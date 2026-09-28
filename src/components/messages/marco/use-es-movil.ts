"use client";

/**
 * ¿Pantalla estrecha (< 768 px, el `md` de Tailwind)? Decide entre dos paneles lado a lado y
 * pantallas apiladas. Un solo árbol montado: antes se pintaban DOS copias del chat (una escondida
 * por CSS) y ambas se suscribían al tiempo real.
 */

import { useSyncExternalStore } from "react";

const CONSULTA = "(max-width: 767px)";

function suscribir(avisar: () => void): () => void {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    let mq: MediaQueryList | null = null;
    try {
        mq = window.matchMedia(CONSULTA);
        mq.addEventListener?.("change", avisar);
    } catch {
        mq = null;
    }
    window.addEventListener("resize", avisar);
    return () => {
        try {
            mq?.removeEventListener?.("change", avisar);
        } catch {
            /* noop */
        }
        window.removeEventListener("resize", avisar);
    };
}

function leer(): boolean {
    try {
        if (typeof window.matchMedia === "function") return window.matchMedia(CONSULTA).matches;
        return window.innerWidth < 768;
    } catch {
        return false;
    }
}

export function useEsMovil(): boolean {
    return useSyncExternalStore(suscribir, leer, () => false);
}
