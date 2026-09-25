"use client";

/**
 * useNivelMovimiento — nivel de movimiento vivo (completo · suave · mínimo).
 * ─────────────────────────────────────────────────────────────────────────────
 * Se recalcula solo cuando cambia algo que lo decide: la preferencia del
 * sistema, la clase de Accesibilidad o `data-perf` en <html>. Usa
 * useSyncExternalStore: en el servidor y durante la hidratación devuelve
 * «completo» (lo mismo que se pintó en el HTML) y luego el valor real, sin
 * desajustes de hidratación ni renders por fotograma.
 */

import { useSyncExternalStore } from "react";
import { leerNivelMovimiento, type NivelMovimiento } from "@/lib/movimiento/nivel";
import { PERF_CHANGED_EVENT } from "@/lib/perf/device-tier";

function suscribir(avisar: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    let mq: MediaQueryList | null = null;
    try {
        mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        mq.addEventListener?.("change", avisar);
    } catch {
        mq = null;
    }
    window.addEventListener(PERF_CHANGED_EVENT, avisar);
    // La clase de Accesibilidad y data-perf se escriben en <html>: un observador
    // limitado a esos dos atributos es barato y no depende de quién los cambie.
    let observador: MutationObserver | null = null;
    try {
        observador = new MutationObserver(avisar);
        observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-perf"] });
    } catch {
        observador = null;
    }
    return () => {
        try {
            mq?.removeEventListener?.("change", avisar);
        } catch {
            /* noop */
        }
        window.removeEventListener(PERF_CHANGED_EVENT, avisar);
        observador?.disconnect();
    };
}

const enServidor = (): NivelMovimiento => "completo";

export function useNivelMovimiento(): NivelMovimiento {
    return useSyncExternalStore(suscribir, leerNivelMovimiento, enServidor);
}
