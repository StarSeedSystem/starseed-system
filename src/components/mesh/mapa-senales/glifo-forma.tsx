"use client";

/**
 * Glifo 2D de la forma que lleva cada familia de antena en el mapa 3D. Sirve a
 * las chips de filtro, la lista y la leyenda para que la forma —no solo el color—
 * identifique la antena (también para quien no distingue bien los colores).
 */

import type { FormaMarcador } from "@/lib/senales/mapa-3d";

export function GlifoForma({ forma, color, size = 12, className }: {
  forma: FormaMarcador;
  color: string;
  size?: number;
  className?: string;
}) {
  const relleno = { fill: color, fillOpacity: 0.9, stroke: color, strokeWidth: 1 } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className={className} focusable={false}>
      {forma === "esfera" && <circle cx="6" cy="6" r="4.6" {...relleno} />}
      {forma === "octaedro" && <polygon points="6,0.8 11.2,6 6,11.2 0.8,6" {...relleno} />}
      {forma === "icosaedro" && <polygon points="6,0.7 10.6,3.35 10.6,8.65 6,11.3 1.4,8.65 1.4,3.35" {...relleno} />}
      {forma === "cilindro" && <ellipse cx="6" cy="6" rx="5.2" ry="3.2" {...relleno} />}
      {forma === "caja" && <rect x="1.6" y="1.6" width="8.8" height="8.8" rx="1" {...relleno} />}
      {forma === "cono" && <polygon points="6,0.8 11,11 1,11" {...relleno} />}
    </svg>
  );
}

export default GlifoForma;
