"use client";

/**
 * useTimeoutInteraction — temporizador que se reinicia con la interacción.
 * ═══════════════════════════════════════════════════════════════════════════
 * Sustituye al `setTimeout` fijo que abría la guía encima de quien estaba
 * navegando. Solo dispara cuando la persona lleva `pacienciaMs` sin tocar nada
 * (clic, tecla, scroll, rueda, toque o movimiento del puntero). La cuenta pura
 * vive en `lib/onboarding/guia-espera.ts`; este hook solo la conecta al DOM.
 *
 * SSR-safe: sin `window` no registra nada. Se limpia al desmontar o al apagar
 * `activo`, y el temporizador es de un solo uso (no se rearma tras cumplirse).
 */

import { useEffect, useRef } from "react";
import { esperaHastaSilencio, interaccionReciente } from "@/lib/onboarding/guia-espera";

export const EVENTOS_INTERACCION = [
  "pointerdown",
  "mousedown",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
  "mousemove",
] as const;

export function useTimeoutInteraction(
  alCumplir: () => void,
  pacienciaMs: number,
  activo = true,
): void {
  const alCumplirRef = useRef(alCumplir);
  alCumplirRef.current = alCumplir;
  const ultimaInteraccionRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activo || typeof window === "undefined") return;
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const programar = (esperaMs: number) => {
      if (!vivo) return;
      temporizador = setTimeout(() => {
        if (!vivo) return;
        if (interaccionReciente(ultimaInteraccionRef.current, Date.now(), pacienciaMs)) {
          programar(esperaHastaSilencio(ultimaInteraccionRef.current, Date.now(), pacienciaMs));
          return;
        }
        vivo = false;
        alCumplirRef.current();
      }, Math.max(0, esperaMs));
    };

    const alInteractuar = () => {
      ultimaInteraccionRef.current = Date.now();
    };

    for (const evento of EVENTOS_INTERACCION) {
      window.addEventListener(evento, alInteractuar, { passive: true, capture: true });
    }
    programar(esperaHastaSilencio(null, Date.now(), pacienciaMs));

    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      for (const evento of EVENTOS_INTERACCION) {
        window.removeEventListener(evento, alInteractuar, true);
      }
    };
  }, [pacienciaMs, activo]);
}
