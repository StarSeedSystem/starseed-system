"use client";

/**
 * useTimeoutInteraction — temporizador de calma que respeta a la persona.
 * ─────────────────────────────────────────────────────────────────────────────
 * Ejecuta una acción UNA sola vez cuando el usuario lleva `retrasoMs` SIN
 * interactuar (pulsar, mover el puntero, rueda, tecla, dedo, scroll). Cada
 * interacción reinicia el temporizador, así que una apertura automática nunca
 * interrumpe una lectura o un gesto en curso: espera a que haya calma.
 *
 * Pensado para la auto-apertura de la guía de Aurora (aurora-guide.tsx), que
 * antes usaba un `setTimeout` fijo y se abría encima de quien estaba
 * navegando. Fail-open y SSR-safe: sin `window` no programa nada y al
 * desmontar limpia siempre.
 */

import { useEffect, useRef } from "react";

/** Eventos del usuario que cuentan como interacción y reinician el temporizador. */
export const EVENTOS_INTERACCION = [
    "pointerdown",
    "pointermove",
    "wheel",
    "keydown",
    "touchstart",
    "scroll",
] as const;

/** Un evento de la lista anterior (solo el nombre, tipado fino). */
export type EventoInteraccion = (typeof EVENTOS_INTERACCION)[number];

/**
 * Reposición mínima entre reinicios (ms): un mismo gesto dispara decenas de
 * `pointermove` y reiniciar en cada uno sería un latido inútil de timers.
 */
export const REPOSICION_MINIMA_MS = 250;

/**
 * Pura: ¿conviene reiniciar el temporizador ante esta interacción?
 * Con la primera constancia sí; después solo si pasó ya el mínimo desde la
 * última reposición (o si el mínimo es 0).
 */
export function debeReiniciar(
    ultimaReposicion: number | null,
    ahora: number,
    reposicionMinimaMs: number,
): boolean {
    if (reposicionMinimaMs <= 0) return true;
    if (ultimaReposicion === null) return true;
    return ahora - ultimaReposicion >= reposicionMinimaMs;
}

/** Opciones del temporizador de calma. */
export interface OpcionesTimeoutInteraccion {
    /** Milissegundos de calma antes de disparar. */
    retrasoMs: number;
    /** Se ejecuta UNA vez si el temporizador expira sin interacción. */
    alExpirar: () => void;
    /** `false` = no programa nada (p. ej. aún no se decidió la apertura). */
    activo?: boolean;
}

/**
 * Temporizador que se reinicia con cada interacción del usuario y llama
 * `alExpirar` una sola vez al llegar la calma. Cambiar `activo` o `retrasoMs`
 * rearma el temporizador desde cero.
 */
export function useTimeoutInteraction({ retrasoMs, alExpirar, activo = true }: OpcionesTimeoutInteraccion): void {
    const alExpirarRef = useRef(alExpirar);
    alExpirarRef.current = alExpirar;

    useEffect(() => {
        if (!activo || typeof window === "undefined") return;
        let id: ReturnType<typeof setTimeout> | undefined;
        const ultimaReposicionRef = { actual: null as number | null };

        const programar = () => {
            if (id !== undefined) clearTimeout(id);
            id = setTimeout(() => {
                id = undefined;
                alExpirarRef.current();
            }, retrasoMs);
        };

        const reponer = () => {
            const ahora = performance.now();
            if (!debeReiniciar(ultimaReposicionRef.actual, ahora, REPOSICION_MINIMA_MS)) return;
            ultimaReposicionRef.actual = ahora;
            programar();
        };

        programar();
        for (const nombre of EVENTOS_INTERACCION) {
            window.addEventListener(nombre as EventoInteraccion, reponer, { passive: true, capture: true });
        }
        return () => {
            if (id !== undefined) clearTimeout(id);
            for (const nombre of EVENTOS_INTERACCION) {
                window.removeEventListener(nombre as EventoInteraccion, reponer, { capture: true });
            }
        };
    }, [activo, retrasoMs]);
}
