/**
 * CapaDifusion — pinta UNA capa `difusion` de la pila de fondos (Ola 1018F · FSH1018F ·
 * architecture/fondos-shaders.md §2). Aplica el estilo PURO de `estiloDifusion` (fondo con tono y
 * opacidad, `backdrop-filter` y textura SVG determinista) y coloca la capa con su transformación y
 * máscara. No pide red, no usa GPU y no captura clics: el motor base sigue debajo y las capas no
 * roban interacción a la interfaz.
 */
import type { CSSProperties } from "react";
import type { BackgroundLayer, MascaraKind, Transform } from "@/lib/appearance/background-layers";
import { estiloDifusion } from "@/lib/appearance/difusion";

const TRANSFORM_POR_DEFECTO: Transform = { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 };

const MASCARAS: Record<Exclude<MascaraKind, "ninguna">, string> = {
  radial: "radial-gradient(circle at 50% 50%, #000 0%, #000 42%, transparent 72%)",
  lineal: "linear-gradient(to bottom, #000 0%, transparent 100%)",
};

export interface CapaDifusionProps {
  capa: BackgroundLayer;
  className?: string;
}

export function CapaDifusion({ capa, className }: CapaDifusionProps) {
  if (!capa.visible) return null;
  const t = capa.transform ?? TRANSFORM_POR_DEFECTO;
  const mascara = capa.mascara && capa.mascara !== "ninguna" ? MASCARAS[capa.mascara] : undefined;
  const estilo: CSSProperties = {
    ...estiloDifusion(capa.difusion),
    position: "absolute",
    left: `${t.x * 100}%`,
    top: `${t.y * 100}%`,
    width: `${t.ancho * 100}%`,
    height: `${t.alto * 100}%`,
    transform: `scale(${t.escala}) rotate(${t.rotacion}deg)`,
    transformOrigin: "center",
    opacity: capa.opacity,
    mixBlendMode: capa.blend,
    ...(mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : {}),
  };
  return <div aria-hidden className={`pointer-events-none ${className ?? ""}`} style={estilo} />;
}

export default CapaDifusion;
