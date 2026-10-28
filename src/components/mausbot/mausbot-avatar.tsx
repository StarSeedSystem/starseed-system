/**
 * MausbotAvatar: SVG ligero del cursor-mascota. Sin animación propia (la mueve el host).
 * Adaptado de OpenMausBot (Copyright 2026 Milind Soni y colaboradores, Apache-2.0):
 * src/components/CursorAvatar.tsx.
 */
"use client";

import { useId, useMemo } from "react";
import { CUERPOS_MAUSBOT, type CuerpoId } from "@/lib/mausbot/cuerpos";
import { disenoPorId, type DisenoMausbot } from "@/lib/mausbot/disenos";
import { BOCAS, EXPRESIONES, expresionDe, marcoBoca, RECORRIDO_MIRADA, type EstadoMausbot } from "@/lib/mausbot/expresiones";

export type { EstadoMausbot };

const VIEW_BOX = "-15 -15 258.541 258.541";
const GAZE_TRAVEL = RECORRIDO_MIRADA;

export interface MausbotAvatarProps {
  diseno: DisenoMausbot | string;
  estado: EstadoMausbot;
  mirada?: { x: number; y: number };
  tamano?: number;
}

function anilloACamino(anillo: [number, number][]): string {
  if (anillo.length === 0) return "";
  let d = `M${anillo[0][0]} ${anillo[0][1]}`;
  for (let i = 1; i < anillo.length; i++) {
    d += ` L${anillo[i][0]} ${anillo[i][1]}`;
  }
  d += " Z";
  return d;
}

function bocaACamino(espec: number[]): string {
  const [ancho, curvatura, caida, _giro] = espec;
  const mitad = ancho / 2;
  const cx = 0;
  const cy = 0;
  const c1x = -mitad * 0.4;
  const c1y = caida * 0.4 + curvatura * 0.6;
  const c2x = mitad * 0.4;
  const c2y = caida * 0.4 + curvatura * 0.6;
  const ex = mitad;
  const ey = caida + curvatura * 0.2;
  return `M${cx - mitad} ${cy} C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey} C${c2x} ${-c2y * 0.4} ${c1x} ${-c1y * 0.4} ${cx - mitad} ${cy} Z`;
}

export function MausbotAvatar({ diseno, estado, mirada = { x: 0, y: 0 }, tamano = 1 }: MausbotAvatarProps) {
  const id = useId();
  const gradienteId = `mausbot-grad-${id.replace(/:/g, "")}`;
  const dis = typeof diseno === "string" ? disenoPorId(diseno) : diseno;

  const [c1, c2, c3] = dis.gradiente;
  const gradiente = `url(#${gradienteId})`;

  const indices = expresionDe(estado);
  const idx = indices[0] ?? 0;
  const anillos = EXPRESIONES[idx] ?? EXPRESIONES[0];
  const boca = BOCAS[idx] ?? BOCAS[0];

  const mx = Math.max(-1, Math.min(1, mirada.x)) * GAZE_TRAVEL.x;
  const my = Math.max(-1, Math.min(1, mirada.y)) * GAZE_TRAVEL.y;

  const cuerpoInfo = dis.cuerpo !== "svg" ? CUERPOS_MAUSBOT[dis.cuerpo as CuerpoId] : null;
  const cuerpoMarkup = dis.cuerpo === "svg" && dis.svgCuerpo ? dis.svgCuerpo : (cuerpoInfo?.body ?? "");

  const body = cuerpoMarkup.replace(/\{\{GRADIENT\}\}/g, gradiente);
  const clip = cuerpoInfo?.clip ?? "";

  const marco = marcoBoca(anillos, boca);

  const tam = tamano * (dis.tamano ?? 1);
  const style = tam === 1 ? undefined : { width: `${tam * 100}%`, height: `${tam * 100}%` };

  return (
    <svg
      viewBox={VIEW_BOX}
      aria-hidden="true"
      focusable="false"
      style={style}
      data-testid="mausbot-avatar"
      data-cuerpo={dis.cuerpo}
      data-estado={estado}
    >
      <defs>
        <linearGradient id={gradienteId} x1="0" y1="0" x2="228.541" y2="228.541" gradientUnits="userSpaceOnUse">
          <stop stopColor={c1} />
          <stop offset="0.5" stopColor={c2} />
          <stop offset="1" stopColor={c3} />
        </linearGradient>
        {clip ? <clipPath id={`mausbot-clip-${gradienteId}`}><g dangerouslySetInnerHTML={{ __html: clip }} /></clipPath> : null}
      </defs>
      {dis.cara.ojos !== false && (
        <g transform={`translate(${mx},${my})`} data-testid="mausbot-ojos">
          {anillos.slice(0, 2).map((anillo, i) => (
            <path key={i} d={anilloACamino(anillo)} fill={gradiente} />
          ))}
        </g>
      )}
      {dis.cara.boca !== false && (
        <g
          transform={`translate(${marco.x + mx * 0.3},${marco.y + my * 0.3}) rotate(${marco.angulo * 180 / Math.PI})`}
          data-testid="mausbot-boca"
        >
          <path d={bocaACamino(boca)} fill={gradiente} />
        </g>
      )}
      {body ? <g dangerouslySetInnerHTML={{ __html: body }} /> : null}
    </svg>
  );
}

export default MausbotAvatar;
