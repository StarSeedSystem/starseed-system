/**
 * IMA8 · Importadores gettext (.po/.pot) y Java .properties.
 * Módulo PURO: sin red, sin disco, sin procesos y sin `node:*`.
 */

export interface Descarte { motivo: string; linea?: number }
export interface ResultadoImportacion { entradas: Record<string, string>; descartadas: Descarte[]; avisos: string[] }
interface Bloque { contexto: string | null; msgid: string | null; plural: string | null; traduccion: string; fuzzy: boolean; linea: number }
type Campo = "contexto" | "msgid" | "plural" | "traduccion";
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", a: "\u0007", b: "\b", f: "\f", v: "\v", '"': '"', "\\": "\\" };
const ESCAPES_PROPIEDADES: Record<string, string> = { n: "\n", t: "\t", r: "\r", f: "\f", "\\": "\\", ":": ":", "=": "=", " ": " ", "!": "!", "#": "#" };

function desescaparPo(texto: string): string {
    return texto.replace(/\\(.)/g, (m: string) => ESCAPES[m[1]] ?? m[1]);
}
function cadenasDeLinea(linea: string): string[] {
    const encontradas = linea.match(/"(?:\\.|[^"\\])*"/g) ?? [];
    return encontradas.map((c) => desescaparPo(c.slice(1, -1)));
}
function bloqueVacio(linea: number): Bloque {
    return { contexto: null, msgid: null, plural: null, traduccion: "", fuzzy: false, linea };
}

export function desdePo(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const descartadas: Descarte[] = [];
    const avisos: string[] = [];
    let bloque = bloqueVacio(1), hayBloque = false, fuzzyPendiente = false;
    let continuando: Campo | "ignorado" | null = null;
    const iniciar = (numero: number) => {
        if (hayBloque) return;
        bloque = { ...bloqueVacio(numero), fuzzy: fuzzyPendiente }; fuzzyPendiente = false; hayBloque = true;
    };
    const cerrar = () => {
        if (!hayBloque) return;
        hayBloque = false; continuando = null;
        const b = bloque;
        if (b.msgid === null || (b.msgid === "" && b.contexto === null)) return;
        const clave = b.contexto === null ? b.msgid : `${b.contexto}|${b.msgid}`;
        if (b.fuzzy) return void avisos.push(`fuzzy ignorado: ${clave} (línea ${b.linea})`);
        if (b.traduccion === "") return void descartadas.push({ motivo: "msgstr vacío", linea: b.linea });
        if (b.plural !== null) avisos.push(`plural simplificado: ${clave} (se usa msgstr[0])`);
        entradas[clave] = b.traduccion;
    };
    texto.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((cruda, indice) => {
        const numero = indice + 1, linea = cruda.trim();
        if (linea === "") { continuando = null; return; }
        if (linea.startsWith("#")) {
            if (/^#,[^\n]*\bfuzzy\b/.test(linea)) fuzzyPendiente = true;
            continuando = null; return;
        }
        const m = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)(?:\s+(.*))?$/.exec(linea);
        if (m === null) {
            if (continuando !== null && continuando !== "ignorado" && linea.startsWith('"')) bloque[continuando] = (bloque[continuando] ?? "") + cadenasDeLinea(linea).join("");
        } else if (m[1] === "msgctxt") {
            if (hayBloque && bloque.msgid !== null) cerrar();
            iniciar(numero);
            bloque.contexto = cadenasDeLinea(m[3] ?? "").join(""); continuando = "contexto";
        } else if (m[1] === "msgid" || m[1] === "msgid_plural") {
            if (m[1] === "msgid" && hayBloque && bloque.msgid !== null) cerrar();
            iniciar(numero);
            const valor = cadenasDeLinea(m[3] ?? "").join("");
            if (m[1] === "msgid") { bloque.msgid = valor; bloque.linea = numero; continuando = "msgid"; }
            else { bloque.plural = valor; continuando = "plural"; }
        } else {
            iniciar(numero); const secundaria = m[2] !== undefined && Number(m[2]) > 0;
            if (!secundaria) bloque.traduccion += cadenasDeLinea(m[3] ?? "").join("");
            continuando = secundaria ? "ignorado" : "traduccion";
        }
    });
    cerrar();
    return { entradas, descartadas, avisos };
}

function desescaparPropiedades(texto: string): string {
    return texto.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (m: string) => {
        const c = m.slice(1);
        if (c.length === 5 && c[0] === "u") return String.fromCharCode(parseInt(c.slice(1), 16));
        return ESCAPES_PROPIEDADES[c] ?? c;
    });
}
function lineasLogicas(original: string): { texto: string; linea: number }[] {
    const resultado: { texto: string; linea: number }[] = [];
    let acumulada = "", inicio = 1;
    original.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((cruda, indice) => {
        const pelada = cruda.replace(/^[ \t\f]+/, "");
        if (acumulada === "" && (pelada === "" || /^[#!]/.test(pelada))) { resultado.push({ texto: pelada, linea: indice + 1 }); return; }
        if (acumulada === "") inicio = indice + 1;
        const barras = /\\+$/.exec(pelada);
        if (barras !== null && barras[0].length % 2 === 1) acumulada += pelada.slice(0, -1);
        else { resultado.push({ texto: acumulada + pelada, linea: inicio }); acumulada = ""; }
    });
    if (acumulada !== "") resultado.push({ texto: acumulada, linea: inicio });
    return resultado;
}
function separarPropiedad(linea: string): { clave: string; valor: string } | null {
    let i = 0;
    while (i < linea.length && linea[i] !== "=" && linea[i] !== ":") { if (linea[i] === "\\") i++; i++; }
    if (i >= linea.length) return null;
    const resto = linea.slice(i + 1).replace(/^[ \t\f]+/, "");
    return { clave: linea.slice(0, i).replace(/[ \t\f]+$/, ""), valor: resto };
}

export function desdeProperties(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {}, descartadas: Descarte[] = [], avisos: string[] = [];
    for (const { texto: logica, linea } of lineasLogicas(texto)) {
        if (logica.trim() === "" || /^[#!]/.test(logica)) continue;
        const partes = separarPropiedad(logica);
        if (partes === null) { descartadas.push({ motivo: "línea sin separador «=» ni «:»", linea }); continue; }
        const clave = desescaparPropiedades(partes.clave), valor = desescaparPropiedades(partes.valor);
        if (clave === "") { descartadas.push({ motivo: "clave vacía", linea }); continue; }
        if (valor === "") { descartadas.push({ motivo: "valor vacío", linea }); continue; }
        entradas[clave] = valor;
    }
    return { entradas, descartadas, avisos };
}
