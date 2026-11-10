// ════════════════════════════════════════════════════════════════
// StarSeed OS — Cuándo el símbolo 3D va en vivo y cuándo queda fijo (ESC1110A)
// ----------------------------------------------------------------
// Lógica pura (sin React ni three) para poder probarla sin navegador.
//   · «fijo»   → solo la imagen prerenderizada (sin WebGL, contexto perdido,
//                movimiento reducido en un aparato débil, pruebas/jsdom).
//   · «quieto» → lienzo 3D en vivo pero sin ningún movimiento (movimiento
//                reducido en un aparato capaz): se pinta una vez y para.
//   · «vivo»   → flotación lenta, guiñada suave y seguimiento del puntero.
// ════════════════════════════════════════════════════════════════

export type ModoSimbolo = "fijo" | "quieto" | "vivo";

export interface EntornoSimbolo {
    webgl: boolean;
    movimientoReducido: boolean;
    /** Núcleos lógicos (navigator.hardwareConcurrency), si se conocen. */
    nucleos?: number;
    /** Memoria en GB (navigator.deviceMemory, solo Chromium), si se conoce. */
    memoriaGb?: number;
    /** Agente de usuario: jsdom no pinta WebGL. */
    agente?: string;
}

/** Aparato débil: ≤ 4 núcleos o ≤ 4 GB declarados. */
export function esAparatoDebil(e: Pick<EntornoSimbolo, "nucleos" | "memoriaGb">): boolean {
    return (typeof e.nucleos === "number" && e.nucleos > 0 && e.nucleos <= 4)
        || (typeof e.memoriaGb === "number" && e.memoriaGb > 0 && e.memoriaGb <= 4);
}

export function decidirModoSimbolo(e: EntornoSimbolo): ModoSimbolo {
    if (!e.webgl) return "fijo";
    if (e.agente && /jsdom/i.test(e.agente)) return "fijo";
    if (e.movimientoReducido) return esAparatoDebil(e) ? "fijo" : "quieto";
    return "vivo";
}

/** Lee el entorno real del navegador (sin crear contextos que se queden vivos). */
export function leerEntornoSimbolo(): EntornoSimbolo {
    if (typeof window === "undefined") return { webgl: false, movimientoReducido: true };
    const nav = navigator as Navigator & { deviceMemory?: number };
    // jsdom no tiene WebGL (y avisa al pedir un contexto): ni lo intenta.
    if (/jsdom/i.test(nav.userAgent)) return { webgl: false, movimientoReducido: false, agente: nav.userAgent };
    let webgl = false;
    try {
        const c = document.createElement("canvas");
        const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
        webgl = !!gl;
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { webgl = false; }
    let movimientoReducido = false;
    try { movimientoReducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* sin matchMedia */ }
    return {
        webgl,
        movimientoReducido,
        nucleos: nav.hardwareConcurrency,
        memoriaGb: nav.deviceMemory,
        agente: nav.userAgent,
    };
}
