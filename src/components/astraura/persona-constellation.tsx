"use client";

/**
 * CONSTELACIÓN ORBITAL DE LOS 5 SISTEMAS (Adenda 149 · ola 3 · idea 2.1:64+66).
 * ============================================================================
 * Primera vez que los cinco sistemas de UNA personalidad en ESTA neurona se ven
 * JUNTOS: un anillo de 5 nodos —LLM cian · Astraura ámbar · OpenVoice fucsia ·
 * Cerebro violeta · Señales esmeralda— donde
 *
 *   · el TRAZO de cada nodo es el acento de su pestaña,
 *   · el RELLENO es la PROCEDENCIA del valor efectivo (`resolvePersonaSystems`):
 *     hueco/esmeralda = automático · sólido/violeta = ajuste de esta neurona ·
 *     fucsia = lo pide la personalidad · cian = preferencia de la cuenta,
 *   · el ARO EXTERIOR lleva el color primario de la personalidad
 *     (`personaPalette`), y
 *   · ese aro LATE con un periodo derivado de la SALUD REAL de la neurona
 *     (motor de voz efectivo, `navigator.onLine`, antenas disponibles y caps):
 *     verde y lento = sana; ámbar y rápido = degradada.
 *
 * Es NAVEGACIÓN, no adorno: pulsar un nodo llama `onSelect(section)`.
 *
 * SVG PURO (sin canvas, sin three, sin librerías) y el latido es SMIL nativo,
 * así que no necesita ni una línea de CSS global. Gates duros: el aro queda
 * ESTÁTICO si el usuario pidió movimiento reducido o si la pestaña está oculta.
 * SSR-safe y defensivo: sin `window` pinta el estado neutro y nunca lanza.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { reducedMotionActive } from "@/lib/astraura/system-chime";
import { personaPalette } from "@/lib/aurora/persona-avatar";
import { getPersonalityProfile } from "@/lib/aurora/personalities";
import { thisDeviceId, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { listVoiceEngines } from "@/lib/aurora/tts-oss/engine-registry";
import {
  ALL_PERSONAS, detectAntennas, resolvePersonaSystems, subscribeNeuronPersona,
  PROVENANCE_LABEL, type Provenance,
} from "@/lib/astraura/neuron-persona-systems";

/** Pestañas de los 5 sistemas (subconjunto de `SetupSection` de la ventana). */
export type ConstellationSection = "llm" | "astraura" | "openvoice" | "cerebro" | "senales";

interface NodeMeta {
  section: ConstellationSection;
  label: string;
  /** Acento de la pestaña (trazo del nodo). */
  stroke: string;
}

const NODES: NodeMeta[] = [
  { section: "llm", label: "LLM", stroke: "#22d3ee" },        // cian
  { section: "astraura", label: "Astraura", stroke: "#fbbf24" }, // ámbar
  { section: "openvoice", label: "OpenVoice", stroke: "#e879f9" }, // fucsia
  { section: "cerebro", label: "Cerebro", stroke: "#a78bfa" },  // violeta
  { section: "senales", label: "Señales", stroke: "#34d399" },  // esmeralda
];

/** Relleno del nodo según de dónde sale el valor efectivo. */
const PROVENANCE_FILL: Record<Provenance, string> = {
  auto: "none",                       // hueco: nadie ha fijado nada
  neurona: "rgba(167,139,250,0.85)",  // sólido violeta: ajuste de esta neurona
  personalidad: "rgba(232,121,249,0.5)",
  cuenta: "rgba(34,211,238,0.45)",
};

/* ───────────────────────────── Salud de la neurona ───────────────────────────── */

export interface NeuronHealth {
  /** 0..1 — media ponderada de señales REALES (nunca inventadas). */
  score: number;
  level: "sana" | "atenta" | "degradada";
  /** Periodo del latido en ms (lento = sana). */
  periodMs: number;
  /** Color del latido: verde sano · ámbar degradado. */
  color: string;
  /** Frase corta para `title`/lectores de pantalla. */
  label: string;
  detalles: { voz: string; red: string; antenas: string; local: string };
}

/**
 * Salud honesta de esta neurona para el LATIDO. Todo se lee sin red: la
 * disponibilidad offline del motor de voz efectivo (`listVoiceEngines`), el
 * estado de `navigator.onLine`, la proporción de antenas disponibles sobre
 * detectadas y las capacidades locales (`caps`, si el llamador ya las tiene).
 * Reutilizable fuera de la constelación. Nunca lanza.
 */
export function computeNeuronHealth(
  personaId: string,
  deviceId: string = thisDeviceId(),
  caps?: NeuronCapabilities | null,
): NeuronHealth {
  let voz = 0.5;
  let vozTxt = "motor de voz sin comprobar";
  let red = 1;
  let redTxt = "conexión sin comprobar";
  let antenas = 0.5;
  let antenasTxt = "antenas sin detectar";
  let local = 0.4;
  let localTxt = "sin IA local detectada";

  try {
    const motor = resolvePersonaSystems(personaId, deviceId, caps ?? null).voz.motor;
    const st = listVoiceEngines().find((e) => e.meta.id === motor);
    const av = st?.availability;
    voz = av === "ready" ? 1 : av === "configured" ? 0.65 : av ? 0.2 : 0.5;
    vozTxt = `voz ${motor}${av ? ` · ${av}` : ""}`;
  } catch { /* */ }

  try {
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      red = navigator.onLine ? 1 : 0.25;
      redTxt = navigator.onLine ? "en línea" : "sin conexión";
    }
  } catch { /* */ }

  try {
    const list = detectAntennas();
    if (list.length > 0) {
      const ok = list.filter((a) => a.availability === "available").length;
      antenas = ok / list.length;
      antenasTxt = `${ok}/${list.length} antenas disponibles`;
    }
  } catch { /* */ }

  try {
    const hasLocal = !!(caps?.ollama || caps?.lmstudio || caps?.chromeAi || caps?.webgpu)
      || (typeof navigator !== "undefined" && !!(navigator as unknown as { gpu?: unknown }).gpu);
    local = hasLocal ? 1 : 0.4;
    localTxt = hasLocal ? "IA local disponible" : "sin IA local detectada";
  } catch { /* */ }

  const score = Math.max(0, Math.min(1, voz * 0.35 + red * 0.2 + antenas * 0.25 + local * 0.2));
  const level: NeuronHealth["level"] = score >= 0.75 ? "sana" : score >= 0.5 ? "atenta" : "degradada";
  // Sana → latido lento y amplio (3.6 s); degradada → rápido (1.2 s).
  const periodMs = Math.round(1200 + score * 2400);
  const color = level === "sana" ? "#39FF14" : level === "atenta" ? "#9FE870" : "#FFBF00";
  const label = `Neurona ${level} · ${vozTxt} · ${redTxt} · ${antenasTxt}`;
  return { score, level, periodMs, color, label, detalles: { voz: vozTxt, red: redTxt, antenas: antenasTxt, local: localTxt } };
}

/* ─────────────────────────────── Componente ─────────────────────────────── */

export interface PersonaConstellationProps {
  personaId: string;
  deviceId?: string;
  /** Capacidades ya detectadas por la ventana (evita volver a sondear). */
  caps?: NeuronCapabilities | null;
  /** Pulsar un nodo navega a esa pestaña. */
  onSelect?: (section: ConstellationSection) => void;
  /** Lado del SVG en px (por defecto 132; `compact` baja a 92). */
  size?: number;
  compact?: boolean;
  className?: string;
}

export function PersonaConstellation({
  personaId,
  deviceId,
  caps = null,
  onSelect,
  size,
  compact = false,
  className,
}: PersonaConstellationProps) {
  const [tick, setTick] = useState(0);
  const [animable, setAnimable] = useState(false); // SSR: arranca estático

  const device = deviceId || (typeof window !== "undefined" ? thisDeviceId() : "");
  const px = size ?? (compact ? 92 : 132);

  // Refresco: overrides del store + cambios de conexión.
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const unsub = subscribeNeuronPersona(bump);
    try {
      window.addEventListener("online", bump);
      window.addEventListener("offline", bump);
    } catch { /* */ }
    return () => {
      try { unsub(); } catch { /* */ }
      try {
        window.removeEventListener("online", bump);
        window.removeEventListener("offline", bump);
      } catch { /* */ }
    };
  }, []);

  // Gate del latido: movimiento reducido global o pestaña oculta ⇒ ESTÁTICO.
  useEffect(() => {
    const sync = () => {
      const hidden = typeof document !== "undefined" && document.hidden;
      setAnimable(!hidden && !reducedMotionActive());
    };
    sync();
    try { document.addEventListener("visibilitychange", sync); } catch { /* */ }
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", sync);
    } catch { /* */ }
    return () => {
      try { document.removeEventListener("visibilitychange", sync); } catch { /* */ }
      try { mq?.removeEventListener("change", sync); } catch { /* */ }
    };
  }, []);

  const resolved = useMemo(() => {
    try { return resolvePersonaSystems(personaId, device, caps); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaId, device, caps, tick]);

  const health = useMemo(() => computeNeuronHealth(personaId, device, caps), [personaId, device, caps, tick]);

  const ring = useMemo(() => {
    try {
      if (!personaId || personaId === ALL_PERSONAS) return "#7fb8ff";
      const profile = getPersonalityProfile(personaId);
      return profile ? personaPalette(profile).primary : "#7fb8ff";
    } catch {
      return "#7fb8ff";
    }
  }, [personaId]);

  const provenanceOf = useCallback((s: ConstellationSection): Provenance => {
    if (!resolved) return "auto";
    switch (s) {
      case "llm": return resolved.llm.provenance;
      case "astraura": return resolved.astraura.provenance;
      case "openvoice": return resolved.voz.provenance;
      case "cerebro": return resolved.cerebro.provenance;
      default: return resolved.senales.provenance;
    }
  }, [resolved]);

  // Geometría en un lienzo 100×100 (escala con `px` sin recalcular nada).
  const C = 50;
  const R = 30;            // radio del anillo de nodos
  const rNode = compact ? 5.4 : 6.4;
  const rPulse = 42;
  const rPersona = 46;
  const durS = (health.periodMs / 1000).toFixed(2);

  return (
    <div
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: px, height: px }}
      role="group"
      aria-label={`Constelación de sistemas · ${health.label}`}
      title={health.label}
    >
      <svg viewBox="0 0 100 100" width={px} height={px} className="overflow-visible">
        {/* Aro exterior con el color de la personalidad (estático). */}
        <circle cx={C} cy={C} r={rPersona} fill="none" stroke={ring} strokeOpacity={0.22} strokeWidth={1} />

        {/* PULSO: aro de salud. Late solo si procede; si no, queda fijo y visible. */}
        <circle
          cx={C} cy={C} r={rPulse}
          fill="none" stroke={health.color}
          strokeOpacity={animable ? 0.16 : 0.3}
          strokeWidth={1.4}
        >
          {animable && (
            <>
              <animate
                attributeName="stroke-opacity"
                values="0.14;0.48;0.14"
                dur={`${durS}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="r"
                values={`${rPulse - 1.2};${rPulse + 1.2};${rPulse - 1.2}`}
                dur={`${durS}s`}
                repeatCount="indefinite"
              />
            </>
          )}
        </circle>

        {/* Órbita de los nodos. */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={0.8} />

        {NODES.map((n, i) => {
          const a = (-90 + i * 72) * (Math.PI / 180);
          const x = C + Math.cos(a) * R;
          const y = C + Math.sin(a) * R;
          const prov = provenanceOf(n.section);
          const fill = PROVENANCE_FILL[prov] ?? "none";
          const label = `${n.label} — ${PROVENANCE_LABEL[prov]}`;
          const clickable = !!onSelect;
          return (
            <g
              key={n.section}
              role={clickable ? "button" : "img"}
              tabIndex={clickable ? 0 : -1}
              aria-label={clickable ? `Ir a ${n.label} — ${PROVENANCE_LABEL[prov]}` : label}
              className={clickable ? "cursor-pointer outline-none" : undefined}
              onClick={clickable ? () => onSelect?.(n.section) : undefined}
              onKeyDown={clickable ? (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(n.section); }
              } : undefined}
            >
              <title>{label}</title>
              {/* Diana táctil generosa e invisible (WCAG 2.5.5 sobre SVG). */}
              <circle cx={x} cy={y} r={rNode + 5} fill="transparent" />
              {/* Radio hacia el centro: la personalidad sostiene sus sistemas. */}
              <line x1={C} y1={C} x2={x} y2={y} stroke={n.stroke} strokeOpacity={0.18} strokeWidth={0.7} />
              <circle
                cx={x} cy={y} r={rNode}
                fill={fill}
                stroke={n.stroke}
                strokeOpacity={0.85}
                strokeWidth={1.6}
              />
              {/* Punto interior esmeralda = "en automático" (relleno hueco). */}
              {prov === "auto" && <circle cx={x} cy={y} r={1.5} fill="#34d399" fillOpacity={0.9} />}
            </g>
          );
        })}

        {/* Núcleo: la personalidad. */}
        <circle cx={C} cy={C} r={compact ? 5 : 6} fill={ring} fillOpacity={0.16} stroke={ring} strokeOpacity={0.5} strokeWidth={1} />
        <circle cx={C} cy={C} r={compact ? 1.6 : 2} fill={ring} fillOpacity={0.85} />
      </svg>

      {/* Texto equivalente: DESIGN_RULES §3 — nunca solo color. */}
      <span className="sr-only">
        Salud de la neurona: {health.level}. {health.detalles.voz}. {health.detalles.red}.{" "}
        {health.detalles.antenas}. {health.detalles.local}.
      </span>
    </div>
  );
}

export default PersonaConstellation;
