/**
 * El colchón de la voz en tiempo real (2026-09-24). PURO.
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «suena bien la voz pero aún se corta y hace pausas para cargar; aunque tarde un
 * poco en responder, que se vaya generando mientras habla, pero las respuestas de voz
 * deben ser continuas… considerando cualquier tipo de capacidad de hardware».
 *
 * Una respuesta hablada es una tubería: el modelo escribe texto → el motor lo convierte
 * en audio → el audio suena. Si producir audio va más lento que escucharlo, reproducir en
 * cuanto llega la primera frase garantiza cortes. La solución de cualquier reproductor de
 * streaming es un colchón: empezar un poco después, con el audio suficiente para que lo
 * que falta se produzca antes de que haga falta.
 *
 *   ritmo r = segundos de audio producidos por segundo de reloj
 *           = min( 1 / RTF del motor ,  (caracteres/s del texto) × (s de audio por carácter) )
 *
 * Para un turno de D segundos de audio, si r < 1 hacen falta D·(1 − r) segundos
 * guardados antes de empezar para no quedarse nunca sin audio. Con r ≥ 1 (el motor y el
 * texto van más rápido que la voz) basta la primera frase. Todo se MIDE en el propio
 * equipo (EWMA guardada), así que una Mac cargada, un móvil o un PC potente llegan cada uno
 * a su colchón sin configurar nada.
 */

export interface MedidasVoz {
    /** Tiempo de síntesis / duración del audio (0,3 = 3 veces más rápido que en vivo). */
    rtf: number;
    /** Segundos de audio por carácter de texto (~0,065 en español a velocidad 1,05). */
    segPorCaracter: number;
    /** Caracteres por segundo que llegan del modelo mientras escribe. */
    charsPorSegTexto: number;
    /** Duración típica de una respuesta hablada, en segundos. */
    duracionTurno: number;
}

export const MEDIDAS_INICIALES: MedidasVoz = {
    rtf: 0.45,
    segPorCaracter: 0.065,
    charsPorSegTexto: 60,
    duracionTurno: 12,
};

/** Margen: se exige producir un 15 % más rápido que la voz para dar el flujo por seguro. */
export const MARGEN = 1.15;
/** Nunca se espera más de esto a llenar el colchón al empezar un turno. */
export const ESPERA_MAXIMA_MS = 8_000;
/** Colchón máximo (segundos de audio). */
export const COLCHON_MAXIMO = 12;

export function ewma(anterior: number, muestra: number, alfa = 0.3): number {
    if (!Number.isFinite(muestra) || muestra <= 0) return anterior;
    if (!Number.isFinite(anterior) || anterior <= 0) return muestra;
    return anterior + alfa * (muestra - anterior);
}

/** Segundos de audio que la tubería produce por segundo de reloj. */
export function ritmoProduccion(m: MedidasVoz): number {
    const motor = 1 / Math.max(m.rtf, 0.05);
    const texto = Math.max(m.charsPorSegTexto, 1) * Math.max(m.segPorCaracter, 0.01);
    return Math.min(motor, texto);
}

/** Segundos de audio a tener listos antes de empezar a hablar un turno nuevo. */
export function colchonObjetivo(m: MedidasVoz): number {
    const r = ritmoProduccion(m);
    if (r >= MARGEN) return 0;
    const necesario = Math.max(m.duracionTurno, 4) * (1 - r / MARGEN);
    return Math.min(COLCHON_MAXIMO, Math.max(0.6, necesario));
}

/**
 * Tras un corte a mitad de turno (se acabó el audio y la frase siguiente no estaba),
 * se vuelve a llenar más colchón antes de seguir: UNA pausa algo más larga es mucho
 * menos molesta que muchas pausas cortas seguidas.
 */
export function colchonTrasCorte(m: MedidasVoz, cortesEnTurno: number): number {
    const base = Math.max(colchonObjetivo(m), 1.5);
    return Math.min(COLCHON_MAXIMO, base * (1 + 0.5 * Math.max(0, cortesEnTurno - 1)));
}

export interface EstadoCompuerta {
    /** Segundos de audio ya sintetizado esperando a sonar. */
    acumulado: number;
    /** Segundos que hacen falta (colchonObjetivo o colchonTrasCorte). */
    necesario: number;
    /** No quedan frases por sintetizar y hace un rato que no llega texto nuevo. */
    finDeTexto: boolean;
    /** ms esperando ya a llenar el colchón. */
    esperandoMs: number;
}

/** ¿Se puede empezar (o seguir tras un corte) a hablar ya? */
export function puedeSonar(e: EstadoCompuerta): boolean {
    if (e.acumulado <= 0) return false;
    return e.acumulado >= e.necesario || e.finDeTexto || e.esperandoMs >= ESPERA_MAXIMA_MS;
}

/** Lee las medidas guardadas con defensas (cualquier cosa rara → valores iniciales). */
export function leerMedidas(json: string | null | undefined): MedidasVoz {
    if (!json) return { ...MEDIDAS_INICIALES };
    try {
        const d = JSON.parse(json) as Partial<MedidasVoz>;
        const ok = (v: unknown, def: number, min: number, max: number) =>
            typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : def;
        return {
            rtf: ok(d.rtf, MEDIDAS_INICIALES.rtf, 0.02, 20),
            segPorCaracter: ok(d.segPorCaracter, MEDIDAS_INICIALES.segPorCaracter, 0.02, 0.3),
            charsPorSegTexto: ok(d.charsPorSegTexto, MEDIDAS_INICIALES.charsPorSegTexto, 1, 10_000),
            duracionTurno: ok(d.duracionTurno, MEDIDAS_INICIALES.duracionTurno, 1, 600),
        };
    } catch {
        return { ...MEDIDAS_INICIALES };
    }
}
