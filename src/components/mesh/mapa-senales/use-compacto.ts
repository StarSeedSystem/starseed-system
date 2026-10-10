"use client";

/**
 * useCompacto — ¿pantalla estrecha de móvil? Se decide DESPUÉS de montar (el HTML del servidor no
 * conoce el ancho) y se mantiene al girar el aparato. Sin `matchMedia` (pruebas, navegadores
 * viejos) devuelve false: la vista completa nunca se pierde por no poder medir.
 */

import { useEffect, useState } from "react";

const CONSULTA = "(max-width: 639px)";

export function useCompacto(forzado?: boolean): boolean {
  const [estrecho, setEstrecho] = useState(false);
  useEffect(() => {
    if (forzado !== undefined || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(CONSULTA);
    const leer = () => setEstrecho(mq.matches);
    leer();
    mq.addEventListener?.("change", leer);
    return () => mq.removeEventListener?.("change", leer);
  }, [forzado]);
  return forzado ?? estrecho;
}
