/**
 * Funciones puras para el log de agentes (Ola 344 · MD2b).
 * Sin disco, sin red: solo texto.
 */

/** Solo admite id seguro para rutas locales. */
export function idSeguro(id: string): boolean {
    return /^[A-Za-z0-9_-]{1,40}$/.test(id);
}

/** Recorta el texto desde un offset en bytes (UTF-8). */
export function recortarDesde(texto: string, desdeBytes: number): { nuevo: string; nuevoOffset: number } {
    if (desdeBytes <= 0) return { nuevo: texto, nuevoOffset: Buffer.byteLength(texto, "utf8") };
    let acumulado = 0;
    let i = 0;
    while (i < texto.length) {
        const byteLen = Buffer.byteLength(texto[i], "utf8");
        if (acumulado + byteLen > desdeBytes) break;
        acumulado += byteLen;
        i++;
    }
    const resto = texto.slice(i);
    const nuevoOffset = acumulado + Buffer.byteLength(resto, "utf8");
    return { nuevo: resto, nuevoOffset };
}

/** Últimas n líneas del texto. */
export function ultimasLineas(texto: string, n = 200): string {
    const lineas = texto.split("\n");
    return lineas.slice(-n).join("\n");
}
