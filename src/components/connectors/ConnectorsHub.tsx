"use client";

// ════════════════════════════════════════════════════════════════
// ConnectorsHub — Hub de Conectores / Integraciones de StarSeed OS.
//
// FILOSOFÍA (CLAUDE.md §3 Ciberdelia · §6 Código Abierto absoluto):
//   Lo GRATIS · PROPIO · CÓDIGO ABIERTO funciona por DEFECTO, sin cuenta.
//   Conectar cuentas externas es SIEMPRE opcional (por usuario y contexto),
//   pero la opción es plenamente funcional y está integrada. Somos honestos:
//   los conectores de clave/OAuth se marcan como "Requiere conexión" y para
//   OAuth solo abrimos su documentación (NO implementamos el flujo ni pedimos
//   credenciales reales aquí).
//
// Astraura auto-selecciona el mejor conector por tarea/contexto vía
// `selectConnector` (store) — este hub solo gestiona qué está disponible.
//
// Estética: Crystal Liquid Glass + shadcn + lucide, cursor-pointer y
// transiciones 150-300ms. Defensivo y SSR-safe (estado neutro + carga en efecto).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Plug2,
  Search as SearchIcon,
  Sparkles,
  Check,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  Cpu,
  Server,
  Globe2,
  FolderOpen,
  Brain,
  Mail,
  HardDrive,
  Calendar,
  NotebookPen,
  MessageSquare,
  Github,
  Figma,
  Link2,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type Connector,
  type ConnectorCategory,
  type ConnectorConfig,
  type ConnectorStatus,
} from "@/lib/connectors/model";
import {
  listConnectors,
  recommendedConnectors,
  setConnectorConfig,
  disableConnector,
  enableConnector,
  CONNECTORS_EVENT,
} from "@/lib/connectors/store";

/* ── Iconos lucide por nombre (los que referencia el registro) ── */
const ICONS: Record<string, LucideIcon> = {
  Cpu,
  Server,
  Sparkles,
  Search: SearchIcon,
  Globe2,
  FolderOpen,
  Brain,
  Mail,
  HardDrive,
  Calendar,
  NotebookPen,
  MessageSquare,
  Github,
  Figma,
  Link2,
};

function iconFor(connector: Connector): LucideIcon {
  return (connector.icon && ICONS[connector.icon]) || Plug2;
}

/* ── Chips por estado (gratuidad/soberanía legibles) ── */
const STATUS_CHIP: Record<ConnectorStatus, string> = {
  connected: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  available: "bg-sky-500/15 text-sky-300 border-sky-400/30",
  "needs-auth": "bg-amber-500/15 text-amber-300 border-amber-400/30",
};

/* ── Chip por naturaleza (propio/oss/gratis/pago) ── */
function kindChip(connector: Connector): { label: string; cls: string } {
  switch (connector.kind) {
    case "own":
      return { label: "Propio", cls: "bg-violet-500/15 text-violet-300 border-violet-400/30" };
    case "oss":
      return { label: "Código abierto", cls: "bg-teal-500/15 text-teal-300 border-teal-400/30" };
    case "free":
      return { label: "Gratis", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" };
    case "paid":
    default:
      return { label: "De pago", cls: "bg-amber-500/15 text-amber-300 border-amber-400/30" };
  }
}

/** Fila reactiva por conector (SSR-safe: recibe estado ya cargado del padre). */
function ConnectorRow({
  connector,
  config,
  status,
  onRefresh,
}: {
  connector: Connector;
  config: ConnectorConfig | null;
  status: ConnectorStatus;
  onRefresh: () => void;
}) {
  const Icon = iconFor(connector);
  const chip = kindChip(connector);
  // Campo editable local (clave o endpoint según authType).
  const isKey = connector.authType === "apiKey";
  const isEndpoint = connector.authType === "localEndpoint";
  const isOauth = connector.authType === "oauth";
  const isNone = connector.authType === "none";

  const [draft, setDraft] = useState("");
  useEffect(() => {
    setDraft(isKey ? (config?.apiKey ?? "") : isEndpoint ? (config?.endpoint ?? "") : "");
  }, [config, isKey, isEndpoint]);

  const enabled = !!config?.enabled || status === "connected";

  const saveDraft = useCallback(() => {
    const value = draft.trim();
    if (isKey) setConnectorConfig(connector.id, { apiKey: value || undefined });
    else if (isEndpoint) setConnectorConfig(connector.id, { endpoint: value || undefined });
    onRefresh();
  }, [draft, isKey, isEndpoint, connector.id, onRefresh]);

  const toggle = useCallback(
    (on: boolean) => {
      if (on) enableConnector(connector.id);
      else disableConnector(connector.id);
      onRefresh();
    },
    [connector.id, onRefresh],
  );

  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-3 transition-colors duration-200 hover:border-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{connector.name}</span>
              <Badge variant="outline" className={cn("text-[9px]", chip.cls)}>
                {chip.label}
              </Badge>
              <Badge variant="outline" className={cn("text-[9px]", STATUS_CHIP[status])}>
                {STATUS_LABELS[status]}
              </Badge>
              {connector.recommended && (
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[9px] text-primary">
                  Recomendado
                </Badge>
              )}
            </div>
            {connector.description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {connector.description}
              </p>
            )}
          </div>
        </div>

        {/* Interruptor: solo para conectores que se usan sin credenciales o ya conectados. */}
        {(isNone || isEndpoint) && (
          <Switch
            checked={enabled}
            onCheckedChange={toggle}
            aria-label={`Usar ${connector.name}`}
            className="shrink-0"
          />
        )}
      </div>

      {/* Acción de configuración según tipo de auth. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(isKey || isEndpoint) && (
          <>
            <Input
              type={isKey ? "password" : "text"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDraft();
              }}
              placeholder={connector.configHint ?? (isKey ? "Pega tu clave…" : "http://localhost:…")}
              className="h-8 flex-1 min-w-[180px] bg-background/60 text-xs"
              aria-label={`${isKey ? "Clave" : "Endpoint"} de ${connector.name}`}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 cursor-pointer gap-1.5 text-xs transition-colors duration-200"
              onClick={saveDraft}
            >
              <Check className="h-3.5 w-3.5" /> Configurar
            </Button>
          </>
        )}

        {isOauth && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <KeyRound className="h-3.5 w-3.5 shrink-0" />
              Opcional · se conecta por OAuth (no guardamos credenciales aquí).
            </p>
            <div className="flex items-center gap-2">
              {connector.docsUrl && (
                <a
                  href={connector.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-background/60 px-2.5 py-1 text-xs font-medium transition-colors duration-200 hover:bg-white/5 cursor-pointer"
                  title={`Cómo conectar ${connector.name}`}
                >
                  Conectar <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {/* Marca honesta: el usuario declara que completó el OAuth por su cuenta. */}
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "h-8 cursor-pointer gap-1.5 text-xs transition-colors duration-200",
                  config?.oauthConnected ? "text-emerald-300" : "text-muted-foreground",
                )}
                onClick={() => {
                  if (config?.oauthConnected) disableConnector(connector.id);
                  else setConnectorConfig(connector.id, { oauthConnected: true });
                  onRefresh();
                }}
              >
                {config?.oauthConnected ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Conectado
                  </>
                ) : (
                  "Marcar como conectado"
                )}
              </Button>
            </div>
          </div>
        )}

        {isNone && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            Funciona sin cuenta ni configuración. Es parte del conjunto propio por defecto.
          </p>
        )}
      </div>
    </div>
  );
}

export function ConnectorsHub() {
  // Estado cargado en efecto (SSR-safe): lista efectiva + query de búsqueda.
  const [items, setItems] = useState<
    Array<{ connector: Connector; config: ConnectorConfig | null; status: ConnectorStatus }>
  >([]);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    try {
      setItems(listConnectors());
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();
    if (typeof window === "undefined") return;
    const onChange = () => refresh();
    window.addEventListener(CONNECTORS_EVENT, onChange);
    return () => window.removeEventListener(CONNECTORS_EVENT, onChange);
  }, [refresh]);

  const recommended = useMemo(() => {
    try {
      return recommendedConnectors();
    } catch {
      return [];
    }
  }, []);

  // Filtrado por búsqueda (nombre / descripción / categoría).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(({ connector }) => {
      const hay = `${connector.name} ${connector.description ?? ""} ${CATEGORY_LABELS[connector.category]}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  // Agrupa por categoría, manteniendo el orden del registro.
  const grouped = useMemo(() => {
    const order: ConnectorCategory[] = [];
    const map = new Map<ConnectorCategory, typeof filtered>();
    for (const row of filtered) {
      const cat = row.connector.category;
      if (!map.has(cat)) {
        map.set(cat, []);
        order.push(cat);
      }
      map.get(cat)!.push(row);
    }
    return order.map((cat) => ({ cat, rows: map.get(cat)! }));
  }, [filtered]);

  const connectedCount = useMemo(
    () => items.filter((i) => i.status === "connected").length,
    [items],
  );

  return (
    <div className="space-y-6">
      {/* ── Hero: propósito honesto ── */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background/40 to-emerald-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug2 className="h-5 w-5 text-primary" /> Conectores e integraciones
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Conectar cuentas externas es <strong>opcional</strong>. Lo{" "}
            <strong>gratis, propio y de código abierto</strong> (Ollama, OpenLLM, SearXNG, Crawl4AI,
            tus archivos y tu memoria) funciona por defecto <strong>sin cuenta</strong>. Cuando quieras,
            conecta servicios de terceros (clave u OAuth) — Aurora los usará solo si tú los conectas y
            siempre prioriza lo gratis y propio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Buscador */}
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conector (Ollama, búsqueda, Notion, calendario…)"
              className="bg-background/60 pl-9"
              aria-label="Buscar conector"
            />
          </div>

          {/* Resumen honesto de estado */}
          <p className="text-[11px] text-muted-foreground">
            {mounted ? (
              <>
                {connectedCount > 0
                  ? `${connectedCount} conector${connectedCount === 1 ? "" : "es"} conectado${connectedCount === 1 ? "" : "s"}. `
                  : "Aún no has conectado ninguna cuenta externa — y no hace falta. "}
                El conjunto recomendado ya está disponible sin configurar nada.
              </>
            ) : (
              "Cargando estado de conectores…"
            )}
          </p>
        </CardContent>
      </Card>

      {/* ── Conjunto recomendado (gratis · propio · código abierto) ── */}
      <Card className="border-emerald-400/20 bg-emerald-500/[0.04] backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-300" /> Recomendado (gratis · propio · código abierto)
          </CardTitle>
          <CardDescription>
            Este conjunto es el que Aurora usa por defecto. No requiere cuenta ni pago: soberano y siempre disponible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {recommended.map((c) => {
              const Icon = iconFor(c);
              return (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-100"
                  title={c.description}
                >
                  <Icon className="h-3.5 w-3.5" /> {c.name}
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Conectores por categoría ── */}
      {mounted && grouped.length === 0 && (
        <Card className="bg-background/40 backdrop-blur-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay conectores que coincidan con «{query}». Prueba otro término.
          </CardContent>
        </Card>
      )}

      {grouped.map(({ cat, rows }) => (
        <Card key={cat} className="bg-background/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">{CATEGORY_LABELS[cat]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map(({ connector, config, status }) => (
              <ConnectorRow
                key={connector.id}
                connector={connector}
                config={config}
                status={status}
                onRefresh={refresh}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {/* ── Nota de honestidad final ── */}
      <div className="flex items-start gap-3 rounded-lg border border-teal-400/15 bg-teal-500/5 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Tus claves y endpoints viven solo en tu navegador y se espejan cifrados en tu cuenta soberana
          (OS · Nexus · Café) para que estén donde estés tú. Los conectores por OAuth solo abren su
          documentación: StarSeed nunca introduce tus credenciales por ti. Puedes desconectar cualquier
          servicio cuando quieras — el OS seguirá funcionando con lo gratis y propio.
        </p>
      </div>
    </div>
  );
}

export default ConnectorsHub;
