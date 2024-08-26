import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();
const org = pulumi.getOrganization();

const stackReference = new pulumi.StackReference(`${org}/authentication/${stack}`);
const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

const NS = stack
const GRAFANA_CLIENT_SECRET =
    stackReference.requireOutput("grafanaRealmSecret") as pulumi.Output<string>;
const HOST = config.require("HOST");

/* --------------------------------- Grafana -------------------------------- */

new k8s.helm.v3.Chart("grafana", {
    namespace: NS,
    chart: "grafana",
    fetchOpts: {
        repo: "https://grafana.github.io/helm-charts",
    },
    values: {
        assertNoLeakedSecrets: false,
        "grafana.ini": {
            auth: {
                disable_login_form: true
            },
            "auth.generic_oauth": {
                enabled: true,
                name: "Keycloak-OAuth",
                allow_sign_up: false,
                client_id: "grafana",
                client_secret: GRAFANA_CLIENT_SECRET,
                scopes: "openid email profile offline_access roles",
                email_attribute_path: "email",
                login_attribute_path: "username",
                name_attribute_path: "full_name",
                auth_url: `https://${HOST}/keycloak/realms/ctf/protocol/openid-connect/auth`,
                token_url: `http://keycloak:8080/realms/ctf/protocol/openid-connect/token`,
                api_url: `https://${HOST}/keycloak/realms/ctf/protocol/openid-connect/userinfo`,
                role_attribute_path: "contains(roles[*], 'admin') && 'Admin' || contains(roles[*], 'editor') && 'Editor' || 'Viewer'"
            },
            server: {
                root_url: `https://${HOST}/grafana/`
            }
        },
        ingress: {
            enabled: true,
            ingressClassName: "nginx",
            path: "/grafana(/|$)(.*)",
            pathType: "ImplementationSpecific",
            hosts: [HOST],
            annotations: {
                "nginx.ingress.kubernetes.io/rewrite-target": "/$2",
            }
        }
    }
});

/* ------------------------------- Prometheus ------------------------------- */

new k8s.helm.v3.Chart("prometheus", {
    namespace: NS,
    chart: "prometheus",
    fetchOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    values: {
        "alertmanager": {
            enabled: false,
        },
        "kube-state-metrics": {
            enabled: false
        },
        "prometheus-node-exporter": {
            enabled: false
        },
        "prometheus-pushgateway": {
            enabled: false
        }
    }
});

/* ---------------------------------- Loki ---------------------------------- */

// new k8s.helm.v3.Chart("loki", {
//     namespace: NS,
//     chart: "loki",
//     fetchOpts: {
//         repo: "https://grafana.github.io/helm-charts",
//     }
// });

/* -------------------------------- Promtail -------------------------------- */

new k8s.helm.v3.Chart("promtail", {
    namespace: NS,
    chart: "promtail",
    fetchOpts: {
        repo: "https://grafana.github.io/helm-charts",
    }
});

/* ------------------------------ Node-exporter ----------------------------- */

new k8s.helm.v3.Chart("node-exporter", {
    namespace: NS,
    chart: "prometheus-node-exporter",
    fetchOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    }
});

/* --------------------------- Kube-state-metrics --------------------------- */

new k8s.helm.v3.Chart("kube-metrics", {
    namespace: NS,
    chart: "kube-state-metrics",
    fetchOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    }
});