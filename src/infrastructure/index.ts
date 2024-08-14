import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

/* ------------------------------ prerequisite ------------------------------ */

const config = new pulumi.Config();

/* --------------------------------- config --------------------------------- */

export const NS = config.require("NS");

/* -------------------------------- namespace ------------------------------- */

new k8s.core.v1.Namespace("namespace-resource", {
    metadata: { name: NS },
});