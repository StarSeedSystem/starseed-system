"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Panel "Automatizaciones (n8n)"
// ----------------------------------------------------------------------------
// Superficie para orquestar workflows de n8n desde StarSeed OS. Usa la CONEXIÓN
// OSS de función `workflow` (resolveServiceFor('workflow')) para saber a qué
// instancia de n8n apuntar (endpoint + API key opcional). El usuario define sus
// propios "ganchos" (webhooks guardados) con {label, path, payload plantilla} y
// puede lanzarlos con un clic. Si hay API key, lista los workflows reales.
//
// Persistencia soberana en localStorage `starseed.n8n.hooks.v1` (por usuario,
// en el dispositivo). SSR-safe y defensivo: nada de esto rompe si n8n no corre.
// Honesto: requiere una instancia de n8n corriendo y accesible (se avisa).
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Workflow,
  Play,
  Plus,
  Trash2,
  RefreshCw,
  Zap,
  Settings2,
  ExternalLink,
  ListChecks,
} from "lucide-react";
import { resolveServiceFor } from "@/lib/services/oss-connections";
import {
  triggerWebhook,
  listWorkflows,
  testN8n,
  type N8nWorkflow,
} from "@/lib/integrations/services/n8n";

// ── Persistencia de los ganchos (webhooks guardados) ─────────────────────────

const HOOKS_KEY = "starseed.n8n.hooks.v1";

interface N8nHook {
  id: string;
  label: string;
  /** Sub-path tras /webhook/ (o URL de webhook completa). */
  path: string;
  /** Plantilla de payload JSON (texto). */
  payload: string;
  lastRunAt?: number;
  lastOk?: boolean;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function loadHooks(): N8nHook[] {
  if (!isClient()) return [];
  try {
    const raw = window.localStorage.getItem(HOOKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((h) => h && typeof h === "object")
      .map((h) => ({
        id: typeof h.id === "string" && h.id ? h.id : makeId(),
        label: typeof h.label === "string" ? h.label : "Sin nombre",
        path: typeof h.path === "string" ? h.path : "",
        payload: typeof h.payload === "string" ? h.payload : "{}",
        lastRunAt: typeof h.lastRunAt === "number" ? h.lastRunAt : undefined,
        lastOk: typeof h.lastOk === "boolean" ? h.lastOk : undefined,
      }));
  } catch {
    return [];
  }
}

function saveHooks(hooks: N8nHook[]): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(HOOKS_KEY, JSON.stringify(hooks));
  } catch {
    /* cuota / modo privado */
  }
}

function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `hook_${crypto.randomUUID()}`;
    }
  } catch {
    /* noop */
  }
  return `hook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Componente ───────────────────────────────────────────────────────────────

export function N8nPanel({ scope = "user" }: { scope?: "user" | "context" | `brain:${string}` | `page:${string}` }) {
  const [hooks, setHooks] = useState<N8nHook[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Estado de la conexión OSS de función 'workflow'.
  const resolved = useMemo(() => {
    try {
      return resolveServiceFor("workflow", scope);
    } catch {
      return null;
    }
    // Recalcular cuando cambian las conexiones (evento del store OSS).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, /* re-render trigger */ hooks.length]);

  const endpoint = resolved?.endpoint ?? "";
  const apiKey = resolved?.connection?.apiKey ?? "";
  const hasEndpoint = !!endpoint;

  // Estado del test / listado de workflows reales.
  const [testing, setTesting] = useState(false);
  const [wfLoading, setWfLoading] = useState(false);
  const [workflows, setWorkflows] = useState<N8nWorkflow[] | null>(null);

  // Formulario de alta.
  const [fLabel, setFLabel] = useState("");
  const [fPath, setFPath] = useState("");
  const [fPayload, setFPayload] = useState('{\n  "hello": "starseed"\n}');

  useEffect(() => {
    setHooks(loadHooks());
  }, []);

  const persist = useCallback((next: N8nHook[]) => {
    setHooks(next);
    saveHooks(next);
  }, []);

  const addHook = useCallback(() => {
    const label = fLabel.trim() || "Automatización";
    const path = fPath.trim();
    if (!path) {
      toast.error("Indica la ruta del webhook (lo que va tras /webhook/).");
      return;
    }
    const hook: N8nHook = {
      id: makeId(),
      label,
      path,
      payload: fPayload.trim() || "{}",
    };
    persist([hook, ...hooks]);
    setFLabel("");
    setFPath("");
    setFPayload('{\n  "hello": "starseed"\n}');
    setShowAdd(false);
    toast.success(`Automatización "${label}" guardada.`);
  }, [fLabel, fPath, fPayload, hooks, persist]);

  const removeHook = useCallback(
    (id: string) => {
      persist(hooks.filter((h) => h.id !== id));
    },
    [hooks, persist],
  );

  const runHook = useCallback(
    async (hook: N8nHook) => {
      if (!hasEndpoint) {
        toast.error("Configura primero la instancia de n8n en Servicios (función Automatización).");
        return;
      }
      setRunning(hook.id);
      let payload: unknown = undefined;
      const body = (hook.payload || "").trim();
      if (body) {
        try {
          payload = JSON.parse(body);
        } catch {
          // Si no es JSON válido, lo mandamos como texto (n8n lo recibe igual).
          payload = body;
        }
      }
      const res = await triggerWebhook(endpoint, hook.path, payload);
      setRunning(null);
      const next = hooks.map((h) =>
        h.id === hook.id ? { ...h, lastRunAt: Date.now(), lastOk: res.ok } : h,
      );
      persist(next);
      if (res.ok) toast.success(`${hook.label}: ${res.message}`);
      else toast.error(`${hook.label}: ${res.message}`);
    },
    [endpoint, hasEndpoint, hooks, persist],
  );

  const doTest = useCallback(async () => {
    if (!hasEndpoint) {
      toast.error("No hay instancia de n8n configurada.");
      return;
    }
    setTesting(true);
    const res = await testN8n(endpoint, apiKey || undefined);
    setTesting(false);
    if (res.ok) toast.success(res.message);
    else toast.warning(res.message);
  }, [endpoint, apiKey, hasEndpoint]);

  const loadRealWorkflows = useCallback(async () => {
    if (!hasEndpoint) {
      toast.error("No hay instancia de n8n configurada.");
      return;
    }
    if (!apiKey) {
      toast.warning("Añade una API key de n8n en Servicios para listar los workflows reales.");
      return;
    }
    setWfLoading(true);
    const res = await listWorkflows(endpoint, apiKey);
    setWfLoading(false);
    if (res.ok) {
      setWorkflows(res.data ?? []);
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  }, [endpoint, apiKey, hasEndpoint]);

  return (
    <Card className="liquid-glass-panel border-white/10">
      <CardContent className="p-4 space-y-4">
        {/* Cabecera */}
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div className="flex items-start gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-300 shrink-0">
              <Workflow className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                Automatizaciones (n8n)
              </h3>
              <p className="text-[11px] text-muted-foreground max-w-xl">
                Lanza tus workflows de n8n por webhook. Guarda accesos con su ruta y una
                plantilla de datos; dispáralos con un clic. Requiere una instancia de n8n
                corriendo y accesible.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasEndpoint ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                Conectado
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300">
                Sin endpoint
              </Badge>
            )}
          </div>
        </div>

        {/* Estado de conexión */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-muted-foreground min-w-0">
              {hasEndpoint ? (
                <>
                  Instancia:{" "}
                  <code className="text-amber-200 break-all">{endpoint}</code>
                  {apiKey ? (
                    <span className="ml-2 text-emerald-300/80">· API key configurada</span>
                  ) : (
                    <span className="ml-2 text-muted-foreground/70">· sin API key (sólo webhooks)</span>
                  )}
                </>
              ) : (
                <span>
                  No hay instancia de n8n conectada. Configúrala en{" "}
                  <a href="/servicios" className="text-amber-300 underline hover:text-amber-200">
                    Servicios → Automatización
                  </a>
                  .
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={doTest}
                disabled={!hasEndpoint || testing}
              >
                <Zap className={cn("w-3 h-3 mr-1", testing && "animate-pulse")} />
                Probar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[10px]"
                onClick={loadRealWorkflows}
                disabled={!hasEndpoint || wfLoading}
              >
                <ListChecks className={cn("w-3 h-3 mr-1", wfLoading && "animate-pulse")} />
                Ver workflows
              </Button>
              <a
                href="/servicios"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-white/10 hover:bg-white/5 text-[10px] text-muted-foreground"
                title="Configurar la conexión de n8n"
              >
                <Settings2 className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Workflows reales (si se cargaron con API key) */}
          {workflows && (
            <div className="pt-1 border-t border-white/5">
              {workflows.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  No hay workflows en esta instancia (o la API key no tiene acceso).
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {workflows.map((w) => (
                    <span
                      key={w.id}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] border",
                        w.active
                          ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/[0.06]"
                          : "border-white/10 text-muted-foreground",
                      )}
                      title={w.active ? "Activo" : "Inactivo"}
                    >
                      {w.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lista de ganchos guardados */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Automatizaciones guardadas
              {hooks.length > 0 && (
                <Badge variant="outline" className="border-white/10 text-[9px] px-1">
                  {hooks.length}
                </Badge>
              )}
            </h4>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={() => setShowAdd((s) => !s)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Nueva
            </Button>
          </div>

          {/* Formulario de alta */}
          {showAdd && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3 space-y-2">
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Nombre</Label>
                  <Input
                    value={fLabel}
                    onChange={(e) => setFLabel(e.target.value)}
                    placeholder="p.ej. Publicar en redes"
                    className="h-7 text-[11px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Ruta del webhook (tras /webhook/)
                  </Label>
                  <Input
                    value={fPath}
                    onChange={(e) => setFPath(e.target.value)}
                    placeholder="mi-flujo  ·  o URL completa"
                    className="h-7 text-[11px] font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Plantilla de datos (JSON)
                </Label>
                <Textarea
                  value={fPayload}
                  onChange={(e) => setFPayload(e.target.value)}
                  className="text-[11px] font-mono min-h-[72px]"
                  spellCheck={false}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px]"
                  onClick={() => setShowAdd(false)}
                >
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 text-[10px]" onClick={addHook}>
                  Guardar automatización
                </Button>
              </div>
            </div>
          )}

          {hooks.length === 0 && !showAdd ? (
            <div className="rounded-xl border border-dashed border-white/10 p-4 text-center">
              <p className="text-[11px] text-muted-foreground">
                Aún no has guardado ninguna automatización. Crea una con la URL de webhook
                de un workflow de n8n.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {hooks.map((h) => (
                <div
                  key={h.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3"
                >
                  <div className="p-1.5 rounded-lg bg-white/5 text-amber-300 shrink-0">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold truncate">{h.label}</span>
                      {typeof h.lastOk === "boolean" && (
                        <span
                          className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded-full border",
                            h.lastOk
                              ? "border-emerald-500/30 text-emerald-300"
                              : "border-red-500/30 text-red-300",
                          )}
                        >
                          {h.lastOk ? "OK" : "falló"}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                      /webhook/{h.path.replace(/^https?:\/\/[^/]+\/webhook\//, "")}
                    </div>
                    {h.lastRunAt && (
                      <div className="text-[9px] text-muted-foreground/70">
                        Último disparo: {new Date(h.lastRunAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => runHook(h)}
                      disabled={running === h.id || !hasEndpoint}
                    >
                      <Play className={cn("w-3 h-3 mr-1", running === h.id && "animate-pulse")} />
                      {running === h.id ? "Lanzando…" : "Lanzar"}
                    </Button>
                    <button
                      onClick={() => removeHook(h.id)}
                      className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-300"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pie honesto */}
        <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 pt-1 border-t border-white/5">
          <ExternalLink className="w-3 h-3 shrink-0" />
          n8n es open source y se auto-hospeda (Docker). StarSeed lo conecta por endpoint;
          los webhooks se disparan desde tu navegador hacia tu instancia.
        </p>
      </CardContent>
    </Card>
  );
}

export default N8nPanel;
