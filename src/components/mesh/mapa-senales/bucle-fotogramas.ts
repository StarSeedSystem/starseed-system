"use client";

import { useEffect, useRef, useState } from "react";

export interface EstadoAnimacion {
  girar: boolean;
  hayPulsos: boolean;
  camaraEnVuelo: boolean;
}

export function useBucleFotogramas(
  estado: EstadoAnimacion,
  reducido: boolean,
  contenedorRef: React.RefObject<HTMLDivElement | null>
): { animado: boolean; fps: number } {
  const [visible, setVisible] = useState(true);
  const [enVista, setEnVista] = useState(true);
  const observadorRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const alCambiar = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", alCambiar);
    return () => document.removeEventListener("visibilitychange", alCambiar);
  }, []);

  useEffect(() => {
    if (!contenedorRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setEnVista(entry.isIntersecting),
      { threshold: 0.01 }
    );
    obs.observe(contenedorRef.current);
    observadorRef.current = obs;
    return () => obs.disconnect();
  }, [contenedorRef]);

  const hayActividad = estado.girar || estado.hayPulsos || estado.camaraEnVuelo;
  const animado = visible && enVista && hayActividad && !reducido;
  const fps = reducido ? 15 : 60;

  return { animado, fps };
}

export function calcularFPS(reducido: boolean, animado: boolean): number {
  if (!animado) return 0;
  return reducido ? 15 : 60;
}