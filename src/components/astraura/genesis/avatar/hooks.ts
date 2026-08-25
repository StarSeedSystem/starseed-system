"use client";

/**
 * hooks.ts — Detección reactiva de entorno para el cuerpo de un ser.
 *
 * Dos preguntas MUY distintas que el encargo pide no confundir:
 *   · ¿Hay WebGL? → si no, no hay "menos animación": no hay Canvas posible.
 *     El respaldo es el SVG estático (`avatar-fallback-svg.tsx`).
 *   · ¿`prefers-reduced-motion`? → el avatar 3D se sigue montando igual,
 *     solo se congela su `useFrame` (pulso/rotación). No es un caso de
 *     "sin WebGL": el ser sigue siendo un cuerpo 3D real, quieto.
 *
 * Por eso son dos hooks separados en vez de uno "modoDegradado" que las
 * mezclara — cada uno alimenta una decisión de render diferente en
 * `avatar-autonomo.tsx` y `avatar-ser.tsx`.
 */

import { useEffect, useState } from "react";

/** Sonda de WebGL real (crea un contexto de prueba y lo descarta) — más
 * fiable que mirar `navigator` o asumir por user-agent. Un `<canvas>` fuera
 * del DOM no cuesta nada y no se pinta nunca. */
function detectarWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * `true` mientras no se ha comprobado nada todavía (SSR / primer paint) —
 * así el llamador puede elegir no mostrar nada, o mostrar el 3D de
 * optimista, hasta que se resuelva en el primer efecto del cliente. Una vez
 * resuelto, refleja la disponibilidad real de WebGL en este navegador.
 */
export function useTieneWebGL(): boolean {
  const [tiene, setTiene] = useState(true);
  useEffect(() => {
    setTiene(detectarWebGL());
  }, []);
  return tiene;
}

/** Reactivo de verdad (a diferencia del chequeo de una sola vez que usa
 * `quantum-orb.tsx` dentro de su propio `useEffect` de montaje): si el
 * usuario cambia la preferencia del sistema mientras la página está
 * abierta, el avatar debe notarlo sin necesitar un remount. */
export function usePrefiereMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setReducido(mq.matches);
    aplicar();
    mq.addEventListener?.("change", aplicar);
    return () => mq.removeEventListener?.("change", aplicar);
  }, []);
  return reducido;
}
