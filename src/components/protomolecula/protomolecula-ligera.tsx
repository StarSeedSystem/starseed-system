"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formaDeEstado,
  paletaDeEstado,
  ritmoDeEstado,
  type EstadoAsistente,
} from "@/lib/widgets/astraura/estado-forma";
import { proyectarForma, type IdForma } from "@/lib/protomolecula/orbe4d/proyeccion-ligera";
import { useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

const PHI = (1 + Math.sqrt(5)) / 2;

const KEYFRAMES_CSS = `
@keyframes giro {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes respira {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.85; }
}
`;

function GlobalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: KEYFRAMES_CSS }} />;
}

interface Props {
  estado: EstadoAsistente;
  tam: number;
  animada?: boolean;
  etiqueta?: string;
  className?: string;
}

function radGradId(id: string, estado: EstadoAsistente) {
  return `halo-${id}-${estado}`;
}

function Halo({ id, estado, radio }: { id: string; estado: EstadoAsistente; radio: number }) {
  const registro = paletaDeEstado(estado);
  const haloColor = PALETAS[registro].halo;
  const gradId = radGradId(id, estado);
  return (
    <defs>
      <radialGradient id={gradId}>
        <stop offset="0%" stopColor={haloColor} stopOpacity={0.55} />
        <stop offset="60%" stopColor={haloColor} stopOpacity={0.12} />
        <stop offset="100%" stopColor={haloColor} stopOpacity={0} />
      </radialGradient>
    </defs>
  );
}

function FormaSVG({
  forma,
  paleta,
  brillo,
  viva,
  giroPeriodo,
  respiraPeriodo,
}: {
  forma: { lineas: [number, number, number, number][]; puntos: [number, number][] };
  paleta: string[];
  brillo: string;
  viva: boolean;
  giroPeriodo: number;
  respiraPeriodo: number;
}) {
  const lineStyle = viva
    ? { animation: `giro ${giroPeriodo}s linear infinite`, transformOrigin: "center", transformBox: "fill-box" as const }
    : { transformOrigin: "center", transformBox: "fill-box" as const };
  const respiraStyle = viva
    ? { animation: `respira ${respiraPeriodo}s ease-in-out infinite`, transformOrigin: "center", transformBox: "fill-box" as const }
    : undefined;

  return (
    <g style={lineStyle}>
      {forma.lineas.map(([x1, y1, x2, y2], i) => (
        <line
          key={i}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={paleta[i % paleta.length]}
          strokeWidth={0.8}
          strokeOpacity={0.6}
        />
      ))}
      {forma.puntos.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={1.2}
          fill={brillo}
          style={respiraStyle}
        />
      ))}
    </g>
  );
}

export function ProtomoleculaLigera({ estado, tam, animada = true, etiqueta, className }: Props) {
  const id = useId().replace(/:/g, "");
  const nivel = useNivelRender();
  const [viva, setViva] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [estadoAnterior, setEstadoAnterior] = useState<EstadoAsistente | null>(null);
  const [cruzando, setCruzando] = useState(false);

  const formaId = formaDeEstado(estado);
  const registro = paletaDeEstado(estado);
  const { giroS, respiraS } = ritmoDeEstado(estado);
  const paleta = PALETAS[registro].colores;
  const brillo = PALETAS[registro].brillo;
  const radioHalo = 50 * PHI;

  const forma = useMemo(() => proyectarForma(formaId, 0, 100), [formaId]);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const debeAnimar = animada !== false && nivel !== "ligero" && !reducedMotion;
    setViva(debeAnimar);
  }, [animada, nivel, reducedMotion]);

  useEffect(() => {
    if (estadoAnterior !== null && estadoAnterior !== estado && viva) {
      setCruzando(true);
      const timer = setTimeout(() => setCruzando(false), 600);
      return () => clearTimeout(timer);
    }
    setEstadoAnterior(estado);
  }, [estado, viva, estadoAnterior]);

  return (
    <>
      <GlobalStyles />
      <svg
        data-testid="protomolecula-ligera"
        viewBox="-50 -50 100 100"
        aria-hidden="true"
        focusable="false"
        data-estado={estado}
        data-forma={estado}
        data-viva={viva ? "true" : "false"}
        className={cn(
          "transition-opacity duration-600 motion-reduce:transition-none",
          cruzando && viva && "opacity-50",
          className
        )}
        style={{ width: tam, height: tam }}
      >
        {etiqueta && <title>{etiqueta}</title>}
        <Halo id={id} estado={estado} radio={radioHalo} />
        <circle r={radioHalo} fill={`url(#${radGradId(id, estado)})`} opacity={0.35} />
        <FormaSVG
          forma={forma}
          paleta={paleta}
          brillo={brillo}
          viva={viva}
          giroPeriodo={giroS}
          respiraPeriodo={respiraS}
        />
        <circle r={3} fill={brillo} opacity={viva ? 1 : 0.6} />
      </svg>
    </>
  );
}