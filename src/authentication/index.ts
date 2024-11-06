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
const KEYCLOAK_IMAGE_VERSION = config.require("KEYCLOAK_IMAGE_VERSION")

/* --------------------------------- secrets -------------------------------- */

const KEYCLOAK_USER = config.requireSecret("KEYCLOAK_USER");
const KEYCLOAK_PWD = config.requireSecret("KEYCLOAK_PWD");

const postgresAdminPassword = stackReference.requireOutput("postgresAdminPassword") as pulumi.Output<string>;
const grafanaRealmSecret = stackReference.requireOutput("grafanaRealmSecret") as pulumi.Output<string>;
const ctfdRealmSecret = stackReference.requireOutput("ctfdRealmSecret") as pulumi.Output<string>;
const stepCaSecret = stackReference.requireOutput("stepCaSecret") as pulumi.Output<string>;

/* -------------------------------- keycloak -------------------------------- */

const keycloakCert = new k8s.apiextensions.CustomResource("keycloak-intern-tls", {
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: {
        name: "keycloak-intern-tls",
        namespace: NS,
    },
    spec: {
        secretName: "keycloak-intern-tls",
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


const keycloakPostgresqlSecret = new k8s.core.v1.Secret("keycloak-postgresql-secret", {
    metadata: {
        namespace: NS,
    },
    stringData: {
        "postgres-password": postgresAdminPassword,
    }
});

let realmConfiguration = fs.readFileSync(REALM_CONFIGURATION_FILE, "utf-8");
// TODO fix realm.json with variables from yaml
pulumi.all([grafanaRealmSecret, ctfdRealmSecret, stepCaSecret]).apply(([grafanaSecret, ctfdSecret, stepSecret]) => {
    realmConfiguration = envSubst(realmConfiguration, "GRAFANA_HOST", GRAFANA_HOST);
    realmConfiguration = envSubst(realmConfiguration, "CTFD_HOST", CTFD_HOST);
    realmConfiguration = envSubst(realmConfiguration, "GRAFANA_CLIENT_SECRET", grafanaSecret);
    realmConfiguration = envSubst(realmConfiguration, "CTFD_CLIENT_SECRET", ctfdSecret);
    realmConfiguration = envSubst(realmConfiguration, "STEP_CLIENT_SECRET", stepSecret);

    new k8s.helm.v3.Chart("keycloak", {
        namespace: NS,
        version: KEYCLOAK_IMAGE_VERSION, // ? Fixed version because because 24.03 is not depoyable        
        chart: "keycloak",
        fetchOpts: {
            repo: "https://charts.bitnami.com/bitnami",
        },
        values: {
            production: true,
            tls: {
                enabled: true,
                existingSecret: keycloakCert.metadata.name,
                usePem: true
            },
            httpRelativePath: "/keycloak/",
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
                configuration: {
                    "ctfd.json": realmConfiguration
                },
            },
            postgresql: {
                enabled: true,
                auth: {
                    existingSecret: keycloakPostgresqlSecret.metadata.name,
                    secretKeys: {
                        adminPasswordKey: "postgres-password",
                    }
                }
            }
        }
    });
});

/* ---------------------- well-known configuration hack --------------------- */

if (stack === Stack.DEV) {
    new k8s.core.v1.Service(KEYCLOAK_HOST, {
        metadata: {
            name: KEYCLOAK_HOST,
            namespace: NS,
        },
        spec: {
            selector: {
                "app.kubernetes.io/component": "keycloak",
                "app.kubernetes.io/instance": "keycloak",
                "app.kubernetes.io/name": "keycloak",
            },
            ports: [{
                name: "https",
                port: 443,
                protocol: "TCP",
                targetPort: "https",
            }],
            type: "ClusterIP",
        },
    });
}