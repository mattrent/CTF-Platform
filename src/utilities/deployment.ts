import { Deployment, DeploymentArgs } from "@pulumi/kubernetes/apps/v1";
import { Input, Output } from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

interface Container {
    image: Output<string> | string;
    name: string;
    imagePullPolicy?: string;
    env?: { [key: string]: string };
    imagePullSecrets?: Output<string>
}

interface DeploymentConfig {
    ns: Output<string> | string;
    replicas: number;
    matchLabels: Record<string, Input<string>>;
    labels: Record<string, Input<string>>;
}

export enum VolumeType {
    configMap,
    volume,
}

interface Volume {
    mountPath: string;
    name: Output<string> | string;
    type: VolumeType;
}

interface VolumeConfig {
    volumeMounts: Volume[];
}

export function singleContainerDeploymentInterface(
    resource: string,
    config: DeploymentConfig,
    container: Container,
    volumes?: VolumeConfig,
    containerOverrides?: Partial<k8s.types.input.core.v1.Container>,
    argOverrides?: DeploymentArgs
) {

    const baseConfig: DeploymentArgs = {
        metadata: { namespace: config.ns },
        spec: {
            selector: { matchLabels: config.matchLabels },
            replicas: config.replicas,
            template: {
                metadata: {
                    labels: config.labels
                },
                spec: {
                    containers: [
                        {
                            image: container.image,
                            imagePullPolicy: container.imagePullPolicy,
                            name: container.name,
                            env: Object.entries(container.env ?? {}).map(([name, value]) => ({ name: name, value: value })),
                            volumeMounts: volumes?.volumeMounts,
                            ...containerOverrides
                        },
                    ],
                    volumes: volumes?.volumeMounts.map(volumeMount => {
                        if (volumeMount.type === VolumeType.volume) {
                            return {
                                name: volumeMount.name,
                                PersistentVolumeClaim: { claimName: volumeMount.name }
                            };
                        } else {
                            return {
                                name: volumeMount.name,
                                configMap: { name: volumeMount.name }
                            };
                        }
                    }),
                },
            },
        },
    }

    return new Deployment(resource, { ...baseConfig, ...argOverrides });
};



