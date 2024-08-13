
import * as k8s from "@pulumi/kubernetes";

interface Path {
    pathType: string;
    path: string;
    name: string;
    port: number;
}

export function ingressTemplate(
    resource: string,
    ns: string,
    rt: string,
    bp: string,
    host: string,
    paths: Path[]
) : k8s.networking.v1.Ingress {
    return new k8s.networking.v1.Ingress(resource, {
        metadata: {
            namespace: ns,
            name: resource,
            annotations: {
                "nginx.ingress.kubernetes.io/rewrite-target": rt,
                "nginx.ingress.kubernetes.io/backend-protocol": bp,
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
                    host: host,
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