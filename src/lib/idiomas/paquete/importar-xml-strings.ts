/**
 * IMA9 (TRA1116) · Importación de XLIFF 1.2/2.0, .strings de Apple y strings.xml de Android.
 * Módulo PURO: analizador mínimo por expresiones regulares, sin librerías XML ni DOMParser.
 * Ningún valor conserva etiquetas: lo que queda con «<» seguido de letra se descarta con motivo.
 */
export const LIMITES_IMPORTACION = { texto: 2_000_000, entradas: 20_000 } as const;
export interface Descartada { clave: string; motivo: string }
export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: Descartada[];
    avisos: string[];
}
interface Par { clave: string; valor: string }
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "'": "'", '"': '"', "\\": "\\" };
const ENTIDADES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" };
const PATRONES_UNIDAD: RegExp[] = [
    /<trans-unit\b([^>]*)>([\s\S]*?)<\/trans-unit>/g,
    /<unit\b([^>]*)>([\s\S]*?)<\/unit>/g,
];
function decodificarEntidades(texto: string): string {
    return texto.replace(/&(?:lt|gt|quot|apos|amp);/g, (e) => ENTIDADES[e]);
}
function atributo(tag: string, nombre: string): string | null {
    const m = tag.match(new RegExp(`${nombre}\\s*=\\s*"([^"]*)"`, "i"));
    return m ? m[1] : null;
}
function desescapar(texto: string, posicionales: boolean): string {
    const base = texto.replace(/\\(.)/g, (m, c: string) => ESCAPES[c] ?? m);
    return posicionales ? base.replace(/%(\d+)\$s/g, (_, n: string) => `{${Number(n) - 1}}`).replace(/%s/g, "{0}") : base;
}
function controlarEntrada(texto: string): ResultadoImportacion | null {
    if (typeof texto !== "string" || texto.length === 0) {
        return { entradas: Object.create(null), descartadas: [], avisos: ["El texto está vacío"] };
    }
    if (texto.length > LIMITES_IMPORTACION.texto) {
        return { entradas: Object.create(null), descartadas: [], avisos: [`El texto supera el límite de ${LIMITES_IMPORTACION.texto} caracteres`] };
    }
    return null;
}
function finalizar(pares: Par[], descartadas: Descartada[], avisos: string[]): ResultadoImportacion {
    const entradas: Record<string, string> = Object.create(null);
    let total = 0;
    for (const { clave, valor } of pares) {
        if (total >= LIMITES_IMPORTACION.entradas) { avisos.push(`Se alcanzó el límite de ${LIMITES_IMPORTACION.entradas} entradas; el resto se descarta`); break; }
        if (/<[a-zA-Z]/.test(valor)) { descartadas.push({ clave, motivo: "el valor conserva etiquetas" }); continue; }
        if (clave in entradas) { avisos.push(`Clave repetida: se conserva la primera de «${clave.slice(0, 40)}»`); continue; }
        entradas[clave] = valor;
        total += 1;
    }
    return { entradas, descartadas, avisos };
}
function sinComentarios(texto: string): string {
    let salida = "", i = 0, enCadena = false;
    while (i < texto.length) {
        const c = texto[i];
        const d = texto[i + 1] ?? "";
        if (enCadena) {
            salida += c === "\\" ? c + d : c;
            i += c === "\\" ? 2 : 1;
            if (c === '"') enCadena = false;
        } else if (c === '"') { enCadena = true; salida += c; i += 1; }
        else if (c === "/" && d === "*") { const f = texto.indexOf("*/", i + 2); i = f === -1 ? texto.length : f + 2; salida += " "; }
        else if (c === "/" && d === "/") { const f = texto.indexOf("\n", i + 2); i = f === -1 ? texto.length : f; }
        else { salida += c; i += 1; }
    }
    return salida;
}
export function desdeXliff(texto: string): ResultadoImportacion {
    const control = controlarEntrada(texto);
    if (control) return control;
    const pares: Par[] = [];
    const descartadas: Descartada[] = [];
    const avisos: string[] = [];
    let unidades = 0;
    for (const { re } of PATRONES_UNIDAD) {
        for (const u of texto.matchAll(re)) {
            unidades += 1;
            const s = /<source[^>]*>([\s\S]*?)<\/source>/.exec(u[2]);
            const t = /<target[^>]*>([\s\S]*?)<\/target>/.exec(u[2]);
            const clave = s ? decodificarEntidades(s[1].trim()) : "";
            const valor = t ? decodificarEntidades(t[1].trim()) : "";
            if (!clave || !valor) descartadas.push({ clave, motivo: "sin source o sin target" });
            else pares.push({ clave, valor });
        }
    }
    if (unidades === 0) avisos.push("No se encontró ninguna unidad traducible: el XLIFF está roto o vacío");
    return finalizar(pares, descartadas, avisos);
}
export function desdeStringsApple(texto: string): ResultadoImportacion {
    const control = controlarEntrada(texto);
    if (control) return control;
    const limpio = sinComentarios(texto);
    const pares: Par[] = [];
    const descartadas: Descartada[] = [];
    const avisos: string[] = [];
    let encontradas = 0;
    for (const m of limpio.matchAll(/"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g)) {
        encontradas += 1;
        pares.push({ clave: desescapar(m[1], false), valor: desescapar(m[2], false) });
    }
    if (encontradas === 0) avisos.push("No se encontró ninguna entrada «clave» = «valor»; el .strings está roto o vacío");
    return finalizar(pares, descartadas, avisos);
}
export function desdeStringsAndroid(texto: string): ResultadoImportacion {
    const control = controlarEntrada(texto);
    if (control) return control;
    const pares: Par[] = [];
    const descartadas: Descartada[] = [];
    const avisos: string[] = [];
    let encontradas = 0;
    for (const m of texto.matchAll(/<string\b([^>]*?)(?:\/>|>([\s\S]*?)<\/string>)/g)) {
        encontradas += 1;
        if (/translatable\s*=\s*"false"/.test(m[1])) continue;
        const clave = atributo(m[1], "name");
        if (clave === null) { descartadas.push({ clave: "", motivo: "string sin name" }); continue; }
        pares.push({ clave, valor: desescapar(decodificarEntidades((m[2] ?? "").trim()), true) });
    }
    if (encontradas === 0) avisos.push("No se encontró ningún <string>; el strings.xml está roto o vacío");
    return finalizar(pares, descartadas, avisos);
}
