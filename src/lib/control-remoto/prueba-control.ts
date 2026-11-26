/**
 * PRU1126A · módulo puro de prueba de control entre neuronas (ORD1114P).
 *
 * Puro, sin `node:*`, sin importar `ejecutores`, `sesion` ni `niveles` salvo `import type { Args }`.
 * Funciones de validación y generación de informes para la orden `prueba-control`.
 *
 * Validaciones:
 *   - destino: huella hex de 64 caracteres
 *   - duración: tope 120 000 ms, mínimo 10 000 ms
 *   - fuente: debe ser "auto", "proyeccion" o "malla"
 *   - si hay nivel, debe ser "controlar" o inferior
 *
 * Exporta `rechazoPrueba` para la parte 2 y `finalizarPrueba` que no lanza.
 */

import type { Args } from "./niveles";

const RE_HUELLA = /^[0-9a-f]{64}$/;
const MAX_DURACION_MS = 120_000;
const MIN_DURACION_MS = 10_000;
const FUENTES_VALIDAS = ["auto", "proyeccion", "malla"] as const;
const NIVELES_VALIDOS_FASE1 = ["ver", "controlar"];

export interface ArgsPruebaControl {
    /** Huella SHA-256 hex (64 chars) de la neurona destino. */
    destino: string;
    /** Duración en ms (mín 10s, tope 120s). */
    duracionMs: number;
    /** Fuente: "auto", "proyeccion" o "malla". */
    fuente: string;
    /** Nivel concedido: "ver" o "controlar" (fase 1). */
    nivel?: string;
}

/** Valida los argumentos de una orden `prueba-control`.
 * Devuelve `ArgsPruebaControl` validado o `null` si son inválidos. */
export function validarArgsPruebaControl(a: Args): ArgsPruebaControl | null {
    if (typeof a.destino !== "string" || !RE_HUELLA.test(a.destino)) return null;
    if (typeof a.duracionMs !== "number" || !Number.isInteger(a.duracionMs)) return null;
    if (a.duracionMs < MIN_DURACION_MS || a.duracionMs > MAX_DURACION_MS) return null;
    if (typeof a.fuente !== "string") return null;
    if (!FUENTES_VALIDAS.includes(a.fuente as any)) return null;
    if (typeof a.nivel !== "undefined") {
        if (!NIVELES_VALIDOS_FASE1.includes(a.nivel as any)) return null;
    }
    return {
        destino: a.destino,
        duracionMs: a.duracionMs,
        fuente: a.fuente,
        nivel: a.nivel,
    };
}

/** Genera un rechazo de prueba con motivo.
 * Devuelve un informe `InformePruebaControl` con `ok=false`. */
export function rechazoPrueba(motivo: "sin-permiso" | "no-aceptado" | "duracion"): InformePruebaControl {
    return { ok: false, motivo };
}

/** `InformePruebaControl`: resultado de una prueba de control entre neuronas. */
export interface InformePruebaControl {
    /** `ok` siempre presente. */
    ok: boolean;
    /** Causa o motivo del resultado. */
    motivo: string;
    /** Duración medida en ms (puede ser 0 si no hubo cuadros). */
    duracionMs: number;
    /** Cuadros efectivamente mostrados. */
    cuadros: number;
    /** Latencia media en ms entre cuadros (0 si no hubo cuadros). */
    latenciaMs: number;
    /** Retardo aplicado en ms entre cuadros (0 si no hubo retardo). */
    retardoMs: number;
}

/** Finaliza una prueba de control y devuelve un `InformePruebaControl`.
 * Con 0 cuadros, devuelve `ok=false` con motivo "sin-cuadros".
 * Nunca lanza errores. */
export function finalizarPrueba(
    estado: {
        /** Cuadros mostrados. */
        cuadros: number;
        /** Latencia media medida en ms. */
        latenciaMs: number;
        /** Retardo aplicado entre cuadros en ms. */
        retardoMs: number;
    },
): InformePruebaControl {
    if (estado.cuadros === 0) {
        return { ok: false, motivo: "sin-cuadros", duracionMs: 0, cuadros: 0, latenciaMs: 0, retardoMs: 0 };
    }
    const duracionMs = estado.cuadros * (estado.latenciaMs + estado.retardoMs);
    return {
        ok: true,
        motivo: "ok",
        duracionMs,
        cuadros: estado.cuadros,
        latenciaMs: estado.latenciaMs,
        retardoMs: estado.retardoMs,
    };
}

export type { ArgsPruebaControl, InformePruebaControl };