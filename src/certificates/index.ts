import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { sleep } from "@ctf/utilities";

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();
const org = pulumi.getOrganization();
const config = new pulumi.Config();
const stackReference = new pulumi.StackReference(`${org}/infrastructure/${stack}`);

/* --------------------------------- config --------------------------------- */

const NS = stack;
const STEP_CA_HOST = config.require("STEP_CA_HOST");
const KEYCLOAK_HOST = config.require("KEYCLOAK_HOST");

const CA_URL = `step-step-certificates.${NS}.svc.cluster.local`;

/* --------------------------------- secrets -------------------------------- */

const STEP_CLIRENT_CA_SECRET = stackReference.requireOutput("stepCaSecret");
const STEP_CA_ADMIN_PROVISIONER_PASSWORD = stackReference.requireOutput("stepCaAdminProvisionerPassword");

/* --------------------------------- step-ca -------------------------------- */

pulumi.all([STEP_CLIRENT_CA_SECRET, STEP_CA_ADMIN_PROVISIONER_PASSWORD]).apply(([stepCaClientSecret, stepCaAdminProvisionerPassword]) => {
    new k8s.helm.v3.Chart("step", {
        namespace: NS,
        chart: "autocert",
        fetchOpts: {
            repo: "https://smallstep.github.io/helm-charts/",
        },
        values: {
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
                        postInitHook: `wget https://github.com/stedolan/jq/releases/download/jq-1.7/jq-linux64 && \
                        chmod +x jq-linux64 && \
                        ./jq-linux64 '.authority.provisioners += [{
                            "type": "OIDC",
                            "name": "keycloak",
                            "clientID": "step",
                            "clientSecret": "${stepCaClientSecret}",
                            "configurationEndpoint": "https://${KEYCLOAK_HOST}/keycloak/realms/ctf/.well-known/openid-configuration",
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
                          }' > $(step path)/templates/ssh/keycloak.tpl`
                    },
                    dns: `${STEP_CA_HOST},${CA_URL},127.0.0.1`,
                },
                ingress: {
                    enabled: true,
                    ingressClassName: "nginx",
                    annotations: {
                        "nginx.ingress.kubernetes.io/backend-protocol": "HTTPS",
                        "nginx.ingress.kubernetes.io/force-ssl-redirect": "true",
                        "cert-manager.io/issuer": "step-issuer",
                        "cert-manager.io/issuer-kind": "StepIssuer",
                        "cert-manager.io/issuer-group": "certmanager.step.sm"
                    },
                    tls: [{
                        hosts: [STEP_CA_HOST],
                        secretName: "step-tls"
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
})

/* ------------------------------- certmanager ------------------------------ */

new k8s.helm.v3.Chart("cert-manager", {
    namespace: NS,
    chart: "cert-manager",
    fetchOpts: {
        repo: "https://charts.jetstack.io",
    },
    values: {
        installCRDs: true,
    },
});

/* ------------------------------- step issuer ------------------------------ */

let CA_ROOT_B64: pulumi.Output<string>;
let CA_PROVISIONER_KID: pulumi.Output<any>;

async function deployStepIssuer() {
    if (!pulumi.runtime.isDryRun()) {
        // TODO fix this!
        await sleep(100000);

        const caCert = k8s.core.v1.ConfigMap.get("step-certificates-certs", "dev/step-step-certificates-certs");
        const caConfig = k8s.core.v1.ConfigMap.get("step-certificates-config", "dev/step-step-certificates-config");

        CA_ROOT_B64 = caCert.data.apply(data => Buffer.from(data['root_ca.crt']).toString('base64'));
        CA_PROVISIONER_KID = caConfig.data.apply(data => JSON.parse(data['ca.json']).authority.provisioners[0].key.kid);
    }

    // Deploy step-issuer using Helm
    new k8s.helm.v3.Chart("step-issuer", {
        chart: "step-issuer",
        fetchOpts: {
            repo: "https://smallstep.github.io/helm-charts/",
        },
        namespace: NS,
        values: {
            certManager: {
                serviceAccount: {
                    namespace: NS
                }
            },
            stepIssuer: {
                create: true,
                caUrl: CA_URL,
                caBundle: CA_ROOT_B64,
                provisioner: {
                    name: "admin",
                    kid: CA_PROVISIONER_KID,
                    passwordRef: {
                        name: "step-step-certificates-provisioner-password",
                        key: "password"
                    }
                }
            }
        }
    });
}

deployStepIssuer();

/* ---------------------- Enable autocert for namespace --------------------- */

new command.local.Command("enable-autocert-namespace", {
    create: `kubectl label namespace ${NS} --overwrite autocert.step.sm=enabled`,
    delete: `kubectl label namespace ${NS} --overwrite autocert.step.sm=`
});