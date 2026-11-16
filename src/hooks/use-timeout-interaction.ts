"use client";

/**
 * Temporizador de inactividad para la guía (2026-11-16 · IMG-agentes).
 * ═══════════════════════════════════════════════════════════════════════════
 * «El temporizador que muestra la guía interrumpe la navegación del usuario al
 * expirar». Un `setTimeout` fijo abre la guía encima de quien está leyendo,
 * escribiendo o moviéndose por la interfaz. Aquí el temporizador es de CALMA:
 * cualquier scroll, clic, tecla, toque o movimiento del ratón lo REINICIA, de
 * modo que la guía solo aparece cuando la persona se ha quedado quieta.
 *
 * La decisión es PURA (`esperaHastaDisparo`, sin reloj ni DOM) para poder
 * probarla en Node; el hook solo cablea el reloj y los eventos del navegador.
 * Fail-open: sin `window` no corre y nunca lanza.
 */

import { useEffect, useRef } from "react";

/** Eventos que cuentan como «el usuario está navegando»: cada uno reinicia el temporizador. */
export const EVENTOS_INTERACCION = [
  "pointerdown",
  "wheel",
  "keydown",
  "touchstart",
  "scroll",
  "mousemove",
] as const;

export type EventoInteraccion = (typeof EVENTOS_INTERACCION)[number];

/**
 * ¿Cuántos ms faltan para que el temporizador pueda disparar? PURA.
 * `ultimaInteraccionMs` es la marca de la última acción del usuario (o null si
 * aún no hubo ninguna). Mientras haya una interacción más reciente que el
 * retardo, la apertura ESPERA; nunca devuelve un valor negativo.
 */
export function esperaHastaDisparo(
  ultimaInteraccionMs: number | null,
  ahoraMs: number,
  retardoMs: number,
): number {
  if (ultimaInteraccionMs === null) return retardoMs;
  return Math.max(0, retardoMs - (ahoraMs - ultimaInteraccionMs));
}

export interface OpcionesTemporizadorInteraccion {
  /** El temporizador solo corre cuando es true (p. ej. hay una apertura pendiente). */
  activo: boolean;
  /** ms de calma sin interacción antes de disparar. */
  retardoMs?: number;
}

/**
 * Ejecuta `alDisparar` tras `retardoMs` SIN que el usuario interactúe; cualquier
 * scroll, clic, tecla, toque o movimiento del ratón lo reinicia, así que la guía
 * nunca aparece encima de quien está navegando. Fail-open: sin `window` no corre.
 */
export function useTimeoutInteraction(
  alDisparar: () => void,
  { activo, retardoMs = 900 }: OpcionesTemporizadorInteraccion,
): void {
  // El callback va en una ref: reprogramar no depende de su identidad.
  const cbRef = useRef(alDisparar);
  cbRef.current = alDisparar;

  useEffect(() => {
    if (!activo || typeof window === "undefined") return;
    let ultimaInteraccion: number | null = null;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    // Programa el disparo para el momento en que la calma cumpla el retardo; si
    // hubo interacción entretanto, vuelve a esperar lo que falte.
    const programar = () => {
      if (temporizador !== undefined) clearTimeout(temporizador);
      const espera = esperaHastaDisparo(ultimaInteraccion, Date.now(), retardoMs);
      temporizador = setTimeout(() => {
        if (esperaHastaDisparo(ultimaInteraccion, Date.now(), retardoMs) > 0) programar();
        else cbRef.current();
      }, espera);
    };

    const alInteractuar = () => {
      ultimaInteraccion = Date.now();
    };

    programar();
    for (const evento of EVENTOS_INTERACCION) {
      window.addEventListener(evento, alInteractuar, { passive: true });
    }
    return () => {
      if (temporizador !== undefined) clearTimeout(temporizador);
      for (const evento of EVENTOS_INTERACCION) {
        window.removeEventListener(evento, alInteractuar);
      }
    };
  }, [activo, retardoMs]);
}
