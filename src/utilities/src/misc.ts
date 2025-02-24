import * as command from "@pulumi/command";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export function envSubst(content: string, envVariable: string, replaceValue: string): string {
    const regex = new RegExp(`\\$\\{${envVariable}\\}`, 'g');
    return content.replace(regex, replaceValue);
}

export enum Stack {
    DEV = "dev",
    UCLOUD = "ucloud"
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function restartStep(
    NS: string,
    waitCondition: pulumi.Output<pulumi.CustomResource[]>
        | k8s.apps.v1.Deployment
        | pulumi.Input<pulumi.Input<pulumi.Resource>[]>
        | undefined,
    restartOnUpdate: boolean
) {
    // Reinitialize Step Certificate due to circular dependency
    // Wait until Step has started again
    // * Only one replica is supported at this time.
    const stepRestartCommand = `
        sleep 10 && \
        kubectl rollout restart -n ${NS} statefulset step-step-certificates && \
        sleep 20 && \
        kubectl wait -n ${NS} --for=condition=Ready pod/step-step-certificates-0 --timeout=600s
    `;

    new command.local.Command("restart-step-certificate", {
        create: stepRestartCommand,
        update: restartOnUpdate ? stepRestartCommand : undefined
    }, { dependsOn: waitCondition });
}

export const cleanPath = (input: string): string => input.replace(/(\/.+)\/$/, "$1");