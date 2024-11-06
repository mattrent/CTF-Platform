import { envSubst, serviceTemplate } from "@ctf/utilities";
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

const HENRIK_BACKEND_CHART = "ctf/backend/deployment/helm"
const NS = stack;
const CTFD_PORT = 8000
const REGISTRY_PORT = 5000;
const REGISTRY_EXPOSED_PORT = 443;
const CTFD_HOST = config.require("CTFD_HOST");
const IMAGE_REGISTRY_HOST = config.require("IMAGE_REGISTRY_HOST");
const CTFD_OIDC_PLUGIN_PATH = config.require("CTFD_OIDC_PLUGIN_PATH");

/* --------------------------------- secret --------------------------------- */

const CTFD_CLIENT_SECRET =
    stackReference.requireOutput("ctfdRealmSecret") as pulumi.Output<string>;
const DOCKER_USERNAME =
    stackReference.requireOutput("dockerUsername") as pulumi.Output<string>;
const DOCKER_PASSWORD =
    stackReference.requireOutput("dockerPassword") as pulumi.Output<string>;
const CTFD_JWT_SECRET =
    stackReference.requireOutput("jwtCtfd") as pulumi.Output<string>;

/* -------------------------------- Regsitry -------------------------------- */

pulumi.all([DOCKER_USERNAME, DOCKER_PASSWORD, CTFD_JWT_SECRET]).apply(([dockerUsername, dockerPassword, jwtCtfd]) => {
    const imageRegistryDeployment = new k8s.apps.v1.Deployment("docker-registry-deployment", {
        metadata: { namespace: NS },
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
                        args: [`htpasswd -Bbn ${dockerUsername} ${dockerPassword} > /auth/htpasswd`],
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
                        readinessProbe: {
                            httpGet: {
                                path: "/",
                                port: REGISTRY_PORT,
                                scheme: "HTTPS"
                            },
                            initialDelaySeconds: 5,
                            periodSeconds: 10
                        }
                    }],
                    volumes: [
                        { name: "auth-volume", emptyDir: {} },
                    ],
                },
            },
        },
    });

    const imagePullSecret = new k8s.core.v1.Secret("image-pull-secret", {
        metadata: {
            namespace: NS
        },
        type: "kubernetes.io/dockerconfigjson",
        data: {
            ".dockerconfigjson": pulumi.secret(Buffer.from(JSON.stringify({
                auths: {
                    "localregistry:443": {
                        username: dockerUsername,
                        password: dockerPassword,
                        auth: Buffer.from(`${dockerUsername}:${dockerPassword}`).toString('base64'),
                    },
                },
            })).toString('base64')),
        },
    });

    const dockerImageRegistryService = new k8s.core.v1.Service(`image-registry-service`, {
        metadata: { namespace: NS, name: IMAGE_REGISTRY_HOST },
        spec: {
            selector: appLabels.registry,
            ports: [{
                port: REGISTRY_EXPOSED_PORT,
                targetPort: REGISTRY_PORT
            }],
        }
    });

    const registryIngress = new k8s.networking.v1.Ingress("registry-ingress", {
        metadata: {
            namespace: NS,
            annotations: {
                "nginx.ingress.kubernetes.io/backend-protocol": "HTTPS",
                "nginx.ingress.kubernetes.io/proxy-body-size": "0", // disable package size
                "nginx.ingress.kubernetes.io/force-ssl-redirect": "true",
                "cert-manager.io/issuer": "step-issuer",
                "cert-manager.io/issuer-kind": "StepIssuer",
                "cert-manager.io/issuer-group": "certmanager.step.sm"
            },
        },
        spec: {
            ingressClassName: "nginx",
            rules: [{
                host: IMAGE_REGISTRY_HOST,
                http: {
                    paths: [{
                        path: "/",
                        pathType: "Prefix",
                        backend: {
                            service: {
                                name: dockerImageRegistryService.metadata.name,
                                port: {
                                    number: REGISTRY_EXPOSED_PORT,
                                },
                            },
                        },
                    }],
                },
            }],
            tls: [{
              hosts: [IMAGE_REGISTRY_HOST],
              secretName: "image-registry-tls"
            }]
        },
    });

    /* ---------------------------------- CTFD ---------------------------------- */

    // Challenges plugin baked into image

    const ctfdImage = new docker.Image("ctfd-image", {
        build: {
            context: ".",
            dockerfile: "./ctfd/Dockerfile",
            platform: "linux/amd64",
            builderVersion: docker.BuilderVersion.BuilderV1,
        },
        registry: {
            server: "https://localregistry:443",
            username: dockerUsername,
            password: dockerPassword
        },
        imageName: "localregistry:443/ctfd:latest",
        skipPush: false,
    }, { dependsOn: [imageRegistryDeployment, registryIngress, dockerImageRegistryService] });

    ctfdImage.repoDigest.apply(digest => console.log("CTFd image digest:", digest))

    // OIDC

    const ctfdOidcFolder = path.resolve(CTFD_OIDC_PLUGIN_PATH);
    const configFile = "config.json"

    const configMapOidc: { [key: string]: string } = {};
    const pluginFile = path.join(ctfdOidcFolder, configFile);
    configMapOidc[configFile] = fs.readFileSync(pluginFile, { encoding: "utf-8" });

    CTFD_CLIENT_SECRET.apply(secret => {
        configMapOidc[configFile] = envSubst(configMapOidc[configFile], "OIDC_CLIENT_SECRET", secret)

        const oidcPlugin = new k8s.core.v1.ConfigMap("oidc-plugin", {
            metadata: {
                namespace: NS
            },
            data: configMapOidc,
        });

        new k8s.apps.v1.Deployment("ctfd-deployment", {
            metadata: { namespace: NS },
            spec: {
                selector: { matchLabels: appLabels.ctfd },
                template: {
                    metadata: { labels: appLabels.ctfd },
                    spec: {
                        containers: [
                            {
                                name: "ctfd",
                                image: ctfdImage.repoDigest,
                                volumeMounts: [{
                                    name: "plugin-config",
                                    mountPath: "/opt/CTFd/CTFd/plugins/ctfd_oidc/config.json",
                                    subPath: "config.json"
                                }],
                                env: [
                                    { name: "APPLICATION_ROOT", value: "/ctfd" },
                                    { name: "REVERSE_PROXY", value: "true" },
                                    { name: "JWTSECRET", value: jwtCtfd },
                                    { name: "BACKENDURL", value: "http://deployer" }
                                ]
                            }
                        ],
                        imagePullSecrets: [{ name: imagePullSecret.metadata.name }],
                        volumes: [{
                            name: "plugin-config",
                            configMap: {
                                name: oidcPlugin.metadata.name,
                            }
                        }]
                    }
                }
            }
        }, { dependsOn: ctfdImage });
    });

    const ctfdService = serviceTemplate(
        "ctfd",
        NS,
        [{ port: CTFD_PORT }],
        appLabels.ctfd
    )

    new k8s.networking.v1.Ingress("ctfd-ingress", {
        metadata: {
            namespace: NS,
            annotations: {
                "nginx.ingress.kubernetes.io/force-ssl-redirect": "true",
                "cert-manager.io/issuer": "step-issuer",
                "cert-manager.io/issuer-kind": "StepIssuer",
                "cert-manager.io/issuer-group": "certmanager.step.sm",
                "nginx.ingress.kubernetes.io/rewrite-target": "/ctfd/$2",
            },
        },
        spec: {
            ingressClassName: "nginx",
            tls: [{
                hosts: [CTFD_HOST],
                secretName: "ctfd-tls",
            }],
            rules: [{
                host: CTFD_HOST,
                http: {
                    paths: [{
                        path: "/ctfd(/|$)(.*)",
                        pathType: "ImplementationSpecific",
                        backend: {
                            service: {
                                name: ctfdService.metadata.name,
                                port: {
                                    number: CTFD_PORT,
                                },
                            },
                        },
                    }],
                },
            }],
        },
    });

    // /* ------------------------------- SSH Bastion ------------------------------ */

    const bastionImage = new docker.Image("bastion-image", {
        build: {
            context: "./bastion",
            dockerfile: "./bastion/Dockerfile",
            platform: "linux/amd64",
            builderVersion: docker.BuilderVersion.BuilderV1,
        },
        registry: {
            server: "https://localregistry:443",
            username: dockerUsername,
            password: dockerPassword
        },
        imageName: "localregistry:443/bastion:latest",
        skipPush: false,
    }, { dependsOn: [imageRegistryDeployment, registryIngress, dockerImageRegistryService] });

    bastionImage.repoDigest.apply(digest => console.log("Bastion image digest:", digest))


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
                            image: bastionImage.repoDigest,
                            ports: [{ containerPort: 22 }],
                            volumeMounts: [{
                                name: "ca-user-key",
                                mountPath: "/etc/ssh/ca_user_key.pub",
                                subPath: "ca_user_key.pub"
                            }]
                        }
                    ],
                    imagePullSecrets: [{ name: imagePullSecret.metadata.name }],
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

    // new k8s.helm.v3.Chart("deployer", {
    //     namespace: NS,
    //     path: HENRIK_BACKEND_CHART,
    // });

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
});