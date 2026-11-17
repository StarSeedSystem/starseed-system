/**
 * IMA9 · Importación de XLIFF, `.strings` de Apple y `strings.xml` de Android.
 * Módulo PURO (sin red, disco ni `node:*`) y sin librerías XML ni `DOMParser`:
 * analizador mínimo por expresiones regulares con límites de tamaño.
 */
export const LIMITES = { bytes: 2_000_000, entradas: 20_000 } as const;

export interface Descartada { clave: string; valor?: string; motivo: string }
export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: Descartada[];
    avisos: string[];
}

const CLAVES_PROHIBIDAS = new Set(["__proto__", "constructor", "prototype"]);
const nuevoResultado = (): ResultadoImportacion => ({ entradas: {}, descartadas: [], avisos: [] });
const vacio = (motivo: string): ResultadoImportacion => ({ ...nuevoResultado(), avisos: [motivo] });
const superaTamano = (texto: string): boolean => texto.length > LIMITES.bytes;
const tieneEtiquetas = (texto: string): boolean => /<[a-zA-Z]/.test(texto);
const contar = (texto: string, patron: RegExp): number => (texto.match(patron) ?? []).length;
const estaRoto = (texto: string, abre: RegExp, cierra: RegExp): boolean => contar(texto, abre) > contar(texto, cierra);

const ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t", '"': '"', "'": "'", "\\": "\\" };
const desescapar = (texto: string): string => texto.replace(/\\(.)/g, (_m, c: string) => ESCAPES[c] ?? c);
const decodificarEntidades = (texto: string): string =>
    texto.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&amp;/g, "&");

function agregar(r: ResultadoImportacion, vistas: Set<string>, clave: string, valor: string): void {
    const k = clave.trim();
    const v = valor.trim();
    const descartar = (motivo: string): void => { r.descartadas.push({ clave: k, valor: v, motivo }); };
    if (!k) { descartar("entrada sin clave"); return; }
    if (!v) { descartar("entrada sin valor"); return; }
    if (CLAVES_PROHIBIDAS.has(k)) { descartar("clave prohibida"); return; }
    if (tieneEtiquetas(v)) { descartar("el valor conserva etiquetas"); return; }
    if (vistas.has(k)) { descartar("clave duplicada"); return; }
    if (vistas.size >= LIMITES.entradas) { r.avisos.push(`límite de ${LIMITES.entradas} entradas alcanzado`); return; }
    vistas.add(k);
    r.entradas[k] = v;
}

interface Bloque { atributos: string; cuerpo: string }
function bloques(texto: string, etiqueta: string): Bloque[] {
    const patron = new RegExp(`<${etiqueta}\\b([^>]*)>([\\s\\S]*?)</${etiqueta}>`, "g");
    return Array.from(texto.matchAll(patron), (m) => ({ atributos: m[1] ?? "", cuerpo: m[2] ?? "" }));
}
function atributo(atributos: string, nombre: string): string | undefined {
    const m = new RegExp(`(?:^|\\s)${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(atributos);
    return m ? decodificarEntidades(m[1] ?? m[2] ?? "") : undefined;
}
function contenido(bloque: string, etiqueta: string): string | null {
    const m = new RegExp(`<${etiqueta}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${etiqueta}>)`).exec(bloque);
    return m ? m[1] ?? "" : null;
}

export function desdeXliff(texto: string): ResultadoImportacion {
    if (superaTamano(texto)) return vacio("el archivo supera el límite de 2 MB");
    if (estaRoto(texto, /<trans-unit\b/g, /<\/trans-unit>/g) || estaRoto(texto, /<unit\b/g, /<\/unit>/g)) {
        return vacio("XLIFF roto: hay etiquetas sin cerrar");
    }
    const u12 = bloques(texto, "trans-unit");
    const u20 = bloques(texto, "unit");
    if (u12.length === 0 && u20.length === 0) return vacio("XLIFF sin unidades o XML roto");
    const r = nuevoResultado();
    const vistas = new Set<string>();
    const importar = (atributos: string, cuerpo: string): void => {
        const fuente = contenido(cuerpo, "source");
        const destino = contenido(cuerpo, "target");
        const clave = atributo(atributos, "id") ?? (fuente === null ? "" : decodificarEntidades(fuente));
        if (destino === null) { r.descartadas.push({ clave: clave.trim(), motivo: "unidad sin <target>" }); return; }
        agregar(r, vistas, clave, decodificarEntidades(destino));
    };
    for (const unidad of u12) importar(unidad.atributos, unidad.cuerpo);
    for (const unidad of u20) for (const segmento of bloques(unidad.cuerpo, "segment")) importar(unidad.atributos, segmento.cuerpo);
    return r;
}

const PAR_APPLE = /(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)|"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;

export function desdeStringsApple(texto: string): ResultadoImportacion {
    if (superaTamano(texto)) return vacio("el archivo supera el límite de 2 MB");
    const r = nuevoResultado();
    const vistas = new Set<string>();
    for (const m of texto.matchAll(PAR_APPLE)) {
        if (m[1] === undefined) continue;
        agregar(r, vistas, desescapar(decodificarEntidades(m[1])), desescapar(decodificarEntidades(m[2] ?? "")));
    }
    if (vistas.size === 0 && r.descartadas.length === 0) r.avisos.push(".strings sin parejas «clave» = «valor»");
    return r;
}

const normalizarMarcadores = (texto: string): string =>
    texto.replace(/%(\d+)\$s/g, (_m, n: string) => `{${Number(n) - 1}}`).replace(/%s/g, "{0}");
const ABRE_ANDROID = /<string(?:\s[^>]*)?>/g;
const CIERRA_ANDROID = /<\/string>/g;
const BLOQUE_ANDROID = /<string(\s[^>]*)?>([\s\S]*?)<\/string>/g;

export function desdeStringsAndroid(texto: string): ResultadoImportacion {
    if (superaTamano(texto)) return vacio("el archivo supera el límite de 2 MB");
    if (estaRoto(texto, ABRE_ANDROID, CIERRA_ANDROID)) return vacio("strings.xml roto: hay etiquetas sin cerrar");
    const r = nuevoResultado();
    const vistas = new Set<string>();
    let encontrados = 0;
    for (const m of texto.matchAll(BLOQUE_ANDROID)) {
        encontrados++;
        const atributos = m[1] ?? "";
        const clave = atributo(atributos, "name") ?? "";
        const bruto = m[2] ?? "";
        if (atributo(atributos, "translatable") === "false") {
            r.descartadas.push({ clave, valor: bruto.trim(), motivo: 'translatable="false"' });
            continue;
        }
        agregar(r, vistas, clave, normalizarMarcadores(desescapar(decodificarEntidades(bruto))));
    }
    if (encontrados === 0) r.avisos.push("strings.xml sin <string> o XML roto");
    return r;
}
