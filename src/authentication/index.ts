import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as fs from 'fs';
import { envSubst, Stack } from "@ctf/utilities";

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();
const org = pulumi.getOrganization();
const config = new pulumi.Config();
const stackReference = new pulumi.StackReference(`${org}/infrastructure/${stack}`);

/* --------------------------------- config --------------------------------- */

const NS = stack;
const REALM_CONFIGURATION_FILE = config.require("REALM_CONFIGURATION_FILE");
const KEYCLOAK_HOST = config.require("KEYCLOAK_HOST");
const CTFD_HOST = config.require("CTFD_HOST");
const GRAFANA_HOST = config.require("GRAFANA_HOST");
const KEYCLOAK_VERSION = config.require("KEYCLOAK_VERSION")
const KEYCLOAK_HTTP_RELATIVE_PATH = config.require("KEYCLOAK_HTTP_RELATIVE_PATH")
const CTFD_HTTP_RELATIVE_PATH = config.require("CTFD_HTTP_RELATIVE_PATH")
const GRAFANA_HTTP_RELATIVE_PATH = config.require("GRAFANA_HTTP_RELATIVE_PATH")
const SSLH_TAG = config.require("SSLH_TAG");

/* --------------------------------- secrets -------------------------------- */

const KEYCLOAK_USER = config.requireSecret("KEYCLOAK_USER");
const KEYCLOAK_PWD = config.requireSecret("KEYCLOAK_PWD");

const postgresAdminPassword = stackReference.requireOutput("postgresAdminPassword") as pulumi.Output<string>;
const postgresUserPassword = stackReference.requireOutput("postgresUserPassword") as pulumi.Output<string>;
const grafanaRealmSecret = stackReference.requireOutput("grafanaRealmSecret") as pulumi.Output<string>;
const ctfdRealmSecret = stackReference.requireOutput("ctfdRealmSecret") as pulumi.Output<string>;
const stepCaSecret = stackReference.requireOutput("stepCaSecret") as pulumi.Output<string>;

/* -------------------------------- keycloak -------------------------------- */

const keycloakCert = new k8s.apiextensions.CustomResource("keycloak-inbound-tls", {
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: {
        name: "keycloak-inbound-tls",
        namespace: NS,
    },
    spec: {
        secretName: "keycloak-inbound-tls",
        commonName: `keycloak.${NS}.svc.cluster.local`,
        dnsNames: [
            KEYCLOAK_HOST,
            "keycloak",
            `keycloak.${NS}.svc.cluster.local`,
        ],
        duration: "24h",
        renewBefore: "8h",
        issuerRef: {
            group: "certmanager.step.sm",
            kind: "StepIssuer",
            name: "step-issuer",
        },
    },
});

const postgresCert = new k8s.apiextensions.CustomResource("postgres-inbound-tls", {
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: {
        name: "postgres-inbound-tls",
        namespace: NS,
    },
    spec: {
        secretName: "postgres-inbound-tls",
        commonName: "keycloak-postgresql",
        dnsNames: [
            "keycloak-postgresql",
            `keycloak-postgresql.${NS}.svc.cluster.local`,
        ],
        duration: "24h",
        renewBefore: "8h",
        issuerRef: {
            group: "certmanager.step.sm",
            kind: "StepIssuer",
            name: "step-issuer",
        },
    },
});


const keycloakPostgresqlSecret = new k8s.core.v1.Secret("keycloak-postgresql-secret", {
    metadata: {
        namespace: NS,
    },
    stringData: {
        "postgres-admin-password": postgresAdminPassword,
        "postgres-user-password": postgresUserPassword
    }
});

let realmConfiguration = fs.readFileSync(REALM_CONFIGURATION_FILE, "utf-8");
pulumi.all([grafanaRealmSecret, ctfdRealmSecret, stepCaSecret]).apply(([grafanaSecret, ctfdSecret, stepSecret]) => {
    realmConfiguration = envSubst(realmConfiguration, "GRAFANA_HOST", GRAFANA_HOST);
    realmConfiguration = envSubst(realmConfiguration, "GRAFANA_HTTP_RELATIVE_PATH", GRAFANA_HTTP_RELATIVE_PATH);
    realmConfiguration = envSubst(realmConfiguration, "CTFD_HOST", CTFD_HOST);
    realmConfiguration = envSubst(realmConfiguration, "CTFD_HTTP_RELATIVE_PATH", CTFD_HTTP_RELATIVE_PATH);
    realmConfiguration = envSubst(realmConfiguration, "GRAFANA_CLIENT_SECRET", grafanaSecret);
    realmConfiguration = envSubst(realmConfiguration, "CTFD_CLIENT_SECRET", ctfdSecret);
    realmConfiguration = envSubst(realmConfiguration, "STEP_CLIENT_SECRET", stepSecret);

    const keycloakChart = new k8s.helm.v3.Chart("keycloak", {
        namespace: NS,
        version: KEYCLOAK_VERSION, // ? Fixed version because because 24.03 is not depoyable without realm migration        
        chart: "keycloak",
        fetchOpts: {
            repo: "https://charts.bitnami.com/bitnami",
        },
        values: {
            production: true,
            // * breaking changes in new version
            metrics: {
                enabled: true,
                serviceMonitor: {
                    enabled: true,
                    relabelings: [
                        {
                            action: "replace",
                            sourceLabels: [
                               "__metrics_path__"
                            ],
                            targetLabel: "metrics_path"
                        }
                    ],
                    labels: {
                        release: "kube-prometheus-stack"
                    },
                    endpoints: [
                        // ? default endpoint does not work
                        // {
                        //     path: '{{ include "keycloak.httpPath" . }}metrics',
                        // },
                        {
                            path: '{{ include "keycloak.httpPath" . }}realms/{{ .Values.adminRealm }}/metrics',
                            port: "http"
                        },
                        {
                            path: '{{ include "keycloak.httpPath" . }}realms/ctf/metrics',
                            port: "http"
                        }
                    ]
                },
            },
            tls: {
                enabled: true,
                existingSecret: keycloakCert.metadata.name,
                usePem: true
            },
            httpRelativePath: KEYCLOAK_HTTP_RELATIVE_PATH,
            auth: {
                adminUser: KEYCLOAK_USER,
                adminPassword: KEYCLOAK_PWD
            },
            ingress: {
                enabled: true,
                ingressClassName: "nginx",
                servicePort: "https",
                annotations: {
                    "nginx.ingress.kubernetes.io/backend-protocol": "HTTPS",
                    "nginx.ingress.kubernetes.io/force-ssl-redirect": "true",
                    "cert-manager.io/issuer": "step-issuer",
                    "cert-manager.io/issuer-kind": "StepIssuer",
                    "cert-manager.io/issuer-group": "certmanager.step.sm"
                },
                tls: true,
                hostname: KEYCLOAK_HOST,
            },
            keycloakConfigCli: {
                enabled: true,
                backoffLimit: 10, // try 11 times (default is 1)
                configuration: {
                    "ctfd.json": realmConfiguration
                },
            },
            extraEnvVars: [ 
                // https://www.postgresql.org/docs/current/libpq-ssl.html
                // https://hub.docker.com/r/bitnami/keycloak
                // https://jdbc.postgresql.org/documentation/use/... tls key in wrong format for mTLS
                {
                    name: "KEYCLOAK_JDBC_PARAMS",
                    value: `sslmode=verify-full&sslrootcert=/opt/bitnami/keycloak/certs/ca.crt`
                }
            ],
            postgresql: {
                enabled: true,
                tls: {
                    enabled: true,
                    autoGenerated: false,
                    certificatesSecret: postgresCert.metadata.name,
                    certFilename: "tls.crt",
                    certKeyFilename: "tls.key",
                    // certCAFilename: "ca.crt" // disable mTLS... "Could not read SSL key file"
                }, 
                auth: {
                    existingSecret: keycloakPostgresqlSecret.metadata.name,
                    secretKeys: {
                        adminPasswordKey: "postgres-admin-password",
                        userPasswordKey: "postgres-user-password"
                    }
                }
            }
        }
    });

    // Reinitialize Step Certificate due to circular dependency
    // Wait until Step has started again
    // * Only one replica is supported at this time.
    const stepRestartCommand = `
        kubectl rollout restart -n ${NS} statefulset step-step-certificates && \
        sleep 20 && \
        kubectl wait -n ${NS} --for=condition=Ready pod/step-step-certificates-0 --timeout=600s
    `;

    new command.local.Command("restart-step-certificate", {
        create: stepRestartCommand,
        update: stepRestartCommand
    }, {dependsOn: keycloakChart.ready});

});

/* ---------------- well-known configuration indirection hack --------------- */

if (stack === Stack.DEV) {
    const appLabels = {
        sslh: {app: "sslh-authentication"}
    }

    new k8s.apps.v1.Deployment("sslh-domain-shadow-deployment", {
        metadata: { namespace: stack },
        spec: {
            selector: { matchLabels: appLabels.sslh },
            template: {
                metadata: { labels: appLabels.sslh },
                spec: {
                    containers: [
                        {
                            name: "sslh",
                            image: `ghcr.io/yrutschle/sslh:${SSLH_TAG}`,
                            args: [
                                "--foreground",
                                "--listen=0.0.0.0:443",
                                "--tls=ingress-nginx-controller.ingress-nginx:443"
                            ]
                        }
                    ],
                }
            }
        }
    });

    new k8s.core.v1.Service(KEYCLOAK_HOST, {
        metadata: { namespace: stack, name: KEYCLOAK_HOST },
        spec: {
            selector: appLabels.sslh,
            ports: [
                {
                    port: 443
                },
            ]
        }
    });
}