/**
 * StarSeed OS — Contexto del oído (EAR1023C · ola 1023X)
 * ─────────────────────────────────────────────────────────────────────────────
 * Convierte las etiquetas que el servicio de oído (earshot) devuelve en una
 * línea corta para el contexto del agente/orbe: «Se oye: timbre (0,82), lluvia (0,64)».
 *
 * Reglas de `architecture/repos-3d-oido-agentes-1023.md` §3:
 *   · Lo que suena hace más de 2 minutos ya no entra: el oído es el ahora.
 *   · Sin repetir etiqueta: la misma sonoridad no se dice dos veces.
 *   · Tope de 200 caracteres: en el prompt es una línea, no un informe.
 *
 * Puro: entra lista de etiquetas con su instante, sale cadena. El cableado al
 * prompt va en otra tarea (EAR1023D).
 */

export interface EtiquetaOida {
    /** Etiqueta del oído (AudioSet): «timbre», «lluvia», «perro»… */
    etiqueta: string;
    /** Confianza del modelo (0…1). */
    confianza: number;
    /** Instante en que se oyó, en milisegundos (misma base que `ahora`). */
    timestamp: number;
}

/** Caducidad del oído por defecto: lo de hace más de 2 min ya no cuenta. */
export const CADUCIDAD_OID_MS = 120_000;
/** Tope de longitud (incluido el prefijo «Se oye: »). */
export const TOPE_CONTEXTO_OID = 200;

const PREFIJO = "Se oye: ";

/** Formato español con coma decimal: 0,82. */
function formatearConfianza(confianza: number): string {
    return confianza.toFixed(2).replace(".", ",");
}

/** ¿Esta etiqueta sigue sonando, o ya se le fue al agente? */
function sigueSonando(ts: number, ahora: number, caducidadMs: number): boolean {
    return Number.isFinite(ts) && ahora - ts <= caducidadMs;
}

/**
 * Línea de contexto del oído para el agente.
 *
 * @param etiquetas   Etiquetas devueltas por el oído ambiental.
 * @param ahora       Instante actual, en milisegundos.
 * @param caducidadMs Caducidad del oído. Defecto 2 minutos.
 * @returns «Se oye: …» o cadena vacía si nada suena ahora mismo.
 */
export function lineaContextoOido(
    etiquetas: readonly EtiquetaOida[],
    ahora: number,
    caducidadMs: number = CADUCIDAD_OID_MS,
): string {
    if (!Number.isFinite(ahora) || !Array.isArray(etiquetas)) return "";

    // Vivas, válidas y sin repetir: si una etiqueta se oye varias veces, manda
    // su mejor confianza.
    const mejor = new Map<string, EtiquetaOida>();
    for (const e of etiquetas) {
        if (!e || typeof e.etiqueta !== "string") continue;
        const etiqueta = e.etiqueta.trim();
        if (!etiqueta || !Number.isFinite(e.confianza) || e.confianza < 0) continue;
        if (!sigueSonando(e.timestamp, ahora, caducidadMs > 0 ? caducidadMs : 0)) continue;
        const previa = mejor.get(etiqueta);
        if (!previa || e.confianza > previa.confianza) mejor.set(etiqueta, { ...e, etiqueta });
    }

    // De lo más sonoro a lo menos, hasta llenar el tope sin trunchar a medias.
    const ordenadas = [...mejor.values()].sort((a, b) => b.confianza - a.confianza);
    let linea = PREFIJO;
    for (const e of ordenadas) {
        const trozo = `${e.etiqueta} (${formatearConfianza(Math.min(e.confianza, 1))})`;
        const conTrozo = linea === PREFIJO ? linea + trozo : `${linea}, ${trozo}`;
        if (conTrozo.length > TOPE_CONTEXTO_OID) break;
        linea = conTrozo;
    }
    return linea === PREFIJO ? "" : linea;
}


