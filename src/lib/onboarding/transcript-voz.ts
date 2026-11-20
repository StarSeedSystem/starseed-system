/**
 * Lectura del transcript de voz — PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * La guía de Aurora sondea el transcript del puente cada 550 ms para avanzar
 * por voz. `getState` puede lanzar (motor a medio montar, puente roto) y el
 * `catch` mudo de antes se tragaba el fallo sin dejar rastro. Aquí se decide,
 * sin tocar la ventana ni el audio, qué texto se devuelve y qué aviso debe
 * quedar en el registro: la guía sigue en texto, pero el fallo se ve.
 */

/** Lo único que se lee del estado de Aurora (subconjunto del puente). */
export type EstadoVozMinimo =
    | { transcript?: string; interim?: string }
    | null
    | undefined;

/** Resultado del intento de lectura: el puente respondió o lanzó. */
export type ResultadoLecturaTranscript =
    | { tipo: "ok"; estado: EstadoVozMinimo }
    | { tipo: "excepcion"; error: unknown };

export interface LecturaTranscript {
    /** Texto para el sondeo; `""` si no hay nada o el puente falló. */
    texto: string;
    /** Línea para el registro; `null` si la lectura fue buena. */
    aviso: string | null;
}

/** Junta la parte final y la provisional tal como las espera la guía. */
export function componerTranscript(estado: EstadoVozMinimo): string {
    const final = (estado?.transcript ?? "").trim();
    const provisional = (estado?.interim ?? "").trim();
    return [final, provisional].filter(Boolean).join(" ");
}

/** Decide el texto y el aviso de un intento de lectura del transcript. */
export function evaluarLecturaTranscript(
    resultado: ResultadoLecturaTranscript,
): LecturaTranscript {
    if (resultado.tipo === "ok") {
        return { texto: componerTranscript(resultado.estado), aviso: null };
    }
    return {
        texto: "",
        aviso: conDetalle("guía: no se pudo leer el transcript de Aurora", resultado.error),
    };
}

const LARGO_AVISO = 160;

function conDetalle(base: string, error: unknown): string {
    const detalle = mensajeCorto(error);
    return detalle ? `${base} («${detalle}»)` : base;
}

function textoDe(error: unknown): string {
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
        const mensaje = (error as { message?: unknown }).message;
        if (typeof mensaje === "string") return mensaje;
    }
    return "";
}

/** Un mensaje de una sola línea, sin controles y sin pasarse de largo. */
function mensajeCorto(error: unknown): string {
    const limpio = textoDe(error)
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (!limpio) return "";
    return limpio.length > LARGO_AVISO ? `${limpio.slice(0, LARGO_AVISO - 1)}…` : limpio;
}
