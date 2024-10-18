import * as docker from "@pulumi/docker";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from 'path';
import { singleContainerDeploymentTemplate, VolumeType } from "../utilities/deployment";
import { ingressTemplate } from "../utilities/ingress";
import { envSubst, Stack } from "../utilities/misc";
import { serviceTemplate } from "../utilities/service";

/* ------------------------------ prerequisite ------------------------------ */

const config = new pulumi.Config();

const appLabels = {
    ctfd: { app: "ctfd" },
    ctfd_db: { app: "ctfd-db" },
    bastion: { app: "bastion" }
}

const stack = pulumi.getStack();
const org = pulumi.getOrganization();
const stackReference = new pulumi.StackReference(`${org}/infrastructure/${stack}`);

/* --------------------------------- config --------------------------------- */

const NS = stack;
const CTFD_PORT = 8000
const CTFD_IMAGE = config.require("CTFD_IMAGE");
const HOST = config.require("HOST");
const CTFD_CLIENT_SECRET =
    stackReference.requireOutput("ctfdRealmSecret") as pulumi.Output<string>;

/* ----------------------------- loading plugin ----------------------------- */

const pluginFolder = path.resolve("ctfd_oidc");
const pluginFiles = fs.readdirSync(pluginFolder);

const configMap: { [key: string]: string } = {};
pluginFiles.forEach((file) => {
    const pluginFile = path.join(pluginFolder, file);
    configMap[file] = fs.readFileSync(pluginFile, { encoding: "utf-8" });
})

const configFile = "config.json"

CTFD_CLIENT_SECRET.apply(secret => {
    configMap[configFile] = envSubst(configMap[configFile], "OIDC_CLIENT_SECRET", secret)

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
        ],
        {
            // Just because CTFd is stupid
            command: ["/bin/sh", "-c"],
            args: [
                "pip install --no-cache-dir -r CTFd/plugins/ctfd_oidc/requirements.txt && /opt/CTFd/docker-entrypoint.sh"
            ]
        }
    );
});

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

// eval $(minikube docker-env)
const bastionImage = new docker.Image("bastion-image", {
    build: {
        context: "./bastion",
        dockerfile: "./bastion/Dockerfile",
        platform: "linux/amd64"
    },
    imageName: "bastion",
    skipPush: true,
});

new k8s.apps.v1.Deployment("bastion-deployment", {
    metadata: { namespace: NS },
    spec: {
        selector: { matchLabels: appLabels.bastion },
        template: {
            metadata: { labels: appLabels.bastion },
            spec: {
                containers: [
                    {
                        name: "ssh-bastion",
                        image: bastionImage.imageName,
                        imagePullPolicy: stack == Stack.DEV ? "Never" : undefined,
                        ports: [{ containerPort: 22 }],
                        volumeMounts: [{
                            name: "ca-user-key",
                            mountPath: "/etc/ssh/ca_user_key.pub",
                            subPath: "ca_user_key.pub"
                        }]
                    }
                ],
                volumes: [{
                    name: "ca-user-key",
                    configMap: {
                        name: "step-step-certificates-certs",
                        items: [{
                            key: "ssh_user_ca_key.pub",
                            path: "ca_user_key.pub"
                        }]
                    }
                }]
            }
        }
    }
}, { dependsOn: bastionImage });

new k8s.core.v1.Service("bastion-service", {
    metadata: { namespace: NS },
    spec: {
        selector: appLabels.bastion,
        type: "NodePort",
        ports: [{
            port: 22,
            targetPort: 22,
            nodePort: 30022
        }]
    }
});
