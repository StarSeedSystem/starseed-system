/**
 * IMA8 · Importación de gettext (.po/.pot) y .properties a pares clave/valor.
 * Módulo puro: sin red, sin disco, sin procesos.
 */

export interface ResultadoImportacion {
    entradas: Record<string, string>;
    descartadas: number;
    avisos: string[];
}

export function desescapar(f: string): string {
    return f.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_coincide, g: string) => {
        if (g[0] === "u") return String.fromCharCode(parseInt(g.slice(1), 16));
        const mapa: Record<string, string> = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" };
        return mapa[g] ?? g;
    });
}

const enContinuacion = (s: string): boolean => ((s.match(/\\+$/) ?? [""])[0].length % 2 === 1);

function partirPropiedad(rec: string): { clave: string; valor: string } | null {
    for (let i = 0; i < rec.length; i++) {
        const c = rec[i];
        if (c === "\\") { i++; continue; }
        if (c === "=" || c === ":") return { clave: rec.slice(0, i), valor: rec.slice(i + 1) };
        if (c === " " || c === "\t") {
            let j = i;
            while (j < rec.length && (rec[j] === " " || rec[j] === "\t")) j++;
            const conSigno = rec[j] === "=" || rec[j] === ":";
            return { clave: rec.slice(0, i), valor: rec.slice(j + (conSigno ? 1 : 0)) };
        }
    }
    return null;
}

interface BloquePo {
    contexto: string; id: string; plural: string; fuzzy: boolean;
    cadenas: Array<{ indice: string; texto: string }>;
}

export function desdePo(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const avisos: string[] = [];
    let descartadas = 0;
    let bloque: BloquePo | null = null;
    let campo: "id" | "plural" | "contexto" | "cadena" = "id";
    let fuzzyPendiente = false;
    let contextoPendiente = "";

    const vaciar = (): void => {
        if (!bloque) return;
        if (bloque.id === "") { bloque = null; return; } // cabecera del catálogo: se ignora
        const forma0 = bloque.cadenas.find((c) => c.indice === "0" || c.indice === "");
        const clave = bloque.contexto ? `${bloque.contexto}|${bloque.id}` : bloque.id;
        if (bloque.fuzzy) { descartadas++; avisos.push(`Entrada fuzzy descartada: ${bloque.id}`); }
        else if (!forma0 || forma0.texto === "") descartadas++;
        else { if (bloque.plural !== "") avisos.push(`Plural simplificado a la forma 0: ${bloque.id}`); entradas[clave] = forma0.texto; }
        bloque = null;
    };

    for (const linea of texto.split(/\r?\n/)) {
        const recortada = linea.trim();
        const comando = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(recortada);
        if (comando) {
            const trozo = desescapar(comando[3]);
            if (comando[1] === "msgctxt") { vaciar(); campo = "contexto"; contextoPendiente = trozo; }
            else if (comando[1] === "msgid") { vaciar(); bloque = { contexto: contextoPendiente, id: trozo, plural: "", cadenas: [], fuzzy: fuzzyPendiente }; contextoPendiente = ""; fuzzyPendiente = false; campo = "id"; }
            else if (comando[1] === "msgid_plural") { campo = "plural"; if (bloque) bloque.plural = trozo; }
            else { campo = "cadena"; if (bloque) bloque.cadenas.push({ indice: comando[2] ?? "", texto: trozo }); }
            continue;
        }
        const continua = /^"((?:[^"\\]|\\.)*)"\s*$/.exec(recortada);
        if (continua && (bloque || campo === "contexto")) {
            const trozo = desescapar(continua[1]);
            if (campo === "contexto") { if (bloque) bloque.contexto += trozo; else contextoPendiente += trozo; }
            else if (!bloque) { /* línea suelta antes de msgid: se ignora */ }
            else if (campo === "id") bloque.id += trozo;
            else if (campo === "plural") bloque.plural += trozo;
            else { const ultima = bloque.cadenas.at(-1); if (ultima) ultima.texto += trozo; }
            continue;
        }
        if (recortada.startsWith("#,") && /\bfuzzy\b/.test(recortada)) { if (bloque) bloque.fuzzy = true; else fuzzyPendiente = true; }
        if (recortada === "") vaciar();
    }
    vaciar();
    return { entradas, descartadas, avisos };
}

export function desdeProperties(texto: string): ResultadoImportacion {
    const entradas: Record<string, string> = {};
    const avisos: string[] = [];
    let descartadas = 0;
    let continua = false;
    let clave = "";
    let valor = "";

    const cerrar = (): void => {
        if (clave === "" && valor === "") return;
        if (clave === "" || valor === "") descartadas++; else entradas[clave] = valor;
        clave = ""; valor = "";
    };

    for (const linea of texto.split(/\r?\n/)) {
        if (continua) {
            let trozo = linea.replace(/^[ \t]+/, "");
            if (enContinuacion(trozo)) trozo = trozo.slice(0, -1); else continua = false;
            valor += desescapar(trozo);
            if (!continua) cerrar();
            continue;
        }
        const recortada = linea.trim();
        if (recortada === "" || recortada.startsWith("#") || recortada.startsWith("!")) { cerrar(); continue; }
        const partes = partirPropiedad(recortada) ?? { clave: recortada, valor: "" };
        cerrar();
        clave = desescapar(partes.clave.trim());
        const bruto = partes.valor.replace(/^[ \t]+/, "");
        if (enContinuacion(bruto)) { valor = desescapar(bruto.slice(0, -1)); continua = true; }
        else { valor = desescapar(bruto); cerrar(); }
    }
    cerrar();
    return { entradas, descartadas, avisos };
}
