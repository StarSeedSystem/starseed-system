/**
 * StarSeed OS — Oído ambiental (EAR1023B · ola 1023X)
 * ─────────────────────────────────────────────────────────────────────────────
 * Decisión PURA: ¿este tramo de audio va al servicio de oído (EAR1023A)?
 *
 * Reglas duras de `architecture/repos-3d-oido-agentes-1023.md` §3:
 *   · Solo con los sentidos encendidos (nunca a ciegas, nunca «por si acaso»).
 *   · Solo fragmentos SIN voz: la voz ya la lleva el reconocimiento de habla.
 *   · Solo por encima de un umbral de energía (el silencio no gasta CPU).
 *   · Como mucho uno cada N milisegundos (no saturar la neurona que oye).
 *
 * No toca red, disco ni procesos: entra estado, sale decisión.
 */

export interface EstadoSentidos {
    /** Los sentidos del agente/orbe están encendidos por su dueño. */
    encendidos: boolean;
    /** El micrófono queda abierto entre interacciones (modo «siempre escuchando»). */
    siempreEscuchando: boolean;
}

/** Tramo de audio ya capturado por el flujo (`oido-flujo.ts`). */
export interface FragmentoAudio {
    id: string;
    /** La detección de voz del flujo marcó este tramo como habla. */
    contieneVoz: boolean;
    /** Energía normalizada del tramo (0…1). */
    energia: number;
    /** Marca temporal del tramo, en milisegundos. */
    timestamp: number;
}

/** Por qué un tramo NO se manda al servicio de oído. */
export type MotivoNoEnviarOido =
    | "sentidos-apagados"
    | "contiene-voz"
    | "energia-insuficiente"
    | "intervalo-demasiado-corto"
    | "fragmento-invalido";

export type DecisionOido =
    | { enviarAlServicio: true }
    | { enviarAlServicio: false; razon: MotivoNoEnviarOido };

/** Umbral de energía por defecto: por debajo es ruido de fondo y no se paga CPU. */
export const UMBRAL_ENERGIA_POR_DEFECTO = 0.15;
/** Cadencia mínima entre envíos por defecto: 3 s (uno cada N segundos). */
export const INTERVALO_MINIMO_MS_POR_DEFECTO = 3000;

const NO = (razon: MotivoNoEnviarOido): DecisionOido => ({
    enviarAlServicio: false,
    razon,
});

/**
 * Decide si un fragmento va al servicio de oído ambiental.
 *
 * @param estado             Sentidos del agente/orbe. `siempreEscuchando` no
 *                           bloquea: describe si el micrófono queda abierto,
 *                           no si un tramo ya capturado puede analizarse.
 * @param fragmento          Tramo capturado por el flujo de reconocimiento.
 * @param ultimoEnvio        `timestamp` del último envío aceptado, o `null`.
 * @param umbralEnergia      Energía mínima para gastar CPU. Defecto 0,15.
 * @param intervaloMinimoMs  Separación mínima entre envíos. Defecto 3 s.
 */
export function decidirEnvioAlOido(
    estado: EstadoSentidos,
    fragmento: FragmentoAudio,
    ultimoEnvio: number | null = null,
    umbralEnergia: number = UMBRAL_ENERGIA_POR_DEFECTO,
    intervaloMinimoMs: number = INTERVALO_MINIMO_MS_POR_DEFECTO,
): DecisionOido {
    if (!estado.encendidos) return NO("sentidos-apagados");
    if (fragmento.contieneVoz) return NO("contiene-voz");
    if (!Number.isFinite(fragmento.energia) || fragmento.energia < umbralEnergia) {
        return NO("energia-insuficiente");
    }
    if (!Number.isFinite(fragmento.timestamp) || (ultimoEnvio !== null && !Number.isFinite(ultimoEnvio))) {
        return NO("fragmento-invalido");
    }
    if (ultimoEnvio !== null) {
        const separacion = fragmento.timestamp - ultimoEnvio;
        const minimo = Number.isFinite(intervaloMinimoMs) ? intervaloMinimoMs : 0;
        if (separacion < minimo) return NO("intervalo-demasiado-corto");
    }
    return { enviarAlServicio: true };
}
