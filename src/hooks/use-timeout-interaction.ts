"use client";

/**
 * useTimeoutInteraction — espera de cortesía que NO interrumpe la navegación.
 * Un plazo fijo abre su ventana aunque la persona esté navegando. Este hook lo
 * cambia por una espera de INACTIVIDAD: cada gesto (scroll, clic, tecla,
 * puntero, rueda) reinicia la cuenta atrás, así que la acción solo ocurre
 * cuando la persona lleva un momento sin tocar nada. La cuenta atrás es pura y
 * se prueba aparte; al desmontar no deja oyentes ni temporizadores vivos.
 */

import { useEffect, useRef } from "react";

/** Gestos que cuentan como «la persona está usando la app». */
export const EVENTOS_INTERACCION = [
    "pointerdown",
    "pointermove",
    "keydown",
    "scroll",
    "touchstart",
    "wheel",
] as const;

/** Cuenta atrás reiniciable, sin relojes ni efectos: entrada → salida. */
export interface CuentaAtras {
    /** Milisegundos de silencio que hay que acumular. */
    esperaMs: number;
    /** Instante (ms epoch) en que vence la espera actual. */
    venceEnMs: number;
}

const esNumero = (n: number): boolean => Number.isFinite(n);

/** Pura: nace una espera nueva desde `ahoraMs`. */
export function nuevaCuentaAtras(ahoraMs: number, esperaMs: number): CuentaAtras {
    const espera = esNumero(esperaMs) && esperaMs > 0 ? esperaMs : 0;
    const ahora = esNumero(ahoraMs) ? ahoraMs : 0;
    return { esperaMs: espera, venceEnMs: ahora + espera };
}

/** Pura: una interacción empuja el vencimiento una espera completa. */
export function alInteractuar(cuenta: CuentaAtras, ahoraMs: number): CuentaAtras {
    if (!esNumero(ahoraMs)) return cuenta;
    return { ...cuenta, venceEnMs: ahoraMs + cuenta.esperaMs };
}

/** Pura: milisegundos que faltan para vencer (nunca negativos). */
export function msRestantes(cuenta: CuentaAtras, ahoraMs: number): number {
    if (!esNumero(ahoraMs)) return cuenta.esperaMs;
    return Math.max(0, cuenta.venceEnMs - ahoraMs);
}

/** Pura: ¿la espera ya se cumplió? */
export function haVencido(cuenta: CuentaAtras, ahoraMs: number): boolean {
    return esNumero(ahoraMs) && ahoraMs >= cuenta.venceEnMs;
}

/**
 * Ejecuta `alExpirar` cuando `activo` lleva `esperaMs` sin interacción.
 * Si `activo` es false o el componente se desmonta, no ejecuta nada.
 */
export function useTimeoutInteraction(
    activo: boolean,
    alExpirar: () => void,
    esperaMs = 900,
): void {
    const alExpirarRef = useRef(alExpirar);
    alExpirarRef.current = alExpirar;

    useEffect(() => {
        if (!activo || typeof window === "undefined") return;

        let cuenta = nuevaCuentaAtras(Date.now(), esperaMs);
        let temporizador: ReturnType<typeof setTimeout> | undefined;
        let ultimoReinicio = 0;

        const limpiar = () => {
            if (temporizador !== undefined) clearTimeout(temporizador);
            temporizador = undefined;
            for (const evento of EVENTOS_INTERACCION) {
                window.removeEventListener(evento, alInteractuarAhora, evento === "scroll" ? true : undefined);
            }
        };

        const armar = () => {
            if (temporizador !== undefined) clearTimeout(temporizador);
            temporizador = setTimeout(() => {
                temporizador = undefined;
                limpiar();
                alExpirarRef.current();
            }, msRestantes(cuenta, Date.now()));
        };

        const alInteractuarAhora = () => {
            const ahora = Date.now();
            // El puntero emite cientos de eventos por segundo: renueva la espera
            // unas pocas veces por segundo y sigue sin dispararse mientras se usa.
            if (ahora - ultimoReinicio < 120) return;
            ultimoReinicio = ahora;
            cuenta = alInteractuar(cuenta, ahora);
            armar();
        };

        for (const evento of EVENTOS_INTERACCION) {
            // `scroll` no burbujea: en captura también se oyen los paneles internos.
            window.addEventListener(
                evento,
                alInteractuarAhora,
                evento === "scroll" ? true : { passive: true },
            );
        }
        armar();
        return limpiar;
    }, [activo, esperaMs]);
}
