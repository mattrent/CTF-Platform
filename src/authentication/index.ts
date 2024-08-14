import { singleContainerDeploymentTemplate } from "../utilities/deployment";
import { ingressTemplate } from "../utilities/ingress";
import { serviceTemplate } from "../utilities/service";
import * as pulumi from "@pulumi/pulumi";

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
const org = pulumi.getOrganization();

const stackRef = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

const NS = stackRef.getOutput("NS").apply(ns => ns as string);
const KEYCLOAK_IMAGE = config.require("KEYCLOAK_IMAGE");
const POSTGRES_IMAGE = config.require("POSTGRES_IMAGE");
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

singleContainerDeploymentTemplate(
    "keycloak",
    {
        ns: NS,
        matchLabels: appLabels.keycloak
    },
    {
        image: KEYCLOAK_IMAGE,
        args: ["start-dev"],
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
    }
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
