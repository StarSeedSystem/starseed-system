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
  ListOrdered, ChevronUp, ChevronDown, Lock, Gift, Cloud, Globe, Star, HardDrive, Boxes, Plug, Puzzle, Rocket, Orbit, Package, Wifi, Network, Zap, Layers,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";
import { recommendModels, type NeuronRecommendation } from "@/ai/astraura/model-recommend";
import { tierLabel, runsRemotely, classifyDeviceTier } from "@/ai/astraura/model-requirements";
import {
  shouldShowUpdates, updateReason, markUpdatesSeen, snoozeUpdates, subscribeStartupOpen,
  openStartupUpdates, getStartupState, newIntegrationsSince, newModelIdsSince, type StartupStrategy,
} from "@/lib/astraura/startup-updates";
import type { Integration } from "@/lib/integrations/integration-registry";
import {
  MODEL_ACCESS_CLASSES, MODEL_ACCESS_META, getModelPreferences, saveModelPreferences, recommendedOrder,
  type ModelAccessClass,
} from "@/lib/astraura/model-preferences";

const STRATS: { value: StartupStrategy; label: string; hint: string }[] = [
  { value: "auto", label: "Automática", hint: "el OS elige local o servidor según cada neurona" },
  { value: "local", label: "Local", hint: "prioriza modelos en el dispositivo (privado, offline)" },
  { value: "servidor", label: "Servidor", hint: "usa el servidor StarSeed en cualquier neurona" },
];

// Modo del orden de preferencia de modelos (Adenda 111): reordenación inteligente vs. orden fijo.
const MODE_OPTS: { value: "auto" | "fixed"; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "auto", label: "Automático", hint: "el sistema puede reordenar según el dispositivo y el entorno (offline/gama)", icon: <Sparkles className="mr-1 inline h-3 w-3" /> },
  { value: "fixed", label: "Fijo", hint: "respeta exactamente tu orden en todas las neuronas y entornos", icon: <Lock className="mr-1 inline h-3 w-3" /> },
];

// MODEL_ACCESS_META da el icono como nombre lucide (string); lo resolvemos de forma
// defensiva a un componente, con respaldo por clase si el nombre no se reconoce.
const ICON_BY_NAME: Record<string, LucideIcon> = {
  cpu: Cpu, harddrive: HardDrive, brain: Brain, layers: Layers,
  sparkles: Sparkles, star: Star, orbit: Orbit, rocket: Rocket,
  gift: Gift, cloud: Cloud, globe: Globe, zap: Zap, wifi: Wifi,
  server: Server, blocks: Blocks, boxes: Boxes, plug: Plug, puzzle: Puzzle, package: Package, network: Network,
};
const ACCESS_FALLBACK_ICON: Record<ModelAccessClass, LucideIcon> = {
  local: Cpu, starseed: Sparkles, "api-free": Gift, "api-external": Blocks,
};
function accessIcon(cls: ModelAccessClass, name?: string): LucideIcon {
  const key = (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ICON_BY_NAME[key] ?? ACCESS_FALLBACK_ICON[cls] ?? Blocks;
}
function orderLabels(order: ModelAccessClass[]): string {
  return order.map((c) => MODEL_ACCESS_META[c]?.label ?? c).join(" → ");
}

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
  // Orden de preferencia de modelos IA (Adenda 111). Inicializado desde preferencias
  // persistidas; defensivo si el módulo/almacenamiento no está disponible aún.
  const [modelOrder, setModelOrder] = useState<ModelAccessClass[]>(() => {
    try { const o = getModelPreferences().order; return Array.isArray(o) && o.length ? [...o] : [...MODEL_ACCESS_CLASSES]; } catch { return [...MODEL_ACCESS_CLASSES]; }
  });
  const [modelMode, setModelMode] = useState<"auto" | "fixed">(() => {
    try { return getModelPreferences().mode === "fixed" ? "fixed" : "auto"; } catch { return "auto"; }
  });
  const [suggestedOrder, setSuggestedOrder] = useState<ModelAccessClass[] | null>(null);

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

  // Orden sugerido según hardware/entorno. Se recalcula al detectar capacidades;
  // si algo falla (o no hay caps), no se muestra sugerido y el orden queda manual.
  useEffect(() => {
    if (!caps) return;
    try {
      const tier = classifyDeviceTier(caps);
      const hasLocal = !!(caps.ollama || caps.lmstudio || caps.chromeAi || caps.webgpu);
      let online = true;
      try { online = typeof navigator === "undefined" || navigator.onLine !== false; } catch { /* */ }
      const sug = recommendedOrder({ tier, online, hasLocal });
      setSuggestedOrder(Array.isArray(sug) && sug.length ? sug : null);
    } catch { setSuggestedOrder(null); }
  }, [caps]);

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

  // Reordenar una clase de acceso arriba (-1) o abajo (+1) en la lista.
  const moveAccess = (idx: number, dir: -1 | 1) => {
    setModelOrder((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const useSuggested = () => { if (suggestedOrder && suggestedOrder.length) setModelOrder([...suggestedOrder]); };

  const apply = () => {
    markUpdatesSeen({ autoUpdate, strategy });
    try { saveModelPreferences({ order: modelOrder, mode: modelMode }); } catch { /* módulo aún no disponible: no bloquea el cierre */ }
    setOpen(false);
  };
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

          {/* Orden de preferencia de modelos IA (Adenda 111) */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-white/85"><ListOrdered className="h-3.5 w-3.5 text-cyan-300" /> Orden de preferencia de modelos IA</p>
            <p className="mt-0.5 text-[10px] leading-snug text-white/45">
              Prioridad con que Astraura intenta cada tipo de motor. En «Automático» puede reordenar según el dispositivo y el entorno; en «Fijo» respeta tu orden exacto.
            </p>

            {/* Modo Automático / Fijo */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {MODE_OPTS.map((m) => (
                <button key={m.value} type="button" title={m.hint} onClick={() => setModelMode(m.value)}
                  className={cn("cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors", modelMode === m.value ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25")}>
                  {m.icon}{m.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-white/45">{MODE_OPTS.find((m) => m.value === modelMode)?.hint}</p>

            {/* Lista reordenable de clases de acceso */}
            <ol className="mt-2 space-y-1.5">
              {modelOrder.map((cls, idx) => {
                const meta = MODEL_ACCESS_META[cls];
                const Icon = accessIcon(cls, meta?.icon);
                return (
                  <li key={cls} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-500/10 text-[10px] font-bold text-cyan-200">{idx + 1}</span>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-white/70" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium text-white/90">{meta?.label ?? cls}</span>
                      {meta?.hint && <span className="block truncate text-[10px] text-white/45">{meta.hint}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button type="button" aria-label={`Subir ${meta?.label ?? cls}`} disabled={idx === 0} onClick={() => moveAccess(idx, -1)}
                        className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] p-1 text-white/60 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-white/60">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label={`Bajar ${meta?.label ?? cls}`} disabled={idx === modelOrder.length - 1} onClick={() => moveAccess(idx, 1)}
                        className="cursor-pointer rounded-md border border-white/10 bg-white/[0.03] p-1 text-white/60 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-white/60">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* Sugerido para este dispositivo */}
            {suggestedOrder && (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.06] px-2.5 py-1.5">
                <p className="min-w-0 flex-1 text-[10px] leading-snug text-white/60"><span className="font-semibold text-cyan-200">Sugerido para este dispositivo:</span> {orderLabels(suggestedOrder)}</p>
                <button type="button" onClick={useSuggested} className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-100 transition-colors hover:bg-cyan-500/25">
                  <Sparkles className="h-3 w-3" /> Usar sugerido
                </button>
              </div>
            )}

            {/* Auto-actualización de catálogos + enlaces a configuración avanzada */}
            <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-snug text-white/40">
              <RefreshCw className="mt-px h-3 w-3 shrink-0 text-white/30" />
              <span>Los catálogos se auto-actualizan: OpenRouter (:free) cada 4 h y HuggingBay. Ajusta modelos propios y descargas por{" "}
                <Link href="/agent?tab=neuronas" onClick={() => setOpen(false)} className="cursor-pointer text-cyan-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-cyan-200">neurona</Link>, o las{" "}
                <Link href="/agent?tab=integraciones" onClick={() => setOpen(false)} className="cursor-pointer text-fuchsia-300/80 underline decoration-dotted underline-offset-2 transition-colors hover:text-fuchsia-200">fuentes externas</Link>.
              </span>
            </p>
            <p className="mt-1 text-[10px] text-white/35">El orden se guarda al pulsar «Aplicar y continuar».</p>
          </div>

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
