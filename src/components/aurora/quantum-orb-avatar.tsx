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
 * PUBLICA su vector visual (turbulence, spikiness, symmetry, hueShift, breath)
 * en el canal `params` del bus de la orbe (onda 1.58b) para que otras
 * instancias o el backend 1.58b puedan reaccionar/sincronizarse.
 */

import { useEffect, useRef, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  resolveQuantumOrbTheme,
  mergeQuantumOrbParams,
  DEFAULT_QUANTUM_ORB_PARAMS,
  type QuantumOrbParams,
} from "@/lib/aurora/quantum-orb-theme";
import { getPersonaParams } from "@/lib/aurora/persona-params";
import {
  createQuantumOrbRenderer,
  prefersReducedMotion,
  type QuantumOrbRenderer,
  type QuantumOrbState,
} from "./quantum-orb";
import { emitQuantumOrbParams, onQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";

export interface QuantumOrbAvatarProps {
  personaId?: string;
  /** Tamaños estándar de avatar de lista (px). */
  size?: 28 | 36 | 48;
  state?: QuantumOrbState;
  /** Vector expresivo (turbulence, spikiness, symmetry, hueShift, breath) — se publica en el bus `params`. */
  params?: Partial<QuantumOrbParams>;
  className?: string;
}

/** Menos partículas que `<QuantumOrb>` (28) — "ligera", pensada para listas. */
const AVATAR_PARTICLE_COUNT = 8;

/** Ajustes por estado (modulan el vector base). */
const STATE_PARAM_ADJUSTMENTS: Record<QuantumOrbState, Partial<QuantumOrbParams>> = {
  idle: { turbulence: 0.0, spikiness: 0.0, symmetry: 0.0, hueShift: 0.0, breath: 0.0 },
  listening: { turbulence: 0.1, spikiness: -0.1, symmetry: 0.05, hueShift: 0.0, breath: 0.15 },
  user_speaking: { turbulence: 0.2, spikiness: 0.1, symmetry: -0.05, hueShift: 0.05, breath: 0.2 },
  thinking: { turbulence: 0.25, spikiness: 0.15, symmetry: -0.1, hueShift: 0.1, breath: 0.1 },
  speaking: { turbulence: 0.15, spikiness: 0.05, symmetry: 0.1, hueShift: -0.05, breath: 0.3 },
  error: { turbulence: 0.5, spikiness: 0.4, symmetry: -0.3, hueShift: 0.2, breath: -0.1 },
};

function clampUnit(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Calcula el vector de params efectivo combinando: defaults + persona + state + props. */
function computeEffectiveParams(
  personaId: string,
  state: QuantumOrbState,
  propsParams?: Partial<QuantumOrbParams>
): QuantumOrbParams {
  const base = { ...DEFAULT_QUANTUM_ORB_PARAMS };
  const personaAdj = getPersonaParams(personaId);
  const stateAdj = STATE_PARAM_ADJUSTMENTS[state] ?? STATE_PARAM_ADJUSTMENTS.idle;

  // Aplicar ajustes de personalidad
  (Object.keys(personaAdj) as Array<keyof QuantumOrbParams>).forEach((k) => {
    const val = personaAdj[k];
    if (val !== undefined) base[k] = clampUnit(base[k] + val);
  });

  // Aplicar ajustes de estado
  (Object.keys(stateAdj) as Array<keyof QuantumOrbParams>).forEach((k) => {
    const val = stateAdj[k];
    if (val !== undefined) base[k] = clampUnit(base[k] + val);
  });

  // Merge con props (props gana)
  if (propsParams) {
    (Object.keys(propsParams) as Array<keyof QuantumOrbParams>).forEach((k) => {
      const val = propsParams[k];
      if (val !== undefined) base[k] = clampUnit(val);
    });
  }

  return base;
}

export function QuantumOrbAvatar({
  personaId = "aurora",
  size = 36,
  state = "idle",
  params,
  className,
}: QuantumOrbAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<QuantumOrbRenderer | null>(null);
  if (!rendererRef.current) rendererRef.current = createQuantumOrbRenderer(AVATAR_PARTICLE_COUNT);

  // Vector efectivo calculado (memoizado para no recalcular en cada render).
  const effectiveParams = useMemo(
    () => computeEffectiveParams(personaId, state, params),
    [personaId, state, params]
  );

  // Rastrea el último vector emitido para evitar re-emisiones idénticas (previene bucles).
  const lastEmittedRef = useRef<QuantumOrbParams | null>(null);
  // Bandera para saber si el último cambio vino del bus (evita re-emitir params del bus).
  const busOriginRef = useRef(false);
  // Guardia de montaje: no emitir en el primer render para evitar race condition con params del bus.
  const mountedRef = useRef(false);

  // Comparación profunda de params (solo claves relevantes).
  function paramsEqual(a: QuantumOrbParams, b: QuantumOrbParams): boolean {
    return (
      a.turbulence === b.turbulence &&
      a.spikiness === b.spikiness &&
      a.symmetry === b.symmetry &&
      a.hueShift === b.hueShift &&
      a.breath === b.breath
    );
  }

  // Merge: params del bus (prioridad visual) + params locales (para emitir).
  const [busParams, setBusParams] = useState<Partial<QuantumOrbParams>>({});
  const mergedParams = useMemo(() => ({
    turbulence: busParams.turbulence ?? effectiveParams.turbulence,
    spikiness: busParams.spikiness ?? effectiveParams.spikiness,
    symmetry: busParams.symmetry ?? effectiveParams.symmetry,
    hueShift: busParams.hueShift ?? effectiveParams.hueShift,
    breath: busParams.breath ?? effectiveParams.breath,
  }), [effectiveParams, busParams]);

  // Estado vivo leído dentro del rAF (no recrea el bucle en cada re-render).
  const liveRef = useRef({ personaId, state, params: mergedParams });
  liveRef.current = { personaId, state, params: mergedParams };

  // Suscripción al bus `params`: actualiza estado visual y marca origen-bus para no re-emitir.
  useEffect(() => {
    const unsub = onQuantumOrbParams((p) => {
      busOriginRef.current = true; // Marcar que el siguiente cambio viene del bus.
      setBusParams(p);
    });
    return unsub;
  }, []);

  // Emisión inicial en montaje (tras tener listo el listener del bus).
  useEffect(() => {
    lastEmittedRef.current = effectiveParams;
    emitQuantumOrbParams(effectiveParams);
  }, []);

  // Publica los parámetros en el bus `params` solo si cambiaron localmente (onda 1.58b).
  useEffect(() => {
    // Si el cambio vino del bus, no re-emitir: cortar posible bucle.
    if (busOriginRef.current) {
      busOriginRef.current = false;
      return;
    }
    // Evitar emitir el mismo vector dos veces seguidas.
    if (lastEmittedRef.current && paramsEqual(lastEmittedRef.current, effectiveParams)) {
      return;
    }
    lastEmittedRef.current = effectiveParams;
    emitQuantumOrbParams(effectiveParams);
  }, [effectiveParams]);

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
        renderer.frame(ctx, {
          nowMs: t,
          dtSeconds: dt,
          personaId: live.personaId,
          state: live.state ?? "idle",
          level: 0,
          frequencies: null,
          params: live.params,
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
