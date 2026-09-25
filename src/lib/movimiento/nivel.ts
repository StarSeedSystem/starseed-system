/**
 * Nivel de movimiento del OS (puro).
 * ─────────────────────────────────────────────────────────────────────────────
 * Una sola decisión para TODAS las animaciones (cortinas, páginas, pasos,
 * ventanas, logos):
 *
 *   completo → resortes naturales con profundidad 3D (perspectiva, giro sutil).
 *   suave    → equipos modestos (data-perf «mid»/«eco»): mismos resortes, cortos,
 *              sin 3D ni desenfoque. Se siente igual de vivo y cuesta casi nada.
 *   minimo   → la persona pidió menos movimiento (sistema o Ajustes →
 *              Accesibilidad): solo fundidos breves; el arrastre directo sigue
 *              funcionando 1:1 porque mover algo con el dedo no es una animación.
 */

export type NivelMovimiento = "completo" | "suave" | "minimo";

export interface SenalesMovimiento {
    /** `prefers-reduced-motion: reduce` del sistema. */
    prefiereReducido: boolean;
    /** Ajustes → Accesibilidad → «Reducir movimiento» (clase `a11y-reduce-motion` en <html>). */
    a11yReducido: boolean;
    /** `data-perf` de <html> que fija src/lib/perf/device-tier.ts. */
    perf: string | null;
}

export function resolverNivelMovimiento(s: SenalesMovimiento): NivelMovimiento {
    if (s.prefiereReducido || s.a11yReducido) return "minimo";
    if (s.perf === "eco" || s.perf === "mid") return "suave";
    return "completo";
}

/** Lee las señales del documento actual (SSR: devuelve «completo» sin tocar nada). */
export function leerNivelMovimiento(): NivelMovimiento {
    if (typeof window === "undefined" || typeof document === "undefined") return "completo";
    let prefiereReducido = false;
    try {
        prefiereReducido = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    } catch {
        /* navegadores sin matchMedia: se asume movimiento normal */
    }
    const html = document.documentElement;
    return resolverNivelMovimiento({
        prefiereReducido,
        a11yReducido: html.classList.contains("a11y-reduce-motion"),
        perf: html.getAttribute("data-perf"),
    });
}
