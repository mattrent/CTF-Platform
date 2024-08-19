export function envSubst(content: string, envVariable: string, replaceValue: string) {
    return content.replace(`${'${' + envVariable + '}'}`, replaceValue);
}