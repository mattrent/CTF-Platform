
import * as k8s from "@pulumi/kubernetes";
import { Output } from "@pulumi/pulumi";

interface Path {
    pathType: string;
    path: string;
    name: Output<string>;
    port: number;
}

interface Config {
    ns: Output<string> | string;
    rt: string;
    bp: string;
    host: string;
}

export function ingressTemplate(
    resource: string,
    config: Config,
    paths: Path[]
) : k8s.networking.v1.Ingress {
    return new k8s.networking.v1.Ingress(`${resource}-ingress`, {
        metadata: {
            namespace: config.ns,
            name: resource,
            annotations: {
                "nginx.ingress.kubernetes.io/rewrite-target": config.rt,
                "nginx.ingress.kubernetes.io/backend-protocol": config.bp,
                "nginx.ingress.kubernetes.io/force-ssl-redirect": "true",
                "nginx.ingress.kubernetes.io/ssl-passthrough": "true",
                "nginx.ingress.kubernetes.io/enable-cors": "true",
                "nginx.ingress.kubernetes.io/cors-allow-methods": "PUT, GET, POST, OPTIONS",
                "nginx.ingress.kubernetes.io/proxy-body-size": "64m"
            },
        },
        spec: {
            ingressClassName: "nginx",
            rules: [
                {
                    host: config.host,
                    http: {
                        paths: paths.map(path => {
                            return {
                                pathType: path.pathType,
                                path: path.path,
                                backend: {
                                    service: {
                                        name: path.name,
                                        port: { number: path.port }
                                    }
                                }
                            }
                        })
                    },
                },
            ]
        }
    });
}