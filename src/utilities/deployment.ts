import { Deployment, DeploymentArgs } from "@pulumi/kubernetes/apps/v1";
import { Input, Output } from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

interface Container {
    image: Output<string> | string;
    imagePullPolicy?: string;
    env?: { [key: string]: Output<string> | string };
    args?: [string];
    imagePullSecrets?: Output<string>
}

interface DeploymentConfig {
    ns: Output<string> | string;
    matchLabels: Record<string, Input<string>>;
    replicas?: number;
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

export function singleContainerDeploymentTemplate(
    resource: string,
    config: DeploymentConfig,
    container: Container,
    volumes?: Volume[],
    containerOverrides?: Partial<k8s.types.input.core.v1.Container>,
    argOverrides?: DeploymentArgs
): Deployment {

    const baseConfig: DeploymentArgs = {
        metadata: { namespace: config.ns },
        spec: {
            selector: { matchLabels: config.matchLabels },
            replicas: config.replicas ?? 1,
            template: {
                metadata: {
                    labels: config.matchLabels
                },
                spec: {
                    containers: [
                        {
                            image: container.image,
                            imagePullPolicy: container.imagePullPolicy ?? "Always",
                            name: resource,
                            env: Object.entries(container.env ?? {}).map(([name, value]) => ({ name: name, value: value })),
                            volumeMounts: volumes,
                            args: container.args,
                            ...containerOverrides
                        },
                    ],
                    volumes: volumes?.map(volumeMount => {
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

    return new Deployment(`${resource}-deployment`, { ...baseConfig, ...argOverrides });
};



