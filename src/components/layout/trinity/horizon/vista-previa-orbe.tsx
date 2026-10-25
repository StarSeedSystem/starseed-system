"use client";

/**
 * Vista previa ligera de la orbe: SVG con la geometría de cada estilo (flor de la vida, merkaba, halo), sin
 * three.js ni cargar nada. Gira con los MISMOS periodos que el motor de la orbe (`34 / velocidad` s el giro
 * global, `13 / velocidad` s la merkaba) y solo anima `transform` y `opacity`; con movimiento reducido o en
 * modo eco se queda quieta (`motion-safe`). Apagada se atenúa y se detiene.
 */
import { useId } from "react";
import { cn } from "@/lib/utils";
import { ESTILOS, PALETAS, type Estilo } from "@/lib/protomolecula/orbe4d/coreografia";
import { centrosFlorDeLaVida } from "./flor-de-la-vida";

interface Props {
  estilo: Estilo;
  activa: boolean;
  /** Muestras fijas (las tres del selector de estilo) no giran. */
  animada?: boolean;
  className?: string;
}

/** Triángulo inscrito de radio `r`; `giro` en grados (0 = punta arriba). */
function triangulo(r: number, giro: number): string {
  return [0, 120, 240]
    .map((a) => {
      const rad = ((a + giro - 90) * Math.PI) / 180;
      return `${(r * Math.cos(rad)).toFixed(2)},${(r * Math.sin(rad)).toFixed(2)}`;
    })
    .join(" ");
}

export function VistaPreviaOrbe({ estilo, activa, animada = true, className }: Props) {
  const id = useId().replace(/:/g, "");
  const params = ESTILOS[estilo];
  const [verde, violeta, cian, oro] = PALETAS.protomolecula.colores;
  const brillo = PALETAS.protomolecula.brillo;
  const gira = animada && activa;
  // Sobria: la semilla de la vida; expresiva: la semilla con halo; experimental: la flor entera con aro de oro.
  const flor = estilo === "experimental" ? centrosFlorDeLaVida() : centrosFlorDeLaVida().slice(0, 7);
  const radioFlor = estilo === "experimental" ? 9 : 13;
  const giroGlobal = `${(34 / params.velocidad).toFixed(1)}s`;
  const giroMerkaba = `${(13 / params.velocidad).toFixed(1)}s`;
  const giro = (inverso = false) =>
    cn(
      "origin-center [transform-box:fill-box]",
      gira && "motion-safe:animate-spin",
      gira && inverso && "[animation-direction:reverse]",
    );

  return (
    <svg
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      focusable="false"
      data-estilo={estilo}
      data-activa={activa ? "si" : "no"}
      className={cn(
        "shrink-0 transition-[opacity,filter] duration-300 motion-reduce:transition-none",
        activa ? "opacity-100" : "opacity-40 grayscale",
        className,
      )}
    >
      <defs>
        <radialGradient id={`halo-${id}`}>
          <stop offset="0%" stopColor={verde} stopOpacity={0.55} />
          <stop offset="60%" stopColor={verde} stopOpacity={0.12} />
          <stop offset="100%" stopColor={verde} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle r={48} fill={`url(#halo-${id})`} opacity={0.35 + params.opacidadHalo} />
      {estilo !== "sobria" && <circle r={40} fill="none" stroke={verde} strokeOpacity={0.35} strokeWidth={0.8} />}
      {estilo === "experimental" && (
        <circle
          r={44}
          fill="none"
          stroke={oro}
          strokeOpacity={0.7}
          strokeWidth={1}
          strokeDasharray="3 4"
          className={giro(true)}
          style={gira ? { animationDuration: `${(21 / params.velocidad).toFixed(1)}s` } : undefined}
        />
      )}
      <g className={giro()} style={gira ? { animationDuration: giroGlobal } : undefined}>
        {flor.map(([x, y], i) => (
          <circle
            key={i}
            cx={x * radioFlor}
            cy={y * radioFlor}
            r={radioFlor}
            fill="none"
            stroke={verde}
            strokeOpacity={0.55}
            strokeWidth={0.9}
          />
        ))}
      </g>
      <g className={giro(true)} style={gira ? { animationDuration: giroMerkaba } : undefined}>
        <polygon points={triangulo(24, 0)} fill={cian} fillOpacity={params.opacidadCaras * 0.6} stroke={cian} strokeOpacity={0.85} strokeWidth={1.1} />
        <polygon points={triangulo(24, 180)} fill={violeta} fillOpacity={params.opacidadCaras * 0.6} stroke={violeta} strokeOpacity={0.85} strokeWidth={1.1} />
      </g>
      <circle r={3.2} fill={brillo} className={cn(gira && estilo !== "sobria" && "motion-safe:animate-pulse")} />
    </svg>
  );
}
