import { Stack } from "@ctf/utilities";
import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();
const org = pulumi.getOrganization();
const config = new pulumi.Config();
const stackReference = new pulumi.StackReference(`${org}/infrastructure/${stack}`);

/* --------------------------------- config --------------------------------- */

const NS = stack;
const STEP_CA_HOST = config.require("STEP_CA_HOST");
const KEYCLOAK_HOST = config.require("KEYCLOAK_HOST");
const KEYCLOAK_HTTP_RELATIVE_PATH = config.require("KEYCLOAK_HTTP_RELATIVE_PATH");
const CERT_MANAGER_VERSION = config.require("CERT-MANAGER_VERSION");
const STEP_ISSUER_VERSION = config.require("STEP_ISSUER_VERSION");
const STEP_AUTOCERT_VERSION = config.require("STEP_AUTOCERT_VERSION");
const TLS_DURATION = config.require("TLS_DURATION");
const MAIN_DOMAIN = config.require("MAIN_DOMAIN");
const NGINX_NS = "ingress-nginx";

const CA_URL = `step-step-certificates.${NS}.svc.cluster.local`;

/* --------------------------------- secrets -------------------------------- */

const STEP_CLIRENT_CA_SECRET = stackReference.requireOutput("stepCaSecret");
const STEP_CA_ADMIN_PROVISIONER_PASSWORD = stackReference.requireOutput("stepCaAdminProvisionerPassword");

/* --------------------------------- step-ca -------------------------------- */

pulumi.all([STEP_CLIRENT_CA_SECRET, STEP_CA_ADMIN_PROVISIONER_PASSWORD]).apply(([stepCaClientSecret, stepCaAdminProvisionerPassword]) => {
    const stepChart = new k8s.helm.v4.Chart("step", {
        namespace: NS,
        version: STEP_AUTOCERT_VERSION,
        chart: "autocert",
        repositoryOpts: {
            repo: "https://smallstep.github.io/helm-charts/",
        },
        values: {
            autocert: {
                certLifetime: TLS_DURATION
            },
            "step-certificates": {
                ca: {
                    ssh: {
                        enabled: true
                    },
                    provisioner: {
                        name: "admin",
                        password: stepCaAdminProvisionerPassword
                    },
                    bootstrap: {
                        // ? add using keycloak using jq because of circular dependency
                        // ? acme does, thus step cli can be used
                        postInitHook: `wget https://github.com/stedolan/jq/releases/download/jq-1.7/jq-linux64 && \
                        chmod +x jq-linux64 && \
                        ./jq-linux64 '.authority.provisioners += [{
                            "type": "OIDC",
                            "name": "keycloak",
                            "clientID": "step",
                            "clientSecret": "${stepCaClientSecret}",
                            "configurationEndpoint": "https://${KEYCLOAK_HOST}${KEYCLOAK_HTTP_RELATIVE_PATH}realms/ctf/.well-known/openid-configuration",
                            "listenAddress": ":10000",
                            "claims": {
                                "enableSSHCA": true,
                                "disableRenewal": false,
                                "allowRenewalAfterExpiry": false
                            },
                            "options": {
                                "x509": {},
                                "ssh": {"templateFile": "templates/ssh/keycloak.tpl"}
                            }
                        }]' $(step path)/config/ca.json > tmp.json && cat tmp.json > $(step path)/config/ca.json && \
                        echo '{
                            "type": {{ toJson .Type }},
                            "keyId": {{ toJson .KeyID }},
                            "principals": {{ toJson ((concat .Principals .Token.resource_access.step.roles) | uniq) }},
                            "criticalOptions": {{ toJson .CriticalOptions }},
                            "extensions": {{ toJson .Extensions }}
                          }' > $(step path)/templates/ssh/keycloak.tpl && \
                        step ca provisioner add acme --type ACME && \
                        step ca provisioner update admin --x509-max-dur=${TLS_DURATION} --x509-default-dur=${TLS_DURATION}`
                    },
                    dns: `${STEP_CA_HOST},${CA_URL},127.0.0.1`,
                },
                //! disable vulnerable paths
                // TODO https://smallstep.com/docs/step-ca/certificate-authority-server-production/
                ingress: {
                    enabled: true,
                    ingressClassName: "nginx",
                    annotations: {
                        "nginx.ingress.kubernetes.io/backend-protocol": "HTTPS",
                        "nginx.ingress.kubernetes.io/force-ssl-redirect": "true",
                        "cert-manager.io/issuer": "step-issuer",
                        "cert-manager.io/issuer-kind": "StepClusterIssuer",
                        "cert-manager.io/issuer-group": "certmanager.step.sm"
                    },
                    tls: [{
                        hosts: [STEP_CA_HOST],
                        secretName: "step-inbound-tls"
                    }],
                    hosts: [{
                        host: STEP_CA_HOST,
                        paths: [{
                            path: "/",
                            pathType: "Prefix"
                        }]
                    }]
                }
            }
        },
    });

    /* ------------------------------- certmanager ------------------------------ */

    const certManager = new k8s.helm.v3.Chart("cert-manager", {
        namespace: NS,
        version: CERT_MANAGER_VERSION,
        chart: "cert-manager",
        fetchOpts: {
            repo: "https://charts.jetstack.io",
        },
        values: {
            installCRDs: true,
        },
    });

    /* ------------------------------- step issuer ------------------------------ */

    // To support Pulumi preview
    let CA_ROOT_B64: pulumi.Output<string> = pulumi.output(Buffer.from("temp-val-for-preview").toString("base64")); 
    let CA_PROVISIONER_KID: pulumi.Output<string> = pulumi.output("temp-val-for-preview");

    if (!pulumi.runtime.isDryRun()) {
        const caCert = k8s.core.v1.ConfigMap.get("step-certificates-certs", `${NS}/step-step-certificates-certs`, {dependsOn: stepChart});
        const caConfig = k8s.core.v1.ConfigMap.get("step-certificates-config", `${NS}/step-step-certificates-config`, {dependsOn: stepChart});

        CA_ROOT_B64 = caCert.data.apply(data => Buffer.from(data['root_ca.crt']).toString('base64'));
        CA_PROVISIONER_KID = caConfig.data.apply(data => {
            const jwkProvisioner = JSON.parse(data['ca.json']).authority.provisioners.find((provisioner: { [key: string]: string }) => provisioner.type === 'JWK');
            if (jwkProvisioner) {
                return jwkProvisioner.key.kid as string;
            } else {
                throw new Error('JWK provisioner with key.kid not found');
            }
        });
    }

    const issuer = new k8s.helm.v4.Chart("step-issuer", {
        chart: "step-issuer",
        version: STEP_ISSUER_VERSION,
        repositoryOpts: {
            repo: "https://smallstep.github.io/helm-charts/",
        },
        namespace: NS,
        values: {
            certManager: {
                serviceAccount: {
                    namespace: NS
                }
            },
            stepClusterIssuer: {
                create: true,
                caUrl: CA_URL,
                caBundle: CA_ROOT_B64,
                provisioner: {
                    name: "admin",
                    kid: CA_PROVISIONER_KID,
                    passwordRef: {
                        name: "step-step-certificates-provisioner-password",
                        namespace: NS,
                        key: "password"
                    }
                }
            }
        }
    }, {dependsOn: certManager.ready});

    /* ------------------------------ patch ingress ----------------------------- */

    if (stack === Stack.DEV) {

        const ingressCertificate = new k8s.apiextensions.CustomResource("nginx-inbound-tls", {
            apiVersion: "cert-manager.io/v1",
            kind: "Certificate",
            metadata: {
                name: "nginx-inbound-tls",
                namespace: NGINX_NS,
            },
            spec: {
                secretName: "nginx-inbound-tls",
                commonName: MAIN_DOMAIN,
                dnsNames: [
                    MAIN_DOMAIN,
                    `*.${MAIN_DOMAIN}`
                ],
                issuerRef: {
                    group: "certmanager.step.sm",
                    kind: "StepClusterIssuer",
                    name: "step-issuer",
                },
            },
        }, {dependsOn: issuer});

        const waitCommand = new command.local.Command("manual-certificate-wait", {
            create: "sleep 20",
            update: "sleep 20"
        }, {dependsOn: ingressCertificate});

        let ca = pulumi.output("");
        let cert = pulumi.output("");
        let key = pulumi.output("");

        if (!pulumi.runtime.isDryRun()) {
            const nginxCertificate = k8s.core.v1.Secret.get("nginx-secret", `${NGINX_NS}/nginx-inbound-tls`, {dependsOn: waitCommand});
            ca = nginxCertificate.data.apply(data => data['ca.crt']);
            cert = nginxCertificate.data.apply(data => data['tls.crt']);
            key = nginxCertificate.data.apply(data => data['tls.key']);
        };
    
        pulumi.all([ca, cert, key]).apply(([ca, cert, key]) => {
            const patchIngress = `
                kubectl patch secret ingress-nginx-admission -n ingress-nginx --type='json' -p='[
                    {"op": "replace", "path": "/data/ca", "value": "${ca}"},
                    {"op": "replace", "path": "/data/cert", "value": "${cert}"},
                    {"op": "replace", "path": "/data/key", "value": "${key}"}
                ]'`

            new command.local.Command("patch-nginx", {
                create: patchIngress,
                update: patchIngress
            });

            const restartIngress = `kubectl rollout restart -n ${NGINX_NS} deployment.apps/ingress-nginx-controller`

            new command.local.Command("restart-nginx", {
                create: restartIngress,
                update: restartIngress
            });
        });
    }
})

/* ---------------------- Enable autocert for namespace --------------------- */

new command.local.Command("enable-autocert-namespace", {
    create: `kubectl label namespace ${NS} --overwrite autocert.step.sm=enabled`,
    delete: `kubectl label namespace ${NS} --overwrite autocert.step.sm=`
});