import { envSubst, ingressTemplate, serviceTemplate, singleContainerDeploymentTemplate, Stack, VolumeType } from "@ctf/utilities";
import * as docker from "@pulumi/docker";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as fs from "fs";
import * as path from 'path';

/* ------------------------------ prerequisite ------------------------------ */

const config = new pulumi.Config();

const appLabels = {
    ctfd: { app: "ctfd" },
    ctfd_db: { app: "ctfd-db" },
    bastion: { app: "bastion" },
    sshl: { app: "sshl-multiplexer" },
    registry: { app: "image-registry" }
}

const stack = pulumi.getStack();
const org = pulumi.getOrganization();
const stackReference = new pulumi.StackReference(`${org}/infrastructure/${stack}`);

/* --------------------------------- config --------------------------------- */

const HENRIK_BACKEND_CHART = config.require("HENRIK_BACKEND_CHART")
const NS = stack;
const CTFD_PORT = 8000
const HOST = config.require("HOST");
const CTFD_CLIENT_SECRET =
    stackReference.requireOutput("ctfdRealmSecret") as pulumi.Output<string>;

/* ---------------------------------- CTFD ---------------------------------- */

// Challenges plugin baked into image

const ctfdImage = new docker.Image("ctfd-image", {
    build: {
        context: ".",
        dockerfile: "./ctfd/Dockerfile",
        platform: "linux/amd64"
    },
    imageName: "cftd",
    skipPush: true,
});

// OIDC

const ctfdOidcFolder = path.resolve("ctfd/oidc");
const oidcFiles = fs.readdirSync(ctfdOidcFolder);

const configMapOidc: { [key: string]: string } = {};
oidcFiles.forEach((file) => {
    const pluginFile = path.join(ctfdOidcFolder, file);
    configMapOidc[file] = fs.readFileSync(pluginFile, { encoding: "utf-8" });
})

CTFD_CLIENT_SECRET.apply(secret => {
    const configFile = "config.json"
    configMapOidc[configFile] = envSubst(configMapOidc[configFile], "OIDC_CLIENT_SECRET", secret)

    const oidcPlugin = new k8s.core.v1.ConfigMap("oidc-plugin", {
        metadata: {
            namespace: NS
        },
        data: configMapOidc,
    });

    singleContainerDeploymentTemplate(
        "ctfd",
        {
            ns: NS,
            matchLabels: appLabels.ctfd
        },
        {
            image: ctfdImage.imageName,
            imagePullPolicy: stack == Stack.DEV ? "Never" : undefined,
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
                `pip install --no-cache-dir -r CTFd/plugins/ctfd_oidc/requirements.txt &&
                 /opt/CTFd/docker-entrypoint.sh`
            ]
        },
        undefined,
        { dependsOn: ctfdImage }
    );
});

const ctfdService = serviceTemplate(
    "ctfd",
    NS,
    [{ port: CTFD_PORT }],
    appLabels.ctfd
)

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

/* ------------------------------- SSH Bastion ------------------------------ */

const bastion = new k8s.apps.v1.Deployment("bastion-deployment", {
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
    metadata: { namespace: NS, name: "bastion" },
    spec: {
        selector: appLabels.bastion,
        ports: [{ port: 22 }]
    }
});

/* ----------------------------- Henrik Backend ----------------------------- */

new k8s.helm.v3.Chart("deployer", {
    namespace: NS,
    path: HENRIK_BACKEND_CHART,
});

/* ------------------------------- Multiplexer ------------------------------ */

new k8s.apps.v1.Deployment("sslh-deployment", {
    metadata: { namespace: stack },
    spec: {
        selector: { matchLabels: appLabels.sshl },
        template: {
            metadata: { labels: appLabels.sshl },
            spec: {
                containers: [
                    {
                        name: "sslh",
                        image: "ghcr.io/yrutschle/sslh:latest",
                        args: [
                            "--foreground",
                            "--listen=0.0.0.0:443",
                            "--tls=ingress-nginx-controller.ingress-nginx:443",
                            "--http=ingress-nginx-controller.ingress-nginx:80",
                            "--ssh=bastion:22"
                        ]
                    }
                ],
            }
        }
    }
}, { dependsOn: bastion });

new k8s.core.v1.Service("sslh-service", {
    metadata: { namespace: stack, name: "sslh-service" },
    spec: {
        selector: appLabels.sshl,
        type: "NodePort",
        ports: [
            {
                port: 443,
                targetPort: 443,
                nodePort: 30443
            },
        ]
    }
});

/* -------------------------------- Regsitry -------------------------------- */
// TODO generate this as port of the infrastructure (or here)

const mypassword = "secret-no-secret"
const username = "bob"

new k8s.apps.v1.Deployment("docker-registry-deployment", {
    metadata: { namespace: NS},
    spec: {
        selector: { matchLabels: appLabels.registry },
        template: {
            metadata: { 
                labels: appLabels.registry, 
                name: "image-registry",
                annotations: { 
                    "autocert.step.sm/name": `image-registry.${NS}.svc.cluster.local` 
                } 
            },
            spec: {
                initContainers: [{
                    name: "init-htpasswd",
                    image: "httpd:2",
                    command: ["bash", "-c"],
                    args: ["htpasswd -Bbn testuser testpassword > /auth/htpasswd"],
                    volumeMounts: [
                        { name: "auth-volume", mountPath: "/auth" },
                    ],
                }],
                containers: [{
                    name: "docker-registry",
                    image: "registry:2",
                    env: [
                        { name: "REGISTRY_AUTH", value: "htpasswd" },
                        { name: "REGISTRY_AUTH_HTPASSWD_REALM", value: "Registry Realm" },
                        { name: "REGISTRY_AUTH_HTPASSWD_PATH", value: "/auth/htpasswd" },
                        { name: "REGISTRY_HTTP_TLS_CERTIFICATE", value: "/var/run/autocert.step.sm/site.crt" },
                        { name: "REGISTRY_HTTP_TLS_KEY", value: "/var/run/autocert.step.sm/site.key" },
                    ],
                    volumeMounts: [
                        { name: "auth-volume", mountPath: "/auth" },
                    ],
                }],
                volumes: [
                    { name: "auth-volume", emptyDir: {} },
                ],
            },
        },
    },
});

const dockerImageRegistryService = new k8s.core.v1.Service(`image-registry-service`, {
    metadata: { namespace: NS },
    spec: {
        selector: appLabels.registry,
        ports: [{
            port: 5000,
        }],
    },
});

