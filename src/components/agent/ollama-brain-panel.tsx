"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Panel Ollama (detectar / probar / local · remoto · cerebro)
// ----------------------------------------------------------------------------
// Configura Ollama de forma completa dentro de Astraura:
//   • baseUrl local (http://localhost:11434) o un endpoint REMOTO (el servidor
//     del cerebro), con presets rápidos.
//   • "Detectar modelos" → GET {baseUrl}/api/tags (sonda defensiva con timeout).
//   • "Probar conexión" → misma sonda, centrada en conectividad.
//   • Vincular la configuración a una CONEXIÓN Ollama de las conexiones OSS
//     (por usuario o por cerebro), reutilizando resolveServiceFor('llm', scope).
//   • Nota honesta: requiere Ollama corriendo (localhost o servidor) y CORS.
//
// SSR-safe y defensivo. No añade dependencias. No toca providerStore/chat/MoA.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cpu,
  Server,
  RadioTower,
  RotateCw,
  CheckCircle2,
  XCircle,
  Link2,
  Info,
  Download,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import {
  OLLAMA_DEFAULT_BASE_URL,
  normalizeOllamaBaseUrl,
  probeOllamaModels,
  type OllamaModelInfo,
  type OllamaProbeResult,
} from "@/ai/providers/ollama";
import {
  useOssConnections,
  resolveServiceFor,
  type OssConnection,
  type OssScope,
} from "@/lib/services/oss-connections";

// Un preset de endpoint frecuente.
const PRESETS: { label: string; url: string; icon: typeof Cpu }[] = [
  { label: "Local", url: "http://localhost:11434", icon: Cpu },
  { label: "Red local (LAN)", url: "http://192.168.1.10:11434", icon: RadioTower },
  { label: "Servidor del cerebro", url: "https://ollama.mi-cerebro.ejemplo", icon: Server },
];

function fmtBytes(n?: number): string {
  if (!n || n <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Etiqueta legible de un scope OSS. */
function scopeLabel(scope: OssScope): string {
  if (scope === "user") return "Usuario";
  if (scope === "context") return "Contexto";
  if (scope.startsWith("brain:")) return `Cerebro · ${scope.slice(6)}`;
  if (scope.startsWith("page:")) return `Página · ${scope.slice(5)}`;
  return scope;
}

export interface OllamaBrainPanelProps {
  /**
   * Callback opcional: cuando el usuario detecta modelos y quiere aplicarlos al
   * proveedor Ollama del store, se emiten aquí (baseUrl + nombres). El host puede
   * escribirlos en providerStore. Opcional: si se omite, sólo se muestran.
   */
  onApplyModels?: (baseUrl: string, models: string[]) => void;
}

export function OllamaBrainPanel({ onApplyModels }: OllamaBrainPanelProps) {
  const oss = useOssConnections();

  const [baseUrl, setBaseUrl] = useState<string>(OLLAMA_DEFAULT_BASE_URL);
  const [busy, setBusy] = useState<null | "detect" | "test">(null);
  const [probe, setProbe] = useState<OllamaProbeResult | null>(null);
  // Conexión OSS Ollama vinculada (id) para heredar su endpoint.
  const [linkedConnId, setLinkedConnId] = useState<string>("");
  const mounted = useRef(false);

  // Conexiones OSS del servicio "ollama" (categoría llm) que el usuario ya tiene.
  const ollamaConns: OssConnection[] = useMemo(
    () => oss.connections.filter((c) => c.serviceId === "ollama"),
    [oss.connections],
  );

  // Hidratación defensiva del endpoint: si hay una conexión Ollama por defecto
  // para la función LLM (scope usuario), la usamos como punto de partida.
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    try {
      const resolved = resolveServiceFor("llm", "user");
      if (
        resolved &&
        resolved.service.id === "ollama" &&
        resolved.endpoint &&
        resolved.endpoint.trim()
      ) {
        setBaseUrl(normalizeOllamaBaseUrl(resolved.endpoint));
        if (resolved.connection) setLinkedConnId(resolved.connection.id);
      }
    } catch {
      /* defensivo: nunca bloquea el render */
    }
  }, []);

  const effectiveBaseUrl = useMemo(() => normalizeOllamaBaseUrl(baseUrl), [baseUrl]);

  const runDetect = useCallback(
    async (mode: "detect" | "test") => {
      setBusy(mode);
      try {
        const r = await probeOllamaModels(effectiveBaseUrl);
        if (mounted.current) setProbe(r);
      } finally {
        if (mounted.current) setBusy(null);
      }
    },
    [effectiveBaseUrl],
  );

  // Al elegir una conexión OSS vinculada, hereda su endpoint.
  const onPickConnection = useCallback(
    (connId: string) => {
      setLinkedConnId(connId);
      const conn = ollamaConns.find((c) => c.id === connId);
      if (conn?.endpoint) setBaseUrl(normalizeOllamaBaseUrl(conn.endpoint));
    },
    [ollamaConns],
  );

  // Crea una conexión OSS Ollama con el endpoint actual, en un scope dado.
  const saveAsConnection = useCallback(
    (scope: OssScope) => {
      const created = oss.addConnection({
        serviceId: "ollama",
        label:
          scope === "user"
            ? "Ollama (mi equipo)"
            : `Ollama · ${scopeLabel(scope)}`,
        endpoint: effectiveBaseUrl,
        scope,
        enabled: true,
      });
      if (created) {
        setLinkedConnId(created.id);
        // Fija esta conexión como el LLM por defecto de ese scope.
        oss.setDefaultFor("llm", created.id, scope);
      }
    },
    [effectiveBaseUrl, oss],
  );

  const detected = probe?.ok ? probe.models : [];
  const models: OllamaModelInfo[] = detected;

  return (
    <Card className="bg-background/40 backdrop-blur-sm border-white/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Cpu className="h-4 w-4 text-emerald-400" />
          Ollama — local, remoto o del cerebro
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Ejecuta modelos abiertos en tu equipo (<span className="font-mono text-[11px]">http://localhost:11434</span>)
          o apunta a un servidor remoto (el del cerebro). Detecta los modelos
          instalados y prueba la conexión. Requiere que Ollama esté corriendo y,
          si es remoto o desde el navegador, que permita CORS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Endpoint + presets */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Endpoint (URL base)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={OLLAMA_DEFAULT_BASE_URL}
              className="bg-background/60 border-white/10 font-mono text-xs"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => runDetect("detect")}
                disabled={busy !== null}
                className="gap-2 whitespace-nowrap"
              >
                {busy === "detect" ? (
                  <RotateCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Download className="h-3 w-3" />
                )}
                Detectar modelos
              </Button>
              <Button
                variant="outline"
                onClick={() => runDetect("test")}
                disabled={busy !== null}
                className="gap-2 whitespace-nowrap"
              >
                {busy === "test" ? (
                  <RotateCw className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3" />
                )}
                Probar conexión
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {PRESETS.map((p) => {
              const Icon = p.icon;
              const active = effectiveBaseUrl === normalizeOllamaBaseUrl(p.url);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setBaseUrl(p.url)}
                  className={`text-left rounded-lg border px-3 py-1.5 text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                      : "border-white/10 bg-black/20 hover:border-emerald-400/40 hover:bg-emerald-400/5 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Resultado de la sonda */}
        {probe && (
          <div
            className={`rounded-lg border p-3 text-xs flex items-start gap-2 ${
              probe.ok
                ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-100"
                : "border-rose-400/30 bg-rose-400/5 text-rose-100"
            }`}
          >
            {probe.ok ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            )}
            <div className="space-y-0.5">
              <p>{probe.message}</p>
              <p className="text-[10px] opacity-70 font-mono">
                {probe.url} · {probe.ms} ms
                {typeof probe.status === "number" ? ` · HTTP ${probe.status}` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Lista de modelos detectados */}
        {models.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Modelos instalados ({models.length})
              </label>
              {onApplyModels && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-[11px]"
                  onClick={() =>
                    onApplyModels(
                      effectiveBaseUrl,
                      models.map((m) => m.name),
                    )
                  }
                >
                  <Link2 className="h-3 w-3" /> Usar en el proveedor Ollama
                </Button>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {models.map((m) => (
                <div
                  key={m.name}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                >
                  <p className="font-mono text-xs text-cyan-100 break-all">{m.name}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {m.parameterSize && (
                      <Badge variant="outline" className="text-[9px] border-white/10 text-muted-foreground">
                        {m.parameterSize}
                      </Badge>
                    )}
                    {m.quantization && (
                      <Badge variant="outline" className="text-[9px] border-white/10 text-muted-foreground">
                        {m.quantization}
                      </Badge>
                    )}
                    {m.family && (
                      <Badge variant="outline" className="text-[9px] border-white/10 text-muted-foreground">
                        {m.family}
                      </Badge>
                    )}
                    {m.size ? (
                      <Badge variant="outline" className="text-[9px] border-white/10 text-muted-foreground">
                        {fmtBytes(m.size)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vínculo con conexiones OSS (usuario / cerebro) */}
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-cyan-100">
            <Link2 className="h-3.5 w-3.5 text-cyan-400" />
            Sincronizar con las conexiones (servidores / cerebros)
          </div>
          {ollamaConns.length > 0 ? (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Usar una conexión Ollama existente
              </label>
              <select
                value={linkedConnId}
                onChange={(e) => onPickConnection(e.target.value)}
                className="w-full rounded-md bg-background/60 border border-white/10 px-3 py-2 text-xs text-cyan-50 outline-none focus:border-emerald-400/50 cursor-pointer"
              >
                <option value="">— Ninguna (endpoint manual) —</option>
                {ollamaConns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {scopeLabel(c.scope)}
                    {c.endpoint ? ` · ${c.endpoint}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Aún no tienes conexiones Ollama guardadas. Crea una con el endpoint
              actual para reutilizarla como LLM por defecto (por usuario o por
              cerebro).
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => saveAsConnection("user")}
            >
              <Cpu className="h-3 w-3" /> Guardar como conexión de usuario
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => saveAsConnection("brain:default")}
            >
              <Server className="h-3 w-3" /> Guardar para el cerebro
            </Button>
          </div>
        </div>

        {/* Nota honesta */}
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            Ollama debe estar corriendo (en <span className="font-mono">localhost</span> o en un
            servidor accesible). Desde el navegador, un endpoint remoto necesita
            CORS habilitado — arranca Ollama con la variable{" "}
            <span className="font-mono">OLLAMA_ORIGINS</span> permitiendo el origen de StarSeed OS.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default OllamaBrainPanel;
