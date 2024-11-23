import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();
const org = pulumi.getOrganization();

const stackReference = new pulumi.StackReference(`${org}/infrastructure/${stack}`);
const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

const NS = stack
const GRAFANA_CLIENT_SECRET =
    stackReference.requireOutput("grafanaRealmSecret") as pulumi.Output<string>;
const GRAFANA_HOST = config.require("GRAFANA_HOST");
const KEYCLOAK_HOST = config.require("KEYCLOAK_HOST");
const KEYCLOAK_HTTP_RELATIVE_PATH = config.require("KEYCLOAK_HTTP_RELATIVE_PATH");
const GRAFANA_HTTP_RELATIVE_PATH = config.require("GRAFANA_HTTP_RELATIVE_PATH");
const kubePrometheusStackRelaseName = "kube-prometheus-stack"

// Remove trailing slash if it exists, but keep the root '/' intact
const cleanedGrafanaPath = (GRAFANA_HTTP_RELATIVE_PATH !== '/' && GRAFANA_HTTP_RELATIVE_PATH.endsWith('/')) 
  ? GRAFANA_HTTP_RELATIVE_PATH.slice(0, -1) 
  : GRAFANA_HTTP_RELATIVE_PATH;


/* --------------------------------- Grafana -------------------------------- */

const grafanaIngressPathType = GRAFANA_HTTP_RELATIVE_PATH !== "/" ? "ImplementationSpecific" : "Prefix"
const grafanaIngressPath = GRAFANA_HTTP_RELATIVE_PATH !== "/" ? `${cleanedGrafanaPath}(/|$)(.*)` : "/"
const grafanaIngressAnnotations: {[key: string]: string} = {
    "nginx.ingress.kubernetes.io/force-ssl-redirect": "true",
    "nginx.ingress.kubernetes.io/backend-protocol": "HTTPS",
    "cert-manager.io/issuer": "step-issuer",
    "cert-manager.io/issuer-kind": "StepIssuer",
    "cert-manager.io/issuer-group": "certmanager.step.sm"
};

if (GRAFANA_HTTP_RELATIVE_PATH !== "/") {
    grafanaIngressAnnotations["nginx.ingress.kubernetes.io/rewrite-target"] = "/$2";
}

// TODO add keycloak dashboard
new k8s.helm.v3.Chart("grafana", {
    namespace: NS,
    chart: "grafana",
    fetchOpts: {
        repo: "https://grafana.github.io/helm-charts",
    },
    values: {
        // https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/keycloak/
        assertNoLeakedSecrets: false,
        "grafana.ini": {
            auth: {
                disable_login_form: true
            },
            "auth.generic_oauth": {
                enabled: true,
                use_pkce: true,
                allow_sign_up: true,
                use_refresh_token: true,
                role_attribute_strict: true,
                tls_skip_verify_insecure: false,
                tls_client_ca: "/var/run/autocert.step.sm/root.crt",
                client_secret: GRAFANA_CLIENT_SECRET,
                scopes: "openid",
                client_id: "grafana",
                name: "Keycloak-OAuth",
                name_attribute_path: "name",
                email_attribute_path: "email",
                id_token_attribute_name: "access_token",
                login_attribute_path: "preferred_username",
                token_url: `https://keycloak${KEYCLOAK_HTTP_RELATIVE_PATH}realms/ctf/protocol/openid-connect/token`,
                auth_url: `https://${KEYCLOAK_HOST}${KEYCLOAK_HTTP_RELATIVE_PATH}realms/ctf/protocol/openid-connect/auth`,
                api_url: `https://${KEYCLOAK_HOST}${KEYCLOAK_HTTP_RELATIVE_PATH}realms/ctf/protocol/openid-connect/userinfo`,
                signout_redirect_url: `https://${KEYCLOAK_HOST}${KEYCLOAK_HTTP_RELATIVE_PATH}realms/ctf/protocol/openid-connect/logout`,
                role_attribute_path: "contains(resource_access.grafana.roles, 'admin') && 'Admin' || contains(resource_access.grafana.roles, 'editor') && 'Editor' || ''"
            },
            server: {
                root_url: `https://${GRAFANA_HOST}${GRAFANA_HTTP_RELATIVE_PATH}`,
                protocol: "https",
                cert_key: "/var/run/autocert.step.sm/site.key",
                cert_file: "/var/run/autocert.step.sm/site.crt"
            }
        },
        podAnnotations: {
            "autocert.step.sm/name": `grafana.${NS}.svc.cluster.local`
        },
        readinessProbe: {
            httpGet: {
                path: "/api/health",
                port: 3000,
                scheme: "HTTPS"
            },
            initialDelaySeconds: 60,
            timeoutSeconds: 30,
            failureThreshold: 10
        },
        livenessProbe: {
            httpGet: {
                path: "/api/health",
                port: 3000,
                scheme: "HTTPS"
            },
            initialDelaySeconds: 60,
            timeoutSeconds: 30,
            failureThreshold: 10
        },
        datasources: {
            "datasources.yaml": {
                apiVersion: 1,
                datasources: [
                    {
                        name: "Prometheus",
                        type: "prometheus",
                        url: "https://kube-prometheus-stack-prometheus:9090",
                        access: "proxy",
                        jsonData: {
                            tlsAuthWithCACert: true
                        },
                        secureJsonData: {
                            tlsCACert: "$__file{/var/run/autocert.step.sm/root.crt}"
                        }
                    },
                    {
                        name: "Loki",
                        type: "loki",
                        url: "http://loki-gateway",
                        access: "proxy",
                        jsonData: {
                            tlsAuthWithCACert: true,
                            tlsAuth: true
                        },
                        secureJsonData: {
                            tlsCACert: "$__file{/var/run/autocert.step.sm/root.crt}",
                            tlsClientKey: "$__file{/var/run/autocert.step.sm/site.key}",
                            tlsClientCert: "$__file{/var/run/autocert.step.sm/site.crt}"
                        }
                    }
                ]
            }
        },
        sidecar: {
            dashboards: {
                enabled: true,
                provider: {
                    folder: "Kube Prometheus Stack"
                }
            }
        },
        dashboardProviders: {
            "dashboardproviders.yaml": {
                apiVersion: 1,
                providers: [
                    {
                        name: 'grafana-dashboards-kubernetes',
                        orgId: 1,
                        folder: 'Kubernetes',
                        type: "file",
                        disableDeletion: true,
                        editable: true,
                        options: {
                            path: "/var/lib/grafana/dashboards/grafana-dashboards-kubernetes"
                        }
                    },
                    {
                        name: 'grafana-dashboards-node',
                        orgId: 1,
                        folder: 'Node',
                        type: "file",
                        disableDeletion: true,
                        editable: true,
                        options: {
                            path: "/var/lib/grafana/dashboards/grafana-dashboards-node"
                        }
                    }
                ]
            }
        },
        dashboards: {
            // https://github.com/dotdc/grafana-dashboards-kubernetes
            "grafana-dashboards-kubernetes": {
                "k8s-addons-prometheus": {
                    gnetId: 19105,
                    revision: 3,
                    datasource: "Prometheus"
                },
                "k8s-addons-trivy-operator": {
                    gnetId: 16337,
                    revision: 12,
                    datasource: "Prometheus"
                },
                "k8s-system-api-server": {
                    gnetId: 15761,
                    revision: 17,
                    datasource: "Prometheus"
                },
                "k8s-system-coredns": {
                    gnetId: 15762,
                    revision: 18,
                    datasource: "Prometheus"
                },
                "k8s-views-global": {
                    gnetId: 15757,
                    revision: 37,
                    datasource: "Prometheus"
                },
                "k8s-views-namespaces": {
                    gnetId: 15758,
                    revision: 35,
                    datasource: "Prometheus"
                },
                "k8s-views-nodes": {
                    gnetId: 15759,
                    revision: 29,
                    datasource: "Prometheus"
                },
                "k8s-views-pods": {
                    gnetId: 15760,
                    revision: 29,
                    datasource: "Prometheus"
                }
            },
            "grafana-dashboards-node": {
                "node-exporter-full": {
                    gnetId: 1860,
                    revision: 37,
                    datasource: "Prometheus"
                }
            }
        },
        serviceMonitor: {
            enabled: true,
            labels: {
                release: kubePrometheusStackRelaseName
            },
            scheme: "https",
            tlsConfig: {
                caFile: "/var/run/step/ca.crt",
                serverName: `grafana.${NS}.svc.cluster.local`,
                insecureSkipVerify: false
            }
        },
        ingress: {
            enabled: true,
            ingressClassName: "nginx",
            path: grafanaIngressPath,
            pathType: grafanaIngressPathType,
            hosts: [GRAFANA_HOST],
            annotations: grafanaIngressAnnotations,
            tls: [
                {
                    secretName: "grafana-tls",
                    hosts: [GRAFANA_HOST]
                }
            ]
        }
    }
});

/* -------------------------- kube-prometheus-stack ------------------------- */

const prometheusCert = new k8s.apiextensions.CustomResource("prometheus-inbound-tls", {
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: {
        name: "prometheus-inbound-tls",
        namespace: NS,
    },
    spec: {
        secretName: "prometheus-inbound-tls",
        commonName: `kube-prometheus-stack-prometheus.${NS}.svc.cluster.local`,
        dnsNames: [
            `kube-prometheus-stack-prometheus.${NS}.svc.cluster.local`,
            "kube-prometheus-stack-prometheus"
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

const nodeExporterCert = new k8s.apiextensions.CustomResource("node-exporter-inbound-tls", {
    apiVersion: "cert-manager.io/v1",
    kind: "Certificate",
    metadata: {
        name: "node-exporter-inbound-tls",
        namespace: NS,
    },
    spec: {
        secretName: "node-exporter-inbound-tls",
        commonName: "kube-prometheus-stack-prometheus-node-exporter",
        dnsNames: [
            `kube-prometheus-stack-prometheus-node-exporter.${NS}.svc.cluster.local`,
            "kube-prometheus-stack-prometheus-node-exporter"
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

// TODO check default insecureSkipVerify
// TODO configure TLS for kube-state-metrics
new k8s.helm.v4.Chart(kubePrometheusStackRelaseName, {
    namespace: NS,
    chart: "kube-prometheus-stack",
    repositoryOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    // Includes scraping for cAdvisor
    values: {
        crds: {
            enabled: true
        },
        alertmanager: {
            enabled: false
        },
        grafana: {
            enabled: false,
            // Tailored dashboards
            forceDeployDashboards: true
        },
        prometheus: {
            serviceMonitor: {
                scheme: "https",
                tlsConfig: {
                    caFile: "/var/run/step/ca.crt",
                    serverName: `kube-prometheus-stack-prometheus.${NS}.svc.cluster.local`,
                    insecureSkipVerify: false
                }
            },
            prometheusSpec: { 
                web: { 
                    tlsConfig: { 
                        keySecret: { 
                            key: "tls.key", 
                            name: prometheusCert.metadata.name 
                        },
                        cert: { 
                            secret: { 
                                key: "tls.crt", 
                                name: prometheusCert.metadata.name 
                            } 
                        },
                        client_ca: {
                            secret: { 
                                key: "ca.crt", 
                                name: prometheusCert.metadata.name 
                            } 
                        },
                        clientAuthType: "VerifyClientCertIfGiven" // can be upgraded to RequireAndVerifyClientCert
                    }
                },
                volumes: [
                    {
                        name: prometheusCert.metadata.name,
                        secret: {
                            secretName: prometheusCert.metadata.name
                        }
                    }
                ],
                volumeMounts: [
                    {
                        name: prometheusCert.metadata.name,
                        mountPath: "/var/run/step"
                    }
                ]
            }
        },
        prometheusOperator: {
            // Readiness probes cannot send certificate
            // https://github.com/prometheus-community/helm-charts/blob/main/charts/kube-prometheus-stack/templates/prometheus-operator/deployment.yaml
            // extraArgs: [
            //     "--web.client-ca-file=/cert/ca.crt",
            // ],
            admissionWebhooks: {
                certManager: {
                    enabled: true,
                    admissionCert: {
                        duration: "24h"
                    },
                    issuerRef: {
                        group: "certmanager.step.sm",
                        kind: "StepIssuer",
                        name: "step-issuer",
                    }
                }
            }
        },
        // https://github.com/dotdc/grafana-dashboards-kubernetes?tab=readme-ov-file#known-issues
        "prometheus-node-exporter": {
            kubeRBACProxy: {
                enabled: true,
                tls: {
                    enabled: true,
                    tlsClientAuth: true
                }
            },
            tlsSecret: {
                enabled: true,
                caItem: "ca.crt",
                certItem: "tls.crt",
                keyItem: "tls.key",
                secretName: nodeExporterCert.metadata.name,
            },
            prometheus: {
                monitor: {
                    scheme: "https",
                    bearerTokenFile: "/var/run/secrets/kubernetes.io/serviceaccount/token",
                    tlsConfig: {
                        caFile: "/var/run/step/ca.crt",
                        // certFile: "/var/run/step/tls.crt",
                        // keyFile: "/var/run/step/tls.key",
                        serverName: `kube-prometheus-stack-prometheus-node-exporter.${NS}.svc.cluster.local`,
                        insecureSkipVerify: false
                    },
                    relabelings: [
                        {
                            action: "replace",
                            sourceLabels: [
                                "__meta_kubernetes_pod_node_name"
                            ],
                            targetLabel: "nodename"
                        }
                    ]
                }
            }
        }
    },
});

/* ---------------------------------- Loki ---------------------------------- */

// TODO Configure TLS... tried but failed
// https://grafana.com/docs/loki/latest/setup/install/helm/install-monolithic/
new k8s.helm.v4.Chart("loki", {
    namespace: NS,
    chart: "loki",
    repositoryOpts: {
        repo: "https://grafana.github.io/helm-charts",
    },
    values: {
        // // ? Added after tls config... sceptical.
        // memberlist: {
        //     service: {
        //         publishNotReadyAddresses: true
        //     }
        // },
        deploymentMode: "SingleBinary",
        loki: {
            auth_enabled: false,
            commonConfig: {
                replication_factor: 1
            },
            storage: {
                type: "filesystem"
            },
            schemaConfig: {
                configs: [
                    {
                        from: "2024-01-01",
                        store: "tsdb",
                        index: {
                            prefix: "loki_index_",
                            period: "24h"
                        },
                        object_store: "filesystem",
                        schema: "v13"
                    }
                ]
            },
            // server: {
            //     http_tls_config: {
            //         // ! should have been RequireAndVerifyClientCert
            //         client_auth_type: "VerifyClientCertIfGiven",
            //         client_ca_file:"/var/run/autocert.step.sm/root.crt",
            //         cert_file: "/var/run/autocert.step.sm/site.crt",
            //         key_file: "/var/run/autocert.step.sm/site.key"
            //     }
            // },
            // readinessProbe: {
            //     httpGet: {
            //         path: "/ready",
            //         port: "http-metrics",
            //         scheme: "HTTPS",
            //     },
            //     initialDelaySeconds: 30,
            //     timeoutSeconds: 1
            // },
            // podAnnotations: {
            //     "autocert.step.sm/name": `loki-gateway.${NS}.svc.cluster.local`,
            //     "autocert.step.sm/sans": `loki-gateway.${NS}.svc.cluster.local,loki-gateway,loki-canary`
            // },
        },
        singleBinary: {
            replicas: 1
        },
        read: {
            replicas: 0
        },
        backend: {
            replicas: 0
        },
        write: {
            replicas: 0
        },
        monitoring: {
            dashboards: {
                enabled: true
            },
            serviceMonitor: {
                enabled: true,
                labels: {
                    release: kubePrometheusStackRelaseName
                },
                // scheme: "https",
                // tlsConfig: {
                //     caFile: "/var/run/step/ca.crt",
                //     certFile: "/var/run/step/tls.crt",
                //     keyFile: "/var/run/step/tls.key",
                //     serverName: `loki-gateway.${NS}.svc.cluster.local`,
                //     insecureSkipVerify: false
                // }
            }
        },
        gateway: {
            service: {
                labels: {
                    "prometheus.io/service-monitor": "false"
                }
            }
        }
    },
});

/* -------------------------------- Promtail -------------------------------- */

new k8s.helm.v3.Chart("promtail", {
    namespace: NS,
    chart: "promtail",
    fetchOpts: {
        repo: "https://grafana.github.io/helm-charts",
    },
    values: {
        config: {
            clients: [{
                url: "http://loki-gateway/loki/api/v1/push",        
                tls_config: {        
                    ca_file:"/var/run/autocert.step.sm/root.crt",
                    cert_file: "/var/run/autocert.step.sm/site.crt",
                    key_file: "/var/run/autocert.step.sm/site.key"
                }
            }],
        },
        podAnnotations: {
            "autocert.step.sm/name": `promtail-metrics.${NS}.svc.cluster.local`
        },
        serviceMonitor: {
            enabled: true,
            labels: {
                release: kubePrometheusStackRelaseName
            }
        }
    }
});