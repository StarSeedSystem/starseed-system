/**
 * CapaDifusion — pinta UNA capa `difusion` de la pila de fondos (Ola 1018F · FSH1018F ·
 * architecture/fondos-shaders.md §2). Es decorativa: no roba clics, no tapa contenido y no
 * necesita GPU. El estilo sale de `estiloDifusion` (puro); aquí solo se envuelve con la
 * opacidad, la mezcla, la transformación y la máscara de la capa. El motor base (Spline por
 * defecto) sigue debajo como opción principal.
 */
import type { CSSProperties } from "react";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import { estiloCapa, estiloDifusion } from "@/lib/appearance/difusion";

export interface CapaDifusionProps {
  capa: BackgroundLayer;
  className?: string;
}

export function CapaDifusion({ capa, className }: CapaDifusionProps) {
  if (!capa.visible || capa.kind !== "difusion" || !capa.difusion) return null;
  const difusion = estiloDifusion(capa.difusion);
  // La opacidad propia de la capa multiplica a la de la difusión: un solo número visible.
  const estilo: CSSProperties = {
    ...difusion,
    ...estiloCapa(capa.transform, capa.mascara),
    opacity: (difusion.opacity ?? 1) * capa.opacity,
    mixBlendMode: capa.blend,
  };
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}>
      <div className="absolute" style={estilo} />
    </div>
  );
}

export default CapaDifusion;
