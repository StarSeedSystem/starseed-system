/**
 * NIVELES DE CALIDAD — MOTOR ÚNICO DE MOVIMIENTO «VIDA STARSEED»
 * (Ola 229 · M1 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * UN solo motor de movimiento para todos los avatares del OS, con cuatro
 * niveles que se adaptan al hardware SIN cambiar la identidad del gesto:
 * el carácter del movimiento es el mismo; lo que varía es la precisión del
 * motor que lo genera.
 *
 *  · vivo   — Kimodo local por el demonio (SOMA, 30 articulaciones)
 *  · fluido — Kimodo con lote precalculado + mezcla de clips
 *  · ligero — biblioteca procedural en el navegador (respiración, parpadeo…)
 *  · quieto — micro-movimiento CSS (respiración) o prefers-reduced-motion
 */

import type { Capacidades } from "@/lib/aurora/voz-starseed/capacidades";

export type NivelMovimiento = "vivo" | "fluido" | "ligero" | "quieto";

export interface InfoNivelMovimiento {
    /** Nombre legible para la interfaz. */
    etiqueta: string;
    /** Motor interno que genera el gesto en este nivel. */
    motorInterno: string;
    /** Requisitos de hardware, en texto. */
    requisitos: string;
    /** Memoria que ocupa el modelo, en MB. */
    ramMB: number;
    /** Latencia percibida, en texto. */
    latencia: string;
    /** Articulaciones del esqueleto objetivo en este nivel. */
    articulaciones: number;
}

export const NIVELES_MOVIMIENTO: Record<NivelMovimiento, InfoNivelMovimiento> = {
    vivo: {
        etiqueta: "Vivo",
        motorInterno: "Kimodo local (demonio, texto → movimiento)",
        requisitos: "Demonio local de movimiento y 8 GB de RAM o más",
        ramMB: 900,
        latencia: "Baja (local, generación en directo)",
        articulaciones: 30,
    },
    fluido: {
        etiqueta: "Fluido",
        motorInterno: "Kimodo con lote precalculado + mezcla de clips",
        requisitos: "Demonio local de movimiento",
        ramMB: 600,
        latencia: "Baja (sirve gestos precalculados)",
        articulaciones: 30,
    },
    ligero: {
        etiqueta: "Ligero",
        motorInterno: "Biblioteca de clips procedurales (navegador)",
        requisitos: "Equipo de escritorio con WebGPU o WASM SIMD",
        ramMB: 0,
        latencia: "Inmediata",
        articulaciones: 22,
    },
    quieto: {
        etiqueta: "Quieto",
        motorInterno: "Micro-movimiento CSS (respiración)",
        requisitos: "Ninguno: funciona en cualquier equipo",
        ramMB: 0,
        latencia: "Inmediata",
        articulaciones: 0,
    },
};

/** Cadena de descenso: cada nivel puede pasar al siguiente. */
const ORDEN: NivelMovimiento[] = ["vivo", "fluido", "ligero", "quieto"];

/**
 * Elige el nivel más alto que el equipo puede sostener:
 *  · `reducirMovimiento` (prefers-reduced-motion)     → quieto, siempre
 *  · demonio local + 8 GB de RAM o más                → vivo
 *  · demonio local                                     → fluido
 *  · escritorio con WebGPU o WASM SIMD                 → ligero
 *  · cualquier otro caso                               → quieto
 */
export function nivelMovimientoPara(c: Capacidades, reducirMovimiento: boolean): NivelMovimiento {
    if (reducirMovimiento) return "quieto";
    if (c.daemonLocal && (c.memoriaGB ?? 0) >= 8) return "vivo";
    if (c.daemonLocal) return "fluido";
    if (!c.movil && (c.webgpu || c.wasmSimd)) return "ligero";
    return "quieto";
}

/**
 * Niveles que puede ofrecer este equipo, del mejor al peor.
 * Siempre incluye «quieto», la red de seguridad que nunca falla.
 */
export function nivelesMovimientoDisponibles(c: Capacidades, reducirMovimiento: boolean): NivelMovimiento[] {
    const mejor = nivelMovimientoPara(c, reducirMovimiento);
    return ORDEN.slice(ORDEN.indexOf(mejor));
}

/**
 * El nivel inmediatamente inferior (degradación grácil), o `null` cuando ya
 * se está en el mínimo. Cadena: vivo → fluido → ligero → quieto → null.
 */
export function siguienteNivelMovimiento(n: NivelMovimiento): NivelMovimiento | null {
    const i = ORDEN.indexOf(n);
    return i >= 0 && i < ORDEN.length - 1 ? ORDEN[i + 1] : null;
}
