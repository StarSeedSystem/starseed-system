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
 */

import { useEffect, useMemo, useState } from "react";
import { detectCapabilities, thisDeviceId, type NeuronCapabilities } from "@/lib/neurons/neurons";
import {
  scoutModels,
  markScoutSeen,
  scoutSignature,
  type ModelRecommendation,
} from "@/ai/astraura/model-scout";
import { ALL_LLM_SPECS, ALL_VOICE_SPECS } from "@/ai/astraura/model-requirements";

const VERDICT_STYLE: Record<string, { label: string; cls: string }> = {
  perfecto: { label: "Perfecto", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  bueno: { label: "Bueno", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  justo: { label: "Justo", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  "no-cabe": { label: "No cabe", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
};

function RecoRow({ r }: { r: ModelRecommendation }) {
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
    </div>
  );
}

export function ModelScoutPanel({ kind = "llm" }: { kind?: "llm" | "voz" }) {
  const [caps, setCaps] = useState<NeuronCapabilities | null>(null);
  const [loading, setLoading] = useState(true);

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
        {result.best.map((r) => (
          <RecoRow key={r.spec.id} r={r} />
        ))}
      </div>
      <p className="text-[11px] text-white/35">
        Ajuste estimado con fórmulas portadas de llmfit (MIT) sobre el hardware detectado de la neurona
        {thisDeviceId() ? "" : ""}. Los requisitos y la velocidad son aproximados.
      </p>
    </div>
  );
}

export default ModelScoutPanel;
