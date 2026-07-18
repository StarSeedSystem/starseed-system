"use client";

/**
 * <OssServicesPanel /> — "Servicios open-source".
 *
 * Panel del REGISTRO UNIFICADO de servicios de código abierto preintegrados por
 * defecto (catálogo en `@/lib/services/oss-services`). Agrupa por función
 * (LLM, voz→texto, texto→voz, imagen, vídeo, automatización, calendarios,
 * documentos, diseño, sitios web) y, para cada servicio, deja:
 *   • ver su propósito y abrir su repositorio,
 *   • crear/editar/eliminar/probar VARIAS conexiones (endpoint/clave/webhook),
 *   • elegir el `scope` de cada conexión (usuario / cerebro / página / contexto),
 *   • marcar una conexión como "por defecto para esta función".
 *
 * Honesto: una web NO instala servidores; los CONECTA. Cada servicio incluye su
 * pista de auto-hospedaje. Estilo Crystal glass, claro y responsive.
 *
 * Persistencia y lógica: `@/lib/services/oss-connections` (localStorage +
 * espejo opcional en la cuenta). NO duplica la capa tri-fuente existente.
 */

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Boxes,
  Github,
  Plus,
  Trash2,
  Star,
  Loader2,
  CheckCircle2,
  XCircle,
  ServerCog,
  Info,
  Save,
  Link2,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

import {
  OSS_SERVICE_CATEGORY_META,
  OSS_SERVICE_CATEGORY_ORDER,
  type OssService,
  type OssServiceCategory,
  type OssServiceField,
} from "@/lib/services/oss-services";
import {
  useOssConnections,
  defaultKey,
  type OssConnection,
  type OssScope,
  type OssTestResult,
} from "@/lib/services/oss-connections";

// ── Scopes disponibles en la UI ──────────────────────────────────────────────

const SCOPE_OPTIONS: { value: OssScope; label: string }[] = [
  { value: "user", label: "Usuario (global)" },
  { value: "context", label: "Contexto actual" },
  { value: "brain:default", label: "Cerebro principal" },
  { value: "page:default", label: "Página / entidad" },
];

function scopeLabel(scope: OssScope): string {
  const found = SCOPE_OPTIONS.find((o) => o.value === scope);
  if (found) return found.label;
  if (scope.startsWith("brain:")) return `Cerebro · ${scope.slice(6)}`;
  if (scope.startsWith("page:")) return `Página · ${scope.slice(5)}`;
  return scope;
}

// ── Editor de una conexión ────────────────────────────────────────────────────

interface ConnectionRowProps {
  service: OssService;
  connection: OssConnection;
  isDefault: boolean;
  onUpdate: (
    id: string,
    patch: Partial<Omit<OssConnection, "id" | "serviceId" | "createdAt">>,
  ) => void;
  onRemove: (id: string) => void;
  onTest: (connection: OssConnection) => Promise<OssTestResult>;
  onMakeDefault: (connection: OssConnection) => void;
}

function ConnectionRow({
  service,
  connection,
  isDefault,
  onUpdate,
  onRemove,
  onTest,
  onMakeDefault,
}: ConnectionRowProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<OssTestResult | null>(null);

  // Valor de un campo (mapea la key a la propiedad correspondiente o a extra).
  function fieldValue(f: OssServiceField): string {
    if (f.key === "baseUrl") return connection.endpoint ?? "";
    if (f.key === "apiKey") return connection.apiKey ?? "";
    if (f.key === "webhook") return connection.webhook ?? "";
    return connection.extra?.[f.key] ?? "";
  }

  function setField(f: OssServiceField, value: string) {
    if (f.key === "baseUrl") return onUpdate(connection.id, { endpoint: value });
    if (f.key === "apiKey") return onUpdate(connection.id, { apiKey: value });
    if (f.key === "webhook") return onUpdate(connection.id, { webhook: value });
    const extra = { ...(connection.extra ?? {}), [f.key]: value };
    onUpdate(connection.id, { extra });
  }

  async function runTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await onTest(connection);
      setResult(r);
      if (r.ok) toast.success(`${connection.label}: ${r.message}`);
      else toast.error(`${connection.label}: ${r.message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3 backdrop-blur-sm transition",
        connection.enabled
          ? "border-white/10 bg-white/5"
          : "border-white/5 bg-white/[0.02] opacity-70",
        isDefault && "ring-1 ring-primary/40 border-primary/30",
      )}
    >
      {/* Cabecera de la conexión */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={connection.label}
          onChange={(e) => onUpdate(connection.id, { label: e.target.value })}
          placeholder="Etiqueta (p.ej. Ollama de casa)"
          className="h-8 max-w-[220px] flex-1 border-white/10 bg-background/60 text-xs"
        />
        {isDefault && (
          <Badge
            variant="outline"
            className="gap-1 border-primary/40 text-[9px] text-primary"
          >
            <Star className="h-3 w-3 fill-primary" /> Por defecto
          </Badge>
        )}
        {connection.lastVerifiedAt && (
          <Badge
            variant="outline"
            className="border-emerald-400/30 text-[9px] text-emerald-300"
          >
            Verificada
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Activa
            <Switch
              checked={connection.enabled}
              onCheckedChange={(v) => onUpdate(connection.id, { enabled: v })}
            />
          </label>
          <button
            onClick={() => onRemove(connection.id)}
            className="cursor-pointer rounded-md border border-white/10 p-1.5 text-muted-foreground transition hover:border-red-400/40 hover:text-red-300"
            title="Eliminar conexión"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Campos del servicio */}
      <div className="grid gap-2 sm:grid-cols-2">
        {service.fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {f.type === "url" || f.type === "webhook" ? (
                <Link2 className="h-3 w-3" />
              ) : null}
              {f.label}
              {f.required && <span className="text-red-400/70">*</span>}
            </label>
            <Input
              type={f.secret ? "password" : "text"}
              value={fieldValue(f)}
              onChange={(e) => setField(f, e.target.value)}
              placeholder={f.placeholder}
              disabled={!connection.enabled}
              className="h-8 border-white/10 bg-background/60 font-mono text-[11px]"
            />
            {f.hint && (
              <p className="text-[9px] leading-snug text-muted-foreground/80">
                {f.hint}
              </p>
            )}
          </div>
        ))}
        {service.fields.length === 0 && (
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Este servicio corre en tu navegador: no necesita endpoint. Sólo
            actívalo para usarlo.
          </p>
        )}
      </div>

      {/* Scope + acciones */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Alcance
          </span>
          <select
            value={
              SCOPE_OPTIONS.some((o) => o.value === connection.scope)
                ? connection.scope
                : "user"
            }
            onChange={(e) =>
              onUpdate(connection.id, { scope: e.target.value as OssScope })
            }
            className="h-8 cursor-pointer rounded-md border border-white/10 bg-background/60 px-2 text-[11px] text-foreground outline-none focus:border-primary/40"
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={runTest}
          disabled={testing}
          className="h-8 gap-1.5 text-xs"
        >
          {testing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : result ? (
            result.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-400" />
            )
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Probar
        </Button>

        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMakeDefault(connection)}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-primary"
            title="Usar por defecto para esta función"
          >
            <Star className="h-3.5 w-3.5" /> Usar por defecto
          </Button>
        )}

        {/* Estado de la última prueba (verde / rojo) */}
        {result && (
          <span
            className={cn(
              "text-[10px]",
              result.ok ? "text-emerald-300" : "text-red-300",
            )}
          >
            {result.ok ? "●" : "●"} {result.message} · {result.ms} ms
          </span>
        )}
      </div>
    </div>
  );
}

// ── Tarjeta de un servicio ────────────────────────────────────────────────────

interface ServiceCardProps {
  service: OssService;
  connections: OssConnection[];
  defaultConnId: string | undefined;
  onAdd: (service: OssService) => void;
  onUpdate: ConnectionRowProps["onUpdate"];
  onRemove: ConnectionRowProps["onRemove"];
  onTest: ConnectionRowProps["onTest"];
  onMakeDefault: (service: OssService, connection: OssConnection) => void;
}

function ServiceCard({
  service,
  connections,
  defaultConnId,
  onAdd,
  onUpdate,
  onRemove,
  onTest,
  onMakeDefault,
}: ServiceCardProps) {
  const kindLabel: Record<OssService["connectionKind"], string> = {
    "http-endpoint": "Endpoint HTTP",
    "api-key": "Endpoint + clave",
    webhook: "Webhook",
    "app-embed": "Instancia (embed)",
    "browser-local": "En el navegador",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
      {/* Cabecera del servicio */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="mt-0.5 rounded-lg border border-white/10 bg-white/5 p-2">
          <ServerCog className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{service.name}</h3>
            <Badge
              variant="outline"
              className="border-white/15 text-[9px] text-muted-foreground"
            >
              {kindLabel[service.connectionKind]}
            </Badge>
            {service.enabledByDefault && (
              <Badge
                variant="outline"
                className="border-violet-400/30 text-[9px] text-violet-300"
              >
                Preintegrado
              </Badge>
            )}
            {connections.length > 0 && (
              <Badge
                variant="outline"
                className="border-primary/30 text-[9px] text-primary"
              >
                {connections.length}{" "}
                {connections.length === 1 ? "conexión" : "conexiones"}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {service.purpose}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px]">
            <a
              href={service.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground transition hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" /> Repositorio
            </a>
            {service.docsUrl && service.docsUrl !== service.repoUrl && (
              <a
                href={service.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground transition hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Docs
              </a>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAdd(service)}
          className="h-8 shrink-0 gap-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" /> Conexión
        </Button>
      </div>

      {/* Pista de auto-hospedaje (honesta) */}
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-950/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
        <span>
          <strong className="text-amber-200/90">Auto-hospedaje:</strong>{" "}
          {service.selfHostHint}
        </span>
      </div>

      {/* Conexiones */}
      <div className="mt-3 space-y-2">
        {connections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/10 bg-black/10 px-3 py-3 text-center text-[11px] text-muted-foreground">
            Registrado por defecto, sin conexión aún.{" "}
            {service.connectionKind === "browser-local"
              ? "Añade una conexión para activarlo (corre en el navegador)."
              : "Añade una conexión con su endpoint para empezar a usarlo."}
          </div>
        ) : (
          connections.map((c) => (
            <ConnectionRow
              key={c.id}
              service={service}
              connection={c}
              isDefault={defaultConnId === c.id}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onTest={onTest}
              onMakeDefault={(conn) => onMakeDefault(service, conn)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Panel principal ───────────────────────────────────────────────────────────

export interface OssServicesPanelProps {
  /** Scope para el que se muestran/definen los "por defecto". */
  scope?: OssScope;
  className?: string;
}

export function OssServicesPanel({
  scope = "user",
  className,
}: OssServicesPanelProps) {
  const {
    services,
    connections,
    defaults,
    addConnection,
    updateConnection,
    removeConnection,
    testConnection,
    setDefaultFor,
    pushToAccount,
    pullFromAccount,
  } = useOssConnections();

  const [syncing, setSyncing] = useState<"idle" | "push" | "pull">("idle");

  // Servicios agrupados por categoría en orden estable.
  const grouped = useMemo(() => {
    const map = new Map<OssServiceCategory, OssService[]>();
    for (const cat of OSS_SERVICE_CATEGORY_ORDER) map.set(cat, []);
    for (const s of services) {
      const arr = map.get(s.category);
      if (arr) arr.push(s);
    }
    return map;
  }, [services]);

  const connsByService = useMemo(() => {
    const map = new Map<string, OssConnection[]>();
    for (const c of connections) {
      const arr = map.get(c.serviceId) ?? [];
      arr.push(c);
      map.set(c.serviceId, arr);
    }
    return map;
  }, [connections]);

  function handleAdd(service: OssService) {
    const created = addConnection({
      serviceId: service.id,
      label:
        (connsByService.get(service.id)?.length ?? 0) > 0
          ? `${service.name} (${(connsByService.get(service.id)?.length ?? 0) + 1})`
          : service.name,
      endpoint: service.defaultEndpoint || undefined,
      scope,
      enabled: true,
    });
    if (created) toast.success(`Conexión añadida a ${service.name}`);
    else toast.error("No se pudo añadir la conexión.");
  }

  // Atajo desde el menú unificado de chat (Adenda 71-bis fix-23): si la URL
  // trae ?connect=<serviceId>, añade la conexión de ese servicio al montar.
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get("connect");
      if (!id) return;
      const svc = services.find((s) => s.id === id);
      if (svc) handleAdd(svc);
      // Limpia el param para no re-añadir en navegaciones posteriores.
      const url = new URL(window.location.href);
      url.searchParams.delete("connect");
      window.history.replaceState({}, "", url.toString());
    } catch { /* defensivo */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  function handleMakeDefault(service: OssService, connection: OssConnection) {
    const ok = setDefaultFor(service.category, connection.id, scope);
    if (ok)
      toast.success(
        `${connection.label} es ahora el servicio por defecto para ${OSS_SERVICE_CATEGORY_META[service.category].label.toLowerCase()}.`,
      );
    else toast.error("No se pudo fijar por defecto.");
  }

  async function handlePush() {
    setSyncing("push");
    try {
      const r = await pushToAccount();
      if (r.ok) toast.success(r.message);
      else toast.message(r.message);
    } finally {
      setSyncing("idle");
    }
  }

  async function handlePull() {
    setSyncing("pull");
    try {
      const r = await pullFromAccount();
      if (r.ok) toast.success(r.message);
      else toast.message(r.message);
    } finally {
      setSyncing("idle");
    }
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Cabecera + explicación honesta */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background/40 to-accent/10 p-5 backdrop-blur-md">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Boxes className="h-5 w-5 text-primary" />
          Servicios open-source
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          StarSeed trae estos servicios de código abierto{" "}
          <strong>preintegrados por defecto</strong>: siempre están registrados y
          listos para enrutar cada función (IA, voz, imagen, automatización,
          calendarios, documentos, diseño, sitios…). Una web no instala
          servidores: los <strong>conecta</strong>. Añade el endpoint de tu
          instancia (o córrelo en tu navegador cuando el servicio lo permita),
          pruébalo, y elige cuál usar por defecto —incluso varios servidores por
          función, distintos por usuario, cerebro o contexto.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-white/15 text-[10px] text-muted-foreground"
          >
            Alcance actual: {scopeLabel(scope)}
          </Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePull}
              disabled={syncing !== "idle"}
              className="h-8 gap-1.5 text-xs"
            >
              {syncing === "pull" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Recuperar de la cuenta
            </Button>
            <Button
              size="sm"
              onClick={handlePush}
              disabled={syncing !== "idle"}
              className="h-8 gap-1.5 text-xs"
            >
              {syncing === "push" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar en la cuenta
            </Button>
          </div>
        </div>
      </div>

      {/* Grupos por función */}
      {OSS_SERVICE_CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        const meta = OSS_SERVICE_CATEGORY_META[cat];
        const defConnId = defaults[defaultKey(cat, scope)];
        return (
          <section key={cat} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground/90">
                {meta.label}
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {meta.blurb}
              </span>
            </div>
            <div className="grid gap-3">
              {list.map((s) => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  connections={connsByService.get(s.id) ?? []}
                  defaultConnId={defConnId}
                  onAdd={handleAdd}
                  onUpdate={updateConnection}
                  onRemove={removeConnection}
                  onTest={testConnection}
                  onMakeDefault={handleMakeDefault}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Nota de privacidad / honestidad */}
      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          Las conexiones (endpoints y claves) son tuyas: se guardan en este
          dispositivo y, si lo pides, en tu cuenta soberana StarSeed. No se
          comparten con otros usuarios ni con la red. Las pruebas de conexión son
          llamadas directas desde tu navegador al servicio; si algo falla, suele
          ser CORS, un servicio no levantado, o una URL incorrecta.
        </span>
      </div>
    </div>
  );
}

export default OssServicesPanel;
