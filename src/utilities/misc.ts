export function envSubst(content: string, envVariable: string, replaceValue: string): string {
    const regex = new RegExp(`\\$\\{${envVariable}\\}`, 'g');
    return content.replace(regex, replaceValue);
}

export enum Stack {
    DEV = "dev"
}