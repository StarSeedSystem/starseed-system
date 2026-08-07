"use client";

/*
 * Adenda 138 · ModelScoutPanel — superficie de RECOMENDACIÓN INTELIGENTE de
 * modelos por neurona (motor: model-scout.ts, fórmulas de fit portadas de
 * llmfit MIT). Compara el hardware REAL de este dispositivo con las mejores
 * opciones del catálogo y muestra, para cada recomendación: veredicto de ajuste
 * (perfecto/bueno/justo), memoria requerida, velocidad estimada (tok/s),
 * cuantización sugerida, diferencias frente a lo que ya usas y las razones.
 *
 * Se monta en la ventana de actualizaciones / Ajustes de Astraura IA. Defensivo
 * y SSR-safe: si algo falla, no rompe la pantalla.
 *
 * A149 · ola 3 · §2.2 — «APLICAR» POR FILA. Con `personaId`/`deviceId`, cada
 * recomendación puede fijarse para esa personalidad EN ESTA neurona. El botón
 * SOLO aparece si la recomendación se resuelve con SEGURIDAD contra el catálogo
 * real (`freeSources()` en LLM, `listVoiceEngines()`/`isVoiceEngineId` en voz):
 * sin match inequívoco no hay botón, nunca se pinta nada a ciegas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectCapabilities, thisDeviceId, type NeuronCapabilities } from "@/lib/neurons/neurons";
import {
  scoutModels,
  markScoutSeen,
  scoutSignature,
  type ModelRecommendation,
} from "@/ai/astraura/model-scout";
import { ALL_LLM_SPECS, ALL_VOICE_SPECS, type ModelSpec } from "@/ai/astraura/model-requirements";
import { freeSources } from "@/ai/astraura/free-catalog";
import { listVoiceEngines } from "@/lib/aurora/tts-oss/engine-registry";
import { isVoiceEngineId } from "@/lib/aurora/tts-oss/voice-config";
import {
  ALL_PERSONAS, getRawOverrides, saveOverrides, clearOverrides,
  type PersonaNeuronOverrides,
} from "@/lib/astraura/neuron-persona-store";
import { playSystemChime } from "@/lib/astraura/system-chime";

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  perfecto: { label: "Perfecto", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  bueno: { label: "Bueno", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  justo: { label: "Justo", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "no-cabe": { label: "No cabe", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

/* ── Resolución SEGURA de una recomendación al catálogo real ───────────────── */

/** Normaliza para comparar ids/motores («GPT-SoVITS» → «gptsovits»). */
function norm(v: string): string {
  return (v || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Destino aplicable de una fila (o `null` si no hay match inequívoco). */
interface ApplyTarget {
  /** Parche exacto que se guardará en el store. */
  patch: PersonaNeuronOverrides;
  /** Sistema tocado (para el toast y la nota del sistema). */
  system: "llm" | "voz";
  /** Nombre real de lo que se va a fijar. */
  label: string;
}

/**
 * LLM: la recomendación se aplica solo si su id coincide EXACTO con una fuente
 * de `freeSources()`, o si su `engine` (Ollama, WebGPU…) apunta a UNA sola
 * fuente. Dos candidatas ⇒ ambiguo ⇒ sin botón.
 */
function llmTarget(spec: ModelSpec): ApplyTarget | null {
  try {
    const sources = freeSources();
    const exact = sources.find((s) => norm(s.id) === norm(spec.id));
    if (exact) return { patch: { llm: { fuente: exact.id, modelo: undefined } }, system: "llm", label: exact.label };
    const eng = norm(spec.engine);
    if (!eng) return null;
    const cands = sources.filter((s) => {
      const id = norm(s.id);
      return id === eng || id.startsWith(eng);
    });
    if (cands.length !== 1) return null;
    return { patch: { llm: { fuente: cands[0].id, modelo: undefined } }, system: "llm", label: cands[0].label };
  } catch {
    return null;
  }
}

/**
 * Voz: el id o el `engine` del spec debe resolver a UN motor real del registro
 * (coincidencia exacta, o prefijo único como «openvoice» → «openvoice2»).
 */
function voiceTarget(spec: ModelSpec): ApplyTarget | null {
  try {
    const engines = listVoiceEngines();
    const ids = engines.map((e) => String(e.meta.id));
    const labelOf = (id: string) => engines.find((e) => String(e.meta.id) === id)?.meta.label ?? id;
    for (const raw of [spec.id, spec.engine]) {
      const c = norm(raw);
      if (!c) continue;
      const exact = ids.find((id) => norm(id) === c);
      if (exact && isVoiceEngineId(exact)) return { patch: { voz: { motor: exact } }, system: "voz", label: labelOf(exact) };
      const pref = ids.filter((id) => norm(id).startsWith(c));
      if (pref.length === 1 && isVoiceEngineId(pref[0])) {
        return { patch: { voz: { motor: pref[0] } }, system: "voz", label: labelOf(pref[0]) };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function RecoRow({
  r, target, onApply, applied,
}: {
  r: ModelRecommendation;
  target: ApplyTarget | null;
  onApply?: (t: ApplyTarget) => void;
  /** Acaba de fijarse desde esta fila (confirmación breve en el propio botón). */
  applied?: boolean;
}) {
  const style = VERDICT_STYLE[r.verdict] ?? VERDICT_STYLE["justo"];
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-white/90">{r.spec.label}</span>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${style.cls}`}>{style.label}</span>
        {r.isCurrentlyUsed && (
          <span className="rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-300">
            En uso
          </span>
        )}
        <span className="ml-auto text-[12px] text-white/50">
          ~{r.requiredGb.toFixed(1)} GB{typeof r.estTps === "number" ? ` · ~${Math.round(r.estTps)} tok/s` : ""}
          {r.quant ? ` · ${r.quant}` : ""}
        </span>
      </div>
      {r.deltaVsCurrent && <div className="mt-1 text-[12px] text-fuchsia-300/80">{r.deltaVsCurrent}</div>}
      {r.reasons?.length > 0 && (
        <div className="mt-1 text-[12px] text-white/45">{r.reasons.slice(0, 2).join(" · ")}</div>
      )}
      {/* Aplicar POR FILA: solo con match seguro contra el catálogo real. */}
      {target && onApply && (
        <button
          type="button"
          onClick={() => onApply(target)}
          title={`Fijar «${target.label}» para esta personalidad en esta neurona`}
          className={cn(
            "mt-2 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-200",
            applied
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
              : "border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25",
          )}
        >
          {applied
            ? <Check className="h-3 w-3" aria-hidden="true" />
            : <Wand2 className="h-3 w-3" aria-hidden="true" />}
          {applied ? "Fijado para esta personalidad" : "Usar para esta personalidad"}
        </button>
      )}
    </div>
  );
}

export interface ModelScoutPanelProps {
  kind?: "llm" | "voz";
  /** Con persona + neurona, cada fila gana «Usar para esta personalidad». */
  personaId?: string;
  deviceId?: string;
}

export function ModelScoutPanel({ kind = "llm", personaId, deviceId }: ModelScoutPanelProps) {
  const [caps, setCaps] = useState<NeuronCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  /** Última fila fijada (confirmación efímera en su propio botón). */
  const [justApplied, setJustApplied] = useState<string | null>(null);

  useEffect(() => {
    if (!justApplied) return;
    const t = setTimeout(() => setJustApplied(null), 1800);
    return () => clearTimeout(t);
  }, [justApplied]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await detectCapabilities();
        if (alive) setCaps(c);
      } catch {
        /* noop */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const result = useMemo(() => {
    if (!caps) return null;
    try {
      return scoutModels(caps, { kind, limit: 4 });
    } catch {
      return null;
    }
  }, [caps, kind]);

  useEffect(() => {
    if (!caps || !result) return;
    try {
      const catalogLen = (kind === "voz" ? ALL_VOICE_SPECS : ALL_LLM_SPECS).length;
      markScoutSeen(scoutSignature(caps, catalogLen));
    } catch {
      /* noop */
    }
  }, [caps, result, kind]);

  /** ¿Se puede aplicar aquí? Solo con personalidad Y neurona conocidas. */
  const canApply = !!personaId && !!deviceId;
  const esTodas = personaId === ALL_PERSONAS;

  const applyTarget = useCallback((t: ApplyTarget, specId: string) => {
    if (!personaId || !deviceId) return;
    let prev: PersonaNeuronOverrides[keyof PersonaNeuronOverrides];
    try { prev = getRawOverrides(deviceId, personaId)[t.system]; } catch { /* */ }
    try {
      saveOverrides(deviceId, personaId, t.patch);
    } catch {
      return;
    }
    setJustApplied(specId);
    playSystemChime(t.system, "set");
    try {
      toast.success(t.system === "llm" ? "Modelo LLM de esta neurona" : "Voz de esta neurona", {
        description: `${t.label} · ${esTodas ? "para toda la neurona" : "para esta personalidad aquí"}.`,
        action: {
          label: "Deshacer",
          onClick: () => {
            try {
              clearOverrides(deviceId, personaId, t.system);
              if (prev !== undefined) {
                const patch: PersonaNeuronOverrides = {};
                (patch as Record<string, unknown>)[t.system] = prev;
                saveOverrides(deviceId, personaId, patch);
              }
            } catch { /* */ }
          },
        },
      });
    } catch { /* */ }
  }, [personaId, deviceId, esTodas]);

  if (loading) {
    return <div className="p-3 text-sm text-white/40">Analizando el hardware de esta neurona…</div>;
  }
  if (!result) {
    return (
      <div className="p-3 text-sm text-white/40">
        No pude analizar el hardware de este dispositivo ahora mismo.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-3">
        <div className="text-[11px] uppercase tracking-widest text-violet-300/60">
          Recomendación de modelos · esta neurona
        </div>
        <p className="mt-1 text-sm text-white/80">{result.summary}</p>
        {result.hasBetter && (
          <p className="mt-1 text-[12px] text-emerald-300/80">
            Hay una opción que rinde mejor en este equipo que la que usas ahora.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2">
        {result.best.map((r) => {
          const target = canApply ? (kind === "voz" ? voiceTarget(r.spec) : llmTarget(r.spec)) : null;
          return (
            <RecoRow
              key={r.spec.id}
              r={r}
              target={target}
              onApply={target ? (t) => applyTarget(t, r.spec.id) : undefined}
              applied={justApplied === r.spec.id}
            />
          );
        })}
      </div>
      {canApply && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--aw-muted)]">
          <Check className="mt-px h-3 w-3 shrink-0 text-[var(--aw-faint)]" aria-hidden="true" />
          <span>
            «Usar para esta personalidad» solo aparece cuando la recomendación coincide sin ambigüedad con
            {kind === "voz" ? " un motor de voz real de esta neurona" : " una fuente real del catálogo"}; fija el pin
            (que va primero, nunca en exclusiva) y se puede deshacer al instante.
          </span>
        </p>
      )}
      <p className="text-[11px] text-white/35">
        Ajuste estimado con fórmulas portadas de llmfit (MIT) sobre el hardware detectado de la neurona
        {thisDeviceId() ? "" : ""}. Los requisitos y la velocidad son aproximados.
      </p>
    </div>
  );
}

export default ModelScoutPanel;
