import * as pulumi from "@pulumi/pulumi";
import { singleContainerDeploymentTemplate } from "../utilities/deployment";
import { ingressTemplate } from "../utilities/ingress";
import { serviceTemplate } from "../utilities/service";

/* ------------------------------ prerequisite ------------------------------ */

const appLabels = {
    grafana: {
        app: "grafana"
    }
}

const stack = pulumi.getStack();
const org = pulumi.getOrganization();

const stackReference = new pulumi.StackReference(`${org}/authentication/${stack}`);
const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

const NS = stack
const GRAFANA_CLIENT_SECRET = stackReference.requireOutput("grafanaRealmSecret") as pulumi.Output<string>;
const GRAFANA_IMAGE = config.require("GRAFANA_IMAGE");
const GRAFANA_PORT = 3000;
const HOST = config.require("HOST");

/* ------------------------------- deployments ------------------------------ */

singleContainerDeploymentTemplate(
    "grafana",
    {
        ns: NS,
        matchLabels: appLabels.grafana
    },
    {
        image: GRAFANA_IMAGE,
        env: {
            GF_SERVER_ROOT_URL: `https://${HOST}/grafana/`,
            GF_AUTH_GENERIC_OAUTH_CLIENT_SECRET: GRAFANA_CLIENT_SECRET,
            GF_AUTH_DISABLE_LOGIN_FORM: "true",
            GF_AUTH_GENERIC_OAUTH_CLIENT_ID: "grafana",
            GF_AUTH_GENERIC_OAUTH_EMAIL_ATTRIBUTE_PATH: "email",
            GF_AUTH_GENERIC_OAUTH_ENABLED: "true",
            GF_AUTH_GENERIC_OAUTH_LOGIN_ATTRIBUTE_PATH: "username",
            GF_AUTH_GENERIC_OAUTH_NAME: "Keycloak-OAuth",
            GF_AUTH_GENERIC_OAUTH_NAME_ATTRIBUTE_PATH: "full_name",
            GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_PATH: "contains(roles[*], 'admin') && 'Admin' || contains(roles[*], 'editor') && 'Editor' || contains(roles[*], 'viewer') && 'Viewer'", // JMESPath
            GF_AUTH_GENERIC_OAUTH_ROLE_ATTRIBUTE_STRICT: "true",
            GF_AUTH_GENERIC_OAUTH_SCOPES: "openid",
            GF_AUTH_GENERIC_OAUTH_TLS_SKIP_VERIFY_INSECURE: "true", // TODO this should be fixed
            GF_AUTH_GENERIC_OAUTH_TOKEN_URL: "http://keycloak:8080/realms/ctf/protocol/openid-connect/token",
            GF_AUTH_GENERIC_OAUTH_API_URL: `https://${HOST}/keycloak/realms/ctf/protocol/openid-connect/userinfo`,
            GF_AUTH_GENERIC_OAUTH_AUTH_URL: `https://${HOST}/keycloak/realms/ctf/protocol/openid-connect/auth`
        }
    }
);

/* -------------------------------- services -------------------------------- */

const grafanaService = serviceTemplate(
    "grafana",
    NS,
    [{ port: GRAFANA_PORT }],
    appLabels.grafana
)

/* --------------------------------- ingress -------------------------------- */

ingressTemplate(
    "grafana",
    {
        ns: NS,
        rt: "/$2",
        bp: "HTTP"
    },
    [{
        pathType: "ImplementationSpecific",
        path: "/grafana(/|$)(.*)",
        name: grafanaService.metadata.name,
        port: GRAFANA_PORT
    }]
);