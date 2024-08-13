import { singleContainerDeploymentTemplate } from "../utilities/deployment";
import { ingressTemplate } from "../utilities/ingress";
import { serviceTemplate } from "../utilities/service";

const appLabels = {
    keycloak: {
        app: "keycloak"
    },
    postgres: {
        app: "postgres-keycloak"
    }
}

singleContainerDeploymentTemplate(
    "keycloak",
    {
        ns: "dev",
        replicas: 1,
        matchLabels: appLabels.keycloak,
        labels: appLabels.keycloak
    },
    {
        image: "keycloak/keycloak:24.0.5",
        imagePullPolicy: "Always",
        args: ["start-dev"],
        env: {
            KC_HOSTNAME_ADMIN_URL: "https://localhost/keycloak/",
            KC_HOSTNAME_URL: "https://localhost/keycloak/",
            KEYCLOAK_ADMIN: "admin",
            KEYCLOAK_ADMIN_PASSWORD: "admin",
            KC_DB: "postgres",
            KC_DB_PASSWORD: "postgres",
            KC_DB_USERNAME: "postgres",
            KC_DB_URL: "jdbc:postgresql://postgres-keycloak:5432/keycloak"
        }
    }
);

singleContainerDeploymentTemplate(
    "postgres-keycloak",
    {
        ns: "dev",
        replicas: 1,
        matchLabels: appLabels.postgres,
        labels: appLabels.postgres
    },
    {
        image: "postgres:latest",
        imagePullPolicy: "Always",
        env: {
            POSTGRES_USER: "postgres",
            POSTGRES_PASSWORD: "postgres",
            POSTGRES_DB: "keycloak"
        }
    }
);

serviceTemplate(
    "postgres-keycloak",
    "dev",
    [{ port: 5432 }],
    appLabels.postgres
)

serviceTemplate(
    "keycloak",
    "dev",
    [{ port: 8080 }],
    appLabels.keycloak
)

ingressTemplate(
    "keycloak-ingress",
    "dev",
    "/$2",
    "HTTP",
    "localhost",
    [{
        pathType: "ImplementationSpecific",
        path: "/keycloak(/|$)(.*)",
        name: "keycloak",
        port: 8080
    }]
);
