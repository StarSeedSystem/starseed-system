"use client";

/**
 * IntegrationsSkills — sección del Hub de Habilidades que expone CADA
 * integración OSS (Crawl4AI, Firecrawl, SearXNG, Stirling-PDF, Dify, Langflow,
 * Flowise, n8n, Ollama, Browser Use, OpenHands…) como una "skill" INSTALABLE y
 * FUNCIONAL. Instalar una skill en un cerebro = activar la tool de Aurora para
 * ESE cerebro (persistimos `enabled` en la config por-cerebro de la integración
 * reutilizando saveIntegrationConfig/loadIntegrationConfig del registro). Cuando
 * está instalada, Aurora puede invocar la tool por su nombre desde ese cerebro.
 *
 * 100% ADITIVO y DEFENSIVO: nada lanza, todo degrada con guardas. No edita el
 * catálogo de habilidades; lo complementa con las integraciones ejecutables.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plug,
  Brain,
  Loader2,
  CheckCircle2,
  CircleSlash,
  RefreshCw,
  ExternalLink,
  KeyRound,
  Globe,
  Zap,
} from "lucide-react";
import {
  AURORA_INTEGRATION_TOOLS,
  type AuroraIntegrationTool,
} from "@/lib/integrations/aurora-tools";
import {
  getIntegration,
  loadIntegrationConfig,
  saveIntegrationConfig,
} from "@/lib/integrations/registry";
import { listTargets, type AttachTarget } from "@/lib/abilities/abilities";

// ── Modelo de fila (una skill de integración) ────────────────────────────────

interface IntegrationSkill {
  tool: AuroraIntegrationTool;
  label: string;
  capabilities: string[];
  defaultEndpoint?: string;
  needsKey?: boolean;
  docsUrl?: string;
}

/** Construye la lista de skills de integración desde el contrato + el registro. */
function buildIntegrationSkills(): IntegrationSkill[] {
  return AURORA_INTEGRATION_TOOLS.map((tool) => {
    const desc = getIntegration(tool.integrationId);
    return {
      tool,
      label: desc?.label || tool.integrationId,
      capabilities: desc?.capabilities || [],
      defaultEndpoint: desc?.defaultEndpoint,
      needsKey: desc?.needsKey,
      docsUrl: desc?.docsUrl,
    };
  });
}

/** Estado de una integración para un objetivo (global o cerebro). */
interface ToolState {
  /** Configurada/activa: enabled !== false y con endpoint (global o por cerebro). */
  available: boolean;
  /** Instalada explícitamente en ESTE cerebro (enabled === true en la clave del cerebro). */
  installedHere: boolean;
  /** Tiene endpoint resoluble (config o por defecto). */
  hasEndpoint: boolean;
}

/** Calcula el estado de una integración para el cerebro dado (o global). */
function readToolState(integrationId: string, brainId?: string): ToolState {
  const desc = getIntegration(integrationId);
  const cfg = loadIntegrationConfig(integrationId, brainId);
  const endpoint = (cfg.endpoint && cfg.endpoint.trim()) || desc?.defaultEndpoint || "";
  const available = cfg.enabled !== false && !!endpoint;
  return {
    available,
    installedHere: cfg.enabled === true,
    hasEndpoint: !!endpoint,
  };
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function IntegrationsSkills() {
  const skills = useMemo(() => buildIntegrationSkills(), []);

  // Cerebros disponibles + cerebro elegido como objetivo de instalación.
  const [brains, setBrains] = useState<AttachTarget[]>([]);
  const [brainId, setBrainId] = useState<string>(""); // "" = global (cuenta)
  const [loadingBrains, setLoadingBrains] = useState(true);

  // Versión para forzar recálculo de estados tras instalar/desinstalar.
  const [rev, setRev] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const loadBrains = useCallback(async () => {
    setLoadingBrains(true);
    try {
      const list = await listTargets("cerebro");
      setBrains(list);
    } catch {
      setBrains([]);
    }
    setLoadingBrains(false);
  }, []);

  useEffect(() => {
    loadBrains();
  }, [loadBrains]);

  // Reacciona a cambios de config hechos por otras superficies (Conexiones…).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setRev((r) => r + 1);
    window.addEventListener("starseed:integration-config-changed", onChange as EventListener);
    return () => window.removeEventListener("starseed:integration-config-changed", onChange as EventListener);
  }, []);

  const targetBrain = useMemo(() => brains.find((b) => b.ref === brainId) || null, [brains, brainId]);
  const targetLabel = brainId ? targetBrain?.name || "Cerebro" : "Cuenta (global)";

  // Instala (activa) la integración para el objetivo: persiste enabled=true y un
  // endpoint efectivo en la clave por-cerebro (o global). Aurora podrá usar la tool.
  const install = useCallback(
    (s: IntegrationSkill) => {
      const id = s.tool.integrationId;
      const bId = brainId || undefined;
      setBusy(s.tool.name);
      try {
        const prev = loadIntegrationConfig(id, bId);
        const endpoint = (prev.endpoint && prev.endpoint.trim()) || s.defaultEndpoint || "";
        saveIntegrationConfig(id, { ...prev, enabled: true, endpoint }, bId);
        setRev((r) => r + 1);
        toast.success(
          `«${s.label}» instalada en ${targetLabel}. Aurora ya puede usar «${s.tool.name}».`,
        );
        if (s.needsKey && !(prev.apiKey && prev.apiKey.trim())) {
          toast.message("Esta herramienta suele requerir una clave", {
            description: "Añádela en Conexiones para que funcione del todo.",
          });
        }
      } catch {
        toast.error("No se pudo instalar la herramienta.");
      }
      setBusy(null);
    },
    [brainId, targetLabel],
  );

  // Desinstala (desactiva) en el objetivo: enabled=false en su clave de config.
  const uninstall = useCallback(
    (s: IntegrationSkill) => {
      const id = s.tool.integrationId;
      const bId = brainId || undefined;
      setBusy(s.tool.name);
      try {
        const prev = loadIntegrationConfig(id, bId);
        saveIntegrationConfig(id, { ...prev, enabled: false }, bId);
        setRev((r) => r + 1);
        toast.success(`«${s.label}» desinstalada de ${targetLabel}.`);
      } catch {
        toast.error("No se pudo desinstalar la herramienta.");
      }
      setBusy(null);
    },
    [brainId, targetLabel],
  );

  // Recalcula estados (depende de rev, brainId).
  const states = useMemo(() => {
    const map: Record<string, ToolState> = {};
    for (const s of skills) {
      map[s.tool.name] = readToolState(s.tool.integrationId, brainId || undefined);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills, brainId, rev]);

  const installedCount = useMemo(
    () => skills.filter((s) => states[s.tool.name]?.installedHere).length,
    [skills, states],
  );

  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-sky-600">
          <Plug className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-cyan-50">
            Integraciones · herramientas de Aurora
          </span>
          <span className="text-[11px] text-cyan-300/70">
            Instala servicios OSS (crawl, PDF, flujos, automatizaciones, búsqueda web, chat local…)
            como skills funcionales. Al instalarlas en un cerebro, Aurora puede invocarlas.
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="border-cyan-500/30 text-[9px] text-cyan-200/80">
            {skills.length} integraciones
          </Badge>
          <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-200/80">
            {installedCount} en {brainId ? "este cerebro" : "tu cuenta"}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 border-cyan-500/30 text-cyan-100"
            onClick={() => {
              loadBrains();
              setRev((r) => r + 1);
            }}
          >
            <RefreshCw className={cn("h-4 w-4", loadingBrains && "animate-spin")} /> Actualizar
          </Button>
        </div>
      </div>

      {/* Objetivo: cuenta (global) o un cerebro concreto */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-cyan-300/60">
          <Brain className="h-3.5 w-3.5" /> Instalar en
        </span>
        <button
          onClick={() => setBrainId("")}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
            brainId === ""
              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
              : "border-white/10 text-white/50 hover:text-white/80",
          )}
        >
          <Globe className="h-3.5 w-3.5" /> Cuenta (global)
        </button>
        {loadingBrains ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-white/40">
            <Loader2 className="h-3 w-3 animate-spin" /> Cargando cerebros…
          </span>
        ) : brains.length === 0 ? (
          <span className="text-[11px] text-white/40">
            No hay cerebros (¿sesión iniciada?). Puedes instalar a nivel de cuenta.
          </span>
        ) : (
          brains.map((b) => (
            <button
              key={b.ref}
              onClick={() => setBrainId(b.ref)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs",
                brainId === b.ref
                  ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
                  : "border-white/10 text-white/50 hover:text-white/80",
              )}
            >
              <Brain className="h-3.5 w-3.5" /> {b.name}
            </button>
          ))
        )}
      </div>

      {/* Tarjetas de integración (skills instalables) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s) => {
          const st = states[s.tool.name] || { available: false, installedHere: false, hasEndpoint: false };
          const isBusy = busy === s.tool.name;
          return (
            <div
              key={s.tool.name}
              className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-3.5"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-cyan-500 to-sky-600 text-white">
                  <Zap className="h-4 w-4" />
                </div>
                <span className="flex-1 text-sm font-semibold text-white">{s.label}</span>
                <Badge variant="outline" className="border-emerald-400/40 text-[8px] text-emerald-300">
                  OSS
                </Badge>
              </div>

              <p className="mt-2 text-[11px] text-white/55">{s.tool.description}</p>

              {s.capabilities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.capabilities.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-white/45"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Estado: instalada aquí / disponible / inactiva */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                {st.installedHere ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Instalada en {brainId ? "este cerebro" : "tu cuenta"}
                  </span>
                ) : st.available ? (
                  <span className="inline-flex items-center gap-1 text-cyan-300/80">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Disponible (heredada/global)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-white/40">
                    <CircleSlash className="h-3.5 w-3.5" /> Inactiva
                  </span>
                )}
                {s.needsKey && (
                  <span className="inline-flex items-center gap-1 text-amber-300/70" title="Suele requerir clave">
                    <KeyRound className="h-3 w-3" /> clave
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] text-white/30">{s.tool.name}</span>
                <div className="flex items-center gap-1.5">
                  {s.docsUrl && (
                    <a
                      href={s.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-white/35 hover:text-cyan-300"
                      title="Documentación"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {st.installedHere ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 border-rose-500/30 text-rose-200 hover:bg-rose-500/10"
                      disabled={isBusy}
                      onClick={() => uninstall(s)}
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleSlash className="h-3.5 w-3.5" />}
                      Quitar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 bg-cyan-600 text-white hover:bg-cyan-500"
                      disabled={isBusy}
                      onClick={() => install(s)}
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                      Instalar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-white/35">
        Instalar activa la herramienta para Aurora en el objetivo elegido (se guarda con la config de
        la integración). Configura endpoint y claves en Conexiones. Aurora solo ofrece y ejecuta las
        herramientas que estén configuradas y disponibles para el cerebro activo.
      </p>
    </div>
  );
}
