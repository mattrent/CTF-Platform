import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from 'path';
import { singleContainerDeploymentTemplate, VolumeType } from "../utilities/deployment";
import { ingressTemplate } from "../utilities/ingress";
import { envSubst } from "../utilities/misc";
import { serviceTemplate } from "../utilities/service";

/* ------------------------------ prerequisite ------------------------------ */

const stack = pulumi.getStack();
const config = new pulumi.Config();

const appLabels = {
    ctfd: { app: "ctfd" },
    ctfd_db: { app: "ctfd-db" }
}

/* --------------------------------- config --------------------------------- */

const NS = stack;
const CTFD_PORT = 8000
const CTFD_IMAGE = config.require("CTFD_IMAGE");
const HOST = config.require("HOST");
const OIDC_CLIENT_SECRET = config.requireSecret("OIDC_CLIENT_SECRET");

/* ----------------------------- loading plugin ----------------------------- */

const pluginFolder = path.resolve("plugins/ctfd_oidc");
const pluginFiles = fs.readdirSync(pluginFolder);

const configMap: { [key: string]: string } = {};
pluginFiles.forEach((file) => {
    const pluginFile = path.join(pluginFolder, file);
    configMap[file] = fs.readFileSync(pluginFile, { encoding: "utf-8" });
})

const configFile = "config.json"
configMap[configFile] = envSubst(configMap[configFile], "OIDC_CLIENT_SECRET", "")

const oidcPlugin = new k8s.core.v1.ConfigMap("oidc-plugin", {
    metadata: {
        namespace: NS
    },
    data: configMap,
});

/* ------------------------------- deployment ------------------------------- */

singleContainerDeploymentTemplate(
    "ctfd",
    {
        ns: NS,
        matchLabels: appLabels.ctfd
    },
    {
        image: CTFD_IMAGE,
        env: {
            APPLICATION_ROOT: "/ctfd",
            REVERSE_PROXY: "true"
        }
    },
    [
        {
            mountPath: "/opt/CTFd/CTFd/plugins/ctfd_oidc",
            type: VolumeType.configMap,
            name: oidcPlugin.metadata.name
        }
    ]
);

/* --------------------------------- service -------------------------------- */

const ctfdService = serviceTemplate(
    "ctfd",
    NS,
    [{ port: CTFD_PORT }],
    appLabels.ctfd
)

/* --------------------------------- ingress -------------------------------- */

ingressTemplate(
    "ctfd",
    {
        ns: NS,
        rt: "/ctfd/$2",
        bp: "HTTP",
        host: HOST
    },
    [{
        pathType: "ImplementationSpecific",
        path: "/ctfd(/|$)(.*)",
        name: ctfdService.metadata.name,
        port: CTFD_PORT
    }]
);