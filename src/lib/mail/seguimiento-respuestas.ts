/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · «Reply Zero» propio: seguimiento de respuestas de los hilos
 * de correo interno (patrón del producto reescrito desde cero; sin copiar
 * nada de Inbox Zero). Al alcance le importa saber qué correos enviados
 * siguen sin respuesta y cuáles llevan demasiado tiempo esperando.
 * ---------------------------------------------------------------------------
 * Estados: «por-responder» (el último mensaje es de otro y pasaron más de N
 * horas sin respuesta mía), «esperando» (el último es mío y pasaron más de D
 * días, 14 por defecto para el alcance) o «resuelto». Módulo puro: el reloj
 * llega inyectado y los tipos son mínimos locales (HiloLite) para no importar
 * `os-mail.ts` (ese archivo depende del cliente de Supabase). R2: nada envía.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

/** Vista mínima de un hilo de correo por si el seguimiento lo necesita. */
export interface HiloLite {
    id: string;
    creatorId: string;
    /** Autor del último mensaje del hilo; null si no hay mensajes. */
    ultimoDe: string | null;
    /** Fecha (ISO) del último mensaje del hilo. */
    lastMsgAt: string;
}

export interface ConfigSeguimiento {
    /** Horas sin responder a un mensaje ajeno antes de marcar «por-responder». */
    horasPorResponder: number;
    /** Días esperando após mi último mensaje antes de marcar «esperando». */
    diasEsperando: number;
}

export interface ResumenSeguimiento {
    porResponder: string[];
    esperando: string[];
    resuelto: number;
}

const CONFIG_POR_DEFECTO: ConfigSeguimiento = {
    horasPorResponder: 24,
    diasEsperando: 14,
};

export { CONFIG_POR_DEFECTO };

function horasDesde(desde: string, ahora: Date): number {
    const t = new Date(desde).getTime();
    if (!Number.isFinite(t)) return NaN;
    return (ahora.getTime() - t) / 3_600_000;
}

/** Clasifica un hilo respecto a `yo`. Nunca lanza: degrade a «resuelto». */
export function clasificarHilo(
    hilo: HiloLite,
    yo: string,
    ahora: Date,
    cfg: ConfigSeguimiento = CONFIG_POR_DEFECTO,
): EstadoSeguimiento {
    const horas = horasDesde(hilo.lastMsgAt, ahora);
    if (!Number.isFinite(horas) || hilo.ultimoDe === null) return "resuelto";
    if (hilo.ultimoDe === yo) {
        return horas > cfg.diasEsperando * 24 ? "esperando" : "resuelto";
    }
    return horas > cfg.horasPorResponder ? "por-responder" : "resuelto";
}

/** Cuenta los hilos por estado, en orden determinista. */
export function resumenSeguimiento(
    hilos: HiloLite[],
    yo: string,
    ahora: Date,
    cfg: ConfigSeguimiento = CONFIG_POR_DEFECTO,
): ResumenSeguimiento {
    const resumen: ResumenSeguimiento = { porResponder: [], esperando: [], resuelto: 0 };
    for (const hilo of hilos) {
        const estado = clasificarHilo(hilo, yo, ahora, cfg);
        if (estado === "por-responder") resumen.porResponder.push(hilo.id);
        else if (estado === "esperando") resumen.esperando.push(hilo.id);
        else resumen.resuelto += 1;
    }
    return resumen;
}
