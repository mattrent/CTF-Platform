import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import axios from 'axios';
import { Stack } from "../utilities/misc";
import * as fs from "fs";

/* -------------------------------- namespace ------------------------------- */

const stack = pulumi.getStack();

new k8s.core.v1.Namespace("namespace", {
    metadata: { name: stack },
});

/* ------------------------ NGINX ingress controller ------------------------ */

if (stack === Stack.DEV) {
    // TODO https://minikube.sigs.k8s.io/docs/tutorials/custom_cert_ingress/
    // openssl genpkey -algorithm RSA -out tls.key -pkeyopt rsa_keygen_bits:2048
    // openssl req -new -key tls.key -out tls.csr -subj "/CN=yourdomain.com"
    // openssl x509 -req -in tls.csr -signkey tls.key -out tls.crt -days 365
    // minikube addons configure ingress

    // Read the certificate and key files
    const cert = fs.readFileSync("./tls/tls.crt");
    const key = fs.readFileSync("./tls/tls.key");
    
    // Create the TLS secret
    new k8s.core.v1.Secret("mkcert", {
        metadata: {
            namespace: "kube-system",
            name: "mkcert",
        },
        type: "kubernetes.io/tls",
        data: {
            "tls.crt": Buffer.from(cert).toString("base64"),
            "tls.key": Buffer.from(key).toString("base64"),
        },
    });

    const configureIngress = async () => await command.local.run({
        command: "echo kube-system/mkcert | minikube addons configure ingress"
    });

    const enableIngress = async () => await command.local.run({
        command: "minikube addons enable ingress"
    });

    // minikube kubectl -- patch deployment -n ingress-nginx ingress-nginx-controller --type='json' -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value":"--enable-ssl-passthrough"}]'
    // kubectl patch deployment -n ingress-nginx ingress-nginx-controller --type='json' -p='[{"op": "add", "path": "/spec/template/spec/containers/0/args/-", "value":"--enable-ssl-passthrough"}]'

    configureIngress();
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