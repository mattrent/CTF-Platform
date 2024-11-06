import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { Stack } from "@ctf/utilities";
import * as crypto from "crypto";

/* --------------------------------- config --------------------------------- */

const config = new pulumi.Config();
const KUBEVIRT_VERSION = config.require("KUBEVIRT_VERSION")
const PROVISIONER_PATH = config.require("PROVISIONER_PATH")
const PROVISIONER_VOLUME_TYPE = config.require("PROVISIONER_VOLUME_TYPE");
const PROVISIONER_VERSION = config.require("PROVISIONER_VERSION")

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
export const jwtCtfd = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const postgresAdminPassword = pulumi.secret(crypto.randomBytes(32).toString("hex"));

/* ------------------------ NGINX ingress controller ------------------------ */

if (stack === Stack.DEV) {
    new command.local.Command("enable-ingress", {
        create: "minikube addons enable ingress",
        delete: "minikube addons disable ingress"
    });
    new command.local.Command("enable-rancher-local-path", {
        create: "minikube addons enable storage-provisioner-rancher",
        delete: "minikube addons disable storage-provisioner-rancher"
    });
} else {
    new k8s.helm.v3.Chart("nginx-ingress", {
        chart: "ingress-nginx",
        fetchOpts: {
            repo: "https://kubernetes.github.io/ingress-nginx",
        },
        values: {
            controller: {
                service: {
                    type: "LoadBalancer",
                },
            },
        },
    });

    new k8s.helm.v3.Chart("local-path-provisioner", {
        chart: "local-path-provisioner",
        version: PROVISIONER_VERSION,
        fetchOpts: {
            repo: "https://rancher.github.io/local-path-provisioner/",
        },
        namespace: NS,
        values: {
            storageClass: {
                create: true,
                defaultClass: true,
                name: "local-path",
                pathPattern: "{{ .PVC.Namespace }}-{{ .PVC.Name }}",
                defaultVolumeType: PROVISIONER_VOLUME_TYPE,
            },
            nodePathMap: [
                {
                    node: "DEFAULT_PATH_FOR_NON_LISTED_NODES",
                    paths: [PROVISIONER_PATH]
                }
            ]
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

// Apply the KubeVirt operator manifest
const kubeVirtOperator = new k8s.yaml.ConfigFile("kubevirt-operator", {
    file: `https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-operator.yaml`,
}, { deletedWith: deleteKubeVirt });

// Apply the KubeVirt CR manifest
const kubeVirtCr = new k8s.yaml.ConfigFile("kubevirt-cr", {
    file: `https://github.com/kubevirt/kubevirt/releases/download/${KUBEVIRT_VERSION}/kubevirt-cr.yaml`
}, { deletedWith: deleteKubeVirt });

// ? Might be needed
// new command.local.Command("software-emulation-fallback", {
//     create: `kubectl patch kubevirt kubevirt -n kubevirt --type merge -p '{
//         "spec": {
//             "configuration": {
//                 "developerConfiguration": {
//                     "useEmulation": true
//                 }
//             }
//         }
//     }'`
// }, {dependsOn: installKubeVirt});

/* ----------------------------- CRDs monitoring ---------------------------- */

// * Needs to be here due to some Pulumi error
new k8s.helm.v3.Chart("crds", {
    namespace: NS,
    chart: "kube-prometheus-stack",
    fetchOpts: {
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

/* --------------------------------- Henrik --------------------------------- */

const dirOffset = "../application/ctf"

const henrikRepo = new command.local.Command("clone-repo-henrik", {
    create: `git clone https://gitlab.com/ctf9215737/ctf.git ${dirOffset}`,
    delete: `rm -rf ${dirOffset}`
});

new command.local.Command("get-dep-backend-chart", {
    create: `helm dep update ${dirOffset}/backend/deployment/helm`
}, { dependsOn: henrikRepo });

