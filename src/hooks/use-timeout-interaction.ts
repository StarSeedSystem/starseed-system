"use client";

/**
 * useTimeoutInteraction — temporizador que respeta la navegación.
 *
 * La guía de Aurora no debe saltar encima de la persona con un plazo fijo:
 * si está leyendo, desplazándose o tocando la interfaz, ese plazo expiraba y
 * la guía aparecía a mitad de un gesto. Aquí la espera se reinicia con cada
 * interacción (puntero, tecla, rueda, scroll, toque) y solo se cumple cuando
 * la persona lleva un rato sin tocar nada. Un techo máximo evita que una
 * interacción constante deje la guía sin abrir jamás.
 *
 * La decisión es una función pura (`msParaAbrirGuia`), sin DOM ni reloj
 * propio, para poder probarla de verdad; el hook solo escucha y programa.
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

/**
 * Ms que faltan para abrir (0 = ya toca). Puro: no lee el reloj por su cuenta.
 * La espera es la inactividad pactada desde el último gesto, recortada por el
 * techo desde que se pidió abrir.
 */
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

/** Gestos que cuentan como «la persona está haciendo algo» (reinician la espera). */
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
    // La interacción vive en un objeto, no en estado de React: mover el ratón
    // no provoca un re-render de toda la guía.
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

    // Solo anota el gesto: la siguiente comprobación recalcula con él.
    const alInteractuar = () => {
      estado.ultimaInteraccion = ahora();
    };

    for (const evento of EVENTOS_INTERACCION) {
      try {
        window.addEventListener(evento, alInteractuar, { passive: true, capture: true });
      } catch {
        /* defensivo */
      }
    }
    comprobar();

    return () => {
      cumplido = true;
      if (id) clearTimeout(id);
      for (const evento of EVENTOS_INTERACCION) {
        try {
          window.removeEventListener(evento, alInteractuar, true);
        } catch {
          /* defensivo */
        }
      }
    };
  }, [activo, esperaInactividadMs, esperaMaximaMs, desde]);
}
