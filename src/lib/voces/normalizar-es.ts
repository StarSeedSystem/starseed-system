/**
 * NORMALIZACIÓN EN ESPAÑOL PARA LA VOZ (Tarea J1b · Ola 264 · Forja fases 2-3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Segunda y última pasada de normalización antes de sintetizar: sobre las
 * cifras ya convertibles por `es-numeros.ts` se añaden pronunciaciones
 * propias del ecosistema (StarSeed → «Estar Sid»…), abreviaturas, siglas,
 * unidades, monedas, porcentajes y puntuación pensada para las pausas del
 * habla. Módulo PURO: sin DOM, sin estado, sin imports de cliente.
 *
 * Garantías fijas:
 *  · IDEMPOTENTE: normalizar dos veces da lo mismo que una (los tests lo
 *    fijan). Cada regla solo se aplica en su fase y nunca re-toca su salida.
 *  · ORDEN FIJO de fases (ver `normalizarParaVoz`): primero limpieza de
 *    formato, luego pronunciaciones propias, luego números (de lo más
 *    específico a lo más genérico) y al final puntuación y espacios.
 *
 * (2026-09-06, Ola 264)
 */

import {
    numeroAPalabras,
    cardinalAnteSustantivo,
    decimalAPalabras,
    ordinalAPalabras,
    horaAPalabras,
    fechaAPalabras,
} from "./es-numeros";

// ── PRONUNCIACIONES PROPIAS ──────────────────────────────────────────────────

/**
 * Parejas [patrón, reemplazo] con los nombres del ecosistema tal como se
 * DICEN. Van ANTES de los números para que un «API 2,5» ya llegue deletreado
 * a la fase numérica. El orden importa: las formas largas primero.
 */
export const PRONUNCIACIONES: Array<[RegExp, string]> = [
    [/StarSeed/g, "Estar Sid"],
    [/Astraura/g, "Astráura"],
    [/OmniVoice/g, "Omni Vóis"],
    [/BitNet/g, "Bit Net"],
    [/GGUF/g, "ge ge u efe"],
    [/\bOS\b/g, "o ese"],
    [/\bAPI\b/g, "a pe i"],
    [/\bRTF\b/g, "erre te efe"],
    [/\bURL\b/g, "u erre ele"],
    [/Wi-?Fi/gi, "wifi"],
];

// ── Letras para deletrear siglas ──
const NOMBRES_LETRAS: Record<string, string> = {
    a: "a", b: "be", c: "ce", d: "de", e: "e", f: "efe", g: "ge", h: "hache",
    i: "i", j: "jota", k: "ka", l: "ele", m: "eme", n: "ene", o: "o",
    p: "pe", q: "cu", r: "erre", s: "ese", t: "te", u: "u", v: "uve",
    w: "doble uve", x: "equis", y: "i griega", z: "zeta",
};

/** Deletrea una sigla letra a letra con los nombres españoles («a pe i»). */
function deletrear(sigla: string): string {
    return sigla.toLowerCase().split("").map((c) => NOMBRES_LETRAS[c] ?? c).join(" ");
}

// ── Abreviaturas habituales ──
const ABREVIATURAS: Array<[RegExp, string]> = [
    [/\bp\.\s?ej\./gi, "por ejemplo"],
    [/\betc\./gi, "etcétera"],
    [/\bDr\./g, "doctor"],
    [/\bDra\./g, "doctora"],
    [/\bSr\./g, "señor"],
    [/\bSra\./g, "señora"],
    [/\b(?:núm\.|n\.º)\b/gi, "número"],
    [/\baprox\./gi, "aproximadamente"],
    [/\bvs\./gi, "contra"],
];

/** Quita el Markdown ligero: énfasis, encabezados, código y enlaces (deja el texto). */
function quitarMarkdown(t: string): string {
    return t
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [texto](url) → texto
        .replace(/(\*\*|__)(.*?)\1/g, "$2")
        .replace(/(\*|_)(.*?)\1/g, "$2")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/^#{1,6}\s+/gm, "");
}

/** Quita emojis y símbolos pictográficos (la voz no puede leerlos). */
function quitarEmojis(t: string): string {
    // Rango «Extended_Pictographic» cubre emoji, emoticonos y símbolos varios.
    return t.replace(/\p{Extended_Pictographic}️?/gu, "");
}

/** Unidades y símbolos que se dicen tras un número; se sustituyen por su palabra. */
function unidadesYSimbolos(t: string): string {
    return t
        .replace(/(\d)\s?GB\b/gi, "$1 gigabytes")
        .replace(/(\d)\s?MB\b/gi, "$1 megabytes")
        .replace(/(\d)\s?KB\b/gi, "$1 kilobytes")
        .replace(/(\d)\s?ms\b/g, "$1 milisegundos")
        .replace(/%/g, " por ciento ")
        .replace(/€/g, " euros ")
        .replace(/\$/g, " dólares ");
}

/**
 * Números en fases, de lo más específico a lo más genérico, porque un patrón
 * genérico («\d+») comería los dígitos de una hora o una fecha si fuera antes.
 */
function numerosAPalabras(t: string): string {
    let s = t;
    // Horas «14:30» → «catorce y media».
    s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h: string, m: string) =>
        horaAPalabras(Number(h), Number(m)));
    // Fechas «06/09/2026» → «seis de septiembre de dos mil veintiséis».
    s = s.replace(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g, (_m, d: string, m: string, a: string) =>
        fechaAPalabras(Number(d), Number(m), Number(a)));
    // Decimales «1,5» / «3.14» y miles «1.000» (lo decide decimalAPalabras).
    s = s.replace(/\b\d+[.,]\d+\b/g, (m) => decimalAPalabras(m));
    // Ordinales «1.º» / «2.ª» con género por la letra volada.
    // Ordinales «1.º» / «2.ª» con género por la letra volada. Sin `\b` final:
    // «ª»/«º» no son caracteres de palabra en JS y romperían la frontera.
    s = s.replace(/\b(\d{1,2})\.\s?([oOªºaA])(?![A-Za-zÁÉÍÓÚÜÑáéíóúüñ])/g, (_m, n: string, g: string) =>
        ordinalAPalabras(Number(n), g === "a" || g === "ª" || g === "A" ? "f" : "m"));
    // Número + sustantivo: concordancia y apócope («21 archivos» → «veintiún archivos»).
    s = s.replace(
        /\b(\d+)\s+([A-Za-zÁÉÍÓÚÜáéíóúüñÑ]{2,})\b/g,
        (_m, n: string, sust: string) => cardinalAnteSustantivo(Number(n), sust),
    );
    // Números sueltos que queden.
    return s.replace(/\b\d+\b/g, (m) => numeroAPalabras(Number(m)));
}

/**
 * Siglas de 2-5 mayúsculas no «pronunciables»: sin vocal, o de ≤ 3 letras, se
 * deletrean («RAM» → «erre a eme», «SQL» → «ese cu ele»). Una sigla larga
 * con vocales (p. ej. «UNESCO») se deja tal cual porque el motor la lee bien.
 */
function deletrearSiglas(t: string): string {
    return t.replace(/\b[A-ZÁÉÍÓÚ]{2,5}\b/g, (sigla) => {
        const conVocal = /[AEIOUÁÉÍÓÚ]/.test(sigla);
        if (!conVocal || sigla.length <= 3) return deletrear(sigla);
        return sigla;
    });
}

/** Puntuación pensada para las pausas del habla; «…» se conserva. */
function puntuacionParaPausas(t: string): string {
    return t
        .replace(/[—–]/g, ", ")
        .replace(/;/g, ", ")
        .replace(/\(/g, ", ")
        .replace(/\)/g, ", ");
}

/**
 * Normaliza una frase del OS para que suene en español correcto por cualquier
 * nivel de voz. Idempotente y pura. Orden de fases fijo (ver cabecera).
 */
export function normalizarParaVoz(texto: string): string {
    if (!texto) return "";
    let s = quitarEmojis(quitarMarkdown(texto));
    for (const [re, reemplazo] of PRONUNCIACIONES) s = s.replace(re, reemplazo);
    for (const [re, reemplazo] of ABREVIATURAS) s = s.replace(re, reemplazo);
    s = unidadesYSimbolos(s);
    s = numerosAPalabras(s);
    s = deletrearSiglas(s);
    s = puntuacionParaPausas(s);
    // Colapso final de espacios para que la salida sea estable y comprobable.
    return s.replace(/[^\S\n]+/g, " ").replace(/ ,/g, ",").trim();
}

/**
 * Trocea un texto YA normalizado en fragmentos de como mucho `max` caracteres,
 * cortando por oraciones y, si una oración no cabe, por comas, y nunca en mitad
 * de una palabra. Pensado para las colas de síntesis por frases: fragmentos
 * cortos arrancan antes y degradan mejor. Si una sola palabra supera `max`
 * (caso patológico), se corta a la fuerza para no devolver nunca más de `max`.
 */
export function trocearParaVoz(texto: string, max = 220): string[] {
    const limpio = texto.trim();
    if (!limpio) return [];
    // Piezas atómicas: oraciones completas (con su signo final) y, dentro de
    // cada una, segmentos por comas/puntos suspensivos cuando haga falta.
    const oraciones = limpio.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [limpio];
    const piezas: string[] = [];
    for (const oracion of oraciones) {
        const o = oracion.trim();
        if (!o) continue;
        if (o.length <= max) { piezas.push(o); continue; }
        // Oración larga: se parte por comas conservando la coma como pausa.
        for (const seg of o.split(/(?<=,)/)) {
            const s = seg.trim();
            if (s) piezas.push(s);
        }
    }
    // Empaquetado voraz: cada fragmento crece hasta el límite sin pasarlo.
    const trozos: string[] = [];
    let actual = "";
    for (const pieza of piezas) {
        const candidato = actual ? `${actual} ${pieza}` : pieza;
        if (candidato.length <= max) { actual = candidato; continue; }
        if (actual) trozos.push(actual);
        actual = pieza;
        // Palabra suelta demasiado larga: corte duro como último recurso.
        while (actual.length > max) {
            let corte = actual.lastIndexOf(" ", max);
            if (corte <= 0) corte = max;
            trozos.push(actual.slice(0, corte).trim());
            actual = actual.slice(corte).trim();
        }
    }
    if (actual) trozos.push(actual);
    return trozos;
}
