"use client";

/**
 * CapaDifusion — pinta UNA capa `difusion` de la pila de fondos (Ola 1018F · FSH1018F · architecture/fondos-shaders.md §2).
 * El velo lo decide `estiloDifusion` (puro); aquí solo se coloca con su transformación relativa y se recorta con su
 * máscara. Sin eventos, sin red y sin GPU: el motor base sigue siendo la opción principal debajo.
 */
import type { CSSProperties } from "react";
import type { BackgroundLayer, DifusionConfig, Transform } from "@/lib/appearance/background-layers";
import { estiloDifusion, estiloMascara } from "@/lib/appearance/difusion";

const SIN_AJUSTES: DifusionConfig = { modo: "transparente", desenfoquePx: 0, opacidad: 1, textura: "ninguna" };
const SIN_TRANSFORMAR: Transform = { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 };

export interface CapaDifusionProps {
  capa: BackgroundLayer;
  className?: string;
}

const pct = (v: number | undefined, fb: number): string => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fb;
  return `${n * 100}%`;
};

const grados = (v: number | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export function CapaDifusion({ capa, className }: CapaDifusionProps) {
  if (!capa.visible || capa.kind !== "difusion") return null;
  const d = capa.difusion ?? SIN_AJUSTES;
  const t = capa.transform ?? SIN_TRANSFORMAR;
  const escala = typeof t.escala === "number" && Number.isFinite(t.escala) ? Math.max(0, t.escala) : 1;
  // x/y son la esquina superior izquierda (0-1): con los valores por defecto la capa cubre todo el lienzo.
  const estilo: CSSProperties = {
    ...estiloDifusion(d),
    ...estiloMascara(capa.mascara),
    position: "absolute",
    left: pct(t.x, 0),
    top: pct(t.y, 0),
    width: pct(t.ancho, 1),
    height: pct(t.alto, 1),
    transform: `rotate(${grados(t.rotacion)}deg) scale(${escala})`,
    transformOrigin: "center",
    opacity: capa.opacity,
    mixBlendMode: capa.blend,
    pointerEvents: "none",
  };
  return <div aria-hidden className={className} style={estilo} />;
}

export default CapaDifusion;
