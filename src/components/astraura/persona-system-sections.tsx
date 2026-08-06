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

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Sparkles, Bot, Brain, BookOpen, GraduationCap, Wand2, Star, Heart, Moon, Sun,
  Flame, Music, Shield, Zap, Cpu, Undo2, Loader2, Volume2, HardDrive, Server,
  RadioTower, Wifi, Bluetooth, Usb, Radio, ArrowDownToLine, ArrowUpFromLine,
  ExternalLink, Users, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { type NeuronCapabilities, settingsFor, setNeuronSettings, NEURON_EVENT } from "@/lib/neurons/neurons";
import { listBrains, type Brain as BrainRecord } from "@/lib/brains/brains";
import { freeSources } from "@/ai/astraura/free-catalog";
import { listVoiceEngines, type VoiceEngineStatus } from "@/lib/aurora/tts-oss/engine-registry";
import {
  ALL_PERSONAS, PROVENANCE_LABEL, clearOverrides, detectAntennas, getRawOverrides,
  personaChips, resolvePersonaSystems, saveOverrides, subscribeNeuronPersona,
  type AntennaRouteMode, type NeuronAntenna, type PersonaChip, type Provenance,
  type ResolvedPersonaSystems,
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
const SetupVoz = dynamic(() => import("@/components/aurora/setup/setup-voz"), {
  ssr: false,
  loading: () => <SectionSpin />,
});

function SectionSpin() {
  return (
    <p className="flex items-center justify-center gap-2 px-2 py-6 text-[11px] text-white/40">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
    </p>
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

function pill(active: boolean, tone: "cyan" | "violet" | "emerald" | "amber" | "fuchsia" = "cyan"): string {
  const tones: Record<string, string> = {
    cyan: "border-cyan-400/40 bg-cyan-500/15 text-cyan-100",
    violet: "border-violet-400/40 bg-violet-500/15 text-violet-100",
    emerald: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
    amber: "border-amber-400/40 bg-amber-500/15 text-amber-100",
    fuchsia: "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100",
  };
  return cn(
    "cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    active ? tones[tone] : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25",
  );
}

/** Chip pequeño de procedencia del valor efectivo. */
export function ProvenanceChip({ p }: { p: Provenance }) {
  const tone =
    p === "neurona" ? "border-violet-400/30 bg-violet-500/10 text-violet-200"
      : p === "personalidad" ? "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200"
        : p === "cuenta" ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-200"
          : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[9px] font-medium", tone)}>
      {PROVENANCE_LABEL[p]}
    </span>
  );
}

/** Botón «Volver a auto» (borra el override de un sistema para esta persona). */
function BackToAuto({ deviceId, personaId, system }: { deviceId: string; personaId: string; system: "llm" | "astraura" | "voz" | "cerebro" | "senales" }) {
  return (
    <button
      type="button"
      onClick={() => clearOverrides(deviceId, personaId, system)}
      className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:border-emerald-400/40 hover:text-emerald-200"
      title="Quitar el ajuste propio y volver a la selección automática"
    >
      <Undo2 className="h-3 w-3" /> Volver a auto
    </button>
  );
}

/** Hook: resolución viva de los sistemas de la persona en esta neurona.
 *  Escucha el store A149 Y el evento de neuronas (ajustes reales tipo
 *  `syncBrains` viven en `starseed.neurons.prefs.v1` — rev. A149·M1). */
function useResolved(personaId: string, deviceId: string, caps?: NeuronCapabilities | null) {
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
}

/**
 * Fila de chips: «Todas» (defaults de la neurona) + cada personalidad de la
 * cuenta (activa primero; Aurora y Hermione vienen de los presets integrados).
 * Lo editado en cada sección aplica a la personalidad seleccionada.
 */
export function PersonaSelector({ value, onChange, compact = false }: PersonaSelectorProps) {
  const [chips, setChips] = useState<PersonaChip[]>([]);
  useEffect(() => {
    try { setChips(personaChips()); } catch { /* */ }
  }, []);
  return (
    <div className={cn("flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5", compact ? "mt-2" : "mt-2.5")} role="tablist" aria-label="Personalidad a configurar en esta neurona">
      <button
        type="button"
        role="tab"
        aria-selected={value === ALL_PERSONAS}
        onClick={() => onChange(ALL_PERSONAS)}
        className={cn("inline-flex shrink-0 items-center gap-1", pill(value === ALL_PERSONAS, "emerald"))}
      >
        <Users className="h-3 w-3" /> Todas
      </button>
      {chips.map((c) => {
        const Icon = personaIcon(c.icon);
        return (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={value === c.id}
            onClick={() => onChange(c.id)}
            className={cn("inline-flex shrink-0 items-center gap-1", pill(value === c.id, "fuchsia"))}
            title={c.active ? `${c.name} (personalidad activa)` : c.name}
          >
            <Icon className="h-3 w-3" /> {c.name}
            {c.active && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />}
          </button>
        );
      })}
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
}

/**
 * LLM — modelo de lenguaje usado por la personalidad seleccionada EN ESTA
 * neurona: efectivo + procedencia, pin fuente/modelo (catálogo gratis-primero)
 * y recomendación inteligente del scout (Adenda 138).
 */
export function LlmSection({ personaId, deviceId, caps, full = false }: SectionProps) {
  const resolved = useResolved(personaId, deviceId, caps);
  const sources = useMemo(() => { try { return freeSources(); } catch { return []; } }, []);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // getRawOverrides es lectura pura de localStorage; se refresca con `resolved`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);

  const fuente = raw.llm?.fuente ?? "";
  const modelos = useMemo(() => sources.find((s) => s.id === fuente)?.models ?? [], [sources, fuente]);
  if (!resolved) return <SectionSpin />;
  const esTodas = personaId === ALL_PERSONAS;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
            <Brain className="h-3.5 w-3.5 text-cyan-300" /> Modelo LLM {esTodas ? "de esta neurona" : "de esta personalidad aquí"}
          </p>
          <ProvenanceChip p={resolved.llm.provenance} />
        </div>
        <p className="mt-1 text-[12px] font-medium text-white/90">{resolved.llm.label}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-white/45">
          En automático, Astraura elige siempre la mejor opción gratuita disponible y cambia sola de fuente si una se
          agota. Un pin va primero en la cadena pero nunca es exclusivo: sin disponibilidad, se cae al siguiente.
        </p>

        {/* Editor del pin fuente/modelo para ESTA neurona */}
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <label className="min-w-0 text-[10px] text-white/55">
            Fuente
            <select
              value={fuente}
              onChange={(e) => {
                const f = e.target.value;
                if (!f) clearOverrides(deviceId, personaId, "llm");
                else saveOverrides(deviceId, personaId, { llm: { fuente: f, modelo: undefined } });
              }}
              className="mt-0.5 w-full cursor-pointer rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/85 outline-none transition-colors focus:border-cyan-400/50"
            >
              <option value="">Automática (gratis-primero)</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.label} · {s.privacy === "local" ? "local" : "nube"}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[10px] text-white/55">
            Modelo
            <select
              value={raw.llm?.modelo ?? ""}
              disabled={!fuente}
              onChange={(e) => saveOverrides(deviceId, personaId, { llm: { fuente, modelo: e.target.value || undefined } })}
              className="mt-0.5 w-full cursor-pointer rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/85 outline-none transition-colors focus:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">El mejor de la fuente</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {raw.llm && <BackToAuto deviceId={deviceId} personaId={personaId} system="llm" />}
          <span className="text-[10px] text-white/35">
            {esTodas ? "Aplica a toda personalidad sin pin propio en esta neurona." : "Solo para esta personalidad en esta neurona; sus pines por sentido siguen en su editor de personalidad."}
          </span>
        </div>
      </div>

      {/* Recomendación inteligente según el hardware real (Adenda 138). */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-white/85">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300" /> Recomendado para este dispositivo
        </p>
        <ModelScoutPanel kind="llm" />
      </div>

      {full && (
        <p className="px-0.5 text-[10px] leading-snug text-white/35">
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
  const resolved = useResolved(personaId, deviceId);
  const [engines, setEngines] = useState<VoiceEngineStatus[]>([]);
  useEffect(() => {
    try { setEngines(listVoiceEngines()); } catch { /* */ }
  }, [resolved]);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SectionSpin />;

  const motorPin = raw.voz?.motor ?? "";
  const viaPin = raw.voz?.modo ?? "";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
            <Volume2 className="h-3.5 w-3.5 text-fuchsia-300" /> Motor de voz {personaId === ALL_PERSONAS ? "de esta neurona" : "de esta personalidad aquí"}
          </p>
          <ProvenanceChip p={resolved.voz.provenance} />
        </div>
        <p className="mt-1 text-[12px] font-medium text-white/90">
          {engines.find((e) => e.meta.id === resolved.voz.motor)?.meta.label ?? resolved.voz.motor}
        </p>
        <label className="mt-2 block text-[10px] text-white/55">
          Elegir motor en esta neurona
          <select
            value={motorPin}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) clearOverrides(deviceId, personaId, "voz");
              else saveOverrides(deviceId, personaId, { voz: { motor: v } });
            }}
            className="mt-0.5 w-full cursor-pointer rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11px] text-white/85 outline-none transition-colors focus:border-fuchsia-400/50"
          >
            <option value="">Automático (cadena de voz: nunca se queda muda)</option>
            {engines.map((e) => (
              <option key={e.meta.id} value={e.meta.id}>
                {e.meta.label} · {e.availability === "ready" ? "listo" : e.availability === "configured" ? "configurado" : "requiere preparación"}
                {e.recommended ? " · recomendado" : ""}
              </option>
            ))}
          </select>
        </label>

        {/* Vía preferida de la voz PARA ESTA PERSONALIDAD en esta neurona */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-white/55">Vía preferida:</span>
          {([["", "Auto"], ["cloud", "Nube gratis"], ["local", "Motor local"]] as const).map(([v, label]) => (
            <button
              key={v || "auto"}
              type="button"
              onClick={() => {
                if (!v) { if (raw.voz?.modo) saveOverrides(deviceId, personaId, { voz: { modo: undefined } }); }
                else saveOverrides(deviceId, personaId, { voz: { modo: v } });
              }}
              className={pill(viaPin === v, "fuchsia")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {raw.voz && <BackToAuto deviceId={deviceId} personaId={personaId} system="voz" />}
          <span className="text-[10px] leading-snug text-white/35">
            La coherencia de persona (tono, emoción, energía y carácter) se conserva en todos los motores; la referencia
            de audio, donde el motor sabe clonar (Adenda 112).
          </span>
        </div>
      </div>

      {/* Vía por DISPOSITIVO (todas las personalidades): tarjeta existente. */}
      <NeuronVoiceChoice compact />

      {full && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
          <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-white/85">
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
export function CerebroSection({ personaId, deviceId, caps, full = false }: SectionProps) {
  const resolved = useResolved(personaId, deviceId, caps);
  const [brains, setBrains] = useState<BrainRecord[]>([]);
  useEffect(() => {
    let alive = true;
    void listBrains().then((b) => { if (alive) setBrains(b); }).catch(() => { /* */ });
    return () => { alive = false; };
  }, []);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SectionSpin />;
  const c = resolved.cerebro;
  const permitidos = c.cerebrosPermitidos;
  const casaos = (() => { try { return settingsFor(deviceId).casaos; } catch { return undefined; } })();

  const toggleBrain = (id: string) => {
    // Solo ids de cerebros EXISTENTES: uno huérfano (borrado) no debe hacer
    // colapsar la lista a «todos» al alcanzar el conteo (rev. A149·B2).
    const existing = new Set(brains.map((b) => b.id));
    const cur = permitidos === "todos"
      ? brains.map((b) => b.id)
      : permitidos.filter((x) => existing.has(x));
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    saveOverrides(deviceId, personaId, {
      cerebro: { cerebrosPermitidos: next.length >= brains.length ? "todos" : next },
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
            <Brain className="h-3.5 w-3.5 text-violet-300" /> Memoria {personaId === ALL_PERSONAS ? "en esta neurona" : "de esta personalidad aquí"}
          </p>
          <ProvenanceChip p={c.provenance} />
        </div>

        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-white/90">Usar memorias y contexto</span>
            <span className="block text-[10px] leading-snug text-white/45">La personalidad recuerda y usa los cerebros de la cuenta.</span>
          </span>
          <Switch
            checked={c.usarMemorias}
            onCheckedChange={(v) => saveOverrides(deviceId, personaId, { cerebro: { usarMemorias: v } })}
            aria-label="Usar memorias y contexto en esta neurona"
          />
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-white/55">Nivel de contexto:</span>
          {(["breve", "completo"] as const).map((n) => (
            <button key={n} type="button" onClick={() => saveOverrides(deviceId, personaId, { cerebro: { nivelContexto: n } })}
              className={pill(c.nivelContexto === n, "violet")}>
              {n === "breve" ? "Breve" : "Completo"}
            </button>
          ))}
        </div>

        {/* Cerebros permitidos */}
        <div className="mt-2.5">
          <p className="text-[10px] text-white/55">Cerebros permitidos ({brains.length} en la cuenta):</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => saveOverrides(deviceId, personaId, { cerebro: { cerebrosPermitidos: "todos" } })}
              className={pill(permitidos === "todos", "violet")}>
              Todos
            </button>
            {brains.map((b) => {
              const on = permitidos === "todos" || permitidos.includes(b.id);
              return (
                <button key={b.id} type="button" onClick={() => toggleBrain(b.id)} className={pill(on, "violet")} title={b.name}>
                  {b.name}
                </button>
              );
            })}
            {brains.length === 0 && <span className="text-[10px] text-white/35">Aún sin cerebros creados.</span>}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {raw.cerebro && <BackToAuto deviceId={deviceId} personaId={personaId} system="cerebro" />}
        </div>
      </div>

      {/* Almacén y sincronización de la neurona */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
          <HardDrive className="h-3.5 w-3.5 text-violet-300" /> Almacén de memorias en esta neurona
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {([["auto", "Automático"], ["local", "Local (este equipo)"], ["servidor", "Servidores"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => saveOverrides(deviceId, personaId, { cerebro: { almacen: v } })}
              className={pill(c.almacen === v, "violet")}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-white/45">
          {typeof caps?.storageQuotaGb === "number"
            ? `Almacenamiento del navegador: ${caps.storageUsedGb ?? 0} / ${caps.storageQuotaGb} GB.`
            : "Capacidad de almacenamiento local no detectada aún."}
          {casaos?.enabled && casaos.url ? " CasaOS conectado como servidor casero de esta neurona." : ""}
          {" "}En automático se usa lo local primero y los servidores de los cerebros como respaldo/replicación.
        </p>
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-white/90">Sincronizar cerebros con esta neurona</span>
            <span className="block text-[10px] leading-snug text-white/45">Réplica de memorias de la cuenta en este dispositivo (ajuste de la neurona, igual que en el panel de Neuronas).</span>
          </span>
          <Switch
            checked={c.syncBrains}
            // ÚNICA fuente de verdad: el ajuste REAL de la neurona (rev. A149·M1) —
            // el mismo que editan Neuronas/NeuronServerConfig vía setNeuronSettings.
            onCheckedChange={(v) => setNeuronSettings(deviceId, { syncBrains: v })}
            aria-label="Sincronizar cerebros de la cuenta con esta neurona"
          />
        </label>
        {full && (
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-white/40">
            <Server className="h-3 w-3" /> Cerebros y servidores completos: pestaña Cerebro de Astraura IA y /servidores.
          </p>
        )}
      </div>
    </div>
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

/**
 * Señales — antenas del dispositivo al servicio de la personalidad en esta
 * neurona: disponibilidad honesta, entrada/salida y ruta preferida por antena
 * (la política de la red sináptica de la Adenda 99 decide en «auto»).
 */
export function SenalesSection({ personaId, deviceId, full = false }: SectionProps) {
  const resolved = useResolved(personaId, deviceId);
  const [antennas, setAntennas] = useState<NeuronAntenna[]>([]);
  useEffect(() => {
    try { setAntennas(detectAntennas()); } catch { /* */ }
  }, []);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SectionSpin />;

  const setRule = (id: string, patch: { enabled?: boolean; entrada?: boolean; salida?: boolean; ruta?: AntennaRouteMode }) => {
    saveOverrides(deviceId, personaId, { senales: { porAntena: { [id]: { ...(raw.senales?.porAntena?.[id] ?? {}), ...patch } } } });
  };

  const conn = resolved.senales.connectivity;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
            <RadioTower className="h-3.5 w-3.5 text-emerald-300" /> Antenas de esta neurona
          </p>
          <ProvenanceChip p={resolved.senales.provenance} />
        </div>
        <p className="mt-1 text-[10px] leading-snug text-white/45">
          Todas activadas por defecto con ruta automática: la política sináptica elige P2P privado, malla local o relé
          cifrado según destino y privacidad. Ajusta entrada/salida y ruta por antena
          {personaId === ALL_PERSONAS ? " para toda la neurona." : " solo para esta personalidad."}
        </p>

        <ul className="mt-2 space-y-1.5">
          {antennas.map((a) => {
            const rule = resolved.senales.porAntena[a.id] ?? { enabled: true, entrada: true, salida: true, ruta: "auto" as const };
            const Icon = ANTENNA_ICON[a.id] ?? RadioTower;
            const unavailable = a.availability === "unsupported";
            return (
              <li key={a.id} className={cn("rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2", unavailable && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-emerald-300/90" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/90">
                      {a.label}
                      <span className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        a.availability === "active" ? "bg-emerald-400" : a.availability === "available" ? "bg-cyan-400" : a.availability === "off" ? "bg-white/25" : "bg-rose-400/70",
                      )} aria-hidden="true" />
                    </span>
                    <span className="block truncate text-[10px] text-white/45">{a.detail}</span>
                  </span>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(v) => setRule(a.id, { enabled: v })}
                    aria-label={`Antena ${a.label} activada`}
                  />
                </div>
                <div className={cn("mt-1.5 flex flex-wrap items-center gap-1.5", !rule.enabled && "pointer-events-none opacity-40")}>
                  <button type="button" onClick={() => setRule(a.id, { entrada: !rule.entrada })}
                    className={cn(pill(rule.entrada, "emerald"), "inline-flex items-center gap-1")}
                    aria-pressed={rule.entrada} aria-label={`Entrada por ${a.label}`}>
                    <ArrowDownToLine className="h-3 w-3" /> Entrada
                  </button>
                  <button type="button" onClick={() => setRule(a.id, { salida: !rule.salida })}
                    className={cn(pill(rule.salida, "emerald"), "inline-flex items-center gap-1")}
                    aria-pressed={rule.salida} aria-label={`Salida por ${a.label}`}>
                    <ArrowUpFromLine className="h-3 w-3" /> Salida
                  </button>
                  <select
                    value={rule.ruta}
                    onChange={(e) => setRule(a.id, { ruta: e.target.value as AntennaRouteMode })}
                    className="ml-auto cursor-pointer rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-white/80 outline-none transition-colors focus:border-emerald-400/50"
                    aria-label={`Ruta preferida de ${a.label}`}
                  >
                    {a.rutas.map((r) => (
                      <option key={r} value={r}>{RUTA_LABEL[r]}</option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
          {antennas.length === 0 && <li className="text-[10px] text-white/35">Detectando antenas…</li>}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {raw.senales && <BackToAuto deviceId={deviceId} personaId={personaId} system="senales" />}
        </div>
      </div>

      {/* Resumen de conectividad heredada (malla/internet/servidor) */}
      <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] px-3 py-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
          <Cpu className="h-3.5 w-3.5 text-emerald-300" /> Conectividad {personaId === ALL_PERSONAS ? "de la neurona" : "que hereda esta personalidad"}
        </p>
        <p className="mt-0.5 text-[10px] leading-snug text-white/55">
          Malla {conn.meshEnabled ? "activa" : "apagada"} · internet {conn.internetMode}
          {conn.publicInternet ? " · internet público ON" : ""} · servidor «{conn.serverId}» · radar {conn.publicRadar}.
        </p>
        {full && (
          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-white/40">
            <ExternalLink className="h-3 w-3" /> Control total en /senales, /red-mesh y el Centro de Conexiones (borde ámbar).
          </p>
        )}
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
  const resolved = useResolved(personaId, deviceId, caps);
  const raw = useMemo(() => {
    try { return getRawOverrides(deviceId, personaId); } catch { return {}; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, personaId, resolved]);
  if (!resolved) return <SectionSpin />;
  const a = resolved.astraura;
  const esTodas = personaId === ALL_PERSONAS;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Sistema Astraura {esTodas ? "de esta neurona" : "de esta personalidad aquí"}
        </p>
        <ProvenanceChip p={a.provenance} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-white/55">Modo de inteligencia:</span>
        {([["auto", "Automático (gratis-primero)"], ["fija", "Fija (respeta pines)"]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => saveOverrides(deviceId, personaId, { astraura: { modo: v } })}
            className={pill(a.modo === v, "amber")}>
            {label}
          </button>
        ))}
      </div>
      <label className="mt-2 flex cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-[12px] font-medium text-white/90">Permitir fuentes de pago</span>
          <span className="block text-[10px] leading-snug text-white/45">
            Solo si tú ya configuraste claves de pago; por defecto {esTodas ? "ninguna personalidad" : "esta personalidad no"} gasta
            dinero sin permiso explícito. Siempre respeta el filtro global de pago de la cuenta.
          </span>
        </span>
        <Switch
          checked={a.permitirPago}
          onCheckedChange={(v) => saveOverrides(deviceId, personaId, { astraura: { permitirPago: v } })}
          aria-label="Permitir fuentes de pago a esta personalidad en esta neurona"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {raw.astraura && <BackToAuto deviceId={deviceId} personaId={personaId} system="astraura" />}
        <span className="text-[10px] text-white/35">
          El orden de clases de acceso (abajo) sigue siendo por cuenta⟷neurona; el modo y el pago son por personalidad.
        </span>
      </div>
    </div>
  );
}
