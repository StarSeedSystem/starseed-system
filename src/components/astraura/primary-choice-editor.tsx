"use client";

/**
 * Editor del SISTEMA PRIMARIO de inteligencia para un ámbito (Adenda 153).
 * ----------------------------------------------------------------------------
 * Reutilizado por: la tarjeta «Sistema primario» de la pestaña LLM (ventana
 * A149), el panel «Astraura 1.58» (cuenta / neurona) y la configuración de
 * agentes (`AgentConfigPanel`). SOP: architecture/astraura-158-sistema-primario.md §3/§7.
 *
 * Tres opciones: Astraura 1.58-bit (defecto) · Automático (gratis-primero
 * clásico) · Fuente concreta (fuente + modelo del catálogo) + «exclusivo».
 * Guarda al instante con `setPrimaryChoice`; «Heredar» borra el ajuste propio
 * del ámbito (vuelve al ámbito superior). Sin `window` pinta defaults.
 */

import { useEffect, useMemo, useState } from "react";
import { Binary, Cpu, Wand2, Layers, Undo2, ShieldAlert, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { freeSources, type CatalogSource } from "@/ai/astraura/free-catalog";
import { ASTRAURA_158_PERSONAS, ASTRAURA_158_MODEL_PREFIX } from "@/ai/providers/astraura-158";
import {
  PRIMARY_PROVENANCE_LABEL, describePrimaryChoice, getPrimaryChoice, resolvePrimarySystem,
  setPrimaryChoice, subscribePrimarySystem,
  type PrimaryChoice, type PrimaryMode, type PrimaryScope, type ResolvedPrimary,
} from "@/lib/astraura/primary-system";

export interface PrimaryChoiceEditorProps {
  /** Ámbito que se edita. */
  scope: PrimaryScope;
  /** Id del ámbito (deviceId / brainId / agentId / personaId). `cuenta` no lo usa. */
  scopeId?: string | null;
  /** Contexto para mostrar el valor EFECTIVO (herencia). */
  context?: { deviceId?: string | null; personaId?: string | null; agentId?: string | null; brainId?: string | null };
  compact?: boolean;
  className?: string;
  /** Etiqueta del ámbito en los textos («esta neurona», «este agente»…). */
  scopeLabel?: string;
}

const MODE_META: Record<PrimaryMode, { label: string; hint: string; icon: LucideIcon; tone: string }> = {
  "astraura-158": {
    label: "Astraura 1.58-bit",
    hint: "Tu backend soberano va primero; si no responde, siguen los secundarios.",
    icon: Binary,
    tone: "border-cyan-400/40 bg-cyan-500/15 text-cyan-100 shadow-[0_0_10px_-3px_rgb(34_211_238)]",
  },
  auto: {
    label: "Automático",
    hint: "Gratis-primero clásico: Astraura elige la mejor fuente disponible.",
    icon: Wand2,
    tone: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100 shadow-[0_0_10px_-3px_rgb(52_211_153)]",
  },
  fuente: {
    label: "Fuente concreta",
    hint: "Una fuente/modelo del catálogo va primero (no exclusiva salvo que lo marques).",
    icon: Layers,
    tone: "border-violet-400/40 bg-violet-500/15 text-violet-100 shadow-[0_0_10px_-3px_rgb(167_139_250)]",
  },
};

function useStoreTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribePrimarySystem(() => setTick((t) => t + 1)), []);
  return tick;
}

export function PrimaryChoiceEditor({ scope, scopeId, context, compact = false, className, scopeLabel }: PrimaryChoiceEditorProps) {
  const tick = useStoreTick();
  const sources = useMemo<CatalogSource[]>(() => { try { return freeSources(); } catch { return []; } }, []);
  const raw = useMemo<PrimaryChoice | null>(() => {
    try { return getPrimaryChoice(scope, scopeId); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId, tick]);
  const effective = useMemo<ResolvedPrimary>(() => {
    try {
      return resolvePrimarySystem({
        deviceId: context?.deviceId ?? (scope === "neurona" ? scopeId : undefined),
        personaId: context?.personaId ?? (scope === "personalidad" ? scopeId : undefined),
        agentId: context?.agentId ?? (scope === "agente" ? scopeId : undefined),
        brainId: context?.brainId ?? (scope === "cerebro" ? scopeId : undefined),
      });
    } catch {
      return { choice: { modo: "astraura-158" }, provenance: "defecto" };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.deviceId, context?.personaId, context?.agentId, context?.brainId, scope, scopeId, tick]);

  const needsId = scope !== "cuenta";
  const disabled = needsId && !scopeId;
  const modo: PrimaryMode = raw?.modo ?? effective.choice.modo;
  const fuente = raw?.modo === "fuente" ? raw.fuente ?? "" : "";
  const modelo = raw?.modelo ?? "";
  const modelos = useMemo(() => sources.find((s) => s.id === fuente)?.models ?? [], [sources, fuente]);
  const label = scopeLabel ?? (scope === "cuenta" ? "la cuenta" : scope === "neurona" ? "esta neurona" : scope === "agente" ? "este agente" : scope === "cerebro" ? "este cerebro" : "esta personalidad");

  function save(next: PrimaryChoice | null, msg: string) {
    try {
      setPrimaryChoice(scope, scopeId, next);
      toast.success(`Sistema primario de ${label}`, { description: msg });
    } catch { /* nunca rompe la UI */ }
  }

  function pickMode(m: PrimaryMode) {
    if (m === "fuente") {
      const first = sources[0];
      if (!first) return;
      save({ modo: "fuente", fuente: first.id, ...(raw?.exclusivo ? { exclusivo: true } : {}) }, `Fuente concreta: ${first.label}.`);
      return;
    }
    save({ modo: m, ...(raw?.exclusivo ? { exclusivo: true } : {}) }, `${MODE_META[m].label} irá primero.`);
  }

  return (
    <div className={cn("rounded-xl border border-[var(--aw-line,rgba(255,255,255,0.1))] bg-[var(--aw-surface,rgba(255,255,255,0.03))] px-3 py-2.5", raw && "border-l-2 border-l-cyan-400/60", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-[var(--aw-strong,#fff)]">
          <Cpu className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> Sistema primario de {label}
        </p>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200"
          title={PRIMARY_PROVENANCE_LABEL[effective.provenance]}
        >
          {effective.provenance === "defecto" ? "Defecto" : effective.provenance.charAt(0).toUpperCase() + effective.provenance.slice(1)}
        </span>
      </div>
      <p className="mt-1 text-[13px] font-medium text-[var(--aw-strong,#fff)]">{describePrimaryChoice(effective.choice)}</p>
      {!compact && (
        <p className="mt-0.5 text-[10px] leading-snug text-[var(--aw-muted,rgba(255,255,255,0.6))]">
          {PRIMARY_PROVENANCE_LABEL[effective.provenance]}. El primario va primero en la cadena; los demás sistemas
          siguen como secundarios. Precedencia: agente › personalidad › cerebro › neurona › cuenta › defecto.
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Sistema primario de ${label}`}>
        {(Object.keys(MODE_META) as PrimaryMode[]).map((m) => {
          const meta = MODE_META[m];
          const Icon = meta.icon;
          const active = !!raw && modo === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => pickMode(m)}
              title={meta.hint}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium",
                "transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-[0.97]",
                "disabled:cursor-not-allowed disabled:opacity-50",
                active ? meta.tone : "border-[var(--aw-line,rgba(255,255,255,0.1))] bg-[var(--aw-surface,rgba(255,255,255,0.03))] text-[var(--aw-text,rgba(255,255,255,0.85))] hover:border-[var(--aw-line-strong,rgba(255,255,255,0.25))]",
              )}
            >
              <Icon className="h-3 w-3" aria-hidden="true" /> {meta.label}
            </button>
          );
        })}
      </div>

      {raw?.modo === "astraura-158" && (
        <label className="mt-2 block text-[10px] text-[var(--aw-muted,rgba(255,255,255,0.6))]">
          Personalidad 1.58 (modelo)
          <select
            value={modelo}
            onChange={(e) => {
              const v = e.target.value;
              save({ ...raw, modo: "astraura-158", ...(v ? { modelo: v } : { modelo: undefined }) }, v ? `Personalidad 1.58 fijada: ${v.replace(ASTRAURA_158_MODEL_PREFIX, "")}.` : "Personalidad 1.58 afín a la personalidad activa del OS.");
            }}
            className="mt-0.5 block w-full cursor-pointer appearance-none rounded-lg border border-[var(--aw-line,rgba(255,255,255,0.1))] bg-[var(--aw-field,rgba(0,0,0,0.3))] py-1.5 pl-2 pr-7 text-[11px] text-[var(--aw-strong,#fff)] outline-none transition-colors focus:border-cyan-400/50"
          >
            <option value="">Afín a la personalidad activa (auto)</option>
            {ASTRAURA_158_PERSONAS.map((p) => (
              <option key={p.id} value={`${ASTRAURA_158_MODEL_PREFIX}${p.id}`}>{p.label} · {p.organ}</option>
            ))}
          </select>
        </label>
      )}

      {raw?.modo === "fuente" && (
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <label className="min-w-0 text-[10px] text-[var(--aw-muted,rgba(255,255,255,0.6))]">
            Fuente
            <select
              value={fuente}
              onChange={(e) => save({ modo: "fuente", fuente: e.target.value, ...(raw.exclusivo ? { exclusivo: true } : {}) }, `Fuente fijada: ${sources.find((s) => s.id === e.target.value)?.label ?? e.target.value}.`)}
              className="mt-0.5 block w-full cursor-pointer appearance-none rounded-lg border border-[var(--aw-line,rgba(255,255,255,0.1))] bg-[var(--aw-field,rgba(0,0,0,0.3))] py-1.5 pl-2 pr-7 text-[11px] text-[var(--aw-strong,#fff)] outline-none transition-colors focus:border-violet-400/50"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>{s.label} · {s.privacy === "local" ? "local" : "nube"}</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-[10px] text-[var(--aw-muted,rgba(255,255,255,0.6))]">
            Modelo
            <select
              value={modelo}
              onChange={(e) => save({ ...raw, modo: "fuente", fuente, ...(e.target.value ? { modelo: e.target.value } : { modelo: undefined }) }, e.target.value ? `Modelo fijado: ${e.target.value}.` : "El mejor modelo de la fuente.")}
              className="mt-0.5 block w-full cursor-pointer appearance-none rounded-lg border border-[var(--aw-line,rgba(255,255,255,0.1))] bg-[var(--aw-field,rgba(0,0,0,0.3))] py-1.5 pl-2 pr-7 text-[11px] text-[var(--aw-strong,#fff)] outline-none transition-colors focus:border-violet-400/50"
            >
              <option value="">El mejor de la fuente</option>
              {modelos.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
            </select>
          </label>
        </div>
      )}

      <div className="mt-2 flex min-h-6 flex-wrap items-center gap-3">
        {raw && raw.modo !== "auto" && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[10px] text-[var(--aw-text,rgba(255,255,255,0.85))]" title="Sin failover: si el primario no responde, respuesta honesta (no se usan secundarios).">
            <Switch
              checked={raw.exclusivo === true}
              onCheckedChange={(v) => save({ ...raw, ...(v ? { exclusivo: true } : { exclusivo: undefined }) }, v ? "Exclusivo: sin sistemas secundarios." : "Con failover a secundarios.")}
              aria-label="Primario exclusivo"
            />
            <ShieldAlert className="h-3 w-3 text-amber-300" aria-hidden="true" /> Exclusivo
          </label>
        )}
        {raw && (
          <button
            type="button"
            onClick={() => save(null, "Vuelve a heredar del ámbito superior.")}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-[var(--aw-line,rgba(255,255,255,0.1))] bg-[var(--aw-surface-2,rgba(255,255,255,0.05))] px-2 py-0.5 text-[10px] text-[var(--aw-text,rgba(255,255,255,0.85))] transition-colors hover:border-emerald-400/40 hover:text-emerald-200"
            title="Quitar el ajuste propio de este ámbito"
          >
            <Undo2 className="h-3 w-3" aria-hidden="true" /> Heredar
          </button>
        )}
        {!raw && !compact && (
          <span className="text-[10px] text-[var(--aw-muted,rgba(255,255,255,0.6))]">Sin ajuste propio: hereda.</span>
        )}
      </div>
    </div>
  );
}
