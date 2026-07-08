"use client";

// ════════════════════════════════════════════════════════════════
// UserConnectorsHub — Hub de Conectores POR USUARIO de StarSeed OS.
//
// FILOSOFÍA (CLAUDE.md §3 Ciberdelia · §6 Invariantes · Identidad Soberana):
//   Cada usuario conecta OPCIONALMENTE sus propias cuentas/credenciales.
//   El sistema funciona SIEMPRE con los defaults gratis/OSS, sin cuenta.
//   El usuario elige el modo de selección por categoría (o global):
//     Automático (Astraura elige) · Preferir mi cuenta · Solo gratis-OSS.
//
// Este componente es ADITIVO: no reemplaza `ConnectorsHub` (Ajustes →
// Avanzado), que sigue funcionando igual. Reutiliza el MISMO catálogo
// (`BUILTIN_CONNECTORS` / `ConnectorCategory` de `@/lib/connectors/model` +
// `registry`) y solo AÑADE credenciales locales + modo de selección por
// encima (`@/lib/connectors/connector-credentials`). Las herramientas OSS
// auto-hospedadas (crawl4ai, searxng, ollama, n8n, stirling, home-assistant,
// audiobookshelf…) no se reconfiguran aquí: se leen de
// `@/lib/integrations/registry` (solo lectura) y se enlaza a su configuración
// real en Ajustes → Avanzado, para no duplicar su almacenamiento.
//
// Honesto: los servicios de marca sin conector real (gmail/drive/calendar/
// notion/slack/github/figma) se muestran como "conecta tu cuenta" —
// opcional— y el motor gratis/OSS de cada categoría es el que YA funciona.
//
// Estética: Crystal Liquid Glass + shadcn + lucide, cursor-pointer y
// transiciones 150-300ms. Defensivo y SSR-safe (estado neutro + carga en
// efecto, igual que `ConnectorsHub`).
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Plug2,
  Sparkles,
  Check,
  KeyRound,
  ExternalLink,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
  Cpu,
  Server,
  Search as SearchIcon,
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
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_LABELS, type Connector, type ConnectorCategory } from "@/lib/connectors/model";
import { BUILTIN_CONNECTORS } from "@/lib/connectors/registry";
import {
  connectorCredentials,
  setConnectorCredentials,
  clearConnectorCredentials,
  allConnectorCredentials,
  getConnectorMode,
  setConnectorMode,
  clearConnectorModeOverride,
  getConnectorModePrefs,
  CONNECTOR_MODE_DEFAULT,
  CONNECTORS_PREFS_EVENT,
  type ConnectorMode,
  type ConnectorModePrefs,
  type ConnectorCredentialData,
  type ConnectorCredentialsMap,
} from "@/lib/connectors/connector-credentials";
import { getIntegration, loadIntegrationConfig } from "@/lib/integrations/registry";
import { testIntegration } from "@/lib/integrations/run";

/* ── Iconos lucide por nombre (mismo vocabulario que ConnectorsHub) ── */
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
};
function iconFor(c: Connector): LucideIcon {
  return (c.icon && ICONS[c.icon]) || Plug2;
}

/* ── Etiquetas y ayudas de modo ── */
const MODE_LABELS: Record<ConnectorMode, string> = {
  auto: "Automático",
  "prefer-own": "Preferir mi cuenta",
  "only-free": "Solo gratis-OSS",
};
const MODE_HINTS: Record<ConnectorMode, string> = {
  auto: "Astraura decide: usa tu cuenta si la conectaste y encaja con la tarea; si no, el motor gratis.",
  "prefer-own": "Si conectaste una cuenta en esta categoría, se usa siempre, por delante del motor gratis.",
  "only-free": "Nunca se usan cuentas de terceros aquí, aunque las conectes.",
};
const MODE_ORDER: ConnectorMode[] = ["auto", "prefer-own", "only-free"];

/*
 * Solapado con integraciones OSS auto-hospedadas YA configurables en
 * Ajustes → Avanzado (`@/lib/integrations/registry`). NO se duplica su
 * almacenamiento aquí: solo se LEE su estado y se enlaza a esa configuración.
 */
const CONNECTOR_TO_INTEGRATION: Record<string, string> = {
  "ollama-local": "ollama",
  "searxng-selfhost": "searxng",
  "crawl4ai-local": "crawl4ai",
};

/** Otras herramientas OSS del catálogo de Integraciones sin Connector propio
 * todavía en este hub, agrupadas por la categoría donde mejor encajan. */
const EXTRA_OSS_BY_CATEGORY: Partial<Record<ConnectorCategory, string[]>> = {
  llm: ["litellm", "localai", "open-webui", "dify", "langflow", "flowise"],
  web: ["firecrawl", "browser-use"],
  dev: ["openhands"],
  files: ["stirling-pdf"],
  custom: ["n8n", "audiobookshelf", "home-assistant"],
};

/** Título de presentación de una categoría en ESTE hub (no toca `CATEGORY_LABELS`). */
const DISPLAY_LABEL_OVERRIDES: Partial<Record<ConnectorCategory, string>> = {
  custom: "Automatización y otros",
};

/** Orden de presentación (prioriza lo que el usuario más busca). */
const CATEGORY_ORDER: ConnectorCategory[] = [
  "llm",
  "search",
  "web",
  "memory",
  "dev",
  "chat",
  "email",
  "calendar",
  "storage",
  "files",
  "social",
  "custom",
];

const APIKEY_FIELD_LABEL: Record<string, string> = {
  notion: "Token de integración",
  github: "Token de acceso personal",
  figma: "Token de acceso personal",
};

/* ── Resolución (SOLO para la previsualización de esta UI) ──────────────── */
function freeDefaultOf(list: Connector[]): Connector | null {
  return list.find((c) => c.authType === "none" || c.authType === "localEndpoint") ?? null;
}
function myAccountOf(list: Connector[], creds: ConnectorCredentialsMap): Connector | null {
  return list.find((c) => !!creds[c.id]?.enabled) ?? null;
}
function resolveActive(
  list: Connector[],
  mode: ConnectorMode,
  creds: ConnectorCredentialsMap,
): { connector: Connector | null; viaOwn: boolean } {
  const free = freeDefaultOf(list);
  if (mode === "only-free") return { connector: free, viaOwn: false };
  const mine = myAccountOf(list, creds);
  if (mine) return { connector: mine, viaOwn: true };
  return { connector: free, viaOwn: false };
}

/* ════════════════════════════════════════════════════════════════
   Selector de modo segmentado (reutilizable: global y por categoría)
   ════════════════════════════════════════════════════════════════ */
function ModeToggle({ value, onChange }: { value: ConnectorMode; onChange: (m: ConnectorMode) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1.5">
      {MODE_ORDER.map((m) => (
        <button
          key={m}
          type="button"
          title={MODE_HINTS[m]}
          onClick={() => onChange(m)}
          className={cn(
            "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-200",
            value === m
              ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
              : "border-white/10 text-white/50 hover:border-white/20 hover:text-white/80",
          )}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Fila: conector de marca (needs-auth) — "Conectar mi cuenta" opcional
   ════════════════════════════════════════════════════════════════ */
function BrandConnectorRow({ connector, onChanged }: { connector: Connector; onChanged: () => void }) {
  const isKey = connector.authType === "apiKey";
  const isOauth = connector.authType === "oauth";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<ConnectorCredentialData | null>(null);

  useEffect(() => {
    const c = connectorCredentials(connector.id);
    setSaved(c);
    setDraft(c?.fields?.token ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector.id]);

  const connected = !!saved?.enabled;
  const Icon = iconFor(connector);

  function save() {
    const value = draft.trim();
    const next = setConnectorCredentials(connector.id, { fields: { token: value } });
    setSaved(next);
    onChanged();
  }

  function forget() {
    clearConnectorCredentials(connector.id);
    setSaved(null);
    setDraft("");
    onChanged();
  }

  function markOauth(on: boolean) {
    if (on) setSaved(setConnectorCredentials(connector.id, { enabled: true }));
    else {
      clearConnectorCredentials(connector.id);
      setSaved(null);
    }
    onChanged();
  }

  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-primary/80" />
        <span className="truncate text-[12px] font-medium text-white/90">{connector.name}</span>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[9px]",
            connected
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
              : "border-amber-400/30 bg-amber-500/10 text-amber-300",
          )}
        >
          {connected ? "Conectada" : "Requiere conexión"}
        </Badge>
        <span className="ml-auto shrink-0 text-[10px] text-white/35">opcional</span>
      </button>

      {open && (
        <div className="mt-2.5 space-y-2 border-t border-white/5 pt-2.5 pl-5">
          {connector.description && (
            <p className="text-[11px] leading-relaxed text-white/45">{connector.description}</p>
          )}

          {isKey && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={save}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                placeholder={connector.configHint ?? "Pega tu clave…"}
                className="h-8 min-w-[180px] flex-1 bg-background/60 text-xs"
                aria-label={`${APIKEY_FIELD_LABEL[connector.id] ?? "Clave"} de ${connector.name}`}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
              />
              <Button size="sm" variant="outline" className="h-8 cursor-pointer gap-1.5 text-xs" onClick={save}>
                <Check className="h-3.5 w-3.5" /> Guardar
              </Button>
              {connected && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 cursor-pointer gap-1.5 text-xs text-white/40 hover:text-red-300"
                  onClick={forget}
                >
                  <X className="h-3.5 w-3.5" /> Olvidar
                </Button>
              )}
            </div>
          )}

          {isOauth && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5 shrink-0" />
                Se conecta por OAuth (no guardamos credenciales aquí).
              </p>
              <div className="flex items-center gap-2">
                {connector.docsUrl && (
                  <a
                    href={connector.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-background/60 px-2.5 py-1 text-xs font-medium transition-colors duration-200 hover:bg-white/5"
                  >
                    Conectar <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "h-8 cursor-pointer gap-1.5 text-xs",
                    connected ? "text-emerald-300" : "text-muted-foreground",
                  )}
                  onClick={() => markOauth(!connected)}
                >
                  {connected ? (
                    <>
                      <Check className="h-3.5 w-3.5" /> Conectada
                    </>
                  ) : (
                    "Marcar como conectada"
                  )}
                </Button>
              </div>
            </div>
          )}

          <p className="text-[10px] text-white/30">
            Guardado solo en este navegador. Nunca se sincroniza con tu cuenta.
          </p>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Fila: default gratis/propio/OSS (ya funciona, sin cuenta)
   ════════════════════════════════════════════════════════════════ */
function FreeDefaultRow({ connector }: { connector: Connector }) {
  const integrationId = CONNECTOR_TO_INTEGRATION[connector.id];
  const [state, setState] = useState<{ enabled: boolean; endpoint: string } | null>(null);
  const [test, setTest] = useState<{ status: "idle" | "testing" | "ok" | "error"; message?: string }>({
    status: "idle",
  });
  const Icon = iconFor(connector);

  useEffect(() => {
    if (!integrationId) return;
    const cfg = loadIntegrationConfig(integrationId);
    const desc = getIntegration(integrationId);
    setState({
      enabled: !!cfg.enabled,
      endpoint: (cfg.endpoint && cfg.endpoint.trim()) || desc?.defaultEndpoint || "",
    });
  }, [integrationId]);

  async function onTest() {
    if (!integrationId) return;
    setTest({ status: "testing" });
    try {
      const r = await testIntegration(integrationId);
      setTest(
        r.ok ? { status: "ok", message: "Conexión correcta." } : { status: "error", message: r.error || "No respondió." },
      );
    } catch (e) {
      setTest({ status: "error", message: (e as Error)?.message || "Error al probar." });
    }
  }

  return (
    <div className="rounded-lg border border-emerald-400/10 bg-emerald-500/[0.03] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-emerald-300" />
        <span className="truncate text-[12px] font-medium text-white/90">{connector.name}</span>
        <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-[9px] text-emerald-300">
          <ShieldCheck className="mr-1 h-2.5 w-2.5" /> Funciona por defecto
        </Badge>
        <span className="ml-auto shrink-0 text-[10px] text-white/35">sin cuenta</span>
      </div>
      {connector.description && (
        <p className="mt-1 pl-6 text-[11px] leading-relaxed text-white/45">{connector.description}</p>
      )}
      {integrationId && state && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6 text-[10px] text-white/40">
          <span className="truncate">Endpoint: {state.endpoint || "—"}</span>
          <span>· {state.enabled ? "Activo en Integraciones" : "Actívalo en Integraciones"}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 cursor-pointer gap-1 px-1.5 text-[10px] text-cyan-200/70 hover:text-cyan-100"
            onClick={onTest}
            disabled={test.status === "testing"}
          >
            {test.status === "testing" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plug2 className="h-3 w-3" />
            )}
            Probar
          </Button>
          {test.status === "ok" && <span className="text-emerald-300">{test.message}</span>}
          {test.status === "error" && <span className="text-red-300">{test.message}</span>}
          <Link
            href="/settings?tab=advanced"
            className="ml-auto inline-flex shrink-0 items-center gap-1 text-cyan-200/70 hover:text-cyan-100"
          >
            Configurar <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Fila compacta: herramienta OSS del catálogo de Integraciones (solo lectura)
   ════════════════════════════════════════════════════════════════ */
function ExtraOssRow({ id }: { id: string }) {
  const desc = getIntegration(id);
  const [state, setState] = useState<{ enabled: boolean; endpoint: string } | null>(null);

  useEffect(() => {
    if (!desc) return;
    const cfg = loadIntegrationConfig(id);
    setState({
      enabled: !!cfg.enabled,
      endpoint: (cfg.endpoint && cfg.endpoint.trim()) || desc.defaultEndpoint || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!desc) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-white/5 bg-black/10 px-2.5 py-1.5 text-[11px]">
      <span className="font-medium text-white/70">{desc.label}</span>
      <span className="truncate text-white/35">{desc.capabilities[0] ?? ""}</span>
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 text-[9px]",
          state?.enabled ? "border-emerald-400/30 text-emerald-300" : "border-white/15 text-white/40",
        )}
      >
        {state?.enabled ? "Activo" : "Disponible"}
      </Badge>
      <Link
        href="/settings?tab=advanced"
        className="ml-auto inline-flex shrink-0 items-center gap-1 text-cyan-200/60 hover:text-cyan-100"
      >
        Configurar <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Tarjeta de categoría
   ════════════════════════════════════════════════════════════════ */
function CategoryCard({
  category,
  connectors,
  creds,
  globalMode,
  modePrefs,
  onRefresh,
}: {
  category: ConnectorCategory;
  connectors: Connector[];
  creds: ConnectorCredentialsMap;
  globalMode: ConnectorMode;
  modePrefs: ConnectorModePrefs;
  onRefresh: () => void;
}) {
  const override = modePrefs.perCategory?.[category];
  const effectiveMode = getConnectorMode(category);
  const { connector: active, viaOwn } = resolveActive(connectors, effectiveMode, creds);
  const extras = EXTRA_OSS_BY_CATEGORY[category] ?? [];
  const freeOnes = connectors.filter((c) => c.authType === "none" || c.authType === "localEndpoint");
  const brandOnes = connectors.filter((c) => c.authType === "apiKey" || c.authType === "oauth");

  function changeModeHere(value: string) {
    if (value === "inherit") clearConnectorModeOverride(category);
    else setConnectorMode(value as ConnectorMode, category);
    onRefresh();
  }

  return (
    <Card className="bg-background/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{DISPLAY_LABEL_OVERRIDES[category] ?? CATEGORY_LABELS[category]}</CardTitle>
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] text-white/35">Modo aquí</span>
            <select
              value={override ?? "inherit"}
              onChange={(e) => changeModeHere(e.target.value)}
              className="h-7 cursor-pointer rounded-md border border-white/15 bg-black/30 px-1.5 text-[11px] text-white/80"
              aria-label={`Modo de selección para ${CATEGORY_LABELS[category]}`}
            >
              <option value="inherit">General ({MODE_LABELS[globalMode]})</option>
              {MODE_ORDER.map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          {active ? (
            <>
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              Activo ahora: <strong className="text-foreground/90">{active.name}</strong>
              <span className="text-muted-foreground">{viaOwn ? "(tu cuenta)" : "(gratis · por defecto)"}</span>
            </>
          ) : (
            <>
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-amber-300" />
              Sin motor gratis disponible aún — conecta tu cuenta para activar esta categoría.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {freeOnes.map((c) => (
          <FreeDefaultRow key={c.id} connector={c} />
        ))}
        {brandOnes.map((c) => (
          <BrandConnectorRow key={c.id} connector={c} onChanged={onRefresh} />
        ))}
        {extras.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="px-0.5 text-[10px] uppercase tracking-wider text-white/30">
              Herramientas de código abierto disponibles
            </p>
            {extras.map((id) => (
              <ExtraOssRow key={id} id={id} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════
   Hub principal
   ════════════════════════════════════════════════════════════════ */
export function UserConnectorsHub() {
  const [creds, setCreds] = useState<ConnectorCredentialsMap>({});
  const [modePrefs, setModePrefs] = useState<ConnectorModePrefs>({ global: CONNECTOR_MODE_DEFAULT });
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    try {
      setCreds(allConnectorCredentials());
      setModePrefs(getConnectorModePrefs());
    } catch {
      setCreds({});
      setModePrefs({ global: CONNECTOR_MODE_DEFAULT });
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener(CONNECTORS_PREFS_EVENT, refresh);
    return () => window.removeEventListener(CONNECTORS_PREFS_EVENT, refresh);
  }, [refresh]);

  const grouped = useMemo(() => {
    const byCategory = new Map<ConnectorCategory, Connector[]>();
    for (const c of BUILTIN_CONNECTORS) {
      const arr = byCategory.get(c.category) ?? [];
      arr.push(c);
      byCategory.set(c.category, arr);
    }
    const cats = CATEGORY_ORDER.filter(
      (cat) => (byCategory.get(cat)?.length ?? 0) > 0 || (EXTRA_OSS_BY_CATEGORY[cat]?.length ?? 0) > 0,
    );
    return cats.map((cat) => ({ cat, connectors: byCategory.get(cat) ?? [] }));
  }, []);

  function changeGlobalMode(m: ConnectorMode) {
    setConnectorMode(m);
    refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-background/40 to-emerald-500/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug2 className="h-5 w-5 text-primary" /> Conectores por categoría
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Todo funciona <strong>gratis por defecto</strong>; conecta tus cuentas solo si quieres. Cada
            categoría ya trae un motor gratis, propio o de código abierto listo — no hace falta configurar
            nada. Cuando quieras usar tu propia cuenta (por ejemplo Notion o GitHub), conéctala abajo y
            decide cómo la usa Astraura con el modo general o por categoría.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Modo general</span>
            <ModeToggle value={modePrefs.global} onChange={changeGlobalMode} />
          </div>
          <p className="text-[11px] text-muted-foreground">{MODE_HINTS[modePrefs.global]}</p>
        </CardContent>
      </Card>

      {mounted &&
        grouped.map(({ cat, connectors }) => (
          <CategoryCard
            key={cat}
            category={cat}
            connectors={connectors}
            creds={creds}
            globalMode={modePrefs.global}
            modePrefs={modePrefs}
            onRefresh={refresh}
          />
        ))}

      <div className="flex items-start gap-3 rounded-lg border border-teal-400/15 bg-teal-500/5 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Tus claves y tokens quedan SOLO en este navegador — nunca viajan a tu cuenta ni a otros
          dispositivos. Solo el modo elegido (automático / preferir mi cuenta / solo gratis) se
          sincroniza, porque no es un secreto. Los servicios de marca sin conector real todavía se
          muestran como &quot;conecta tu cuenta&quot; (opcional) — el motor gratis/OSS de cada categoría es
          el que de verdad funciona hoy. Más categorías (mapas, diseño…) llegarán cuando haya un conector
          real que ofrecer.
        </p>
      </div>
    </div>
  );
}

export default UserConnectorsHub;
