"use client";

/**
 * NeuronModelsPanel — CAPACIDADES + MODELOS RECOMENDADOS por neurona (Adenda 109).
 * ============================================================================
 * Detecta las capacidades reales de ESTA neurona (CPU/GPU/RAM/OS/PWA) y recomienda
 * el mejor LLM (OpenRouter/local) y la mejor voz (OmniVoice/local/servidor) para
 * ella, mostrando los REQUISITOS MÍNIMOS de cada opción y su nivel de encaje, con
 * un botón «Probar» funcional. Aplica la política local-vs-servidor:
 *   · dispositivo capaz + app instalada → modelos LOCALES por defecto (privado).
 *   · si no → servidor StarSeed (funciona en cualquier neurona, sin instalar).
 * Todo es una recomendación por defecto: ajustable luego por chat, personalidad y
 * cerebro. SSR-safe y defensivo.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Cpu, Gauge, Server, Download, CheckCircle2, XCircle, Loader2, MonitorSmartphone,
  Sparkles, Mic, Brain, ChevronDown, HardDrive, Wifi, ShieldCheck, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { detectCapabilities, type NeuronCapabilities } from "@/lib/neurons/neurons";
import {
  recommendModels, type NeuronRecommendation, type Recommendation, type KindRecommendation,
} from "@/ai/astraura/model-recommend";
import {
  describeReq, describeCaps, tierLabel, runsRemotely, type ModelSpec, type FitLevel,
} from "@/ai/astraura/model-requirements";
import { ModelDownloadsPanel } from "@/components/neurons/model-downloads-panel";
import { NeuronServerConfig } from "@/components/neurons/neuron-server-config";

/**
 * Adenda 149 · PUENTE entre los dos recomendadores: este panel usa
 * `model-recommend.ts` (encaje cualitativo por requisitos) y `ModelScoutPanel`
 * usa `model-scout.ts` (análisis cuantitativo: GB, tok/s, cuantización). No se
 * duplica lógica: se monta el panel existente bajo demanda, con el mismo `kind`
 * de la sección. Carga diferida (no entra en el bundle hasta que se despliega).
 */
const ModelScoutPanel = dynamic(
  () => import("@/components/astraura/model-scout-panel").then((m) => ({ default: m.ModelScoutPanel })),
  {
    ssr: false,
    loading: () => (
      <p className="flex items-center gap-2 px-0.5 py-2 text-[11px] text-white/45">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando análisis cuantitativo…
      </p>
    ),
  },
);

const FIT_META: Record<FitLevel, { label: string; cls: string }> = {
  ideal: { label: "Ideal", cls: "text-emerald-300 bg-emerald-500/15 border-emerald-400/30" },
  suficiente: { label: "Suficiente", cls: "text-cyan-300 bg-cyan-500/15 border-cyan-400/30" },
  justo: { label: "Justo", cls: "text-amber-300 bg-amber-500/15 border-amber-400/30" },
  insuficiente: { label: "No alcanza", cls: "text-rose-300 bg-rose-500/15 border-rose-400/30" },
};

const ACCESS_META: Record<string, { label: string; cls: string }> = {
  local: { label: "Local", cls: "text-violet-300 bg-violet-500/15 border-violet-400/30" },
  starseed: { label: "Servidor StarSeed", cls: "text-cyan-300 bg-cyan-500/15 border-cyan-400/30" },
  openrouter: { label: "OpenRouter", cls: "text-sky-300 bg-sky-500/15 border-sky-400/30" },
  custom: { label: "Servidor propio", cls: "text-amber-300 bg-amber-500/15 border-amber-400/30" },
};

type TestState = { state: "idle" | "run" | "ok" | "fail"; msg?: string };

async function testSpec(spec: ModelSpec, caps: NeuronCapabilities): Promise<{ ok: boolean; msg: string }> {
  try {
    if (runsRemotely(spec)) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, msg: "Sin conexión a internet" };
      if (spec.access === "custom") return { ok: true, msg: "Listo · configura endpoint/clave en Servidores" };
      return { ok: true, msg: "Conexión OK · se ejecuta en el servidor" };
    }
    if (spec.req.chromeAi) {
      const has = typeof window !== "undefined" && !!(window as unknown as { LanguageModel?: unknown }).LanguageModel;
      return has ? { ok: true, msg: "Chrome AI (Gemini Nano) disponible" } : { ok: false, msg: "Activa la Prompt API de Chrome" };
    }
    if (spec.req.webgpu) {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu;
      if (!gpu) return { ok: false, msg: "WebGPU no disponible en este navegador" };
      const adapter = await gpu.requestAdapter?.();
      return adapter ? { ok: true, msg: "WebGPU con adaptador de GPU listo" } : { ok: false, msg: "WebGPU sin adaptador utilizable" };
    }
    if (spec.engine === "Ollama") {
      return caps.ollama || caps.lmstudio ? { ok: true, msg: "Servidor local detectado" } : { ok: false, msg: "Inicia Ollama o LM Studio local" };
    }
    if (caps.installedApp) return { ok: true, msg: "App del OS instalada · stack local listo" };
    return { ok: false, msg: "Instala la app del OS para usarlo en local" };
  } catch {
    return { ok: false, msg: "No se pudo completar la prueba" };
  }
}

function FitBadge({ level }: { level: FitLevel }) {
  const m = FIT_META[level];
  return <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", m.cls)}>{m.label}</span>;
}

function ModelRow({ rec, caps, best }: { rec: Recommendation; caps: NeuronCapabilities; best?: boolean }) {
  const [test, setTest] = useState<TestState>({ state: "idle" });
  const access = ACCESS_META[rec.spec.access] ?? ACCESS_META.local;
  const run = async () => {
    setTest({ state: "run" });
    const r = await testSpec(rec.spec, caps);
    setTest({ state: r.ok ? "ok" : "fail", msg: r.msg });
  };
  return (
    <div className={cn("rounded-xl border px-3 py-2.5 transition-colors", best ? "border-cyan-400/30 bg-cyan-500/[0.06]" : "border-white/10 bg-white/[0.03]")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-white/90">{rec.spec.label}</span>
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-medium", access.cls)}>{access.label}</span>
        <FitBadge level={rec.fit.level} />
        {best && <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-cyan-100">Recomendado</span>}
        {rec.availableNow ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-emerald-300/80"><CheckCircle2 className="h-3 w-3" /> disponible</span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 text-[9px] text-white/40"><Download className="h-3 w-3" /> requiere preparación</span>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-snug text-white/50">{describeReq(rec.spec)}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-white/40">{rec.rationale}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={run}
          disabled={test.state === "run"}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70 transition-colors hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-50"
        >
          {test.state === "run" ? <Loader2 className="h-3 w-3 animate-spin" /> : test.state === "ok" ? <CheckCircle2 className="h-3 w-3 text-emerald-300" /> : test.state === "fail" ? <XCircle className="h-3 w-3 text-rose-300" /> : <Gauge className="h-3 w-3" />}
          Probar
        </button>
        {test.msg && <span className={cn("text-[10px]", test.state === "ok" ? "text-emerald-300/80" : "text-rose-300/80")}>{test.msg}</span>}
      </div>
    </div>
  );
}

function KindSection({ title, icon, kind, caps, scoutKind }: { title: string; icon: React.ReactNode; kind: KindRecommendation; caps: NeuronCapabilities; scoutKind: "llm" | "voz" }) {
  const [open, setOpen] = useState(false);
  const [scout, setScout] = useState(false);
  const rest = useMemo(() => kind.ranked.filter((r) => r.spec.id !== kind.best.spec.id), [kind]);
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-[12px] font-semibold text-white/85">{icon} {title}</p>
      <ModelRow rec={kind.best} caps={caps} best />
      {kind.bestLocal && kind.bestLocal.spec.id !== kind.best.spec.id && (
        <div>
          <p className="mb-1 px-0.5 text-[9px] uppercase tracking-wide text-white/35">Mejor opción local (al instalar la app)</p>
          <ModelRow rec={kind.bestLocal} caps={caps} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-white/45 transition-colors hover:text-white/75"
        >
          <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} /> {open ? "Ocultar" : `Ver todas las opciones (${rest.length})`}
        </button>
        {/* Adenda 149 · puente con el otro recomendador (memoria, tok/s, cuantización). */}
        <button
          type="button"
          onClick={() => setScout((v) => !v)}
          aria-expanded={scout}
          title="Compara memoria requerida, velocidad estimada y cuantización sugerida con el hardware real de esta neurona"
          className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-cyan-300/70 transition-colors hover:text-cyan-200"
        >
          <BarChart3 className="h-3 w-3" /> {scout ? "Ocultar análisis cuantitativo" : "Ver análisis cuantitativo"}
        </button>
      </div>
      {open && <div className="space-y-1.5">{rest.map((r) => <ModelRow key={r.spec.id} rec={r} caps={caps} />)}</div>}
      {scout && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] p-2">
          <ModelScoutPanel kind={scoutKind} />
        </div>
      )}
    </div>
  );
}

export function NeuronModelsPanel({ embedded = false }: { embedded?: boolean }) {
  const [caps, setCaps] = useState<NeuronCapabilities | null>(null);
  const [rec, setRec] = useState<NeuronRecommendation | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const c = await detectCapabilities();
      if (!alive) return;
      setCaps(c);
      setRec(recommendModels(c, { osInstalled: !!c.installedApp }));
    })();
    return () => { alive = false; };
  }, []);

  const specChips = useMemo(() => {
    if (!caps) return [];
    const chips: { icon: React.ReactNode; text: string }[] = [];
    chips.push({ icon: <MonitorSmartphone className="h-3 w-3" />, text: `${caps.platform}${caps.browser ? ` · ${caps.browser}` : ""}` });
    if (caps.cores) chips.push({ icon: <Cpu className="h-3 w-3" />, text: `${caps.cores} núcleos` });
    if (caps.memoryGb) chips.push({ icon: <HardDrive className="h-3 w-3" />, text: `${caps.memoryGb} GB RAM` });
    if (caps.gpuRenderer) chips.push({ icon: <Sparkles className="h-3 w-3" />, text: caps.gpuRenderer });
    chips.push({ icon: <Gauge className="h-3 w-3" />, text: caps.webgpu ? "WebGPU ✓" : "sin WebGPU" });
    chips.push({ icon: caps.installedApp ? <ShieldCheck className="h-3 w-3" /> : <Wifi className="h-3 w-3" />, text: caps.installedApp ? "app del OS instalada" : "navegador (sin instalar)" });
    if (caps.ollama || caps.lmstudio) chips.push({ icon: <Server className="h-3 w-3" />, text: caps.ollama ? "Ollama local" : "LM Studio local" });
    return chips;
  }, [caps]);

  const body = (
    <div className="space-y-3">
      {/* Capacidades detectadas */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/[0.07] to-transparent p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
            <Cpu className="h-4 w-4 text-cyan-300" /> Capacidades de esta neurona
          </p>
          {rec && (
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-100">
              {tierLabel(rec.tier)}
            </span>
          )}
        </div>
        {caps ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {specChips.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70">
                {c.icon} {c.text}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-[11px] text-white/45"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Detectando hardware…</p>
        )}
        {rec && (
          <p className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-[11px] leading-snug text-white/70">
            {rec.strategy === "local" ? <Brain className="mr-1 inline h-3.5 w-3.5 text-violet-300" /> : <Server className="mr-1 inline h-3.5 w-3.5 text-cyan-300" />}
            {rec.summary}
          </p>
        )}
      </div>

      {rec && caps && (
        <>
          <KindSection title="Modelo de lenguaje (Astraura · OpenRouter/local)" icon={<Brain className="h-4 w-4 text-violet-300" />} kind={rec.llm} caps={caps} scoutKind="llm" />
          <KindSection title="Voz (OmniVoice)" icon={<Mic className="h-4 w-4 text-fuchsia-300" />} kind={rec.voz} caps={caps} scoutKind="voz" />
        </>
      )}

      {/* Descargas locales en 2º plano + modelos propios (Adenda 113). */}
      <div className="border-t border-white/10 pt-3">
        <ModelDownloadsPanel embedded />
      </div>

      {/* Gestión de esta neurona: servidor/receptor, ubicación, memorias, logs (Adenda 114). */}
      <div className="border-t border-white/10 pt-3">
        <NeuronServerConfig />
      </div>

      <p className="px-0.5 text-[10px] leading-snug text-white/35">
        Selecciones automáticas por defecto según el entorno. Todo es ajustable después en cada chat, personalidad y cerebro.
        Los modelos de servidor funcionan en cualquier neurona sin instalar nada; los locales requieren la app del OS instalada.
      </p>
    </div>
  );

  if (embedded) {
    return (
      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <Cpu className="h-4 w-4 text-cyan-300" /> Capacidades y modelos recomendados
        </h3>
        {body}
      </div>
    );
  }

  return (
    <Card className="border-white/10 bg-black/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Cpu className="h-4 w-4 text-cyan-300" /> Neurona · capacidades y modelos
        </CardTitle>
        <CardDescription>
          Detecta el hardware de esta neurona y recomienda los mejores modelos de IA y voz según sus capacidades,
          con requisitos mínimos y prueba funcional.
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

export default NeuronModelsPanel;
