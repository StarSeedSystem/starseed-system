/**
 * CapaDifusion — pinta UNA capa `difusion` de la pila de fondos (Ola 1018F · FSH1018F).
 * Es un velo CSS puro (sin hooks ni GPU): el desenfoque, el tono y la textura los calcula
 * el módulo puro `estiloDifusion`, y aquí se aplica además la transformación (posición,
 * tamaño, escala y rotación) y la máscara de la capa, como en `atomo-fondo-shader.tsx`.
 * La opacidad y el modo de mezcla son los de siempre de `BackgroundLayer`.
 */
import type { CSSProperties } from "react";
import type { BackgroundLayer } from "@/lib/appearance/background-layers";
import { estiloDifusion, estiloTransformDifusion, mascaraDifusion } from "@/lib/appearance/difusion";

export interface CapaDifusionProps {
  capa: BackgroundLayer;
  className?: string;
}

export function CapaDifusion({ capa, className }: CapaDifusionProps) {
  // Sin configuración (capa vieja sin migrar) no se pinta nada: silencio seguro.
  if (!capa.visible || !capa.difusion) return null;
  const mascara = mascaraDifusion(capa.mascara ?? "ninguna");
  const estilo: CSSProperties = {
    position: "absolute",
    ...estiloTransformDifusion(capa.transform ?? { x: 0, y: 0, escala: 1, rotacion: 0, ancho: 1, alto: 1 }),
    opacity: capa.opacity,
    mixBlendMode: capa.blend,
    ...mascara,
  };
  return (
    <div aria-hidden className={`pointer-events-none overflow-hidden ${className ?? ""}`} style={estilo}>
      <div className="h-full w-full" style={estiloDifusion(capa.difusion)} />
    </div>
  );
}

export default CapaDifusion;
