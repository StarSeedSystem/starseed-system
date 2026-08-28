"use client";

/**
 * IntegrationsPanel — UI de configuración de los conectores funcionales OSS.
 *
 * Pinta el catálogo `INTEGRATIONS` agrupado por categoría. Para cada
 * herramienta permite: activar/desactivar, fijar endpoint (con el de StarSeed
 * por defecto), clave (si la herramienta la necesita), campos extra dinámicos
 * (flowId, chatflowId, webhookPath, model, path…) y probar la conexión real con
 * `testIntegration`. Persiste con `saveIntegrationConfig` (onBlur, sin spamear)
 * y carga el estado inicial con `loadIntegrationConfig`.
 *
 * - `brainId` ausente  → configuración GLOBAL.
 * - `brainId` presente → configuración por cerebro (el registro hace fallback
 *   global→cerebro, así que aquí sólo guardamos/leemos con ese `brainId`).
 *
 * Defensivo y SSR-safe: nada lanza, las llamadas de red degradan con honestidad,
 * y todo el acceso a almacenamiento ya está guardado dentro del registro.
 *
 * Sigue el estilo de las secciones por-cerebro de brains-panel.tsx (tarjetas
 * `rounded-lg border border-cyan-500/20 bg-cyan-950/10`, cabeceras en
 * mayúsculas, Switch/Input de shadcn).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Plug,
  Plug2,
  KeyRound,
  Link2,
  Loader2,
  Check,
  X,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Globe2,
  Database,
  Workflow,
  Cpu,
  Search as SearchIcon,
  Boxes,
} from "lucide-react";
import {
  INTEGRATIONS,
  loadIntegrationConfig,
  saveIntegrationConfig,
} from "@/lib/integrations/registry";
import { testIntegration } from "@/lib/integrations/run";
import type {
  IntegrationConfig,
  IntegrationCategory,
  IntegrationDescriptor,
} from "@/lib/integrations/types";

/* ── Etiquetas de categoría en español + icono ───────────────────────────── */
const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  "data-ingest": "Ingesta de datos y búsqueda",
  "app-platform": "Apps y plataformas IA",
  automation: "Automatización",
  backend: "Backends",
  runtime: "Runtimes locales (compatibles OpenAI)",
  devops: "DevOps",
  memory: "Memoria y contexto",
};

const CATEGORY_ICONS: Record<IntegrationCategory, typeof Database> = {
  "data-ingest": Database,
  "app-platform": Boxes,
  automation: Workflow,
  backend: Database,
  runtime: Cpu,
  devops: Globe2,
  memory: Database,
};

// Orden estable de presentación de las categorías.
const CATEGORY_ORDER: IntegrationCategory[] = [
  "data-ingest",
  "app-platform",
  "runtime",
  "automation",
  "backend",
  "devops",
];

/* ── Campos extra por herramienta ────────────────────────────────────────── */
/**
 * Mapa por-id de los campos `extra` que cada integración necesita. Se infiere
 * del contrato de los clientes/runner:
 *   • langflow   → extra.flowId
 *   • flowise    → extra.chatflowId
 *   • n8n        → extra.webhookPath
 *   • openai-compat (open-webui/ollama/litellm/localai) → extra.model
 *   • dify       → extra.model (id de app / modelo según workflow)
 *   • openhands / browser-use → extra.path (ruta del endpoint, experimental)
 */
interface ExtraField {
  key: string;
  label: string;
  placeholder: string;
  hint?: string;
}

const EXTRA_FIELDS: Record<string, ExtraField[]> = {
  langflow: [
    {
      key: "flowId",
      label: "Flow ID",
      placeholder: "p.ej. a1b2c3d4-…",
      hint: "Identificador del flujo a ejecutar.",
    },
  ],
  flowise: [
    {
      key: "chatflowId",
      label: "Chatflow ID",
      placeholder: "p.ej. 5e6f7a8b-…",
      hint: "Identificador del chatflow a consultar.",
    },
  ],
  n8n: [
    {
      key: "webhookPath",
      label: "Ruta del webhook",
      placeholder: "p.ej. webhook/mi-flujo",
      hint: "Ruta del webhook que dispara el workflow.",
    },
  ],
  dify: [
    {
      key: "model",
      label: "App / modelo",
      placeholder: "p.ej. mi-app o el modelo",
      hint: "Opcional. La clave de Dify suele ir por app.",
    },
  ],
  "open-webui": [
    { key: "model", label: "Modelo", placeholder: "p.ej. llama3.1" },
  ],
  ollama: [
    { key: "model", label: "Modelo", placeholder: "p.ej. llama3.1" },
  ],
  litellm: [
    { key: "model", label: "Modelo", placeholder: "p.ej. gpt-4o" },
  ],
  localai: [
    { key: "model", label: "Modelo", placeholder: "p.ej. gpt-4" },
  ],
  openhands: [
    {
      key: "path",
      label: "Ruta del endpoint",
      placeholder: "p.ej. /api/conversations",
      hint: "Experimental: ruta a la que enviar la tarea.",
    },
  ],
  "browser-use": [
    {
      key: "path",
      label: "Ruta del endpoint",
      placeholder: "p.ej. /api/run",
      hint: "Experimental: ruta a la que enviar la tarea.",
    },
  ],
};

function extraFieldsFor(desc: IntegrationDescriptor): ExtraField[] {
  return EXTRA_FIELDS[desc.id] ?? [];
}

/* ── Tipos de estado local ───────────────────────────────────────────────── */
type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

/* ── Tarjeta de una integración ──────────────────────────────────────────── */
function IntegrationCard({
  desc,
  brainId,
}: {
  desc: IntegrationDescriptor;
  brainId?: string;
}) {
  const [cfg, setCfg] = useState<IntegrationConfig>({});
  const [open, setOpen] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const mounted = useRef(true);

  const extras = useMemo(() => extraFieldsFor(desc), [desc]);

  // Carga inicial (cliente; SSR-safe porque loadIntegrationConfig ya guarda).
  useEffect(() => {
    mounted.current = true;
    try {
      const loaded = loadIntegrationConfig(desc.id, brainId);
      setCfg(loaded ?? {});
    } catch {
      setCfg({});
    }
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desc.id, brainId]);

  const enabled = cfg.enabled === true;

  // El endpoint efectivo (lo que se probaría) = configurado o el de StarSeed.
  const effectiveEndpoint = (cfg.endpoint && cfg.endpoint.trim()) || desc.defaultEndpoint || "";

  function persist(next: IntegrationConfig) {
    try {
      saveIntegrationConfig(desc.id, next, brainId);
    } catch {
      /* noop — el registro ya es defensivo */
    }
  }

  function patch(p: Partial<IntegrationConfig>) {
    setCfg((c) => ({ ...c, ...p }));
  }

  // Activar/desactivar persiste al instante (es un toggle, no hay onBlur).
  function setEnabled(v: boolean) {
    const next: IntegrationConfig = { ...cfg, enabled: v };
    // Si se activa sin endpoint propio, rellenamos con el de StarSeed por defecto.
    if (v && !(next.endpoint && next.endpoint.trim()) && desc.defaultEndpoint) {
      next.endpoint = desc.defaultEndpoint;
    }
    setCfg(next);
    persist(next);
    if (v && !open) setOpen(true);
  }

  // Campos de texto: actualizan estado en vivo, persisten en onBlur.
  function patchExtra(key: string, value: string) {
    setCfg((c) => ({ ...c, extra: { ...(c.extra ?? {}), [key]: value } }));
  }

  async function onTest() {
    setTest({ status: "testing" });
    try {
      // Asegura que se prueba con el endpoint efectivo (configurado o StarSeed).
      const probe: IntegrationConfig = {
        ...cfg,
        endpoint: effectiveEndpoint,
      };
      const r = await testIntegration(desc.id, probe);
      if (!mounted.current) return;
      if (r.ok) {
        setTest({ status: "ok", message: "Conexión correcta." });
      } else {
        setTest({ status: "error", message: r.error || "No respondió." });
      }
    } catch (err) {
      if (!mounted.current) return;
      setTest({ status: "error", message: (err as Error)?.message || "Error al probar." });
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-black/20 p-3 transition-colors",
        enabled ? "border-cyan-400/40 bg-cyan-950/15" : "border-white/10",
      )}
    >
      {/* Cabecera de la tarjeta */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 shrink-0 cursor-pointer text-white/40 hover:text-white/70"
          aria-label={open ? "Contraer" : "Expandir"}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-white">{desc.label}</span>
            {desc.needsKey && (
              <Badge variant="outline" className="gap-1 border-amber-400/30 text-[9px] text-amber-200">
                <KeyRound className="h-2.5 w-2.5" /> clave
              </Badge>
            )}
            {enabled && (
              <Badge variant="outline" className="gap-1 border-cyan-400/40 text-[9px] text-cyan-200">
                <Check className="h-2.5 w-2.5" /> activa
              </Badge>
            )}
          </div>
          {desc.capabilities.length > 0 && (
            <p className="mt-0.5 truncate text-[11px] text-white/45">
              {desc.capabilities.join(" · ")}
            </p>
          )}
        </div>
        {/* Activar */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[10px] text-white/40">Activar</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {/* Cuerpo configurable */}
      {open && (
        <div className="mt-3 space-y-2.5 border-t border-white/5 pt-3">
          {/* Endpoint */}
          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] text-white/55">
              <Link2 className="h-3.5 w-3.5 text-cyan-300" /> Endpoint
            </span>
            <Input
              value={cfg.endpoint ?? ""}
              onChange={(e) => patch({ endpoint: e.target.value })}
              onBlur={() => persist(cfg)}
              placeholder={desc.defaultEndpoint || "https://mi-servidor:puerto"}
              className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
            <span className="text-[10px] text-white/35">
              Vacío usa el de StarSeed por defecto
              {desc.defaultEndpoint ? ` (${desc.defaultEndpoint})` : ""}.
            </span>
          </label>

          {/* Clave (si la necesita) */}
          {desc.needsKey && (
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] text-white/55">
                <KeyRound className="h-3.5 w-3.5 text-amber-300" /> Clave / token
              </span>
              <Input
                type="password"
                value={cfg.apiKey ?? ""}
                onChange={(e) => patch({ apiKey: e.target.value })}
                onBlur={() => persist(cfg)}
                placeholder="••••••••"
                className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
            </label>
          )}

          {/* Campos extra dinámicos */}
          {extras.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] text-white/55">
                <Sparkles className="h-3.5 w-3.5 text-emerald-300" /> {f.label}
              </span>
              <Input
                value={cfg.extra?.[f.key] ?? ""}
                onChange={(e) => patchExtra(f.key, e.target.value)}
                onBlur={() => persist(cfg)}
                placeholder={f.placeholder}
                className="h-8 border-white/15 bg-black/30 text-white placeholder:text-white/30"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              {f.hint && <span className="text-[10px] text-white/30">{f.hint}</span>}
            </label>
          ))}

          {/* Probar conexión + resultado inline */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-cyan-500/30 text-cyan-100 hover:bg-cyan-500/10"
              disabled={test.status === "testing"}
              onClick={onTest}
            >
              {test.status === "testing" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plug className="h-3.5 w-3.5" />
              )}
              Probar conexión
            </Button>
            {test.status === "ok" && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                <Check className="h-3.5 w-3.5" /> {test.message}
              </span>
            )}
            {test.status === "error" && (
              <span className="inline-flex items-center gap-1 text-[11px] text-red-300">
                <X className="h-3.5 w-3.5" /> {test.message}
              </span>
            )}
            {desc.docsUrl && (
              <a
                href={desc.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-[10px] text-white/35 underline hover:text-white/60"
              >
                Documentación
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Panel principal ─────────────────────────────────────────────────────── */
export default function IntegrationsPanel({ brainId }: { brainId?: string } = {}) {
  // Agrupa las integraciones por categoría, en el orden estable definido.
  const grouped = useMemo(() => {
    const map = new Map<IntegrationCategory, IntegrationDescriptor[]>();
    for (const desc of INTEGRATIONS) {
      const arr = map.get(desc.category) ?? [];
      arr.push(desc);
      map.set(desc.category, arr);
    }
    const order: IntegrationCategory[] = [
      ...CATEGORY_ORDER.filter((c) => map.has(c)),
      // categorías presentes que no estuvieran en el orden conocido
      ...Array.from(map.keys()).filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
    return order.map((cat) => ({ cat, items: map.get(cat) ?? [] }));
  }, []);

  return (
    <div className="space-y-4">
      {/* Nota de cabecera */}
      <div className="flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-500/10 text-cyan-200">
          <Plug2 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cyan-50">
            Integraciones de herramientas {brainId ? "(este cerebro)" : ""}
          </p>
          <p className="text-[11px] text-cyan-300/70">
            Por defecto se usan los servicios de StarSeed; configura tu propio endpoint
            (local o externo) para usar el tuyo.
          </p>
        </div>
      </div>

      {/* Grupos por categoría */}
      {grouped.map(({ cat, items }) => {
        const Icon = CATEGORY_ICONS[cat] ?? SearchIcon;
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-cyan-300/60">
              <Icon className="h-3.5 w-3.5" /> {CATEGORY_LABELS[cat] ?? cat}
              <Badge variant="outline" className="ml-auto border-white/15 text-[9px] normal-case text-white/45">
                {items.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {items.map((desc) => (
                <IntegrationCard key={desc.id} desc={desc} brainId={brainId} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
