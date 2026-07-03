"use client";

/**
 * <NvidiaNimPanel /> — "NVIDIA NIM · Modelos y Skills".
 *
 * Panel Crystal-glass, responsive, para conectar y explorar la API-catalog de
 * NVIDIA NIM (build.nvidia.com), que es COMPATIBLE con OpenAI:
 *   • Campo de API key (persistida como conexión OSS del servicio 'nvidia-nim'
 *     vía `addConnection`; y espejo en localStorage 'starseed.nvidia.apikey'
 *     como respaldo/lectura rápida).
 *   • "Probar" (testNim) y "Detectar modelos" (listModels en vivo).
 *   • Catálogo CURADO de modelos por categoría (LLM, visión, imagen, código,
 *     embeddings, voz) con badge "gratis (Developer Program)", fusionable con la
 *     lista real de la cuenta.
 *   • Lista de SKILLS / blueprints agénticos.
 *   • GUÍAS inteligentes desplegables (¿cómo consigo la clave?, ¿cómo funciona
 *     NIM?, ¿para qué sirve cada modelo/skill?) — honestas y en español.
 *   • Selector "usar por defecto para la función X" (texto/imagen/código/voz),
 *     que fija el servicio NVIDIA como default OSS y guarda el modelo elegido.
 *
 * Honesto: NVIDIA NIM NO se instala en tu web; se CONECTA por clave (Bearer).
 * La clave es GRATIS para prototipar con el NVIDIA Developer Program.
 *
 * SSR-safe y defensivo: los clientes NIM nunca lanzan; los stores tocan
 * localStorage tras guardas. No añade dependencias.
 */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Cpu,
  KeyRound,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Sparkles,
  HelpCircle,
  Star,
  Save,
  Wand2,
} from "lucide-react";

import {
  NIM_DEFAULT_BASE_URL,
  NIM_BUILD_URL,
  testNim,
  type NimTestResult,
} from "@/lib/services/nvidia/nim-client";
import {
  buildNimSkills,
  buildNimModelGroups,
  mergeWithLiveModels,
  NIM_CATEGORY_META,
  type NimCategory,
  type NimModelEntry,
  type NimSkillEntry,
} from "@/lib/services/nvidia/nim-catalog";
import {
  addConnection,
  connectionsForService,
  updateConnection,
  setDefaultFor,
  type OssScope,
} from "@/lib/services/oss-connections";
import {
  getGenerationFunctions,
  nimCategoriesForFunction,
  setNimModelFor,
  type GenerationFunction,
} from "@/ai/functions/function-models";
import type { OssServiceCategory } from "@/lib/services/oss-services";

// ── Clave de respaldo en localStorage (además de la conexión OSS) ────────────
const NVIDIA_APIKEY_LS = "starseed.nvidia.apikey";
/** Servicio LLM de NVIDIA en el catálogo OSS (ancla de la conexión de la clave). */
const NVIDIA_LLM_SERVICE_ID = "nvidia-nim";

// ── Mapa categoría NIM → categoría OSS (para fijar el default correcto) ───────
// NIM tiene categorías más ricas; al fijar "por defecto para la función" hay que
// traducir a la categoría OSS que la resolución entiende, y elegir el servicio
// NVIDIA adecuado.
const NIM_TO_OSS: Record<
  NimCategory,
  { ossCategory: OssServiceCategory; serviceId: string }
> = {
  llm: { ossCategory: "llm", serviceId: "nvidia-nim" },
  code: { ossCategory: "llm", serviceId: "nvidia-nim" },
  embedding: { ossCategory: "llm", serviceId: "nvidia-nim" },
  vision: { ossCategory: "image", serviceId: "nvidia-nim-vision" },
  image: { ossCategory: "image", serviceId: "nvidia-nim-vision" },
  stt: { ossCategory: "stt", serviceId: "nvidia-riva-asr" },
  tts: { ossCategory: "tts", serviceId: "nvidia-riva-tts" },
};

// ── Lectura SSR-safe de la clave guardada (conexión OSS o localStorage) ──────
function readStoredKey(): string {
  // 1) conexión OSS del servicio LLM de NVIDIA (fuente preferida).
  try {
    const conns = connectionsForService(NVIDIA_LLM_SERVICE_ID);
    const withKey = conns.find((c) => c.apiKey && c.apiKey.trim());
    if (withKey?.apiKey) return withKey.apiKey;
  } catch {
    /* noop */
  }
  // 2) respaldo en localStorage.
  if (typeof window !== "undefined") {
    try {
      const v = window.localStorage.getItem(NVIDIA_APIKEY_LS);
      if (v && v.trim()) return v;
    } catch {
      /* noop */
    }
  }
  return "";
}

/**
 * Persiste la clave: como conexión OSS del servicio 'nvidia-nim' (creándola o
 * actualizándola) Y como respaldo en localStorage. Nunca lanza.
 */
function persistKey(apiKey: string): void {
  const key = apiKey.trim();
  // localStorage (respaldo).
  if (typeof window !== "undefined") {
    try {
      if (key) window.localStorage.setItem(NVIDIA_APIKEY_LS, key);
      else window.localStorage.removeItem(NVIDIA_APIKEY_LS);
    } catch {
      /* noop */
    }
  }
  // conexión OSS.
  try {
    const existing = connectionsForService(NVIDIA_LLM_SERVICE_ID);
    if (existing.length > 0) {
      updateConnection(existing[0].id, {
        apiKey: key,
        endpoint: existing[0].endpoint || NIM_DEFAULT_BASE_URL,
        enabled: true,
      });
    } else if (key) {
      addConnection({
        serviceId: NVIDIA_LLM_SERVICE_ID,
        label: "NVIDIA NIM (clave del Developer Program)",
        endpoint: NIM_DEFAULT_BASE_URL,
        apiKey: key,
        scope: "user",
        enabled: true,
      });
    }
  } catch {
    /* noop */
  }
}

// ── Guía desplegable (native <details>, sin dependencias) ────────────────────

function Guide({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 [&_summary]:list-none">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-medium text-primary/90 transition hover:text-primary">
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
        {title}
        <span className="ml-auto text-[10px] text-muted-foreground transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

// ── Tarjeta de un modelo ──────────────────────────────────────────────────────

function ModelCard({
  model,
  onUseFor,
}: {
  model: NimModelEntry;
  onUseFor: (model: NimModelEntry) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-primary/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {model.name}
          </p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {model.id}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {model.live && (
            <Badge className="border-emerald-400/30 bg-emerald-400/10 px-1.5 text-[8px] text-emerald-300">
              en vivo
            </Badge>
          )}
          {model.freeForPrototype && (
            <Badge className="border-primary/30 bg-primary/10 px-1.5 text-[8px] text-primary">
              gratis (Developer Program)
            </Badge>
          )}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {model.purpose}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <a
          href={model.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-primary/80 transition hover:text-primary"
        >
          Ficha en build.nvidia.com <ExternalLink className="h-3 w-3" />
        </a>
        <button
          onClick={() => onUseFor(model)}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-lg border border-primary/30 bg-primary/[0.08] px-2 py-1 text-[10px] text-primary transition hover:bg-primary/[0.16]"
        >
          <Star className="h-3 w-3" />
          Usar por defecto
        </button>
      </div>
    </div>
  );
}

// ── Diálogo ligero "usar por defecto para la función X" ──────────────────────

function UseForPicker({
  model,
  scope,
  onClose,
}: {
  model: NimModelEntry;
  scope: OssScope;
  onClose: () => void;
}) {
  // Funciones cuya categoría NIM incluye la del modelo elegido.
  const eligibleFns = useMemo<GenerationFunction[]>(
    () =>
      getGenerationFunctions().filter((fn) =>
        nimCategoriesForFunction(fn.id).includes(model.category),
      ),
    [model.category],
  );

  const apply = (fn: GenerationFunction) => {
    const target = NIM_TO_OSS[model.category];
    // 1) Asegura una conexión del servicio NVIDIA adecuado (con la clave si hay).
    let connId: string | null = null;
    try {
      const existing = connectionsForService(target.serviceId);
      if (existing.length > 0) {
        connId = existing[0].id;
      } else {
        const key = readStoredKey();
        const created = addConnection({
          serviceId: target.serviceId,
          label: `NVIDIA · ${NIM_CATEGORY_META[model.category].label}`,
          endpoint: NIM_DEFAULT_BASE_URL,
          apiKey: key || undefined,
          scope: "user",
          enabled: true,
        });
        connId = created?.id ?? null;
      }
    } catch {
      connId = null;
    }
    // 2) Fija esa conexión como default OSS para la categoría de la función.
    let okDefault = false;
    if (connId) {
      try {
        okDefault = setDefaultFor(target.ossCategory, connId, scope);
      } catch {
        okDefault = false;
      }
    }
    // 3) Guarda el modelo NIM concreto para esa función (preferencia de UI).
    const okModel = setNimModelFor(fn.id, model.id, scope);

    if (okDefault || okModel) {
      toast.success(
        `${model.name} quedará como modelo NVIDIA para "${fn.label}".`,
      );
    } else {
      toast.error("No se pudo fijar el modelo para esa función.");
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1020]/95 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Usar por defecto para…</h3>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
          Elige la función que usará{" "}
          <span className="font-mono text-primary">{model.id}</span> por defecto.
          Se fijará el servicio NVIDIA de esa función y se recordará este modelo.
        </p>
        {eligibleFns.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] text-muted-foreground">
            Ninguna función de generación admite modelos de esta categoría.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {eligibleFns.map((fn) => (
              <button
                key={fn.id}
                onClick={() => apply(fn)}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-xs transition hover:border-primary/40 hover:bg-primary/[0.08]"
              >
                <span className="text-base">{fn.glyph ?? "•"}</span>
                <span className="truncate">{fn.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Skill card ────────────────────────────────────────────────────────────────

function SkillCard({ skill }: { skill: NimSkillEntry }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-3 transition hover:border-primary/30">
      <p className="text-sm font-medium text-foreground">{skill.name}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {skill.purpose}
      </p>
      <a
        href={skill.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary/80 transition hover:text-primary"
      >
        Ver blueprint en build.nvidia.com <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Panel principal
// ════════════════════════════════════════════════════════════════════════════

export interface NvidiaNimPanelProps {
  /** Scope OSS para las preferencias por defecto (por defecto "user"). */
  scope?: OssScope;
  className?: string;
}

export function NvidiaNimPanel({ scope = "user", className }: NvidiaNimPanelProps) {
  const [apiKey, setApiKey] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<NimTestResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [liveNote, setLiveNote] = useState<string>("");
  const [models, setModels] = useState<NimModelEntry[]>([]);
  const [pickerModel, setPickerModel] = useState<NimModelEntry | null>(null);

  const skills = useMemo(() => buildNimSkills(), []);

  // Hidrata la clave guardada y el catálogo curado en el cliente.
  useEffect(() => {
    setApiKey(readStoredKey());
    setModels(
      buildNimModelGroups().flatMap((g) => g.models), // curado, agrupado→plano
    );
    setHydrated(true);
  }, []);

  const groups = useMemo(() => buildNimModelGroups(models), [models]);

  const handleSaveKey = () => {
    persistKey(apiKey);
    toast.success(
      apiKey.trim()
        ? "Clave de NVIDIA guardada (como conexión de servicio)."
        : "Clave de NVIDIA borrada.",
    );
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    persistKey(apiKey); // guarda antes de probar, por comodidad
    try {
      const r = await testNim(apiKey);
      setTestResult(r);
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    } finally {
      setTesting(false);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    setLiveNote("");
    persistKey(apiKey);
    try {
      const r = await mergeWithLiveModels(apiKey);
      setModels(r.models);
      setLiveNote(r.message);
      if (r.ok) toast.success(r.message);
      else toast.message(r.message);
    } finally {
      setDetecting(false);
    }
  };

  const keyPresent = hydrated && apiKey.trim().length > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl md:p-6",
        className,
      )}
    >
      {/* Cabecera */}
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#76b900]/40 bg-[#76b900]/10">
          <Cpu className="h-5 w-5 text-[#76b900]" />
        </div>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            NVIDIA NIM · Modelos y Skills
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Conecta el catálogo de IA de NVIDIA (compatible con OpenAI) con una
            clave <strong>gratis</strong> del Developer Program. No se instala:
            se conecta por clave.
          </p>
        </div>
      </div>

      {/* Bloque de conexión (API key) */}
      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <label className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          Clave de API de NVIDIA (Bearer)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="nvapi-… (se guarda como tu credencial; no se comparte)"
            className="flex-1 font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveKey}
              className="cursor-pointer"
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              Guardar
            </Button>
            <Button
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="cursor-pointer"
            >
              {testing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              )}
              Probar
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDetect}
              disabled={detecting}
              className="cursor-pointer"
            >
              {detecting ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Detectar modelos
            </Button>
          </div>
        </div>

        {/* Resultado de prueba */}
        {testResult && (
          <div
            className={cn(
              "mt-2 flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px]",
              testResult.ok
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-red-500/10 text-red-300",
            )}
          >
            {testResult.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            <span>
              {testResult.message}
              {typeof testResult.ms === "number" ? ` · ${testResult.ms} ms` : ""}
            </span>
          </div>
        )}
        {liveNote && (
          <p className="mt-2 text-[11px] text-muted-foreground">{liveNote}</p>
        )}

        {/* Estado + enlace para conseguir la clave */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            className={cn(
              "px-2 text-[9px]",
              keyPresent
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300",
            )}
          >
            {keyPresent ? "clave configurada" : "sin clave todavía"}
          </Badge>
          <a
            href={NIM_BUILD_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary/80 transition hover:text-primary"
          >
            Conseguir clave gratis en build.nvidia.com{" "}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Guías inteligentes */}
      <div className="mb-5 space-y-2">
        <Guide title="¿Cómo consigo la clave gratis?">
          <p>
            1) Entra en{" "}
            <a
              href={NIM_BUILD_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              build.nvidia.com
            </a>{" "}
            y crea una cuenta del <strong>NVIDIA Developer Program</strong>{" "}
            (gratuita).
          </p>
          <p>
            2) Abre cualquier modelo (p.ej. Llama 3.1) y pulsa{" "}
            <em>Get API Key</em>. Copia la clave (empieza por{" "}
            <span className="font-mono">nvapi-</span>).
          </p>
          <p>
            3) Pégala arriba y pulsa <strong>Guardar</strong> y{" "}
            <strong>Probar</strong>. La API-catalog es gratis para prototipar
            (con límite de créditos de evaluación).
          </p>
        </Guide>

        <Guide title="¿Cómo funciona NIM?">
          <p>
            NIM expone los modelos de NVIDIA a través de una API{" "}
            <strong>compatible con OpenAI</strong>: la base es{" "}
            <span className="font-mono">integrate.api.nvidia.com/v1</span> y se
            autentica con <span className="font-mono">Authorization: Bearer</span>.
          </p>
          <p>
            Por eso StarSeed lo trata como un servicio más: puedes listar modelos
            (<span className="font-mono">GET /models</span>) y generar (
            <span className="font-mono">POST /chat/completions</span>) igual que
            con Ollama o cualquier proveedor compatible.
          </p>
          <p>
            La clave es <strong>tuya</strong>: se guarda como credencial de
            conexión (local + tu cuenta soberana), nunca se comparte con la red.
          </p>
        </Guide>

        <Guide title="¿Para qué sirve cada tipo de modelo?">
          <ul className="ml-3 list-disc space-y-0.5">
            <li>
              <strong>LLM</strong>: chat, razonamiento y texto (Llama, Nemotron,
              Mixtral, DeepSeek…).
            </li>
            <li>
              <strong>Visión / Multimodal</strong>: entienden imágenes + texto
              (Llama Vision, NeVA).
            </li>
            <li>
              <strong>Imagen</strong>: generan imágenes desde texto (Stable
              Diffusion, FLUX).
            </li>
            <li>
              <strong>Código</strong>: completar/explicar código (Codestral, Code
              Llama).
            </li>
            <li>
              <strong>Embeddings</strong>: vectores para búsqueda semántica y RAG
              (NV-Embed).
            </li>
            <li>
              <strong>Voz</strong>: transcribir (ASR: Parakeet/Canary) y sintetizar
              (TTS: FastPitch/Magpie) con Riva.
            </li>
          </ul>
        </Guide>

        <Guide title="¿Qué son las Skills (blueprints)?">
          <p>
            Las <strong>Skills</strong> son blueprints agénticos listos para
            usar: combinan varios modelos y pasos para resolver un caso completo
            (RAG con PDFs, humano digital, análisis de vulnerabilidades…). Son un
            punto de partida para construir agentes reales.
          </p>
          <p>
            Explóralas en{" "}
            <a
              href="https://build.nvidia.com/skills"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              build.nvidia.com/skills
            </a>
            .
          </p>
        </Guide>
      </div>

      {/* Catálogo de modelos por categoría */}
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Modelos por categoría</h3>
          <span className="text-[10px] text-muted-foreground">
            {models.length} en el catálogo · verifica versiones en
            build.nvidia.com/models
          </span>
        </div>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.category}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <h4 className="text-xs font-semibold text-foreground">
                  {g.label}
                </h4>
                <span className="text-[10px] text-muted-foreground">
                  {g.blurb}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.models.map((m) => (
                  <ModelCard key={m.id} model={m} onUseFor={setPickerModel} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Skills */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Skills · Blueprints agénticos</h3>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((s) => (
            <SkillCard key={s.id} skill={s} />
          ))}
        </div>
      </div>

      {/* Nota honesta al pie */}
      <p className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
        Honesto: NVIDIA NIM es un servicio en la nube; StarSeed lo{" "}
        <strong>conecta</strong> por clave, no lo instala. La clave es gratis
        para prototipar con el Developer Program; para producción/on-prem existen
        los contenedores NIM auto-hospedables. Los ids y versiones de modelos
        pueden cambiar: usa "Detectar modelos" para la lista real de tu cuenta.
      </p>

      {/* Picker "usar por defecto para la función X" */}
      {pickerModel && (
        <UseForPicker
          model={pickerModel}
          scope={scope}
          onClose={() => setPickerModel(null)}
        />
      )}
    </div>
  );
}

export default NvidiaNimPanel;
