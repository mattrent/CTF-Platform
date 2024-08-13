import * as k8s from "@pulumi/kubernetes";

new k8s.core.v1.Namespace("dev-namespace", {
    metadata: { name: "dev" },
});