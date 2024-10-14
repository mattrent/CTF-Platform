import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import axios from 'axios';
import { Stack } from "../utilities/misc";
import * as crypto from "crypto";

/* -------------------------------- namespace ------------------------------- */

const stack = pulumi.getStack();

new k8s.core.v1.Namespace("namespace", {
    metadata: { name: stack },
});

/* ------------------- generate client secrets for export ------------------- */

export const grafanaRealmSecret = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const ctfdRealmSecret = pulumi.secret(crypto.randomBytes(32).toString("hex"));
export const stepCaSecret = pulumi.secret(crypto.randomBytes(32).toString("hex"));

/* ------------------------ NGINX ingress controller ------------------------ */

if (stack === Stack.DEV) {
    const enableIngress = async () => await command.local.run({
        command: "minikube addons enable ingress"
    });

    enableIngress();
} else {
    new k8s.helm.v3.Chart("nginx-ingress", {
        chart: "ingress-nginx",
        version: "4.11.2", // Specify the version you want to deploy
        fetchOpts: {
            repo: "https://kubernetes.github.io/ingress-nginx", // NGINX Ingress Controller Helm chart repository
        },
        values: {
            controller: {
                service: {
                    type: "NodePort", // Change to "NodePort" if LoadBalancer is not supported
                },
            },
        },
    });
}

// /* ---------------------------- install KubeVirt ---------------------------- */

(async () => {
    // Function to fetch the latest KubeVirt release
    const RELEASE = await axios.get('https://storage.googleapis.com/kubevirt-prow/release/kubevirt/kubevirt/stable.txt')
        .then(res => res.data.trim())
        .catch(error => `Error fetching release: ${error.message}`);

    // Apply the KubeVirt operator manifest
    new k8s.yaml.ConfigFile("kubevirt-operator", {
        file: `https://github.com/kubevirt/kubevirt/releases/download/${RELEASE}/kubevirt-operator.yaml`,
    });

    // Apply the KubeVirt CR manifest
    new k8s.yaml.ConfigFile("kubevirt-cr", {
        file: `https://github.com/kubevirt/kubevirt/releases/download/${RELEASE}/kubevirt-cr.yaml`
    });
})();

const softwareEmulationFallback = async () => await command.local.run({
    command: `kubectl patch kubevirt kubevirt -n kubevirt --type merge -p '{
        "spec": {
            "configuration": {
                "developerConfiguration": {
                    "useEmulation": true
                }
            }
        }
    }'`
});

if (false) {
    softwareEmulationFallback();
}

/* ---------------------------------- CRDs ---------------------------------- */

new k8s.helm.v3.Chart("crds", {
    namespace: stack,
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