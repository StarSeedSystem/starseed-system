"use client";

/**
 * CAPACIDADES DEL EQUIPO — MOTOR ÚNICO «VOZ STARSEED» (Ola 228 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sondeo único del hardware para decidir el NIVEL de la voz (`niveles.ts`).
 * Antes cada ventana elegía motor por su cuenta y la voz cambiaba de una a
 * otra; aquí se mide una sola vez y el resultado se comparte.
 *
 * Reglas:
 *  · Funciona también en el servidor (sin `window`): devuelve valores neutros.
 *  · Caché de 5 minutos: `detectarCapacidades()` no repite el sondeo.
 *  · El sondeo de `/api/voz/salud` tiene un límite de 800 ms y nunca lanza:
 *    si no existe, `daemonLocal` es `false`).
 */

export interface Capacidades {
    /** GB de memoria RAM aproximados (`navigator.deviceMemory`); `null` si se desconoce. */
    memoriaGB: number | null;
    /** Núcleos lógicos de CPU (`navigator.hardwareConcurrency`); `null` si se desconoce. */
    nucleos: number | null;
    /** El navegador expone WebGPU. */
    webgpu: boolean;
    /** WebAssembly con SIMD disponible. */
    wasmSimd: boolean;
    /** Puntero táctil principal (móvil/tablet). */
    movil: boolean;
    /** El demonio local de voz responde en `/api/voz/salud`. */
    daemonLocal: boolean;
}

/** Valores neutros para el servidor o cuando el sondeo falla. */
const NEUTRAS: Capacidades = {
    memoriaGB: null,
    nucleos: null,
    webgpu: false,
    wasmSimd: false,
    movil: false,
    daemonLocal: false,
};

/** Duración de la caché: 5 minutos. */
const CACHE_MS = 5 * 60 * 1000;

let cache: { datos: Capacidades; en: number } | null = null;

/** Comprueba si WebAssembly puede compilar un módulo con SIMD. */
function haySimd(): boolean {
    try {
        // Módulo WASM mínimo con una instrucción SIMD (v8x16.swizzle).
        const bytes = new Uint8Array([
            0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, 0x03,
            0x02, 0x01, 0x00, 0x0a, 0x0a, 0x01, 0x08, 0x00,
            0x41, 0x00, 0x41, 0x00, 0x41, 0x00, 0xfd, 0x0c,
            0x00, 0x00, 0x0b,
        ]);
        return WebAssembly.validate(bytes);
    } catch {
        return false;
    }
}

/** Sondeo al demonio local de voz con límite de 800 ms. Nunca lanza. */
async function sondearDaemon(): Promise<boolean> {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), 800);
    try {
        const resp = await fetch("/api/voz/salud", { signal: control.signal, cache: "no-store" });
        return resp.ok;
    } catch {
        return false;
    } finally {
        clearTimeout(temporizador);
    }
}

/**
 * Detecta las capacidades del equipo. Devuelve la caché si tiene menos de
 * 5 minutos. En el servidor devuelve valores neutros sin tocar nada.
 */
export async function detectarCapacidades(): Promise<Capacidades> {
    if (typeof window === "undefined") return { ...NEUTRAS };
    const ahora = Date.now();
    if (cache && ahora - cache.en < CACHE_MS) return cache.datos;

    const nav = window.navigator as Navigator & { deviceMemory?: number };
    const datos: Capacidades = {
        memoriaGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
        nucleos: typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
        webgpu: "gpu" in nav,
        wasmSimd: haySimd(),
        movil: window.matchMedia("(pointer: coarse)").matches,
        daemonLocal: await sondearDaemon(),
    };
    cache = { datos, en: ahora };
    return datos;
}

/** Devuelve la última medición guardada, o `null` si aún no se ha medido. */
export function capacidadesEnCache(): Capacidades | null {
    if (!cache) return null;
    if (Date.now() - cache.en >= CACHE_MS) return null;
    return cache.datos;
}
