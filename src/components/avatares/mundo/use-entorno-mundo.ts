"use client";

/**
 * Lo que el aparato dice del entorno del mundo (Ola 1025U · U1): ¿hay WebGL de verdad?, ¿pide la persona
 * reducir el movimiento? y ¿está la pestaña oculta? Los tres se siguen en vivo: antes el movimiento
 * reducido se leía una sola vez, y si la persona lo activaba con el mundo abierto la escena seguía girando.
 *
 * Hasta que se mide (`listo`), el mundo no decide entre la escena 3D y la crónica: así no aparece un destello
 * de crónica antes del lienzo, ni se monta el `<Canvas>` en un aparato sin WebGL.
 */
import { useEffect, useState } from "react";

export interface EntornoMundo {
  /** Ya se midió el aparato; antes de esto `webgl` y `reducido` son provisionales. */
  listo: boolean;
  webgl: boolean;
  reducido: boolean;
  /** La pestaña no se ve: no hay nada que animar. */
  oculta: boolean;
}

const CONSULTA_REDUCIDO = "(prefers-reduced-motion: reduce)";

/** ¿Hay un contexto WebGL de verdad? (en jsdom no lo hay). */
export function hayWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const lienzo = document.createElement("canvas");
    return !!(lienzo.getContext("webgl2") || lienzo.getContext("webgl") || lienzo.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function pideReducir(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(CONSULTA_REDUCIDO).matches;
  } catch {
    return false;
  }
}

const estaOculta = (): boolean => typeof document !== "undefined" && document.hidden === true;

export function useEntornoMundo(): EntornoMundo {
  const [entorno, setEntorno] = useState<EntornoMundo>({ listo: false, webgl: false, reducido: false, oculta: false });

  useEffect(() => {
    setEntorno({ listo: true, webgl: hayWebGL(), reducido: pideReducir(), oculta: estaOculta() });

    let consulta: MediaQueryList | null = null;
    try {
      consulta = typeof window.matchMedia === "function" ? window.matchMedia(CONSULTA_REDUCIDO) : null;
    } catch {
      consulta = null;
    }
    const alCambiarMovimiento = () => setEntorno((e) => ({ ...e, reducido: pideReducir() }));
    const alCambiarVisibilidad = () => setEntorno((e) => ({ ...e, oculta: estaOculta() }));

    consulta?.addEventListener?.("change", alCambiarMovimiento);
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => {
      consulta?.removeEventListener?.("change", alCambiarMovimiento);
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    };
  }, []);

  return entorno;
}
