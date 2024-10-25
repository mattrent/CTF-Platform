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
    const kubeVirtOperator = new k8s.yaml.ConfigFile("kubevirt-operator", {
        file: `https://github.com/kubevirt/kubevirt/releases/download/${RELEASE}/kubevirt-operator.yaml`,
    });

    // Apply the KubeVirt CR manifest
    const kubeVirtCr = new k8s.yaml.ConfigFile("kubevirt-cr", {
        file: `https://github.com/kubevirt/kubevirt/releases/download/${RELEASE}/kubevirt-cr.yaml`
    });


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
    // }, {dependsOn: [kubeVirtOperator, kubeVirtOperator]});
    
})();

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

/* --------------------------------- Henrik --------------------------------- */

new k8s.helm.v3.Chart("traefik", {
    chart: "traefik",
    namespace: "kube-system",
    fetchOpts: {
        repo: "https://traefik.github.io/charts",
    },
    values: {
        service: {
            type: "ClusterIP"
        }
    }
});

const dirOffset = "../application/ctf"

const henrikRepo = new command.local.Command("clone-repo-henrik", {
    create: `git clone https://gitlab.com/ctf9215737/ctf.git ${dirOffset}`,
    delete: `rm -rf ${dirOffset}`
});

const getDepBackendChart = new command.local.Command("get-dep-backend-chart", {
    create: `helm dep update ${dirOffset}/backend/deployment/helm`
}, {dependsOn: henrikRepo});

new command.local.Command("package-backend-helm-chart", {
    create: `helm package ${dirOffset}/backend/deployment/helm -d ../application/`,
    delete: "rm $(find ../application/ -maxdepth 1 -name 'deployer*.tgz')"
}, {dependsOn: getDepBackendChart})