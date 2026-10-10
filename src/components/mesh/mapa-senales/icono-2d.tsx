"use client";

/**
 * Glifo 2D de cada TIPO de señal (el mismo que el icono 3D de `icono-3d.tsx`). Una sola definición en
 * una rejilla de 12×12 sirve a la lista, la leyenda, los filtros y, escalada, a las marcas del plano.
 */

import type { ReactElement } from "react";
import type { IconoId } from "@/lib/senales/iconos";

/** Los trazos de un icono en la rejilla 12×12. Relleno y borde llegan de quien lo dibuja. */
export function TrazosIcono({ id, relleno, borde, grosor = 0.9 }: { id: IconoId; relleno: string; borde: string; grosor?: number }): ReactElement {
  const f = { fill: relleno, stroke: borde, strokeWidth: grosor, strokeLinejoin: "round" } as const;
  const l = { fill: "none", stroke: borde, strokeWidth: grosor * 1.4, strokeLinecap: "round" } as const;
  switch (id) {
    case "nodo-lora":
      return <g><circle cx="6" cy="8.7" r="2.7" {...f} /><line x1="6" y1="8.7" x2="6" y2="2.4" {...l} /><circle cx="6" cy="1.9" r="1.2" {...f} /></g>;
    case "rele":
      return <g><polygon points="6,0.9 11.1,6 6,11.1 0.9,6" {...f} /><ellipse cx="6" cy="6" rx="5.6" ry="1.9" fill="none" stroke={borde} strokeWidth={grosor * 0.8} /></g>;
    case "movil":
      return <rect x="3.3" y="0.8" width="5.4" height="10.4" rx="1.3" {...f} />;
    case "tablet":
      return <rect x="0.9" y="2.2" width="10.2" height="7.6" rx="1.3" {...f} />;
    case "portatil":
      return <g><rect x="2" y="1.8" width="8" height="5.6" rx="0.7" {...f} /><polygon points="0.6,8.2 11.4,8.2 10.3,10 1.7,10" {...f} /></g>;
    case "escritorio":
      return <g><rect x="0.8" y="1.2" width="10.4" height="6.6" rx="0.8" {...f} /><rect x="5.1" y="7.8" width="1.8" height="1.9" {...f} /><rect x="3" y="9.6" width="6" height="1.3" rx="0.6" {...f} /></g>;
    case "servidor":
      return <g><rect x="1.6" y="1" width="8.8" height="2.9" rx="0.7" {...f} /><rect x="1.6" y="4.55" width="8.8" height="2.9" rx="0.7" {...f} /><rect x="1.6" y="8.1" width="8.8" height="2.9" rx="0.7" {...f} /></g>;
    case "enlace-directo":
      return <g><circle cx="4.4" cy="6" r="3.3" {...l} /><circle cx="7.6" cy="6" r="3.3" {...l} /></g>;
    case "red-ip":
      return <g><ellipse cx="6" cy="9" rx="5.2" ry="2.2" {...f} /><circle cx="6" cy="4.6" r="3.2" {...f} /></g>;
    case "bluetooth":
      return <g><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="0.8" {...f} /><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="0.8" fill="none" stroke={borde} strokeWidth={grosor * 0.8} transform="rotate(45 6 6)" /></g>;
    case "usb":
      return <g><polygon points="6,0.8 10.6,9 1.4,9" {...f} /><rect x="4.4" y="9" width="3.2" height="2.2" rx="0.4" {...f} /></g>;
    default:
      return <polygon points="6,0.7 10.6,3.35 10.6,8.65 6,11.3 1.4,8.65 1.4,3.35" {...f} />;
  }
}

/** Glifo suelto (lista, leyenda, filtros). */
export function GlifoIcono({ id, color, size = 13, className }: { id: IconoId; color: string; size?: number; className?: string }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden className={className} focusable={false}>
      <TrazosIcono id={id} relleno={color} borde={color} grosor={0.5} />
    </svg>
  );
}

export default GlifoIcono;
