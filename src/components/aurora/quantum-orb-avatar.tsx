"use client";

/**
 * StarSeed OS — Avatar Vivo de la Orbe Cuántica (QuantumOrbAvatar)
 * ----------------------------------------------------------------------------
 * Versión MINIATURA de `<QuantumOrb>` (`quantum-orb.tsx`), pensada para listas
 * — el catálogo de personalidades, un panel de agentes, la cola de procesos
 * imaginativos (`imagine-panel.tsx`), etc. — donde cada fila necesita su
 * propia identidad visual VIVA (no un icono estático) sin el coste de una
 * orbe grande por fila.
 *
 * NO reimplementa el pipeline de dibujo: reutiliza el MISMO motor exportado
 * por `quantum-orb.tsx` (`createQuantumOrbRenderer`), con menos partículas
 * (8 en vez de 28) y SIN estela líquida (`trail: false` — un `clearRect` es
 * más barato para un canvas pequeño repetido muchas veces en una lista y
 * evita que el "rastro" oscuro se note como una mota sucia a tamaño mini).
 * Corresponde a la nota "avatar vivo de procesos imaginativos, agentes y
 * personalidades" del encargo — de ahí que solo reciba `personaId`/`state`
 * (sin audio real: una fila de lista no tiene micrófono propio) y por defecto
 * respire en reposo, encendiéndose solo cuando quien la monta le pasa un
 * `state` distinto de "idle" (p. ej. "thinking" mientras ese agente procesa).
 *
 * Además ESCUCHA el canal `params` del bus de la orbe (onda 1.58b): el vector
 * expresivo que el puente publica (`emitQuantumOrbParams`, todos 0..1) llega
 * también a las filas de lista, igual que ya lo pintaba la orbe grande. Es la
 * «diferencia UX inmediata» del encargo, sin coste por frame: un `ref` que el
 * emisor (≤4 emisiones/s) rellena y que el rAF lee como el resto del estado.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveQuantumOrbTheme, type QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";
import { onQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import {
  createQuantumOrbRenderer,
  prefersReducedMotion,
  type QuantumOrbRenderer,
  type QuantumOrbState,
} from "./quantum-orb";

export interface QuantumOrbAvatarProps {
  personaId?: string;
  /** Tamaños estándar de avatar de lista (px). */
  size?: 28 | 36 | 48;
  state?: QuantumOrbState;
  className?: string;
}

/** Menos partículas que `<QuantumOrb>` (28) — "ligera", pensada para listas. */
const AVATAR_PARTICLE_COUNT = 8;

/**
 * Último vector expresivo publicado en el canal `params` del bus de la orbe
 * (o `undefined` mientras nadie haya publicado). Costura pública de esta tarea:
 * la orbe grande ya consumía el canal; aquí lo aterrizamos para las listas.
 */
export function useParamsOrbeDelBus(): Partial<QuantumOrbParams> | undefined {
  const [params, setParams] = useState<Partial<QuantumOrbParams> | undefined>(undefined);
  useEffect(() => onQuantumOrbParams(setParams), []);
  return params;
}

export function QuantumOrbAvatar({
  personaId = "aurora",
  size = 36,
  state = "idle",
  className,
}: QuantumOrbAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<QuantumOrbRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = createQuantumOrbRenderer(AVATAR_PARTICLE_COUNT);

  // Estado vivo leído dentro del rAF (no recrea el bucle en cada re-render).
  const vectorBus = useParamsOrbeDelBus();
  const liveRef = useRef({ personaId, state });
  liveRef.current = { personaId, state };
  const paramsRef = useRef<Partial<QuantumOrbParams> | undefined>(vectorBus);
  paramsRef.current = vectorBus;

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = renderer.resize(canvas, size);
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let docVisible = typeof document === "undefined" ? true : !document.hidden;
    const onVisibility = () => {
      docVisible = typeof document === "undefined" ? true : !document.hidden;
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    let raf = 0;
    let running = true;
    let last = typeof performance !== "undefined" ? performance.now() : Date.now();

    const tick = (t: number) => {
      if (!running) return;
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
      last = t;
      if (docVisible) {
        const live = liveRef.current;
        // Sin audio real: una fila de lista no tiene micrófono propio. El
        // "aliento" vivo viene del ruido interno del motor + el `state`
        // (p. ej. "thinking" mientras ESE agente concreto procesa).
        renderer.frame(ctx, {
          nowMs: t,
          dtSeconds: dt,
          personaId: live.personaId,
          state: live.state ?? "idle",
          level: 0,
          frequencies: null,
          params: paramsRef.current,
          trail: false,
          reduced,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [size]);

  const theme = resolveQuantumOrbTheme(personaId);

  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-full", className)}
      style={{ width: size, height: size }}
      aria-hidden
      title={theme.shortName}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

export default QuantumOrbAvatar;
