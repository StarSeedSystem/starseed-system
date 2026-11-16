"use client";

/**
 * Temporizador que respeta la navegación: no salta encima con un plazo fijo,
 * espera a que la persona lleve un rato sin tocar nada. Cada gesto (puntero,
 * tecla, rueda, scroll, toque) reinicia la cuenta; un techo máximo impide que
 * el aplazamiento la deje sin abrir nunca. La decisión es pura
 * (`msParaAbrirGuia`) y se prueba sin DOM; el hook solo escucha y programa.
 */

import { useEffect, useRef } from "react";

/** Inactividad mínima antes de abrir la guía sola. */
export const ESPERA_INACTIVIDAD_MS = 1200;
/** Techo: aunque no se deje de interactuar, no se aplaza más que esto. */
export const ESPERA_MAXIMA_MS = 20_000;

/** Lo que el temporizador necesita saber para decidir cuándo abrir. */
export interface EstadoTemporizadorGuia {
  /** Momento en que se pidió abrir. */
  pedidoEn: number;
  /** Momento de la última interacción observada. */
  ultimaInteraccion: number;
}

/** Umbrales ajustables (las pruebas y quien llama pueden acortarlos). */
export interface OpcionesEspera {
  esperaInactividadMs?: number;
  esperaMaximaMs?: number;
}

/** Ms que faltan para abrir (0 = ya toca). Puro: no lee el reloj por su cuenta. */
export function msParaAbrirGuia(
  estado: EstadoTemporizadorGuia,
  ahora: number,
  opciones: OpcionesEspera = {},
): number {
  const inactividad = Math.max(0, opciones.esperaInactividadMs ?? ESPERA_INACTIVIDAD_MS);
  // El techo nunca puede quedar por debajo de la inactividad.
  const techo = Math.max(inactividad, opciones.esperaMaximaMs ?? ESPERA_MAXIMA_MS);
  // Relojes del navegador hacia atrás (ajuste de hora, suspensión): no disparan.
  const desdePedido = Math.max(0, ahora - estado.pedidoEn);
  if (desdePedido >= techo) return 0;
  const desdeInteraccion = Math.max(0, ahora - estado.ultimaInteraccion);
  if (desdeInteraccion >= inactividad) return 0;
  return Math.min(inactividad - desdeInteraccion, techo - desdePedido);
}

/** Opciones del hook. */
export interface OpcionesTimeoutInteraction extends OpcionesEspera {
  /** Mientras sea false no se programa nada (la guía ya está abierta, etc.). */
  activo: boolean;
  /** Se llama una sola vez, al cumplirse la espera. */
  alCumplir: () => void;
  /** Momento en que se PIDIÓ abrir (si no, cuenta desde que el hook se activa). */
  desde?: number;
}

/** Gestos que cuentan como «la persona está haciendo algo» (se reinicia la espera). */
const EVENTOS_INTERACCION = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
  "popstate",
  "hashchange",
] as const;

/** Programa `alCumplir` para el primer momento de inactividad suficiente. */
export function useTimeoutInteraction({
  activo,
  alCumplir,
  esperaInactividadMs,
  esperaMaximaMs,
  desde,
}: OpcionesTimeoutInteraction): void {
  const alCumplirRef = useRef(alCumplir);
  alCumplirRef.current = alCumplir;
  useEffect(() => {
    if (!activo || typeof window === "undefined") return;
    const ahora = () => Date.now();
    // Cuenta desde la petición (si se sabe): entre pedir y montar no se perdió tiempo.
    const inicio = typeof desde === "number" && Number.isFinite(desde) ? desde : ahora();
    // Interacción en un objeto, sin estado de React: mover el ratón no re-renderiza.
    const estado: EstadoTemporizadorGuia = { pedidoEn: inicio, ultimaInteraccion: inicio };
    let id: ReturnType<typeof setTimeout> | null = null;
    let cumplido = false;

    const comprobar = () => {
      if (cumplido) return;
      const falta = msParaAbrirGuia(estado, ahora(), { esperaInactividadMs, esperaMaximaMs });
      if (falta <= 0) {
        cumplido = true;
        alCumplirRef.current();
        return;
      }
      id = setTimeout(comprobar, falta);
    };

    // Solo anota el gesto: la siguiente comprobación ya recalcula con él.
    const alInteractuar = () => {
      estado.ultimaInteraccion = ahora();
    };

    for (const evento of EVENTOS_INTERACCION) {
      try { window.addEventListener(evento, alInteractuar, { passive: true, capture: true }); } catch { /* */ }
    }
    comprobar();

    return () => {
      cumplido = true;
      if (id) clearTimeout(id);
      for (const evento of EVENTOS_INTERACCION) {
        try { window.removeEventListener(evento, alInteractuar, true); } catch { /* */ }
      }
    };
  }, [activo, esperaInactividadMs, esperaMaximaMs, desde]);
}
