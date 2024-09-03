import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { Stack } from "../utilities/misc";

/* -------------------------------- namespace ------------------------------- */

const stack = pulumi.getStack();

const namespace = new k8s.core.v1.Namespace("namespace", {
    metadata: { name: stack },
});

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

/* ------------------------------ cert-manager ------------------------------ */

if (stack !== Stack.DEV) {
    new k8s.helm.v3.Chart("cert-manager", {
        chart: "cert-manager",
        version: "v1.11.0", // Specify the version you want to deploy
        fetchOpts: {
            repo: "https://charts.jetstack.io", // cert-manager Helm chart repository
        },
        values: {
            installCRDs: true, // Install Custom Resource Definitions
        },
    });
}

// /* ---------------------------- install KubeVirt ---------------------------- */

// const kubevirtManagerChart = new k8s.helm.v3.Chart("kubevirt-manager", {
//     namespace: "kube-system",               // Change to the desired namespace if necessary
//     chart: "kubevirt",                      // The name of the chart. Adjust if necessary
//     version: "latest",                      // Specify the version of kubevirt-manager chart
//     fetchOpts: {
//         repo: "https://kubevirt.io/charts", // The repository URL where the chart can be found
//     },
// });


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