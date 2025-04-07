import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { Stack } from "@ctf/utilities";
import * as crypto from "crypto";

/* --------------------------------- config --------------------------------- */

const config = new pulumi.Config();
const KUBEVIRT_VERSION = config.require("KUBEVIRT_VERSION");
const PROVISIONER_PATH = config.require("PROVISIONER_PATH");
const NGINX_VERSION = config.require("NGINX_VERSION");
const KUBE_PROMETHEUS_STACK_VERSION = config.require("KUBE-PROMETHEUS-STACK_VERSION");
const NGINX_NS = config.require("NGINX_NAMESPACE");
const NFS_PROVISIONER_VERSION = config.require("NFS_PROVISIONER_VERSION");
const NFS_RECLAIM_POLICY = config.require("NFS_RECLAIM_POLICY");
const STORAGECLASS_RECLAIM_POLICY = config.require("STORAGECLASS_RECLAIM_POLICY");
const VOLUME_BINDING_MODE = config.require("VOLUME_BINDING_MODE");
const NFS_SERVER = config.require("NFS_SERVER");

/* -------------------------------- namespace ------------------------------- */

const stack = pulumi.getStack();
const NS = stack;

new k8s.core.v1.Namespace("namespace", {
    metadata: { name: NS },
});

/* ------------------- generate client secrets for export ------------------- */

export const grafanaRealmSecret = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const ctfdRealmSecret = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const stepCaSecret = pulumi.secret(crypto.randomBytes(32).toString("hex"));

export const dockerUsername = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const dockerPassword = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const postgresAdminPassword = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const postgresUserPassword = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const postgresCtfdAdminPassword = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const stepCaAdminProvisionerPassword = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const ctfdApiToken = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const backendApiPostgresql = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const unleashClientApiKey = pulumi.secret(`default:production.${crypto.randomBytes(32).toString("hex")}`);
export const nginxSecretName = "nginx-inbound-tls";

/* ------------------------ NGINX ingress controller ------------------------ */

if (stack === Stack.DEV) {
    // Configure the TLS certificate to be used by the NGINX ingress controller
    // ? LIMITATION: Cannot add more arguments using newline as ordinary bash commands.
    // ? This cannot be updated without deleting and starting minikube again.
    const patchCommand = new command.local.Command("patch-minikube-nginx", {
        create: `echo ${NGINX_NS}/${nginxSecretName} | minikube addons configure ingress || true`,
    });
    // ? Maybe disable HSTS
    new command.local.Command("enable-ingress", {
        create: "minikube addons enable ingress",
        delete: "minikube addons disable ingress"
    }, { dependsOn: patchCommand });
    new command.local.Command("enable-rancher-local-path", {
        create: "minikube addons enable storage-provisioner-rancher",
        delete: "minikube addons disable storage-provisioner-rancher"
    });
} else {
    new k8s.core.v1.Namespace("namespace-nginx", {
        metadata: { name: NGINX_NS },
    });
    // ? Use cert-manager to create root certificate
    new k8s.helm.v3.Chart("nginx-ingress", {
        namespace: NGINX_NS,
        version: NGINX_VERSION,
        chart: "ingress-nginx",
        fetchOpts: {
            repo: "https://kubernetes.github.io/ingress-nginx",
        },
        values: {
            fullnameOverride: "ingress-nginx",
            controller: {
                service: {
                    type: "ClusterIP"
                },
                // ! Disable HSTS
                // https://github.com/kubernetes/ingress-nginx/blob/main/docs/user-guide/nginx-configuration/configmap.md
                config: {
                    "hsts": "false",
                    "hsts-include-subdomains": "false",
                    "hsts-max-age": "0"
                },
                extraArgs: {
                    "default-ssl-certificate": `${NGINX_NS}/${nginxSecretName}`
                }
            },
        },
    });

    // Kept for historical reasons: https://github.com/rancher/local-path-provisioner/issues/465
    // https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner/tree/master
    new k8s.helm.v4.Chart("nfs-subdir-external-provisioner", {
        chart: "nfs-subdir-external-provisioner",
        repositoryOpts: {
            repo: "https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/",
        },
        version: NFS_PROVISIONER_VERSION,
        namespace: NS,
        values: {
            storageClass: {
                create: true,
                defaultClass: true,
                name: "nfs-client",
                pathPattern: "${.PVC.namespace}-${.PVC.name}",
                reclaimPolicy: STORAGECLASS_RECLAIM_POLICY,
                volumeBindingMode: VOLUME_BINDING_MODE
            },
            nfs: {
                path: PROVISIONER_PATH,
                server: NFS_SERVER,
                reclaimPolicy: NFS_RECLAIM_POLICY,
            }
        },
    });
}

// /* ---------------------------- install KubeVirt ---------------------------- */

// * Deletion ressource to add sleep and deletion order
// ? Why is sleep needed... otherwise, weekhook is unavailable?
const deleteKubeVirt = new command.local.Command("delete-kubevirt", {
    delete: `
        sleep 10 && \
        kubectl delete -f https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml --wait=true && \
        kubectl delete -f https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml --wait=false
    `
});

// Apply the KubeVirt CR manifest
const kubeVirtCr = new k8s.yaml.ConfigFile("kubevirt-cr", {
    file: `https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml`
}, { deletedWith: deleteKubeVirt });


// Apply the KubeVirt operator manifest
const kubeVirtOperator = new k8s.yaml.v2.ConfigFile("kubevirt-operator", {
    file: `https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml`,
}, { deletedWith: deleteKubeVirt });

// TODO: add stack Hetzner
if (stack === Stack.UCLOUD) {
    // ? Needed on UCloud for some reason
    new command.local.Command("software-emulation-fallback", {
        create: `kubectl patch kubevirt kubevirt -n kubevirt --type merge -p '{
            "spec": {
                "configuration": {
                    "developerConfiguration": {
                        "useEmulation": false
                    }
                }
            }
        }'`
    }, { dependsOn: [kubeVirtOperator] });
}

/* ----------------------------- CRDs monitoring ---------------------------- */

// For flexibility
new k8s.helm.v4.Chart("monitoring-crds", {
    namespace: NS,
    version: KUBE_PROMETHEUS_STACK_VERSION,
    chart: "kube-prometheus-stack",
    repositoryOpts: {
        repo: "https://prometheus-community.github.io/helm-charts",
    },
    values: {
        // Only need crds (explicit)
        crds: {
            enabled: true
        },
        prometheus: {
            enabled: false
        },
        alertmanager: {
            enabled: false
        },
        grafana: {
            enabled: false
        },
        kubeStateMetrics: {
            enabled: false
        },
        nodeExporter: {
            enabled: false
        },
        windowsMonitoring: {
            enabled: false
        },
        kubernetesServiceMonitors: {
            enabled: false
        },
        defaultRules: {
            create: false
        },
        prometheusOperator: {
            enabled: false
        }
    },
});