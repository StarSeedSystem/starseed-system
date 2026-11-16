"use client";
/**
 * Protomolécula Ligera en SVG (ASW03 / ASW1116A).
 * Cambia de forma con el estado, respeta movimiento reducido y dispositivos modestos.
 * Módulo puro visual y de renderizado SVG.
 */
import React, { useId } from "react";
import { cn } from "@/lib/utils";
import { PALETAS, type IdForma } from "@/lib/protomolecula/orbe4d/coreografia";
import { proyectarForma } from "@/lib/protomolecula/orbe4d/proyeccion-ligera";
import { formaDeEstado, paletaDeEstado, ritmoDeEstado, type EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";

export interface ProtomoleculaLigeraProps {
  estado: EstadoAsistente;
  tam: number;
  animada?: boolean;
  etiqueta?: string;
  className?: string;
  formaForzada?: IdForma;
}

export function ProtomoleculaLigera({
  estado,
  tam,
  animada = true,
  etiqueta,
  className,
  formaForzada,
}: ProtomoleculaLigeraProps) {
  const id = useId().replace(/:/g, "");
  const nivel = useNivelRender();
  const forma = formaForzada ?? formaDeEstado(estado);
  const clavePaleta = paletaDeEstado(estado);
  const paleta = PALETAS[clavePaleta] ?? PALETAS.astraura;
  const ritmo = ritmoDeEstado(estado);

  const [prefersReduced, setPrefersReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const viva = animada && nivel !== "ligero" && !prefersReduced && ritmo.giroS > 0;
  const { lineas, puntos } = proyectarForma(forma, 0, 50);

  const [colorVerde, colorVioleta, colorCian] = paleta.colores;
  const colorBrillo = paleta.brillo;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center select-none", className)}
      style={{ width: tam, height: tam }}
      title={etiqueta}
    >
      <svg
        viewBox="-50 -50 100 100"
        aria-hidden="true"
        focusable="false"
        data-testid="protomolecula-svg"
        data-estado={estado}
        data-forma={forma}
        data-viva={viva ? "true" : "false"}
        className="h-full w-full overflow-visible transition-[opacity] duration-600"
      >
        <defs>
          <radialGradient id={`halo-ligera-${id}`}>
            <stop offset="0%" stopColor={colorVerde} stopOpacity={0.55} />
            <stop offset="60%" stopColor={colorVerde} stopOpacity={0.12} />
            <stop offset="100%" stopColor={colorVerde} stopOpacity={0} />
          </radialGradient>
        </defs>

        <circle
          r={48}
          fill={`url(#halo-ligera-${id})`}
          opacity={0.4}
          className={cn(viva && "motion-safe:animate-pulse")}
          style={viva ? { animationDuration: `${ritmo.respiraS}s` } : undefined}
        />

        <circle
          r={40}
          fill="none"
          stroke={colorCian || colorVerde}
          strokeOpacity={0.3}
          strokeWidth={0.8}
        />

        <g
          className={cn(
            "origin-center [transform-box:fill-box]",
            viva && "motion-safe:animate-spin"
          )}
          style={viva ? { animationDuration: `${ritmo.giroS}s` } : undefined}
        >
          {lineas.map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={colorVioleta || colorVerde}
              strokeOpacity={0.65}
              strokeWidth={1.1}
              strokeLinecap="round"
            />
          ))}

          {puntos.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={1.8}
              fill={colorBrillo}
              fillOpacity={0.9}
            />
          ))}
        </g>

        <circle r={2.5} fill={colorBrillo} />
      </svg>
    </div>
  );
}

export default ProtomoleculaLigera;
