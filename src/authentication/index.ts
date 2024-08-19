import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";
import * as fs from 'fs';
import { singleContainerDeploymentTemplate, VolumeType } from "../utilities/deployment";
import { ingressTemplate } from "../utilities/ingress";
import { envSubst } from "../utilities/misc";
import { serviceTemplate } from "../utilities/service";

/* ------------------------------ prerequisite ------------------------------ */

const appLabels = {
    keycloak: {
        app: "keycloak"
    },
    postgres: {
        app: "postgres-keycloak"
    }
}

const stack = pulumi.getStack();

const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

const NS = stack;
const KEYCLOAK_IMAGE = config.require("KEYCLOAK_IMAGE");
const POSTGRES_IMAGE = config.require("POSTGRES_IMAGE");
const REALM_CONFIGURATION_FILE = config.require("REALM_CONFIGURATION_FILE");
const KEYCLOAK_PORT = 8080;
const POSTGRES_PORT = 5432;
const DB = "keycloak";
const HOST = config.require("HOST");

/* --------------------------------- secrets -------------------------------- */

const POSTGRES_USER = config.requireSecret("POSTGRES_USER");
const POSTGRES_PWD = config.requireSecret("POSTGRES_PWD");
const KEYCLOAK_USER = config.requireSecret("KEYCLOAK_USER");
const KEYCLOAK_PWD = config.requireSecret("KEYCLOAK_PWD");

/* -------------------------------- postgres -------------------------------- */

// TODO Add PV to deployment

singleContainerDeploymentTemplate(
    "postgres-keycloak",
    {
        ns: NS,
        matchLabels: appLabels.postgres
    },
    {
        image: POSTGRES_IMAGE,
        env: {
            POSTGRES_USER: POSTGRES_USER,
            POSTGRES_PASSWORD: POSTGRES_PWD,
            POSTGRES_DB: DB
        }
    }
);

const postgresService = serviceTemplate(
    "postgres-keycloak",
    NS,
    [{ port: POSTGRES_PORT }],
    appLabels.postgres
)

/* -------------------------------- keycloak -------------------------------- */

let realmConfiguration = fs.readFileSync(REALM_CONFIGURATION_FILE, "utf-8");

const realmSecret = crypto.randomBytes(32).toString("hex");
realmConfiguration = envSubst(realmConfiguration, "GRAFANA_CLIENT_SECRET", realmSecret);

const configMapKeycloak = new k8s.core.v1.ConfigMap("realm-configmap", {
    metadata: {
        namespace: NS
    },
    data: {
        "realm.json": realmConfiguration
    },
});

singleContainerDeploymentTemplate(
    "keycloak",
    {
        ns: NS,
        matchLabels: appLabels.keycloak
    },
    {
        image: KEYCLOAK_IMAGE,
        args: ["start-dev", "--import-realm"],
        env: {
            KC_HOSTNAME_ADMIN_URL: `https://${HOST}/keycloak/`,
            KC_HOSTNAME_URL: `https://${HOST}/keycloak/`,
            KEYCLOAK_ADMIN: KEYCLOAK_USER,
            KEYCLOAK_ADMIN_PASSWORD: KEYCLOAK_PWD,
            KC_DB: "postgres",
            KC_DB_USERNAME: POSTGRES_USER,
            KC_DB_PASSWORD: POSTGRES_PWD,
            KC_DB_URL: postgresService.metadata.name.apply(
                postgres => `jdbc:postgresql://${postgres}:${POSTGRES_PORT}/${DB}`
            )
        }
    },
    [
        {
            mountPath: "/opt/keycloak/data/import",
            type: VolumeType.configMap,
            name: configMapKeycloak.metadata.name
        }
    ]
);

const keycloakService = serviceTemplate(
    "keycloak",
    NS,
    [{ port: KEYCLOAK_PORT }],
    appLabels.keycloak
)

/* --------------------------------- ingress -------------------------------- */

ingressTemplate(
    "keycloak",
    {
        ns: NS,
        rt: "/$2",
        bp: "HTTP"
    },
    [{
        pathType: "ImplementationSpecific",
        path: "/keycloak(/|$)(.*)",
        name: keycloakService.metadata.name,
        port: KEYCLOAK_PORT
    }]
);

/* --------------------------------- export --------------------------------- */

export const grafanaRealmSecret = pulumi.secret(realmSecret);