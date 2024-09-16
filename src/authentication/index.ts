import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";
import * as fs from 'fs';
import { envSubst } from "../utilities/misc";

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();
const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

const NS = stack;
const REALM_CONFIGURATION_FILE = config.require("REALM_CONFIGURATION_FILE");
const HOST = config.require("HOST");
const POSTGRES_DB = config.require("POSTGRES_DB");
const HTTP_RELATIVE_PATH = config.require("HTTP_RELATIVE_PATH")

/* --------------------------------- secrets -------------------------------- */

const POSTGRES_USER = config.requireSecret("POSTGRES_USER");
const POSTGRES_USER_PWD = config.requireSecret("POSTGRES_USER_PWD");
const POSTGRES_ADMIN_PWD = config.requireSecret("POSTGRES_ADMIN_PWD");
const KEYCLOAK_USER = config.requireSecret("KEYCLOAK_USER");
const KEYCLOAK_PWD = config.requireSecret("KEYCLOAK_PWD");

/* -------------------------------- keycloak -------------------------------- */

let realmConfiguration = fs.readFileSync(REALM_CONFIGURATION_FILE, "utf-8");

const grafanaRealmSecret_ = crypto.randomBytes(32).toString("hex");
const ctfdRealmSecret_ = crypto.randomBytes(32).toString("hex");

realmConfiguration = envSubst(realmConfiguration, "GRAFANA_CLIENT_SECRET", grafanaRealmSecret_);
realmConfiguration = envSubst(realmConfiguration, "CTFD_CLIENT_SECRET", ctfdRealmSecret_);
realmConfiguration = envSubst(realmConfiguration, "HOST", HOST);

const keycloakPostgresqlSecret = new k8s.core.v1.Secret("keycloak-postgresql-secret", {
    metadata: {
        namespace: NS,
    },
    stringData: {
        "admin-password": POSTGRES_ADMIN_PWD,
        "user-password": POSTGRES_USER_PWD
    }
});

new k8s.helm.v3.Chart("keycloak", {
    namespace: NS,
    chart: "keycloak",
    fetchOpts: {
        repo: "https://charts.bitnami.com/bitnami",
    },
    values: {
        production: true,
        tls: {
            enabled: true,
            autoGenerated: true
        },
        httpRelativePath: HTTP_RELATIVE_PATH,
        auth: {
            adminUser: KEYCLOAK_USER,
            adminPassword: KEYCLOAK_PWD
        },
        ingress: {
            enabled: true,
            ingressClassName: "nginx",
            hostname: HOST,
        },
        keycloakConfigCli: {
            enabled: true,
            configuration: {
                "ctfd.json": realmConfiguration
            }
        },
        postgresql: {
            enabled: true,
            auth: {
                username: POSTGRES_USER,
                database: POSTGRES_DB,
                existingSecret: keycloakPostgresqlSecret.metadata.name,
                secretKeys: {
                    adminPasswordKey: "admin-password",
                    userPasswordKey: "user-password"
                }
            }
        }
    }
});

/* --------------------------------- export --------------------------------- */

export const grafanaRealmSecret = pulumi.secret(grafanaRealmSecret_);
export const ctfdRealmSecret = pulumi.secret(ctfdRealmSecret_);