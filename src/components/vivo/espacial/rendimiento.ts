"use client";

/**
 * Perfil de rendimiento de la escena: `eco` con `html[data-perf="eco"]` o en equipos modestos
 * (≤ 4 núcleos o ≤ 4 GB), y `reducido` con prefers-reduced-motion. Se relee si cambian.
 */

import { useEffect, useState } from "react";

export interface PerfilRendimiento {
    eco: boolean;
    reducido: boolean;
}

export function leerPerfil(): PerfilRendimiento {
    if (typeof window === "undefined") return { eco: false, reducido: false };
    let eco = false;
    let reducido = false;
    try {
        eco = document.documentElement.getAttribute("data-perf") === "eco";
        const nav = navigator as Navigator & { deviceMemory?: number };
        const nucleos = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 8;
        const memoria = typeof nav.deviceMemory === "number" ? nav.deviceMemory : 8;
        if (nucleos <= 4 || memoria <= 4) eco = true;
        reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    } catch {
        /* sin datos: perfil normal */
    }
    return { eco, reducido };
}

export function usePerfilRendimiento(): PerfilRendimiento {
    const [perfil, setPerfil] = useState<PerfilRendimiento>({ eco: false, reducido: false });
    useEffect(() => {
        const actualizar = () =>
            setPerfil((prev) => {
                const n = leerPerfil();
                return n.eco === prev.eco && n.reducido === prev.reducido ? prev : n;
            });
        actualizar();
        let obs: MutationObserver | null = null;
        try {
            obs = new MutationObserver(actualizar);
            obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-perf"] });
        } catch {
            obs = null;
        }
        const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        mq?.addEventListener?.("change", actualizar);
        return () => {
            obs?.disconnect();
            mq?.removeEventListener?.("change", actualizar);
        };
    }, []);
    return perfil;
}
