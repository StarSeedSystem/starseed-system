"use client";

import { type ReactNode } from "react";

export function OracleGastoDias({ dias, moneda }: { dias: { dia: string; coste: number }[]; moneda: string }) {
  if (dias.length === 0) return null;

  const medidos = dias.filter((d) => d.coste !== null) as { dia: string; coste: number }[];
  const max = Math.max(1, ...medidos.map((d) => d.coste));
  const ancho = 14;
  const altoSvg = 34;
  const hoy = dias[dias.length - 1];
  const pico = medidos.reduce<{ dia: string; coste: number } | null>((a, d) => (!a || d.coste > a.coste ? d : a), null);

  const resumen = medidos.length
    ? `Gasto de Oracle por día: máximo ${pico?.coste.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}; hoy ${hoy?.coste === null || !hoy ? "sin medir" : hoy.coste.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`
    : `Sin mediciones en los últimos ${dias.length} días.`;

  return (
    <figure className="m-0">
      <svg
        role="img"
        aria-label={resumen}
        viewBox={`0 0 ${dias.length * ancho} ${altoSvg}`}
        preserveAspectRatio="none"
        className="block h-9 w-full"
      >
        {dias.map((d, i) => {
          if (d.coste === null) {
            return (
              <line
                key={d.dia}
                x1={i * ancho + 3}
                x2={i * ancho + ancho - 3}
                y1={altoSvg - 1}
                y2={altoSvg - 1}
                stroke="rgba(255,255,255,.25)"
                strokeDasharray="2 2"
              />
            );
          }
          const barWidth = ancho - 4;
          const x = i * ancho + 2;
          if (d.coste === 0) {
            return (
              <line
                key={d.dia}
                x1={x}
                x2={x + barWidth}
                y1={altoSvg - 1}
                y2={altoSvg - 1}
                stroke="rgba(34,211,238,.4)"
                strokeWidth={1}
              >
                <title>{`${d.dia}: 0 ${moneda}`}</title>
              </line>
            );
          }
          const height = Math.max(1.5, (d.coste / max) * (altoSvg - 3));
          const esHoy = i === dias.length - 1;
          return (
            <rect
              key={d.dia}
              x={x}
              y={altoSvg - height}
              width={barWidth}
              height={height}
              rx={2}
              fill={esHoy ? "rgba(34,211,238,.85)" : "rgba(34,211,238,.4)"}
            >
              <title>{`${d.dia}: ${d.coste.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-[10px] text-white/40">
        <span>{dias[0]?.dia ?? ""}</span>
        <span>gasto por día ({moneda})</span>
        <span>{hoy?.dia ?? ""}</span>
      </figcaption>
    </figure>
  );
}