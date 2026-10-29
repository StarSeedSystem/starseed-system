/**
 * RESOLUTOR ÚNICO DE IDENTIDAD DE VOZ (VZF1015M) — capa pura, SSR-safe.
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo «qué voz tiene esta persona». Antes había seis mapas sin coordinar
 * (VOZ_POR_PERSONA de voz-rt, el pin del registro de motores, los timbres de
 * voz-inicial/voz-rito/timbres, el INSTRUCT del demonio, seedKindFor de
 * openvoice2 y xai-persona-voices): ahora cada uno ALIMENTA una capa y este
 * resolutor decide. Ningún mapa se borra ni se vuelve a calcular aquí.
 *
 * Precedencia (lo más específico gana), la misma de primary-system.ts:
 *   agente > personalidad > cerebro > neurona > cuenta > defecto
 *
 * Nunca lanza, no toca disco ni red: los lectores le pasan las capas ya leídas.
 * Mapa de conexión (quién alimenta qué):
 *   · voz-rt VOZ_POR_PERSONA        → personalidad.vozRT (F1…M5 de Supertonic)
 *   · pin del registro (engine-registry) → motor (AuroraVoiceEngine)
 *   · timbres / voz-inicial / voz-rito → timbre (id del catálogo de timbres)
 *   · INSTRUCT del demonio          → timbre (instruct del timbre elegido)
 *   · seedKindFor de openvoice2     → timbre (semilla curada por arquetipo)
 *   · xai-persona-voices            → motor («xai») y su voz built-in
 */

export type OrigenIdentidadVoz = "agente" | "personalidad" | "cerebro" | "neurona" | "cuenta" | "defecto";

export interface CapaIdentidadVoz {
    timbre?: string | null;
    motor?: string | null;
    vozRT?: string | null;
}

export interface CapasIdentidadVoz {
    agente?: CapaIdentidadVoz | null;
    personalidad?: CapaIdentidadVoz | null;
    cerebro?: CapaIdentidadVoz | null;
    neurona?: CapaIdentidadVoz | null;
    cuenta?: CapaIdentidadVoz | null;
}

export interface IdentidadVoz {
    timbre: string;
    motor: string;
    vozRT: string;
    origen: OrigenIdentidadVoz;
}

/* ───────────────────── Valores por defecto ───────────────────── */

/** La voz F1 de Alex (Supertonic), conservada por defecto. */
export const VOZ_RT_DEFECTO = "F1";
/** Timbre base de la identidad: el Aurora del catálogo, género femenino. */
export const TIMBRE_DEFECTO = "fem-aurora";
/** Motor por defecto del registro: la voz del navegador (siempre disponible). */
export const MOTOR_DEFECTO = "browser";

/** Orden de precedencia, de lo más específico a lo más general. */
export const ORDEN_IDENTIDAD_VOZ = ["agente", "personalidad", "cerebro", "neurona", "cuenta"] as const;

/** Identidad completa sin elección: lo que suena hoy en toda StarSeed. */
export const IDENTIDAD_VOZ_DEFECTO: IdentidadVoz = {
    timbre: TIMBRE_DEFECTO,
    motor: MOTOR_DEFECTO,
    vozRT: VOZ_RT_DEFECTO,
    origen: "defecto",
};

/* ───────────────────── Saneado puro ───────────────────── */

/**
 * ¿Es una voz rápida válida del repertorio de Supertonic (F1…M5)?
 * La misma regla que aplicaba `vozDePersona` a la preferencia guardada.
 */
export function esVozRtValida(v: unknown): boolean {
    return typeof v === "string" && /^[FM][1-5]$/.test(v);
}

/** Texto id ya limpio (sin espacios en los bordes, sin controles) o `null`. */
function saneaTexto(v: unknown, max = 64): string | null {
    if (typeof v !== "string") return null;
    // eslint-disable-next-line no-control-regex
    const s = v.trim().replace(/[\u0000-\u001f\u007f]/g, "");
    return s && s.length <= max ? s : null;
}

/** Una capa con solo sus valores válidos; una capa vacía no decide. */
function capaLimpia(capa: CapaIdentidadVoz | null | undefined): CapaIdentidadVoz {
    if (!capa || typeof capa !== "object") return {};
    const out: CapaIdentidadVoz = {};
    const voz = saneaTexto(capa.vozRT);
    if (voz && esVozRtValida(voz)) out.vozRT = voz;
    const timbre = saneaTexto(capa.timbre);
    if (timbre) out.timbre = timbre;
    const motor = saneaTexto(capa.motor);
    if (motor) out.motor = motor;
    return out;
}

/* ───────────────────── Resolución pura ───────────────────── */

/**
 * Resuelve la identidad de voz EFECTIVA para una persona sobre las capas dadas
 * (pura, inyectable: cada lector pasa lo que vk vio en su mapa). Para cada campo
 * gana la capa más específica que lo haya fijado; `origen` es la capa más
 * específica que fijó ALGO. Nunca lanza.
 */
export function identidadVoz(capas: CapasIdentidadVoz): IdentidadVoz {
    const resuelta: IdentidadVoz = { ...IDENTIDAD_VOZ_DEFECTO };
    let algoFijado: OrigenIdentidadVoz | null = null;
    for (const campo of ORDEN_IDENTIDAD_VOZ) {
        const limpia = capaLimpia(capas[campo]);
        let fijóAlgo = false;
        if (limpia.timbre) { resuelta.timbre = limpia.timbre; fijóAlgo = true; }
        if (limpia.motor) { resuelta.motor = limpia.motor; fijóAlgo = true; }
        if (limpia.vozRT) { resuelta.vozRT = limpia.vozRT; fijóAlgo = true; }
        if (fijóAlgo) algoFijado = campo;
    }
    return { ...resuelta, origen: algoFijado ?? "defecto" };
}
