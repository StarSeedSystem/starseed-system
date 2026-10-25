/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Correos inteligentes (2): seguimiento de respuestas («Reply
 * Zero» propio, reescrito desde cero; NO se copia nada de Inbox Zero).
 * ---------------------------------------------------------------------------
 * Sirve al alcance (respuestas a lo enviado desde la dirección pública) y a
 * Mensajes. Clasifica un hilo en tres estados:
 *   · por-responder   → el último mensaje es de otro y pasaron más de N horas
 *                        sin respuesta mía.
 *   · esperando       → el último es mío y pasaron más de D días (14 por
 *                        defecto, los del alcance: un recordatorio de esos).
 *   · resuelto        → nada pendiente de seguimiento (incluida la ventana
 *                        todavía no cumplida).
 *
 * Tipos mínimos locales (HiloLite) para no importar os-mail.ts (cliente con
 * Supabase). Reloj inyectado: `ahora` entra como parámetro. Nada envía nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

export interface MensajeLite {
    /** Remitente del mensaje (id o dirección); entró null si es del sistema. */
    de: string | null;
    /** Fecha del mensaje en formato entendible por `new Date()`. */
    createdAt: string;
}

export interface HiloSeguible {
    id: string;
    /** Mensajes del hilo en orden (el último es el más reciente). */
    mensajes: MensajeLite[];
}

export interface CfgSeguimiento {
    /** Horas sin respuesta mía que activan «por-responder» (por defecto 24). */
    horasPorResponder?: number;
    /** Días esperando mi respuesta que activan «esperando» (por defecto 14). */
    diasEsperando?: number;
}

export interface ResumenSeguimiento {
    porResponder: string[];
    esperando: string[];
    resuelto: number;
    total: number;
}

/* ─────────────────────────── Clasificación ─────────────────────────────── */

const HORAS_POR_RESPONDER_DEFECTO = 24;
const DIAS_ESPERANDO_DEFECTO = 14;

function horasDesde(fecha: string, ahora: number): number {
    const t = new Date(fecha).getTime();
    if (!Number.isFinite(t)) return Infinity;
    return (ahora - t) / 3_600_000;
}

/**
 * Clasifica un hilo de correo respecto a «yo». Nunca lanza: fechas inválidas
 * cuentan como demasiado antiguas (hilo pendiente, no silenciado).
 */
export function clasificarHilo(
    hilo: HiloSeguible,
    yo: string,
    ahora: Date,
    cfg: CfgSeguimiento = {},
): EstadoSeguimiento {
    const horasLimite = cfg.horasPorResponder ?? HORAS_POR_RESPONDER_DEFECTO;
    const diasLimite = cfg.diasEsperando ?? DIAS_ESPERANDO_DEFECTO;
    const t = ahora.getTime();
    const ultimo = hilo.mensajes.length > 0 ? hilo.mensajes[hilo.mensajes.length - 1] : null;
    if (!ultimo) return "por-responder";
    const mias = ultimo.de === yo;
    const horas = horasDesde(ultimo.createdAt, t);
    if (!mias) return horas > horasLimite ? "por-responder" : "resuelto";
    return horas > diasLimite * 24 ? "esperando" : "resuelto";
}

/**
 * Resumen de una bandeja completa: ids de hilos por estado y cuenta de los
 * resueltos (ids no interesan). Hilos de apoyo: el orden de entrada.
 */
export function resumenSeguimiento(
    hilos: HiloSeguible[],
    yo: string,
    ahora: Date,
    cfg: CfgSeguimiento = {},
): ResumenSeguimiento {
    const resumen: ResumenSeguimiento = { porResponder: [], esperando: [], resuelto: 0, total: hilos.length };
    for (const hilo of hilos) {
        const estado = clasificarHilo(hilo, yo, ahora, cfg);
        if (estado === "por-responder") resumen.porResponder.push(hilo.id);
        else if (estado === "esperando") resumen.esperando.push(hilo.id);
        else resumen.resuelto += 1;
    }
    return resumen;
}
