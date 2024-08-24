import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

/* -------------------------------- namespace ------------------------------- */

const stack = pulumi.getStack();

const namespace = new k8s.core.v1.Namespace("namespace", {
    metadata: { name:  stack},
});

// /* ------------------------ NGINX ingress controller ------------------------ */

// const nginxIngress = new k8s.helm.v3.Chart("nginx-ingress", {
//     chart: "ingress-nginx",
//     version: "4.11.2", // Specify the version you want to deploy
//     fetchOpts: {
//         repo: "https://kubernetes.github.io/ingress-nginx", // NGINX Ingress Controller Helm chart repository
//     },
//     values: {
//         controller: {
//             service: {
//                 type: "NodePort", // Change to "NodePort" if LoadBalancer is not supported
//             },
//         },
//     },
// });

// /* ------------------------------ cert-manager ------------------------------ */

// const certManager = new k8s.helm.v3.Chart("cert-manager", {
//     chart: "cert-manager",
//     version: "v1.11.0", // Specify the version you want to deploy
//     fetchOpts: {
//         repo: "https://charts.jetstack.io", // cert-manager Helm chart repository
//     },
//     values: {
//         installCRDs: true, // Install Custom Resource Definitions
//     },
// });

// /* ---------------------------- install KubeVirt ---------------------------- */

// const kubevirtManagerChart = new k8s.helm.v3.Chart("kubevirt-manager", {
//     namespace: "kube-system",               // Change to the desired namespace if necessary
//     chart: "kubevirt",                      // The name of the chart. Adjust if necessary
//     version: "latest",                      // Specify the version of kubevirt-manager chart
//     fetchOpts: {
//         repo: "https://kubevirt.io/charts", // The repository URL where the chart can be found
//     },
// });