'use client';

/**
 * CapaDifusion — pinta UNA capa `difusion` de la pila de fondos (Ola 1018F · FSH1018F ·
 * architecture/fondos-shaders.md §2). El estilo del difuminado (tono, desenfoque y textura)
 * lo decide `estiloDifusion`, que es puro; aquí solo se añaden la posición, la escala, la
 * rotación, la máscara y la opacidad que pone la pila. No hay red, ni GPU, ni permisos.
 */
import type { CSSProperties } from "react";
import type { BackgroundLayer, MascaraKind, Transform } from "@/lib/appearance/background-layers";
import { estiloDifusion } from "@/lib/appearance/difusion";

const TRANSFORM_BASE: Transform = { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 };

const MASCARA: Record<Exclude<MascaraKind, "ninguna">, string> = {
  radial: "radial-gradient(circle at 50% 50%, #000 55%, transparent 100%)",
  lineal: "linear-gradient(to bottom, #000 0%, transparent 100%)",
};

function numero(valor: number | undefined, porDefecto: number): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : porDefecto;
}

function geometria(capa: BackgroundLayer): CSSProperties {
  const t = capa.transform ?? TRANSFORM_BASE;
  return {
    position: "absolute",
    left: `${numero(t.x, 0) * 100}%`,
    top: `${numero(t.y, 0) * 100}%`,
    width: `${numero(t.ancho, 1) * 100}%`,
    height: `${numero(t.alto, 1) * 100}%`,
    transform: `scale(${numero(t.escala, 1)}) rotate(${numero(t.rotacion, 0)}deg)`,
    transformOrigin: "50% 50%",
  };
}

function mascaraDe(capa: BackgroundLayer): CSSProperties {
  const tipo = capa.mascara;
  if (!tipo || tipo === "ninguna") return {};
  const mascara = MASCARA[tipo];
  return { maskImage: mascara, WebkitMaskImage: mascara };
}

export interface CapaDifusionProps {
  capa: BackgroundLayer;
  className?: string;
}

export function CapaDifusion({ capa, className }: CapaDifusionProps) {
  if (!capa.visible) return null;
  const estilo: CSSProperties = {
    ...estiloDifusion(capa.difusion),
    ...geometria(capa),
    ...mascaraDe(capa),
    opacity: typeof capa.opacity === "number" && Number.isFinite(capa.opacity) ? capa.opacity : 1,
    mixBlendMode: capa.blend,
  };
  return <div aria-hidden className={`pointer-events-none ${className ?? ""}`.trim()} style={estilo} />;
}

export default CapaDifusion;
