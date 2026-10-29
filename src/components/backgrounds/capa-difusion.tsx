"use client";

/**
 * CapaDifusion — pinta UNA capa `difusion` de la pila de fondos (Ola 1018F · FSH1018F ·
 * architecture/fondos-shaders.md §2). El estilo sale de `estiloDifusion` (puro): desenfoque,
 * tinte con opacidad y textura SVG determinista. Aquí solo se añaden su transformación relativa
 * y su máscara. No ocupa eventos y se oculta con `aria-hidden`: es fondo, no contenido.
 */
import type { CSSProperties } from "react";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import { estiloDifusion, estiloMascara, estiloTransformacion } from "@/lib/appearance/difusion";

export interface CapaDifusionProps {
  capa: BackgroundLayer;
  className?: string;
}

export function CapaDifusion({ capa, className }: CapaDifusionProps) {
  if (!capa.visible || !capa.difusion) return null;
  const estilo: CSSProperties = {
    ...estiloDifusion(capa.difusion),
    ...estiloMascara(capa.mascara),
    ...estiloTransformacion(capa.transform),
    opacity: capa.opacity,
    mixBlendMode: capa.blend,
  };
  return <div aria-hidden className={`pointer-events-none ${className ?? ""}`} style={estilo} />;
}

export default CapaDifusion;
