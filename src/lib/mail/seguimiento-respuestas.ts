/** «Reply Zero» propio del correo del OS (Ola 1025R · INV1025I). Módulo puro. */

/** Mensaje mínimo de un hilo; las fechas llegan como ISO para no casar reloj. */
export interface HiloLite {
    id: string;
    mensajes: { de: string; fecha: string }[];
}
export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

export interface ConfigSeguimiento {
    /** Horas sin contestar a otro para que el hilo quede «por-responder» (defecto: 24). */
    horasPorResponder?: number;
    /** Días sin respuesta mía para «esperando»; el alcance usa 14, el defecto 14. */
    diasEsperaMax?: number;
}

export const DEFECTO_SEGUIMIENTO: Required<ConfigSeguimiento> = { horasPorResponder: 24, diasEsperaMax: 14 };

/**
 * Clasifica un hilo con reloj inyectado («ahora»): el último mensaje manda.
 *  · Resuelto: sin mensajes, o hay conversación viva dentro de los umbrales.
 *  · Por-responder: el último es de OTRO y pasaron más de N horas sin respuesta mía.
 *  · Esperando: el último es MÍO y pasaron más de D días (respondí a lo enviado).
 */
export function clasificarHilo(
    hilo: HiloLite | null | undefined,
    yo: string,
    ahora: Date,
    cfg?: ConfigSeguimiento,
): EstadoSeguimiento {
    const conf = { ...DEFECTO_SEGUIMIENTO, ...(cfg || {}) };
    const vivos = (hilo?.mensajes || [])
        .filter((m) => m && typeof m.fecha === "string" && !Number.isNaN(new Date(m.fecha).getTime()))
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
    const ultimo = vivos[vivos.length - 1];
    if (!ultimo) return "resuelto";
    const horas = (ahora.getTime() - new Date(ultimo.fecha).getTime()) / 3_600_000;
    if (ultimo.de === yo) {
        return horas > conf.diasEsperaMax * 24 ? "esperando" : "resuelto";
    }
    return horas > conf.horasPorResponder ? "por-responder" : "resuelto";
}

/** Resumen de cuántos hilos hay en cada estado (para «Por responder» y el alcance). */
export function resumenSeguimiento(
    hilos: HiloLite[],
    yo: string,
    ahora: Date,
    cfg?: ConfigSeguimiento,
): Record<EstadoSeguimiento, number> {
    const resumen = { "por-responder": 0, esperando: 0, resuelto: 0 };
    for (const hilo of hilos) {
        resumen[clasificarHilo(hilo, yo, ahora, cfg)] += 1;
    }
    return resumen;
}
