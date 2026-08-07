"use client";

/**
 * SECCIONES DE SISTEMAS POR PERSONALIDAD × NEURONA (Adenda 149).
 * ============================================================================
 * SOP: `architecture/astraura-config-sistemas-neurona.md`.
 *
 * Piezas de la ventana «Configuración/actualización de sistemas de Astraura en
 * esta neurona» (`astraura-omnivoice-config.tsx`): el selector de personalidad
 * y las secciones LLM · OpenVoice · Cerebro · Señales. (La sección Astraura —
 * orden de clases, modo, novedades — vive en el componente principal, que ya la
 * tenía de las Adendas 132/133.)
 *
 * Todas leen su estado con `resolvePersonaSystems` (capa de la Adenda 149) y
 * editan con `saveOverrides`/`clearOverrides`. Cada control muestra su
 * PROCEDENCIA y ofrece «volver a auto». Sin overrides, describir ≠ cambiar:
 * el comportamiento del OS es exactamente el previo.
 *
 * SSR-safe y defensivo: nunca lanza; sin `window` pinta defaults.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles, Bot, Brain, BookOpen, GraduationCap, Wand2, Star, Heart, Moon, Sun,
  Flame, Music, Shield, Zap, Cpu, Undo2, Loader2, Volume2, HardDrive, Server,
  RadioTower, Wifi, Bluetooth, Usb, Radio, ArrowDownToLine, ArrowUpFromLine,
  Users, User, UserCog, Fingerprint, Search, ChevronDown, ChevronUp, ArrowRight,
  Plus, Pin, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { type NeuronCapabilities, settingsFor, setNeuronSettings, NEURON_EVENT } from "@/lib/neurons/neurons";
import { listBrains, type Brain as BrainRecord } from "@/lib/brains/brains";
import { freeSources } from "@/ai/astraura/free-catalog";
import { describeCaps } from "@/ai/astraura/model-requirements";
import { engineSupportsRef } from "@/lib/aurora/persona-coherence";
import {
  listVoiceEngines, buildVoiceChain, AUTO_ENDPOINT_ORDER, type VoiceEngineStatus,
} from "@/lib/aurora/tts-oss/engine-registry";
import { getVoiceConfig, isVoiceEngineId } from "@/lib/aurora/tts-oss/voice-config";
import { playSystemChime } from "@/lib/astraura/system-chime";
import { getPersonalityProfile } from "@/lib/aurora/personalities";
import { personaPalette, proceduralAvatarDataUrl } from "@/lib/aurora/persona-avatar";
import { getPersonaProfile } from "@/lib/aurora/setup-config";
import {
  ALL_PERSONAS, PROVENANCE_LABEL, clearOverrides, detectAntennas, getRawOverrides,
  personaChips, resolvePersonaSystems, saveOverrides, subscribeNeuronPersona,
  type AntennaRouteMode, type NeuronAntenna, type PersonaChip, type PersonaNeuronOverrides,
  type Provenance, type ResolvedPersonaSystems,
} from "@/lib/astraura/neuron-persona-systems";

/* Paneles pesados reutilizados: SOLO se descargan si su sección los muestra. */
const NeuronVoiceChoice = dynamic(
  () => import("@/components/settings/aurora/neuron-voice-choice").then((m) => ({ default: m.NeuronVoiceChoice })),
  { ssr: false, loading: () => <SectionSpin /> },
);
const ModelScoutPanel = dynamic(
  () => import("@/components/astraura/model-scout-panel").then((m) => ({ default: m.ModelScoutPanel })),
  { ssr: false, loading: () => <SectionSpin /> },
);
const PersonaCoherencePanel = dynamic(
  () => import("@/components/aurora/persona-coherence-panel").then((m) => ({ default: m.PersonaCoherencePanel })),
  { ssr: false, loading: () => <SectionSpin /> },
);
const SetupVoz = dynamic(() => import("@/components/aurora/setup/setup-voz"), {
  ssr: false,
  loading: () => <SectionSpin />,
});

/** Spinner corto: SOLO para paneles dinámicos (su módulo tarda unos ms). */
function SectionSpin() {
  return (
    <p className="flex items-center justify-center gap-2 px-2 py-6 text-[11px] text-[var(--aw-text)]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
    </p>
  );
}

/**
 * SKELETON con la GEOMETRÍA de la tarjeta destino (A149 · ola 2 · §2.13).
 * Antes, cada sección colapsaba a UNA línea con un spinner y luego saltaba a
 * tarjeta completa (el peor caso empujaba el bloque de orden). Aquí la altura
 * y la estructura ya son las de la tarjeta que llega: cabecera (título +
 * procedencia), valor efectivo, hint y N filas de controles.
 *
 * Usa `.loading-shimmer` de globals.css (~2255), que ya degrada con
 * `prefers-reduced-motion` y con `data-perf="eco"` (bloques globales al final
 * de globals.css), así que no necesita gate propio.
 */
export function SystemCardSkeleton({
  rows = 2, value = true, className,
}: { rows?: number; value?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="loading-shimmer block h-3 w-40 max-w-[60%] rounded-md opacity-60" />
        <span className="loading-shimmer block h-4 w-16 rounded-full opacity-50" />
      </div>
      {value && <span className="loading-shimmer mt-2 block h-3.5 w-1/2 rounded-md opacity-60" />}
      <span className="loading-shimmer mt-1.5 block h-2.5 w-full rounded-md opacity-40" />
      <span className="loading-shimmer mt-1 block h-2.5 w-4/5 rounded-md opacity-40" />
      {Array.from({ length: Math.max(0, rows) }).map((_, i) => (
        <div key={i} className="mt-2 flex gap-1.5">
          <span className="loading-shimmer block h-7 flex-1 rounded-lg opacity-50" />
          <span className="loading-shimmer block h-7 flex-1 rounded-lg opacity-50" />
        </div>
      ))}
    </div>
  );
}

/** Grupo de skeletons de una sección (mismo hueco que sus tarjetas reales). */
export function SectionSkeleton({ cards }: { cards: { rows?: number; value?: boolean }[] }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando la configuración de esta personalidad…</span>
      {cards.map((c, i) => <SystemCardSkeleton key={i} rows={c.rows} value={c.value} />)}
    </div>
  );
}

/* ── Iconos de personalidad (nombres Lucide más comunes; respaldo Sparkles) ── */
const PERSONA_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, bot: Bot, brain: Brain, bookopen: BookOpen, graduationcap: GraduationCap,
  wand2: Wand2, star: Star, heart: Heart, moon: Moon, sun: Sun, flame: Flame, music: Music,
  shield: Shield, zap: Zap,
};
function personaIcon(name?: string): LucideIcon {
  const key = (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return PERSONA_ICONS[key] ?? Sparkles;
}

/* ── Utilidades UI compartidas ── */

/** Sistemas editables por personalidad × neurona (claves del store A149). */
type SystemKey = keyof PersonaNeuronOverrides;

/** Riel izquierdo con el ACENTO DE SU PESTAÑA (LLM cian · Astraura ámbar ·
 *  OpenVoice fucsia · Cerebro violeta · Señales esmeralda): marca a simple
 *  vista una tarjeta CON ajuste propio, sin depender de que aparezca el botón. */
const SYSTEM_RAIL: Record<SystemKey, string> = {
  llm: "border-l-2 border-l-cyan-400/60",
  astraura: "border-l-2 border-l-amber-400/60",
  voz: "border-l-2 border-l-fuchsia-400/60",
  cerebro: "border-l-2 border-l-violet-400/60",
  senales: "border-l-2 border-l-emerald-400/60",
};
/** Clase del riel si el sistema tiene override crudo guardado (si no, nada). */
function rail(has: boolean, system: SystemKey): string {
  return has ? SYSTEM_RAIL[system] : "";
}

const SYSTEM_TOAST: Record<SystemKey, string> = {
  llm: "Modelo LLM de esta neurona",
  astraura: "Sistema Astraura de esta neurona",
  voz: "Voz de esta neurona",
  cerebro: "Cerebro de esta neurona",
  senales: "Señales de esta neurona",
};

/** Restaura EXACTAMENTE el override crudo previo de un sistema («Deshacer»). */
function restoreSystem(deviceId: string, personaId: string, system: SystemKey, prev: PersonaNeuronOverrides[SystemKey]): void {
  try {
    clearOverrides(deviceId, personaId, system);
    if (prev === undefined) return;
    const patch: PersonaNeuronOverrides = {};
    (patch as Record<string, unknown>)[system] = prev;
    saveOverrides(deviceId, personaId, patch);
  } catch { /* nunca lanza */ }
}

/** Toast con acción «Deshacer» (defensivo: si sonner falla, no rompe la edición). */
function undoToast(title: string, description: string, undo: () => void): void {
  try {
    toast.success(title, { description, action: { label: "Deshacer", onClick: undo } });
  } catch { /* */ }
}

/**
 * Guarda un override AL INSTANTE (modelo de la ventana) pero deja de ser mudo:
 * avisa de qué cambió y ofrece «Deshacer», que restaura el estado crudo previo
 * de ESE sistema (patrón de `library-catalog.tsx`).
 */
function applyOverride(
  deviceId: string, personaId: string, system: SystemKey,
  patch: PersonaNeuronOverrides, description: string,
): void {
  let prev: PersonaNeuronOverrides[SystemKey];
  try { prev = getRawOverrides(deviceId, personaId)[system]; } catch { /* */ }
  try { saveOverrides(deviceId, personaId, patch); } catch { return; }
  // Nota del sistema al fijar algo (OFF por defecto; el módulo se auto-silencia
  // con movimiento reducido, pestaña oculta o si el usuario no lo activó).
  playSystemChime(system, "set");
  undoToast(SYSTEM_TOAST[system], description, () => restoreSystem(deviceId, personaId, system, prev));
}

/** «Volver a auto» con la misma red de seguridad: borra y ofrece deshacer. */
function clearOverrideWithUndo(deviceId: string, personaId: string, system: SystemKey): void {
  let prev: PersonaNeuronOverrides[SystemKey];
  try { prev = getRawOverrides(deviceId, personaId)[system]; } catch { /* */ }
  try { clearOverrides(deviceId, personaId, system); } catch { return; }
  // Misma nota, cayendo una quinta: algo se soltó y vuelve a automático.
  playSystemChime(system, "clear");
  undoToast(SYSTEM_TOAST[system], "Vuelve a la selección automática.", () => restoreSystem(deviceId, personaId, system, prev));
}

function pill(active: boolean, tone: "cyan" | "violet" | "emerald" | "amber" | "fuchsia" = "cyan"): string {
  const tones: Record<string, string> = {
    cyan: "border-cyan-400/40 bg-cyan-500/15 text-cyan-100 shadow-[0_0_10px_-3px_rgb(34_211_238)]",
    violet: "border-violet-400/40 bg-violet-500/15 text-violet-100 shadow-[0_0_10px_-3px_rgb(167_139_250)]",
    emerald: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 shadow-[0_0_10px_-3px_rgb(52_211_153)]",
    amber: "border-amber-400/40 bg-amber-500/15 text-amber-100 shadow-[0_0_10px_-3px_rgb(251_191_36)]",
    fuchsia: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100 shadow-[0_0_10px_-3px_rgb(232_121_249)]",
  };
  return cn(
    "cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97]",
    "disabled:cursor-not-allowed disabled:opacity-50",
    active ? tones[tone] : "border-[var(--aw-line)] bg-[var(--aw-surface)] text-[var(--aw-text)] hover:border-[var(--aw-line-strong)]",
  );
}

/** Etiqueta CORTA + icono de la procedencia (la frase larga va en `title`). */
const PROVENANCE_SHORT: Record<Provenance, string> = {
  neurona: "Neurona", personalidad: "Persona", cuenta: "Cuenta", auto: "Auto",
};
const PROVENANCE_ICON: Record<Provenance, LucideIcon> = {
  neurona: Cpu, personalidad: UserCog, cuenta: User, auto: Wand2,
};

/** Chip pequeño de procedencia del valor efectivo. */
export function ProvenanceChip({ p }: { p: Provenance }) {
  const tone =
    p === "neurona" ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
      : p === "personalidad" ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200"
        : p === "cuenta" ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-200"
          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  const Icon = PROVENANCE_ICON[p] ?? Wand2;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", tone)}
      title={PROVENANCE_LABEL[p]}
    >
      <Icon className="h-3 w-3" aria-hidden="true" /> {PROVENANCE_SHORT[p] ?? PROVENANCE_LABEL[p]}
      <span className="sr-only"> — {PROVENANCE_LABEL[p]}</span>
    </span>
  );
}

/** Botón «Volver a auto» (borra el override de un sistema para esta persona). */
function BackToAuto({ deviceId, personaId, system }: { deviceId: string; personaId: string; system: SystemKey }) {
  return (
    <button
      type="button"
      onClick={() => clearOverrideWithUndo(deviceId, personaId, system)}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-text)] transition-colors hover:border-emerald-400/40 hover:text-emerald-200"
      title="Quitar el ajuste propio y volver a la selección automática"
    >
      <Undo2 className="h-3 w-3" /> Volver a auto
    </button>
  );
}

/** Enlace de navegación REAL a otra superficie del OS (cierra modal/drawer). */
function CrossNav({ href, label, onDismiss, className }: { href: string; label: string; onDismiss?: () => void; className?: string }) {
  return (
    <Link
      href={href}
      onClick={() => onDismiss?.()}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-text)]",
        "transition-colors hover:border-cyan-400/40 hover:text-cyan-200",
        className,
      )}
    >
      {label} <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

/**
 * Envoltura de `<select>` NATIVO con CHEVRON propio (A149 · ola 2 · §2.13).
 * Se mantiene el `<select>` nativo — coherente con `setup-sentidos`/
 * `setup-memoria` y mejor a11y táctil — pero la flecha del navegador (gris
 * de sistema, distinta en cada plataforma) se sustituye por el icono del OS.
 */
function SelectWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("relative block", className)}>
      {children}
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--aw-muted)]"
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * PREVISUALIZACIÓN DE LA CADENA al fijar un pin (A149 · ola 3 · §2.2).
 * El invariante «un pin va PRIMERO pero nunca es EXCLUSIVO» era hasta ahora
 * solo un párrafo: aquí se ve. Se pintan como máximo 5 eslabones + «+N», y el
 * primero lleva la marca «tu pin». Si la cadena real NO empieza por el pin
 * (p.ej. un motor de voz sin endpoint configurado), se dice en vez de fingir.
 */
interface ChainLink { id: string; label: string; pinned?: boolean; muted?: boolean }

function ChainChips({
  links, tone, label,
}: { links: ChainLink[]; tone: "cyan" | "fuchsia"; label: string }) {
  if (!links.length) return null;
  const MAX = 5;
  const shown = links.slice(0, MAX);
  const rest = links.length - shown.length;
  const pinTone = tone === "cyan"
    ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
    : "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100";
  return (
    <div className="mt-2">
      <p className="text-[10px] text-[var(--aw-muted)]">{label}</p>
      <ul
        className="mt-1 flex flex-wrap items-center gap-1"
        aria-label={`${label}: ${links.map((l) => l.label).join(", luego ")}`}
      >
        {shown.map((l, i) => (
          <li key={`${l.id}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ArrowRight className="h-3 w-3 shrink-0 text-[var(--aw-faint)]" aria-hidden="true" />}
            <span
              title={l.muted ? `${l.label} — tu pin, pero hoy no está disponible en esta neurona` : l.label}
              className={cn(
                "inline-flex max-w-[9.5rem] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[10px]",
                l.pinned && !l.muted
                  ? pinTone
                  : l.muted
                    ? "border-amber-400/30 bg-amber-500/10 text-amber-100/80 line-through decoration-amber-300/60"
                    : "border-[var(--aw-line)] bg-[var(--aw-surface-2)] text-[var(--aw-text)]",
              )}
            >
              {l.pinned && <Pin className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
              {l.label}
            </span>
          </li>
        ))}
        {rest > 0 && (
          <li className="flex items-center gap-1">
            <ArrowRight className="h-3 w-3 shrink-0 text-[var(--aw-faint)]" aria-hidden="true" />
            <span className="rounded-full border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-muted)]">
              +{rest}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * Bloque plegable para paneles pesados: en `full` llega abierto (y por tanto
 * montado); en modal/drawer se descarga SOLO al desplegarlo (next/dynamic no
 * pide el módulo hasta que su componente se renderiza de verdad).
 */
function Foldable({
  icon: Icon, title, iconCls, defaultOpen = false, children,
}: { icon: LucideIcon; title: string; iconCls?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 text-left text-[12px] font-semibold text-[var(--aw-strong)] transition-colors hover:text-[var(--aw-ink)]"
      >
        <Icon className={cn("h-3.5 w-3.5", iconCls)} aria-hidden="true" />
        <span className="min-w-0 flex-1">{title}</span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-[var(--aw-muted)]" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5 text-[var(--aw-muted)]" aria-hidden="true" />}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

/** Hook: resolución viva de los sistemas de la persona en esta neurona.
 *  Escucha el store A149 Y el evento de neuronas (ajustes reales tipo
 *  `syncBrains` viven en `starseed.neurons.prefs.v1` — rev. A149·M1).
 *  Exportado (A149·ola1): /cuenta, quick-settings y widgets leen el estado
 *  EN VIVO sin duplicar la lógica de suscripción. */
export function useResolvedPersonaSystems(personaId: string, deviceId: string, caps?: NeuronCapabilities | null) {
  const [resolved, setResolved] = useState<ResolvedPersonaSystems | null>(null);
  const recompute = useCallback(() => {
    try { setResolved(resolvePersonaSystems(personaId, deviceId, caps ?? null)); } catch { /* */ }
  }, [personaId, deviceId, caps]);
  useEffect(() => {
    recompute();
    const off = subscribeNeuronPersona(recompute);
    if (typeof window === "undefined") return off;
    const onNeuron = () => recompute();
    window.addEventListener(NEURON_EVENT, onNeuron);
    return () => { off(); window.removeEventListener(NEURON_EVENT, onNeuron); };
  }, [recompute]);
  return resolved;
}

/* ═══════════════════ Selector de personalidad ═══════════════════ */

export interface PersonaSelectorProps {
  value: string;
  onChange: (personaId: string) => void;
  compact?: boolean;
  /** Neurona actual: con ella, cada chip marca si tiene ajustes propios AQUÍ. */
  deviceId?: string;
}

/** Orbe + hue de una personalidad (avatar propio si lo tiene; si no, el
 *  procedural determinista por rasgos). Lectura de localStorage → SOLO en
 *  cliente, dentro de un efecto. */
interface PersonaVisual { avatar: string; hue: string }

function readPersonaVisuals(chips: PersonaChip[]): Record<string, PersonaVisual> {
  const out: Record<string, PersonaVisual> = {};
  for (const c of chips) {
    try {
      const profile = getPersonalityProfile(c.id);
      if (!profile) continue;
      // Mismo patrón que `setup-personalidad.tsx`: avatar del perfil de persona
      // si el usuario le puso uno; si no, el orbe procedural de sus rasgos.
      const propio = (() => { try { return getPersonaProfile(c.id, c.name).avatar; } catch { return ""; } })();
      out[c.id] = {
        avatar: propio || proceduralAvatarDataUrl(profile, 64),
        hue: personaPalette(profile).primary,
      };
    } catch { /* una personalidad ilegible no rompe la fila */ }
  }
  return out;
}

/**
 * Fila de chips: «Todas» (defaults de la neurona) + cada personalidad de la
 * cuenta (activa primero; Aurora y Hermione vienen de los presets integrados).
 * Lo editado en cada sección aplica a la personalidad seleccionada.
 *
 * A149 · ola 2 · §2.10:
 *   · ORBE de la personalidad (18px) con anillo de su hue en vez de un lucide
 *     de 12px — el mismo orbe que se ve en su perfil, no un icono genérico.
 *   · GEOMETRÍA del carril unificado: máscara de fundido lateral, scroll-snap
 *     y dianas ≥40px (inspirado en `SectionTabs`, no heredado: aquí el patrón
 *     correcto no es un tablist).
 *   · SEMÁNTICA correcta: `radiogroup`/`radio` con roving tabindex. Antes
 *     anidaba un segundo `role="tablist"` sin tabpanel (dos tablists hermanos).
 */
export function PersonaSelector({ value, onChange, compact = false, deviceId }: PersonaSelectorProps) {
  const [chips, setChips] = useState<PersonaChip[]>([]);
  /** Personalidades con override crudo en ESTA neurona (punto violeta). */
  const [pinned, setPinned] = useState<Record<string, boolean>>({});
  /** Orbe + hue por personalidad (solo cliente). */
  const [visuals, setVisuals] = useState<Record<string, PersonaVisual>>({});
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { setChips(personaChips()); } catch { /* */ }
  }, []);
  useEffect(() => {
    if (!chips.length) return;
    setVisuals(readPersonaVisuals(chips));
  }, [chips]);
  useEffect(() => {
    if (!deviceId) return;
    const read = () => {
      try {
        const next: Record<string, boolean> = {};
        for (const id of [ALL_PERSONAS, ...chips.map((c) => c.id)]) {
          next[id] = Object.keys(getRawOverrides(deviceId, id)).length > 0;
        }
        setPinned(next);
      } catch { /* */ }
    };
    read();
    return subscribeNeuronPersona(read);
  }, [deviceId, chips]);

  const ids = [ALL_PERSONAS, ...chips.map((c) => c.id)];
  const selectedIdx = Math.max(0, ids.indexOf(value));

  /** Roving tabindex del radiogroup: ← → Inicio/Fin mueven foco Y selección. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const NAV = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!NAV.includes(e.key)) return;
    const nodes = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-persona-chip]") ?? []);
    if (nodes.length === 0) return;
    const cur = nodes.findIndex((n) => n === document.activeElement);
    let next = cur;
    if (e.key === "ArrowRight") next = cur < 0 ? 0 : (cur + 1) % nodes.length;
    else if (e.key === "ArrowLeft") next = cur <= 0 ? nodes.length - 1 : cur - 1;
    else if (e.key === "Home") next = 0;
    else next = nodes.length - 1;
    e.preventDefault();
    const target = nodes[next];
    target?.focus();
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const id = target?.getAttribute("data-persona-id");
    if (id) onChange(id);
  };

  /** Punto violeta: esta personalidad tiene ajustes propios en esta neurona. */
  const dot = (on: boolean) => on
    ? <span className="ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" aria-hidden="true" />
    : null;

  /** Diana ≥40px y hueco para el orbe (el carril es lo más tocado del modal). */
  const chipCls = "inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 py-1 pl-1 pr-2.5 sm:min-h-9";

  return (
    <div className={cn("relative min-w-0", compact ? "mt-2" : "mt-2.5")}>
      {/* Máscara de fundido lateral: indica que hay más personalidades. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[var(--aw-shell)] to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[var(--aw-shell)] to-transparent" aria-hidden />
      <div
        ref={listRef}
        role="radiogroup"
        aria-label="Personalidad a configurar en esta neurona"
        onKeyDown={onKeyDown}
        className="flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-hide snap-x scroll-px-2 pb-0.5"
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === ALL_PERSONAS}
          tabIndex={selectedIdx === 0 ? 0 : -1}
          data-persona-chip
          data-persona-id={ALL_PERSONAS}
          onClick={() => onChange(ALL_PERSONAS)}
          title={pinned[ALL_PERSONAS] ? "Todas — con ajustes propios en esta neurona" : "Todas las personalidades (defaults de esta neurona)"}
          className={cn(pill(value === ALL_PERSONAS, "emerald"), chipCls)}
        >
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-emerald-300/50 bg-emerald-500/15">
            <Users className="h-3 w-3" aria-hidden="true" />
          </span>
          Todas
          {dot(!!pinned[ALL_PERSONAS])}
        </button>
        {chips.map((c, i) => {
          const Icon = personaIcon(c.icon);
          const base = c.active ? `${c.name} (personalidad activa)` : c.name;
          const v = visuals[c.id];
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={value === c.id}
              tabIndex={selectedIdx === i + 1 ? 0 : -1}
              data-persona-chip
              data-persona-id={c.id}
              onClick={() => onChange(c.id)}
              className={cn(pill(value === c.id, "fuchsia"), chipCls)}
              title={pinned[c.id] ? `${base} — con ajustes propios en esta neurona` : base}
            >
              {/* ORBE de la personalidad con anillo de SU hue (o icono si aún
                  no hay perfil legible: nunca se queda sin marca visual). */}
              {v ? (
                // `<img>` a propósito (como el resto del OS): la fuente es un
                // data:URL de SVG procedural o la URL del avatar del usuario, y
                // ninguna pasa por el optimizador de Next.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={v.avatar}
                  alt=""
                  aria-hidden="true"
                  width={18}
                  height={18}
                  loading="lazy"
                  decoding="async"
                  onError={() => setVisuals((prev) => {
                    if (!prev[c.id]) return prev;
                    const next = { ...prev };
                    delete next[c.id];
                    return next; // avatar roto → vuelve el icono, nunca un hueco
                  })}
                  className="h-[18px] w-[18px] shrink-0 rounded-full border object-cover"
                  style={{ borderColor: v.hue, boxShadow: `0 0 8px -3px ${v.hue}` }}
                />
              ) : (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-[var(--aw-line-strong)]">
                  <Icon className="h-3 w-3" aria-hidden="true" />
                </span>
              )}
              <span className="truncate">{c.name}</span>
              {c.active && <span className="ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />}
              {dot(!!pinned[c.id])}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════ Sección LLM ═══════════════════ */

export interface SectionProps {
  personaId: string;
  deviceId: string;
  caps?: NeuronCapabilities | null;
  compact?: boolean;
  /** Variante ancha (hub embedded): muestra los paneles completos. */
  full?: boolean;
  /** Cierra el contenedor (modal/drawer) al navegar a otra superficie. */
  onDismiss?: () => void;
  /** Navegación por callback a las pestañas de /agent (evita el query param). */
  onNavigate?: (tab: string) => void;
}

/**
 * LLM — modelo de lenguaje usado por la personalidad seleccionada EN ESTA
 * neurona: efectivo + procedencia, pin fuente/modelo (catálogo gratis-primero)
 * y recomendación inteligente del scout (Adenda 138).
 */
export function LlmSection({ personaId, deviceId, caps, full = false }: SectionProps) {
  const resolved = useResolvedPersonaSystems(personaId, deviceId, caps);
  const sources = useMemo(() => { try { return freeSources(); } catch { return []; } }, []);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // getRawOverrides es lectura pura de localStorage; se refresca con `resolved`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);

  const fuente = raw.llm?.fuente ?? "";
  const modelos = useMemo(() => sources.find((s) => s.id === fuente)?.models ?? [], [sources, fuente]);
  /** Cadena REAL con el pin delante: `freeSources()` en su orden, sin el pin. */
  const cadena = useMemo<ChainLink[]>(() => {
    if (!fuente) return [];
    const pin = sources.find((s) => s.id === fuente);
    const resto = sources.filter((s) => s.id !== fuente).map((s) => ({ id: s.id, label: s.label }));
    return [{ id: fuente, label: pin?.label ?? fuente, pinned: true }, ...resto];
  }, [fuente, sources]);
  if (!resolved) return <SectionSkeleton cards={[{ rows: 2 }, { rows: 1, value: false }]} />;
  const esTodas = personaId === ALL_PERSONAS;
  const sourceLabel = (id: string) => sources.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="space-y-3">
      <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5", rail(!!raw.llm, "llm"))}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
            <Brain className="h-3.5 w-3.5 text-cyan-300" /> Modelo LLM {esTodas ? "de esta neurona" : "de esta personalidad aquí"}
          </p>
          <ProvenanceChip p={resolved.llm.provenance} />
        </div>
        <p className="mt-1 text-[13px] font-medium text-[var(--aw-strong)]">{resolved.llm.label}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--aw-muted)]">
          En automático, Astraura elige siempre la mejor opción gratuita disponible y cambia sola de fuente si una se
          agota. Un pin va primero en la cadena pero nunca es exclusivo: sin disponibilidad, se cae al siguiente.
        </p>

        {/* Editor del pin fuente/modelo para ESTA neurona */}
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <label className="min-w-0 text-[10px] text-[var(--aw-muted)]">
            Fuente
            <SelectWrap className="mt-0.5">
              <select
                value={fuente}
                onChange={(e) => {
                  const f = e.target.value;
                  if (!f) clearOverrideWithUndo(deviceId, personaId, "llm");
                  else applyOverride(deviceId, personaId, "llm", { llm: { fuente: f, modelo: undefined } }, `Fuente fijada: ${sourceLabel(f)}.`);
                }}
                className="block w-full cursor-pointer appearance-none rounded-lg border border-[var(--aw-line)] bg-[var(--aw-field)] py-1.5 pl-2 pr-7 text-[11px] text-[var(--aw-strong)] outline-none transition-colors focus:border-cyan-400/50"
              >
                <option value="">Automática (gratis-primero)</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.label} · {s.privacy === "local" ? "local" : "nube"}</option>
                ))}
              </select>
            </SelectWrap>
          </label>
          <label className="min-w-0 text-[10px] text-[var(--aw-muted)]">
            Modelo
            <SelectWrap className="mt-0.5">
              <select
                value={raw.llm?.modelo ?? ""}
                disabled={!fuente}
                onChange={(e) => {
                  const m = e.target.value;
                  applyOverride(
                    deviceId, personaId, "llm",
                    { llm: { fuente, modelo: m || undefined } },
                    m ? `Modelo fijado: ${modelos.find((x) => x.id === m)?.label ?? m}.` : "Se usará el mejor modelo de la fuente.",
                  );
                }}
                className="block w-full cursor-pointer appearance-none rounded-lg border border-[var(--aw-line)] bg-[var(--aw-field)] py-1.5 pl-2 pr-7 text-[11px] text-[var(--aw-strong)] outline-none transition-colors focus:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">El mejor de la fuente</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </SelectWrap>
          </label>
        </div>
        {/* La cadena que resulta de TU pin (nunca exclusivo: si se agota, sigue). */}
        <ChainChips links={cadena} tone="cyan" label="Tu pin va primero; si se agota, la cadena sigue:" />
        {/* Fila de acciones con ALTURA RESERVADA: «Volver a auto» no salta el layout. */}
        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2">
          {raw.llm && <BackToAuto deviceId={deviceId} personaId={personaId} system="llm" />}
          <span className="text-[10px] text-[var(--aw-muted)]">
            {esTodas ? "Aplica a toda personalidad sin pin propio en esta neurona." : "Solo para esta personalidad en esta neurona; sus pines por sentido siguen en su editor de personalidad."}
          </span>
        </div>
      </div>

      {/* Recomendación inteligente según el hardware real (Adenda 138). */}
      <div className="rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5">
        <p className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Recomendado para este dispositivo
        </p>
        {/* Contexto de hardware REAL del que habla el recomendador. */}
        <p className="mb-1.5 flex items-start gap-1.5 text-[10px] leading-snug text-[var(--aw-muted)]">
          <Cpu className="mt-px h-3 w-3 shrink-0 text-[var(--aw-faint)]" aria-hidden="true" />
          <span>{caps ? describeCaps(caps) : "Detectando el hardware de esta neurona…"}</span>
        </p>
        {/* Con persona+neurona, cada fila puede aplicarse aquí mismo (§2.2). */}
        <ModelScoutPanel kind="llm" personaId={personaId} deviceId={deviceId} />
      </div>

      {full && (
        <p className="px-0.5 text-[10px] leading-snug text-[var(--aw-muted)]">
          Los catálogos se auto-actualizan (OpenRouter :free cada 4 h · HuggingBay). Modelos propios y descargas, en la
          pestaña Neuronas.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════ Sección OpenVoice ═══════════════════ */

/**
 * OpenVoice — voz de la personalidad seleccionada en esta neurona: motor
 * efectivo + pin por personalidad, vía de la neurona (nube ⟷ local) y
 * coherencia de persona (Adenda 112: el carácter se conserva en TODOS los
 * motores; la referencia de audio, donde el motor sabe clonar).
 */
export function OpenVoiceSection({ personaId, deviceId, caps: _caps, full = false }: SectionProps) {
  const resolved = useResolvedPersonaSystems(personaId, deviceId);
  const [engines, setEngines] = useState<VoiceEngineStatus[]>([]);
  useEffect(() => {
    try { setEngines(listVoiceEngines()); } catch { /* */ }
  }, [resolved]);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SectionSkeleton cards={[{ rows: 3 }, { rows: 1, value: false }]} />;

  const motorPin = raw.voz?.motor ?? "";
  const viaPin = raw.voz?.modo ?? "";
  const engineLabel = (id: string) => engines.find((e) => e.meta.id === id)?.meta.label ?? id;

  /**
   * Cadena REAL de voz con el pin delante (`buildVoiceChain`, la misma que usa
   * la síntesis). Si el pin no tiene endpoint configurado, la cadena NO empieza
   * por él: se marca en ámbar en vez de fingir que manda.
   */
  const cadenaVoz: ChainLink[] = (() => {
    if (!motorPin) return [];
    let chain: string[] = [];
    try {
      const pin = isVoiceEngineId(motorPin) ? motorPin : null;
      chain = buildVoiceChain(getVoiceConfig(), pin) as unknown as string[];
    } catch { chain = []; }
    if (!chain.length) chain = [motorPin, ...AUTO_ENDPOINT_ORDER.filter((e) => e !== motorPin)];
    const links: ChainLink[] = chain.map((id) => ({
      id, label: engineLabel(id), pinned: id === motorPin,
    }));
    // El pin quedó fuera de la cadena real: se muestra igual, tachado y honesto.
    if (!chain.includes(motorPin)) {
      links.unshift({ id: motorPin, label: engineLabel(motorPin), pinned: true, muted: true });
    }
    return links;
  })();
  /** ¿El motor EFECTIVO sabe clonar por referencia de audio? (en vivo, A112). */
  const clona = (() => { try { return engineSupportsRef(resolved.voz.motor); } catch { return false; } })();

  return (
    <div className="space-y-3">
      <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5", rail(!!raw.voz, "voz"))}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
            <Volume2 className="h-3.5 w-3.5 text-fuchsia-300" /> Motor de voz {personaId === ALL_PERSONAS ? "de esta neurona" : "de esta personalidad aquí"}
          </p>
          <ProvenanceChip p={resolved.voz.provenance} />
        </div>
        <p className="mt-1 text-[13px] font-medium text-[var(--aw-strong)]">
          {engines.find((e) => e.meta.id === resolved.voz.motor)?.meta.label ?? resolved.voz.motor}
        </p>
        <label className="mt-2 block text-[10px] text-[var(--aw-muted)]">
          Elegir motor en esta neurona
          <SelectWrap className="mt-0.5">
            <select
              value={motorPin}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) clearOverrideWithUndo(deviceId, personaId, "voz");
                else applyOverride(deviceId, personaId, "voz", { voz: { motor: v } }, `Motor de voz: ${engineLabel(v)}.`);
              }}
              className="block w-full cursor-pointer appearance-none rounded-lg border border-[var(--aw-line)] bg-[var(--aw-field)] py-1.5 pl-2 pr-7 text-[11px] text-[var(--aw-strong)] outline-none transition-colors focus:border-fuchsia-400/50"
            >
              <option value="">Automático (cadena de voz: nunca se queda muda)</option>
              {engines.map((e) => (
                <option key={e.meta.id} value={e.meta.id}>
                  {e.meta.label} · {e.availability === "ready" ? "listo" : e.availability === "configured" ? "configurado" : "requiere preparación"}
                  {e.recommended ? " · recomendado" : ""}
                </option>
              ))}
            </select>
          </SelectWrap>
        </label>

        {/* La cadena real de voz: por eso Aurora nunca se queda muda. */}
        <ChainChips links={cadenaVoz} tone="fuchsia" label="Cadena de voz resultante (nunca se queda muda):" />

        {/* Vía preferida de la voz PARA ESTA PERSONALIDAD en esta neurona */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[var(--aw-muted)]">Vía preferida:</span>
          {([["", "Auto"], ["cloud", "Nube gratis"], ["local", "Motor local"]] as const).map(([v, label]) => (
            <button
              key={v || "auto"}
              type="button"
              aria-pressed={viaPin === v}
              onClick={() => {
                if (!v) { if (raw.voz?.modo) applyOverride(deviceId, personaId, "voz", { voz: { modo: undefined } }, "Vía de voz: automática."); }
                else applyOverride(deviceId, personaId, "voz", { voz: { modo: v } }, `Vía de voz: ${label.toLowerCase()}.`);
              }}
              className={pill(viaPin === v, "fuchsia")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Badge HONESTO de clonación: depende del motor efectivo, no del texto. */}
        <p className={cn(
          "mt-2 flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[10px] leading-snug",
          clona ? "border-emerald-400/25 bg-emerald-500/[0.06] text-emerald-100/85" : "border-[var(--aw-line)] bg-[var(--aw-surface-2)] text-[var(--aw-muted)]",
        )}>
          <Fingerprint className={cn("mt-px h-3 w-3 shrink-0", clona ? "text-emerald-300" : "text-[var(--aw-faint)]")} aria-hidden="true" />
          <span>
            {clona
              ? "Este motor clona: la referencia de audio de la personalidad se usa en la síntesis."
              : "Este motor no clona: la persona se mantiene por parámetros (tono, emoción, energía y carácter)."}
          </span>
        </p>

        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2">
          {raw.voz && <BackToAuto deviceId={deviceId} personaId={personaId} system="voz" />}
          <span className="text-[10px] leading-snug text-[var(--aw-muted)]">
            La coherencia de persona se conserva en TODOS los motores (Adenda 112).
          </span>
        </div>
      </div>

      {/* Vía por DISPOSITIVO (todas las personalidades): tarjeta existente. */}
      <NeuronVoiceChoice compact />

      {/* Recomendador de motores de voz para este hardware (A138, kind="voz"). */}
      <Foldable icon={Sparkles} iconCls="text-fuchsia-300" title="Motores de voz recomendados para este dispositivo" defaultOpen={full}>
        <ModelScoutPanel kind="voz" personaId={personaId} deviceId={deviceId} />
      </Foldable>

      {/* Coherencia de persona y referencia de audio (A112). */}
      <Foldable icon={Wand2} iconCls="text-fuchsia-300" title="Coherencia de voz y persona" defaultOpen={full}>
        <PersonaCoherencePanel embedded />
      </Foldable>

      {full && (
        <div className="rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5">
          <p className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
            <Wand2 className="h-3.5 w-3.5 text-fuchsia-300" /> Panel completo de voz · OmniVoice
          </p>
          <SetupVoz />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════ Sección Cerebro ═══════════════════ */

/**
 * Cerebro — memorias de la personalidad en esta neurona: política de memoria
 * (usar memorias, nivel de contexto, cerebros permitidos), almacén local ⟷
 * servidores, y sincronización de cerebros de la cuenta con esta neurona.
 */
export function CerebroSection({ personaId, deviceId, caps, onDismiss, onNavigate }: SectionProps) {
  const resolved = useResolvedPersonaSystems(personaId, deviceId, caps);
  const [brains, setBrains] = useState<BrainRecord[]>([]);
  /** Filtro de texto de la lista de cerebros (solo cuando hay muchos). */
  const [brainQuery, setBrainQuery] = useState("");
  useEffect(() => {
    let alive = true;
    void listBrains().then((b) => { if (alive) setBrains(b); }).catch(() => { /* */ });
    return () => { alive = false; };
  }, []);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SectionSkeleton cards={[{ rows: 3 }, { rows: 2, value: false }]} />;
  const c = resolved.cerebro;
  const permitidos = c.cerebrosPermitidos;
  const casaos = (() => { try { return settingsFor(deviceId).casaos; } catch { return undefined; } })();

  const showBrainFilter = brains.length > 8;
  const q = brainQuery.trim().toLowerCase();
  const visibleBrains = showBrainFilter && q
    ? brains.filter((b) => (b.name ?? "").toLowerCase().includes(q))
    : brains;

  const toggleBrain = (id: string, name: string) => {
    // Solo ids de cerebros EXISTENTES: uno huérfano (borrado) no debe hacer
    // colapsar la lista a «todos» al alcanzar el conteo (rev. A149·B2).
    const existing = new Set(brains.map((b) => b.id));
    const cur = permitidos === "todos"
      ? brains.map((b) => b.id)
      : permitidos.filter((x) => existing.has(x));
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    const todos = next.length >= brains.length;
    applyOverride(
      deviceId, personaId, "cerebro",
      { cerebro: { cerebrosPermitidos: todos ? "todos" : next } },
      todos ? "Cerebros permitidos: todos." : `${next.includes(id) ? "Permitido" : "Excluido"}: ${name} (${next.length} de ${brains.length}).`,
    );
  };

  /** Ir al hub de Cerebro (callback dentro de /agent; si no, navegación real). */
  const cerebroHub = onNavigate
    ? (
      <button
        type="button"
        onClick={() => { onNavigate("cerebro"); onDismiss?.(); }}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-100 transition-colors hover:bg-violet-500/20"
      >
        <Plus className="h-3 w-3" aria-hidden="true" /> Crear cerebro
      </button>
    )
    : (
      <Link
        href="/agent?tab=cerebro"
        onClick={() => onDismiss?.()}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-100 transition-colors hover:bg-violet-500/20"
      >
        <Plus className="h-3 w-3" aria-hidden="true" /> Crear cerebro
      </Link>
    );

  return (
    <div className="space-y-3">
      <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5", rail(!!raw.cerebro, "cerebro"))}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
            <Brain className="h-3.5 w-3.5 text-violet-300" /> Memoria {personaId === ALL_PERSONAS ? "en esta neurona" : "de esta personalidad aquí"}
          </p>
          <ProvenanceChip p={c.provenance} />
        </div>

        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-[var(--aw-strong)]">Usar memorias y contexto</span>
            <span className="block text-[10px] leading-snug text-[var(--aw-muted)]">La personalidad recuerda y usa los cerebros de la cuenta.</span>
          </span>
          <Switch
            checked={c.usarMemorias}
            onCheckedChange={(v) => applyOverride(
              deviceId, personaId, "cerebro", { cerebro: { usarMemorias: v } },
              v ? "Usará memorias y contexto de los cerebros." : "No usará memorias ni contexto.",
            )}
            aria-label="Usar memorias y contexto en esta neurona"
          />
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[var(--aw-muted)]">Nivel de contexto:</span>
          {(["breve", "completo"] as const).map((n) => (
            <button key={n} type="button" aria-pressed={c.nivelContexto === n}
              onClick={() => applyOverride(
                deviceId, personaId, "cerebro", { cerebro: { nivelContexto: n } },
                `Nivel de contexto: ${n === "breve" ? "breve" : "completo"}.`,
              )}
              className={pill(c.nivelContexto === n, "violet")}>
              {n === "breve" ? "Breve" : "Completo"}
            </button>
          ))}
        </div>

        {/* Cerebros permitidos */}
        <div className="mt-2.5">
          <p className="text-[10px] text-[var(--aw-muted)]">Cerebros permitidos ({brains.length} en la cuenta):</p>
          {showBrainFilter && (
            <label className="mt-1 flex items-center gap-1.5 rounded-lg border border-[var(--aw-line)] bg-[var(--aw-field)] px-2 py-1 focus-within:border-violet-400/50">
              <Search className="h-3 w-3 shrink-0 text-[var(--aw-faint)]" aria-hidden="true" />
              <input
                type="search"
                value={brainQuery}
                onChange={(e) => setBrainQuery(e.target.value)}
                placeholder={`Filtrar entre ${brains.length} cerebros…`}
                aria-label="Filtrar cerebros por nombre"
                className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--aw-strong)] outline-none placeholder:text-[var(--aw-muted)]"
              />
            </label>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {brains.length > 0 && (
              <button type="button" aria-pressed={permitidos === "todos"}
                onClick={() => applyOverride(
                  deviceId, personaId, "cerebro", { cerebro: { cerebrosPermitidos: "todos" } },
                  "Cerebros permitidos: todos.",
                )}
                className={pill(permitidos === "todos", "violet")}>
                Todos
              </button>
            )}
            {visibleBrains.map((b) => {
              const on = permitidos === "todos" || permitidos.includes(b.id);
              return (
                <button key={b.id} type="button" aria-pressed={on} onClick={() => toggleBrain(b.id, b.name)} className={pill(on, "violet")} title={b.name}>
                  {b.name}
                </button>
              );
            })}
            {brains.length > 0 && visibleBrains.length === 0 && (
              <span className="text-[10px] text-[var(--aw-muted)]">Ningún cerebro coincide con «{brainQuery}».</span>
            )}
          </div>
          {brains.length === 0 && (
            <EmptyState
              className="mt-1.5 px-4 py-6 sm:px-5 sm:py-7"
              icon={Brain}
              title="Aún sin cerebros creados"
              description={<span className="text-[11px]">Un cerebro guarda memorias y conocimiento que esta personalidad puede usar aquí.</span>}
              action={cerebroHub}
            />
          )}
        </div>
        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2">
          {raw.cerebro && <BackToAuto deviceId={deviceId} personaId={personaId} system="cerebro" />}
        </div>
      </div>

      {/* Almacén y sincronización de la neurona */}
      <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5", rail(!!raw.cerebro?.almacen, "cerebro"))}>
        <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
          <HardDrive className="h-3.5 w-3.5 text-violet-300" /> Almacén de memorias en esta neurona
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {([["auto", "Automático"], ["local", "Local (este equipo)"], ["servidor", "Servidores"]] as const).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={c.almacen === v}
              onClick={() => applyOverride(
                deviceId, personaId, "cerebro", { cerebro: { almacen: v } },
                v === "local" ? "Destino de sincronización: solo este equipo."
                  : v === "servidor" ? "Destino de sincronización: servidores de los cerebros."
                    : "Destino de sincronización: automático (local primero, servidores de respaldo).",
              )}
              className={pill(c.almacen === v, "violet")}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-[var(--aw-muted)]">
          Decide el DESTINO de sincronización de las memorias (local ⟷ servidores): en «Local» la réplica se queda en
          este equipo; en «Servidores» se empuja a los servidores de los cerebros; en automático se usa lo local primero
          y los servidores como respaldo/replicación. La copia local nunca se borra.
        </p>
        <p className="mt-1 text-[10px] leading-snug text-[var(--aw-muted)]">
          {typeof caps?.storageQuotaGb === "number"
            ? `Almacenamiento del navegador: ${caps.storageUsedGb ?? 0} / ${caps.storageQuotaGb} GB.`
            : "Capacidad de almacenamiento local no detectada aún."}
          {casaos?.enabled && casaos.url ? " CasaOS conectado como servidor casero de esta neurona." : ""}
        </p>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-[var(--aw-strong)]">Sincronizar cerebros con esta neurona</span>
            <span className="block text-[10px] leading-snug text-[var(--aw-muted)]">Réplica de memorias de la cuenta en este dispositivo (ajuste de la neurona, igual que en el panel de Neuronas).</span>
          </span>
          <Switch
            checked={c.syncBrains}
            // ÚNICA fuente de verdad: el ajuste REAL de la neurona (rev. A149·M1) —
            // el mismo que editan Neuronas/NeuronServerConfig vía setNeuronSettings.
            onCheckedChange={(v) => {
              const prev = c.syncBrains;
              try { setNeuronSettings(deviceId, { syncBrains: v }); } catch { return; }
              undoToast(
                "Sincronización de cerebros",
                v ? "Esta neurona replicará las memorias de la cuenta." : "Esta neurona deja de replicar las memorias de la cuenta.",
                () => { try { setNeuronSettings(deviceId, { syncBrains: prev }); } catch { /* */ } },
              );
            }}
            aria-label="Sincronizar cerebros de la cuenta con esta neurona"
          />
        </label>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] leading-snug text-[var(--aw-muted)]">
          <Server className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Cerebros y servidores completos:</span>
          {cerebroHubLink({ onNavigate, onDismiss })}
          <CrossNav href="/servidores" label="Servidores" onDismiss={onDismiss} />
        </p>
      </div>
    </div>
  );
}

/** Enlace/botón al hub de Cerebro (callback dentro de /agent; si no, ruta real). */
function cerebroHubLink({ onNavigate, onDismiss }: { onNavigate?: (tab: string) => void; onDismiss?: () => void }) {
  const cls = "inline-flex cursor-pointer items-center gap-1 rounded-md border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2 py-0.5 text-[10px] text-[var(--aw-text)] transition-colors hover:border-violet-400/40 hover:text-violet-200";
  if (onNavigate) {
    return (
      <button type="button" onClick={() => { onNavigate("cerebro"); onDismiss?.(); }} className={cls}>
        Cerebro <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </button>
    );
  }
  return (
    <Link href="/agent?tab=cerebro" onClick={() => onDismiss?.()} className={cls}>
      Cerebro <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );
}

/* ═══════════════════ Sección Señales ═══════════════════ */

const ANTENNA_ICON: Record<NeuronAntenna["id"], LucideIcon> = {
  wifi: Wifi, bluetooth: Bluetooth, serial: Usb, lora: Radio, daemon: RadioTower,
};

const RUTA_LABEL: Record<AntennaRouteMode, string> = {
  auto: "Auto (política sináptica)",
  privada: "Privada (P2P directa)",
  mesh: "Malla local",
  servidor: "Servidor / relé",
};

/** Estado de la antena SIEMPRE legible (nunca solo color — DESIGN_RULES §3). */
const AVAIL_META: Record<NeuronAntenna["availability"], { label: string; dot: string; text: string; ring: string }> = {
  active: { label: "activa", dot: "bg-emerald-400", text: "text-emerald-300/90", ring: "border-emerald-400/70" },
  available: { label: "disponible", dot: "bg-cyan-400", text: "text-cyan-300/85", ring: "border-cyan-400/70" },
  off: { label: "apagada", dot: "bg-[var(--aw-faint)]", text: "text-[var(--aw-muted)]", ring: "border-[var(--aw-faint)]" },
  unsupported: { label: "no soportada", dot: "bg-rose-400/70", text: "text-rose-300/85", ring: "border-rose-400/60" },
};

/**
 * Señales — antenas del dispositivo al servicio de la personalidad en esta
 * neurona: disponibilidad honesta, entrada/salida y ruta preferida por antena
 * (la política de la red sináptica de la Adenda 99 decide en «auto»).
 */
export function SenalesSection({ personaId, deviceId, onDismiss }: SectionProps) {
  const resolved = useResolvedPersonaSystems(personaId, deviceId);
  const [antennas, setAntennas] = useState<NeuronAntenna[]>([]);
  useEffect(() => {
    try { setAntennas(detectAntennas()); } catch { /* */ }
  }, []);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SectionSkeleton cards={[{ rows: 5, value: false }, { rows: 0, value: false }]} />;

  const setRule = (
    id: string,
    patch: { enabled?: boolean; entrada?: boolean; salida?: boolean; ruta?: AntennaRouteMode },
    description: string,
  ) => {
    applyOverride(
      deviceId, personaId, "senales",
      { senales: { porAntena: { [id]: { ...(raw.senales?.porAntena?.[id] ?? {}), ...patch } } } },
      description,
    );
  };

  const conn = resolved.senales.connectivity;

  return (
    <div className="space-y-3">
      <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5", rail(!!raw.senales, "senales"))}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
            <RadioTower className="h-3.5 w-3.5 text-emerald-300" /> Antenas de esta neurona
          </p>
          <ProvenanceChip p={resolved.senales.provenance} />
        </div>
        <p className="mt-1 text-[10px] leading-snug text-[var(--aw-muted)]">
          Todas activadas por defecto con ruta automática: la política sináptica elige P2P privado, malla local o relé
          cifrado según destino y privacidad. Entrada/salida y ruta deciden qué entra y qué sale por cada antena
          {personaId === ALL_PERSONAS ? " para toda la neurona." : " para esta personalidad."}
        </p>

        <ul className="mt-2 space-y-1.5">
          {antennas.map((a) => {
            const rule = resolved.senales.porAntena[a.id] ?? { enabled: true, entrada: true, salida: true, ruta: "auto" as const };
            const Icon = ANTENNA_ICON[a.id] ?? RadioTower;
            const unavailable = a.availability === "unsupported";
            const st = AVAIL_META[a.availability] ?? AVAIL_META.off;
            return (
              <li key={a.id} className={cn("rounded-lg border border-[var(--aw-line)] bg-[var(--aw-surface-2)] px-2.5 py-2", unavailable && "opacity-60")}>
                {/* Fila principal envuelta en <label>: toda ella activa el switch. */}
                <label className="flex cursor-pointer flex-wrap items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-300/90" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-[var(--aw-strong)]">
                      {a.label}
                      {/* Punto + micro-etiqueta textual (nunca solo color) y latido si está activa. */}
                      <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
                        <span className={cn("absolute inset-0 rounded-full", st.dot)} />
                        {a.availability === "active" && (
                          <span className={cn("ss-signal-ping absolute inset-0 rounded-full border", st.ring)} />
                        )}
                      </span>
                      <span className={cn("text-[10px] font-medium", st.text)}>{st.label}</span>
                    </span>
                    <span className="block truncate text-[10px] text-[var(--aw-muted)]">{a.detail}</span>
                  </span>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) => setRule(a.id, { enabled: v }, `${a.label}: ${v ? "activada" : "desactivada"} para esta personalidad.`)}
                    aria-label={`Antena ${a.label} activada`}
                  />
                </label>
                <div className={cn("mt-1.5 flex flex-wrap items-center gap-1.5", !rule.enabled && "pointer-events-none opacity-40")}>
                  <button type="button" onClick={() => setRule(a.id, { entrada: !rule.entrada }, `${a.label}: entrada ${!rule.entrada ? "permitida" : "cerrada"}.`)}
                    className={cn(pill(rule.entrada, "emerald"), "inline-flex items-center gap-1")}
                    aria-pressed={rule.entrada} aria-label={`Entrada por ${a.label}`}>
                    <ArrowDownToLine className="h-3 w-3" /> Entrada
                  </button>
                  <button type="button" onClick={() => setRule(a.id, { salida: !rule.salida }, `${a.label}: salida ${!rule.salida ? "permitida" : "cerrada"}.`)}
                    className={cn(pill(rule.salida, "emerald"), "inline-flex items-center gap-1")}
                    aria-pressed={rule.salida} aria-label={`Salida por ${a.label}`}>
                    <ArrowUpFromLine className="h-3 w-3" /> Salida
                  </button>
                  <SelectWrap className="ml-auto w-auto">
                    <select
                      value={rule.ruta}
                      onChange={(e) => {
                        const r = e.target.value as AntennaRouteMode;
                        setRule(a.id, { ruta: r }, `${a.label}: ruta ${RUTA_LABEL[r].toLowerCase()}.`);
                      }}
                      className="block cursor-pointer appearance-none rounded-lg border border-[var(--aw-line)] bg-[var(--aw-field)] py-1 pl-2 pr-7 text-[11px] text-[var(--aw-strong)] outline-none transition-colors focus:border-emerald-400/50"
                      aria-label={`Ruta preferida de ${a.label}`}
                    >
                      {a.rutas.map((r) => (
                        <option key={r} value={r}>{RUTA_LABEL[r]}</option>
                      ))}
                    </select>
                  </SelectWrap>
                </div>
              </li>
            );
          })}
          {antennas.length === 0 && <li className="text-[10px] text-[var(--aw-muted)]">Detectando antenas…</li>}
        </ul>
        <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2">
          {raw.senales && <BackToAuto deviceId={deviceId} personaId={personaId} system="senales" />}
          <span className="text-[10px] leading-snug text-[var(--aw-muted)]">
            Una antena en gris no está apagada por ti: este dispositivo o navegador no la expone.
          </span>
        </div>
      </div>

      {/* Resumen de conectividad heredada (malla/internet/servidor) */}
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] px-3 py-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
          <Cpu className="h-3.5 w-3.5 text-emerald-300" /> Conectividad {personaId === ALL_PERSONAS ? "de la neurona" : "que hereda esta personalidad"}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--aw-muted)]">
          Malla {conn.meshEnabled ? "activa" : "apagada"} · internet {conn.internetMode}
          {conn.publicInternet ? " · internet público ON" : ""} · servidor «{conn.serverId}» · radar {conn.publicRadar}.
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] leading-snug text-[var(--aw-muted)]">
          <span>Control total de la conectividad:</span>
          <CrossNav href="/senales" label="Señales" onDismiss={onDismiss} className="hover:border-emerald-400/40 hover:text-emerald-200" />
          <CrossNav href="/red-mesh" label="Red mesh" onDismiss={onDismiss} className="hover:border-emerald-400/40 hover:text-emerald-200" />
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════ Tarjeta Astraura por personalidad ═══════════════════ */

/**
 * Sistema Astraura de la personalidad seleccionada EN ESTA neurona (SOP §4 ·
 * rev. A149·M3): modo Automático/Fija y permiso de fuentes de PAGO, con
 * procedencia y «volver a auto». Complementa (no sustituye) el orden de clases
 * cuenta⟷neurona que vive en la misma pestaña.
 */
export function AstrauraPersonaCard({ personaId, deviceId, caps }: SectionProps) {
  const resolved = useResolvedPersonaSystems(personaId, deviceId, caps);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SystemCardSkeleton rows={2} value={false} />;
  const a = resolved.astraura;
  const esTodas = personaId === ALL_PERSONAS;

  return (
    <div className={cn("rounded-xl border border-[var(--aw-line)] bg-[var(--aw-surface)] px-3 py-2.5", rail(!!raw.astraura, "astraura"))}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong)]">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Sistema Astraura {esTodas ? "de esta neurona" : "de esta personalidad aquí"}
        </p>
        <ProvenanceChip p={a.provenance} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-[var(--aw-muted)]">Modo de inteligencia:</span>
        {([["auto", "Automático (gratis-primero)"], ["fija", "Fija (respeta pines)"]] as const).map(([v, label]) => (
          <button key={v} type="button" aria-pressed={a.modo === v}
            onClick={() => applyOverride(
              deviceId, personaId, "astraura", { astraura: { modo: v } },
              v === "auto" ? "Modo automático: siempre la mejor opción gratuita disponible." : "Modo fijo: respeta tus pines antes que el automático.",
            )}
            className={pill(a.modo === v, "amber")}>
            {label}
          </button>
        ))}
      </div>
      <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[12px] font-medium text-[var(--aw-strong)]">Permitir fuentes de pago</span>
          <span className="block text-[10px] leading-snug text-[var(--aw-muted)]">
            Solo si tú ya configuraste claves de pago; por defecto {esTodas ? "ninguna personalidad" : "esta personalidad no"} gasta
            dinero sin permiso explícito. Siempre respeta el filtro global de pago de la cuenta: puede restringir más, nunca
            aflojar el límite que hayas puesto en la cuenta.
          </span>
        </span>
        <Switch
          checked={a.permitirPago}
          onCheckedChange={(v) => applyOverride(
            deviceId, personaId, "astraura", { astraura: { permitirPago: v } },
            v ? "Podrá usar fuentes de pago (dentro del límite de la cuenta)." : "No usará fuentes de pago.",
          )}
          aria-label="Permitir fuentes de pago a esta personalidad en esta neurona"
        />
      </label>
      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-2">
        {raw.astraura && <BackToAuto deviceId={deviceId} personaId={personaId} system="astraura" />}
        <span className="text-[10px] text-[var(--aw-muted)]">
          El orden de clases de acceso (abajo) sigue siendo por cuenta⟷neurona; el modo y el pago son por personalidad.
        </span>
      </div>
    </div>
  );
}
