"use client";

/**
 * Seguimiento de respuestas («Reply Zero» propio · Ola 1025R · INV1025I).
 *
 * Clasifica los hilos de correo del OS (patrón Inbox Zero reescrito desde
 * cero: solo sus conceptos públicos de README, sin código ni textos suyos) en
 * tres estados para la cola «Por responder» y «Esperando respuesta»:
 *
 *   · `por-responder`  → el último mensaje es de OTRO y ya pasaron más de N
 *                        horas sin respuesta mía.
 *   · `esperando`      → el último es MÍO y pasaron más de D días (14 por
 *                        defecto para el alcance: sirvo a las respuestas a lo
 *                        enviado desde la dirección pública).
 *   · `resuelto`       → nada pendiente según los umbrales.
 *
 * Módulo puro: reloj INYECTADO (`ahora`) y tipos mínimos locales para no
 * importar `os-mail.ts` (cliente con Supabase). Nada envía nada (R2).
 */

import type { HiloLite } from "@/lib/mail/reglas-correo";

export type EstadoSeguimiento = "por-responder" | "esperando" | "resuelto";

export interface CfgSeguimiento {
    /** Horas sin responder a un mensaje ajeno antes de salir en la cola. */
    horasSinResponder: number;
    /** Días desde mi último mensaje antes de esperar (14 por defecto). */
    diasEsperando: number;
}

export interface ResumenSeguimiento {
    total: number;
    porResponder: number;
    esperando: number;
    resuelto: number;
}

export const CFG_POR_DEFECTO: CfgSeguimiento = { horasSinResponder: 24, diasEsperando: 14 };

/* ───────────────────────── Configuración ───────────────────────────────── */

/** Fr fusión tolerante: rellena solo lo que falte o lo inválido. */
export function configurar(cfg?: Partial<CfgSeguimiento>): CfgSeguimiento {
    const horas = typeof cfg?.horasSinResponder === "number" && Number.isFinite(cfg.horasSinResponder) && cfg.horasSinResponder > 0 ? cfg.horasSinResponder : CFG_POR_DEFECTO.horasSinResponder;
    const dias = typeof cfg?.diasEsperando === "number" && Number.isFinite(cfg.diasEsperando) && cfg.diasEsperando > 0 ? cfg.diasEsperando : CFG_POR_DEFECTO.diasEsperando;
    return { horasSinResponder: horas, diasEsperando: dias };
}

/* ─────────────────────────── Clasificar ────────────────────────────────── */

/**
 * Estado de un hilo respecto a MÍ (`yo`). El tiempo entra como parámetro, así
 * que el resultado es determinista y probado sin red ni disco. Nunca lanza.
 */
export function clasificarHilo(
    hilo: HiloLite | null | undefined,
    yo: string,
    ahora: Date,
    cfg?: Partial<CfgSeguimiento>,
): EstadoSeguimiento {
    const c = configurar(cfg);
    const ultimo = hilo && Array.isArray(hilo.mensajes) && hilo.mensajes.length ? hilo.mensajes[hilo.mensajes.length - 1] : null;
    if (!ultimo || !ultimo.en) return "resuelto";
    const hora = Date.parse(ultimo.en);
    if (!Number.isFinite(hora)) return "resuelto";
    const mHola = Math.max(0, ahora.getTime() - hora);

    if (ultimo.de !== yo) {
        return mHola > c.horasSinResponder * 36e5 ? "por-responder" : "resuelto";
    }
    return mHola > c.diasEsperando * 864e5 ? "esperando" : "resuelto";
}

/* ──────────────────────────── Resumen ──────────────────────────────────── */

/**
 * Cuenta los tres estados de una bandeja para la cola y el widget.
 */
export function resumenSeguimiento(
    hilos: HiloLite[] | null,
    yo: string,
    ahora: Date,
    cfg?: Partial<CfgSeguimiento>,
): ResumenSeguimiento {
    const lista = Array.isArray(hilos) ? hilos : [];
    const res: ResumenSeguimiento = { total: lista.length, porResponder: 0, esperando: 0, resuelto: 0 };
    for (const h of lista) {
        const e = clasificarHilo(h, yo, ahora, cfg);
        if (e === "por-responder") res.porResponder += 1;
        else if (e === "esperando") res.esperando += 1;
        else res.resuelto += 1;
    }
    return res;
}
