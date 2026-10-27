/**
 * capa-difusion.tsx — Componente React para la capa de difusión de fondos (Ola 1018F)
 * ============================================================================
 * Aplica los estilos generados por `estiloDifusion` con su transformación y máscara.
 */

import * as React from "react";
import type { DifusionConfig, Transform, MascaraKind } from "@/lib/appearance/background-layers";
import { estiloDifusion } from "@/lib/appearance/difusion";

interface CapaDifusionProps {
  difusion: DifusionConfig;
  opacity?: number;
  transform?: Transform;
  mascara?: MascaraKind;
  className?: string;
  style?: React.CSSProperties;
}

export const CapaDifusion: React.FC<CapaDifusionProps> = ({
  difusion,
  opacity = 1,
  transform,
  mascara = "ninguna",
  className = "",
  style = {},
}) => {
  const baseStyles = estiloDifusion(difusion);

  // Calcular transformaciones CSS si existen
  const transformStyle: React.CSSProperties = {};
  if (transform) {
    const { x, y, escala, rotacion, ancho, alto } = transform;
    const transformStr = `translate(${x * 100}%, ${y * 100}%) scale(${escala}) rotate(${rotacion}deg)`;
    transformStyle.transform = transformStr;
    transformStyle.width = `${ancho * 100}%`;
    transformStyle.height = `${alto * 100}%`;
    transformStyle.position = "absolute";
    transformStyle.left = "0";
    transformStyle.top = "0";
  } else {
    transformStyle.position = "absolute";
    transformStyle.inset = "0";
  }

  // Estilos de máscara
  const maskStyle: React.CSSProperties = {};
  if (mascara === "radial") {
    maskStyle.maskImage = "radial-gradient(circle, black 40%, transparent 100%)";
    maskStyle.WebkitMaskImage = "radial-gradient(circle, black 40%, transparent 100%)";
  } else if (mascara === "lineal") {
    maskStyle.maskImage = "linear-gradient(to bottom, black 60%, transparent 100%)";
    maskStyle.WebkitMaskImage = "linear-gradient(to bottom, black 60%, transparent 100%)";
  }

  const combinedStyle: React.CSSProperties = {
    ...baseStyles,
    ...transformStyle,
    ...maskStyle,
    opacity,
    pointerEvents: "none",
    zIndex: 2,
    ...style,
  };

  return <div className={`absolute inset-0 pointer-events-none ${className}`} style={combinedStyle} />;
};
