/** VEN1115L · el texto va en trozos de 512 caracteres como mucho (contrato §2.4), sin partir un par sustituto. */
export const MAX_TEXTO = 512;

export function trocear(texto: string, max = MAX_TEXTO): string[] {
    const trozos: string[] = [];
    let i = 0;
    while (i < texto.length) {
        let fin = Math.min(i + max, texto.length);
        if (fin < texto.length) {
            const c = texto.charCodeAt(fin - 1);
            if (c >= 0xd800 && c <= 0xdbff) fin -= 1; // no dejar una mitad de carácter al final del trozo
        }
        trozos.push(texto.slice(i, fin));
        i = fin;
    }
    return trozos;
}
