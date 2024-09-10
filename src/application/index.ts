import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from 'path';

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();

/* --------------------------------- config --------------------------------- */

const NS = stack;

/* ----------------------------- loading plugin ----------------------------- */

const configMap: { [key: string]: string } = {};
const pluginFolder = path.resolve("plugins/ctfd_oidc");
const pluginFiles = fs.readdirSync(pluginFolder);
pluginFiles.forEach((file) => {
    const pluginFile = path.join(pluginFolder, file);
    configMap[file] = fs.readFileSync(pluginFile, { encoding: "utf-8" });
})

const oidcPlugin = new k8s.core.v1.ConfigMap("oidcPlugin", {
    metadata: {
        namespace: NS
    },
    data: configMap,
});

console.log(configMap)