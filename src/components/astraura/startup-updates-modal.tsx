"use client";

/**
 * StartupUpdatesModal — VENTANA UNIFICADA DE INICIO / ACTUALIZACIONES (Adenda 111).
 * ============================================================================
 * Emerge en la primera entrada de la neurona y reaparece cuando hay novedades
 * (nuevos modelos de LLM/voz o nuevas fuentes/integraciones). Unifica en una sola
 * ventana centrada: capacidades detectadas + selección automática de LLM y voz
 * (Adenda 109) con prueba de entorno, fuentes nuevas (Adenda 110), y preferencias
 * de cuenta (auto-actualización por defecto ON, estrategia local/servidor).
 * SSR-safe: no renderiza en servidor; decide abrir tras montar. Nunca lanza.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles, Cpu, Brain, Mic, Server, X, Check, Loader2, Gauge, Blocks, ExternalLink, RefreshCw, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { recommendModels, type NeuronRecommendation } from "@/ai/astraura/model-recommend";
import { tierLabel, runsRemotely } from "@/ai/astraura/model-requirements";
import {
  shouldShowUpdates, updateReason, markUpdatesSeen, snoozeUpdates, subscribeStartupOpen,
  openStartupUpdates, getStartupState, newIntegrationsSince, newModelIdsSince, type StartupStrategy,
} from "@/lib/astraura/startup-updates";
import type { Integration } from "@/lib/integrations/integration-registry";

const STRATS: { value: StartupStrategy; label: string; hint: string }[] = [
  { value: "auto", label: "Automática", hint: "el OS elige local o servidor según cada neurona" },
  { value: "local", label: "Local", hint: "prioriza modelos en el dispositivo (privado, offline)" },
  { value: "servidor", label: "Servidor", hint: "usa el servidor StarSeed en cualquier neurona" },
];

function RecoCard({ icon, label, name, access, rationale }: { icon: React.ReactNode; label: string; name: string; access: string; rationale: string }) {
  return (
    <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/[0.06] px-3 py-2">
      <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85">{icon} {label}</p>
      <p className="mt-0.5 text-[13px] font-bold text-white/95">{name}</p>
      <p className="text-[10px] text-white/50">{access} · {rationale}</p>
    </div>
  );
}

export function StartupUpdatesModal() {
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<NeuronCapabilities | null>(null);
  const [rec, setRec] = useState<NeuronRecommendation | null>(null);
  const [reason, setReason] = useState<"primera-vez" | "novedades" | "al-dia">("primera-vez");
  const [newSources, setNewSources] = useState<Integration[]>([]);
  const [newModels, setNewModels] = useState<number>(0);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [strategy, setStrategy] = useState<StartupStrategy>("auto");
  const [test, setTest] = useState<{ state: "idle" | "run" | "done"; msg?: string }>({ state: "idle" });

  const load = useCallback(() => {
    const st = getStartupState();
    setAutoUpdate(st.autoUpdate !== false);
    setStrategy(st.strategy ?? "auto");
    setReason(updateReason());
    setNewSources(newIntegrationsSince().slice(0, 8));
    setNewModels(newModelIdsSince().length);
    setOpen(true);
    void (async () => {
      const c = await detectCapabilities();
      setCaps(c);
      setRec(recommendModels(c, { osInstalled: !!c.installedApp }));
    })();
  }, []);

  // Auto-abrir en primera entrada o si hay novedades; y por evento manual.
  useEffect(() => {
    const t = setTimeout(() => { if (shouldShowUpdates()) load(); }, 1200);
    const off = subscribeStartupOpen(() => load());
    // Apertura manual desde ajustes/notificaciones (paridad con openAuroraSetup).
    try { (window as unknown as { openAstrauraStartup?: () => void }).openAstrauraStartup = openStartupUpdates; } catch { /* */ }
    return () => { clearTimeout(t); off(); };
  }, [load]);

  const runTest = async () => {
    setTest({ state: "run" });
    let online = true;
    let gpu = false;
    try { online = typeof navigator === "undefined" || navigator.onLine !== false; } catch { /* */ }
    try {
      const g = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
      gpu = !!(g && (await g.requestAdapter?.()));
    } catch { /* */ }
    const parts = [online ? "conexión OK" : "sin conexión", gpu ? "WebGPU listo" : "sin WebGPU (usa servidor)"];
    setTest({ state: "done", msg: parts.join(" · ") });
  };

  const apply = () => { markUpdatesSeen({ autoUpdate, strategy }); setOpen(false); };
  const later = () => { snoozeUpdates(); setOpen(false); };

  if (!open) return null;

  const title = reason === "primera-vez" ? "Configura Astraura y OmniVoice" : reason === "novedades" ? "Novedades disponibles" : "Astraura al día";
  const subtitle = reason === "primera-vez"
    ? "Bienvenida a esta neurona. Estas son las selecciones automáticas según su hardware — todo ajustable luego."
    : reason === "novedades"
      ? "Hay nuevos modelos o fuentes disponibles. Revisa la selección recomendada para esta neurona."
      : "Todo actualizado. Puedes revisar la configuración recomendada.";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12] shadow-2xl">
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-gradient-to-br from-cyan-500/[0.1] to-transparent px-4 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-white/95"><Sparkles className="h-4 w-4 text-cyan-300" /> {title}</h2>
            <p className="mt-0.5 text-[11px] leading-snug text-white/55">{subtitle}</p>
          </div>
          <button type="button" onClick={later} title="Recordar luego" className="cursor-pointer rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Cuerpo scrollable */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {/* Capacidades + gama */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70">
              <Cpu className="h-3 w-3 text-cyan-300" />
              {caps ? `${caps.platform}${caps.cores ? ` · ${caps.cores} núcleos` : ""}${caps.memoryGb ? ` · ${caps.memoryGb} GB` : ""}` : "detectando hardware…"}
            </span>
            {rec && <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-100">{tierLabel(rec.tier)}</span>}
            <button type="button" onClick={runTest} disabled={test.state === "run"} className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50">
              {test.state === "run" ? <Loader2 className="h-3 w-3 animate-spin" /> : test.state === "done" ? <Check className="h-3 w-3 text-emerald-300" /> : <Gauge className="h-3 w-3" />} Probar entorno
            </button>
          </div>
          {test.msg && <p className="text-[10px] text-emerald-300/80">{test.msg}</p>}

          {/* Selección automática */}
          {rec ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <RecoCard icon={<Brain className="h-3.5 w-3.5 text-violet-300" />} label="Modelo de lenguaje" name={rec.llm.best.spec.label}
                access={runsRemotely(rec.llm.best.spec) ? "servidor" : "local"} rationale={rec.llm.best.rationale} />
              <RecoCard icon={<Mic className="h-3.5 w-3.5 text-fuchsia-300" />} label="Voz (OmniVoice)" name={rec.voz.best.spec.label}
                access={runsRemotely(rec.voz.best.spec) ? "servidor" : "local"} rationale={rec.voz.best.rationale} />
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[11px] text-white/45"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando la mejor selección…</p>
          )}

          {/* Novedades */}
          {(newSources.length > 0 || newModels > 0) && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85"><RefreshCw className="h-3.5 w-3.5 text-emerald-300" /> Novedades desde tu última visita</p>
              {newModels > 0 && <p className="mt-1 text-[10px] text-white/55">{newModels} modelo(s) nuevo(s) de LLM/voz disponibles.</p>}
              {newSources.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {newSources.map((i) => (
                    <a key={i.id} href={i.url} target="_blank" rel="noopener noreferrer" className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/70 hover:border-cyan-400/40 hover:text-cyan-200">
                      {i.name} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preferencias de cuenta */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[12px] font-medium text-white/90">Actualización automática</span>
                <span className="block text-[10px] leading-snug text-white/45">Aplica por defecto las mejores opciones cuando haya modelos o fuentes nuevos.</span>
              </span>
              <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
            </label>
            <div className="mt-2 border-t border-white/10 pt-2">
              <p className="mb-1.5 text-[11px] font-medium text-white/80">Estrategia por defecto de esta neurona</p>
              <div className="flex flex-wrap gap-1.5">
                {STRATS.map((s) => (
                  <button key={s.value} type="button" title={s.hint} onClick={() => setStrategy(s.value)}
                    className={cn("cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors", strategy === s.value ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25")}>
                    {s.value === "local" ? <Cpu className="mr-1 inline h-3 w-3" /> : s.value === "servidor" ? <Server className="mr-1 inline h-3 w-3" /> : <Sparkles className="mr-1 inline h-3 w-3" />}
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-white/45">{STRATS.find((s) => s.value === strategy)?.hint}</p>
            </div>
          </div>

          {/* Enlaces a detalle */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Link href="/agent?tab=neuronas" onClick={() => setOpen(false)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/70 hover:border-cyan-400/40 hover:text-cyan-200">
              <Cpu className="h-3 w-3" /> Neuronas y modelos <ArrowRight className="h-3 w-3" />
            </Link>
            <Link href="/agent?tab=integraciones" onClick={() => setOpen(false)} className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/70 hover:border-fuchsia-400/40 hover:text-fuchsia-200">
              <Blocks className="h-3 w-3" /> Integraciones y fuentes <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Pie */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-black/30 px-4 py-2.5">
          <button type="button" onClick={later} className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-white/25">
            Recordar luego
          </button>
          <button type="button" onClick={apply} className="cursor-pointer rounded-lg border border-cyan-400/40 bg-cyan-500/20 px-3 py-1.5 text-[12px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/30">
            Aplicar y continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartupUpdatesModal;
