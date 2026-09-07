/**
 * (Ola 265 · Forja fase 3 — efectos y tomas · 2026-09-07)
 *
 * Cadena de EFECTOS de voz al estilo Voicebox (jamiepine/voicebox): todo el
 * post-proceso vive como filtros de ffmpeg aplicados DESPUÉS de la síntesis,
 * sin tocar el modelo. Este módulo es la ÚNICA fuente de la relación
 * efecto → filtro `-af`, compartido por la interfaz y espejo de la copia
 * local que lleva el demonio (`native/astraura-voice/daemon.mjs`).
 * ⚠️ El demonio no importa TypeScript: su copia debe ser idéntica; si uno
 * cambia, cambia el otro y también los tests.
 *
 * Reglas del área: «gratis primero» (es post-proceso local, no cuesta créditos)
 * y «efectos nunca rompen la voz» — si ffmpeg falta o falla se sirve el audio
 * sin efectos con `X-Astraura-Ignored: efectos`.
 */

/** Efectos que un timbre puede pedir; `undefined`/`ninguna` = sin tocar. */
export interface EfectosVoz {
    /** Ecualización con nombre: realce cálido, presencia clara o «radio» (banda estrecha). */
    eq?: "cálida" | "clara" | "radio" | "ninguna";
    /** Mezcla de reverberación ligera, [0, 1] (0 = seca). */
    reverb?: number;
    /** Compresor suave de voz constante (aval: iguala susurros y énfasis). */
    compresor?: boolean;
    /** De-esser (suaviza las «s» siseantes del motor). */
    deesser?: boolean;
    /** Ganancia de salida en dB, acotada a [-6, 6] (0 = como vino). */
    ganancia?: number;
}

/** Presets documentados: cada perfil de uso tiene su cadena «de fábrica». */
export const PRESETS_EFECTOS: Record<
    "narracion" | "chat" | "aviso" | "intimo" | "neutro",
    EfectosVoz
> = {
    /** Narración de biblioteca: cálida, algo de sala y compresión — larga escucha sin fatiga. */
    narracion: { eq: "cálida", reverb: 0.25, compresor: true, deesser: true },
    /** Chat con Aurora: clara y seca — lo más importante es la inteligibilidad. */
    chat: { eq: "clara", reverb: 0, compresor: true, deesser: true },
    /** Avisos del sistema: radio (enchufado en banda estrecha) para que atraviese el ruido. */
    aviso: { eq: "radio", reverb: 0, compresor: true, ganancia: 2 },
    /** Voz íntima / cercana: cálida, sin ecualización estridente, compresión suave. */
    intimo: { eq: "cálida", reverb: 0.15, compresor: true, deesser: true, ganancia: -1 },
    /** Sin tocar: el motor habla como salió. */
    neutro: {},
};

/**
 * Traduce unos efectos a la lista de filtros ffmpeg para `-af`, ya en ORDEN
 * (eq → reverb → compresor → de-esser → ganancia): el orden es parte del
 * contrato, porque cambiar el orden cambia el sonido y la clave de caché.
 * `sampleRate` aún no modula ningún filtro, pero se firma ya para poder
 * afinar la reverb/frecuencias sin romper la firma hacia fuera.
 */
export function filtrosFfmpeg(e: EfectosVoz, sampleRate: number): string[] {
    void sampleRate;
    const efx = normalizarEfectos(e);
    const cadena: string[] = [];
    // Ecualización de carácter (una sola opción; «ninguna» no emite nada).
    if (efx.eq === "cálida") {
        // Graves acariciantes y agudos bajados: voz cercana y reposada.
        cadena.push("equalizer=f=200:t=q:w=1:g=2", "equalizer=f=4000:t=q:w=1:g=-1.5");
    } else if (efx.eq === "clara") {
        // Presencia en 3 kHz y corte de retumbar grave del motor.
        cadena.push("equalizer=f=3000:t=q:w=1:g=2.5", "highpass=f=90");
    } else if (efx.eq === "radio") {
        // Banda telefónica + compresión fuerte: atraviesa música y ruido.
        cadena.push("highpass=f=300", "lowpass=f=3400", "acompressor=threshold=-18dB:ratio=4");
    }
    // Reverberación ligera: retardo y decaimiento CRECEN con r, siempre
    // acotados (acotado ya por normalizarEfectos, aquí solo se formatea).
    if (efx.reverb !== undefined && efx.reverb > 0) {
        const retardo = 20 + 40 * efx.reverb; // ms: 20…60
        const decaimiento = 0.15 + 0.35 * efx.reverb; // 0.15…0.5
        cadena.push(`aecho=0.8:0.7:${redondear3(retardo)}:${redondear3(decaimiento)}`);
    }
    // Compresor de voz constante (el «radio» ya lleva el suyo, más duro).
    if (efx.compresor === true) {
        cadena.push("acompressor=threshold=-20dB:ratio=3:attack=10:release=120");
    }
    if (efx.deesser === true) cadena.push("deesser");
    // Ganancia de salida; 0 no emite filtro (cadena vacía = «sin efectos»).
    if (efx.ganancia !== undefined && efx.ganancia !== 0) {
        cadena.push(`volume=${redondear3(efx.ganancia)}dB`);
    }
    return cadena;
}

/**
 * Normaliza una entrada DESCONOCIDA a unos `EfectosVoz` seguros: acota
 * rangos, descarta claves desconocidas y nunca lanza. Es la frontera entre
 * el cliente (que puede mandar cualquier cosa) y la cadena ffmpeg.
 */
export function normalizarEfectos(x: unknown): EfectosVoz {
    if (typeof x !== "object" || x === null) return {};
    const r = x as Record<string, unknown>;
    const salida: EfectosVoz = {};
    if (r.eq === "cálida" || r.eq === "clara" || r.eq === "radio" || r.eq === "ninguna") {
        if (r.eq !== "ninguna") salida.eq = r.eq;
    }
    if (Number.isFinite(r.reverb)) {
        salida.reverb = Math.max(0, Math.min(1, Number(r.reverb)));
    }
    if (r.compresor === true) salida.compresor = true;
    if (r.deesser === true) salida.deesser = true;
    if (Number.isFinite(r.ganancia)) {
        salida.ganancia = Math.max(-6, Math.min(6, Number(r.ganancia)));
    }
    return salida;
}

/** Redondeo estable para que la cadena ffmpeg sea byte-idéntica (clave de caché). */
function redondear3(n: number): string {
    return String(Math.round(n * 1000) / 1000);
}

/** ¿La cadena está vacía (no hay nada que post-procesar)? */
export function efectosVacios(e: EfectosVoz): boolean {
    return filtrosFfmpeg(e, 24000).length === 0;
}

/**
 * Clave canónica de caché para unos efectos: JSON con claves ordenadas, así
 * `{reverb:.2,eq:"cálida"}` y `{eq:"cálida",reverb:.2}` dan la misma clave.
 */
export function claveEfectos(e: EfectosVoz): string {
    const n = normalizarEfectos(e);
    const ordenado: Record<string, unknown> = {};
    if (n.eq) ordenado.eq = n.eq;
    if (n.reverb) ordenado.reverb = n.reverb;
    if (n.compresor) ordenado.compresor = n.compresor;
    if (n.deesser) ordenado.deesser = n.deesser;
    if (n.ganancia) ordenado.ganancia = n.ganancia;
    return JSON.stringify(ordenado);
}
