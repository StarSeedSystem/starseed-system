"use client";

// ════════════════════════════════════════════════════════════════
// IntelligencePanel — "Inteligencia de Aurora (Astraura)".
// Gratis-primero y transparente: Aurora detecta las fuentes
// disponibles (instant · clave gratis · local), elige la mejor
// GRATUITA por tarea (modo Auto) o respeta el proveedor activo
// clásico (modo Manual). Permite fijar modelo por tarea, anunciar
// el modelo usado y ver el registro de rutas (transparencia total).
// Defensivo y SSR-safe: estado inicial neutro + carga en useEffect.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sparkles, Wand2, SlidersHorizontal, Megaphone, Radar, RefreshCw, ExternalLink,
  ChevronDown, Gem, ListChecks, History, CheckCircle2, XCircle,
  Gauge, Zap, RotateCcw, KeyRound, Cpu, Eye, Volume2, Lightbulb,
  Download, Loader2, Wrench, GitBranch, Library as LibraryIcon,
  Compass, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { encryptKey } from "@/ai/client/keyStorage";
import { loadConfigs, saveConfigs } from "@/ai/client/providerStore";
import type { ProviderConfig, ProviderId } from "@/ai/providers/types";
import { TASK_LABELS, findSource, type TaskKind, type SourceTier, type CatalogSource } from "@/ai/astraura/free-catalog";
import { activeCapabilities, type SkillCapability } from "@/ai/astraura/skills";
import {
  DOWNLOADABLE_SOURCES, DOWNLOAD_SIZES, MODEL_DOWNLOAD_EVENT, INSTALLED_MODELS_EVENT,
  isDownloadableSource, installModelInBackground, isModelInstalled, isDownloading,
  downloadProgress, markModelUninstalled,
} from "@/ai/astraura/installed-models";
import {
  detectAvailability, summarizeAvailability, userConfigForSource,
  type SourceAvailability,
} from "@/ai/astraura/availability";
import {
  DEFAULT_INTELLIGENCE, getIntelligenceSettings, saveIntelligenceSettings,
  readRouteLog, ROUTE_EVENT,
  type IntelligenceSettings, type RouteRecord,
} from "@/ai/astraura/router";
import {
  allUsageToday, dailyPercent, activeCooldowns, clearCooldown, USAGE_EVENT,
} from "@/ai/astraura/usage";
import {
  computeSuggestions, SUGGESTIONS_EVENT,
  type Suggestion, type SuggestionKind,
} from "@/ai/astraura/autonomy";
import {
  DEFAULT_USER_CONTEXT_SETTINGS, getUserContextSettings, saveUserContextSettings,
  USER_CONTEXT_SETTINGS_EVENT, type UserContextSettings, type UserContextLevel,
} from "@/ai/astraura/user-context";
import { AuroraAvatarSettingsCard } from "@/components/aurora/aurora-avatar";

/* ── Chips por nivel de fuente (gratuidad/privacidad legibles) ── */
const TIER_CHIP: Record<SourceTier, { label: string; cls: string }> = {
  instant: { label: "Instant", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
  "free-key": { label: "Clave gratis", cls: "bg-sky-500/15 text-sky-300 border-sky-400/30" },
  local: { label: "Local", cls: "bg-violet-500/15 text-violet-300 border-violet-400/30" },
  "local-gpu": { label: "Local GPU", cls: "bg-rose-500/15 text-rose-300 border-rose-400/30" },
  paid: { label: "De pago", cls: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
};

/** Etiqueta legible para un override `sourceId::modelId` (aunque ya no esté disponible). */
function labelForOverride(value: string): string {
  const [sourceId, modelId] = value.split("::");
  const source = findSource(sourceId ?? "");
  const model = source?.models.find((m) => m.id === modelId);
  if (source && model) return `${source.label} · ${model.label}`;
  return value;
}

/** Color de la barra de consumo diario (verde <60 · ámbar <85 · rojo ≥85). */
function usageBarColor(pct: number): string {
  if (pct >= 85) return "bg-red-500";
  if (pct >= 60) return "bg-amber-400";
  return "bg-emerald-500";
}

/**
 * Servicios GRATIS con clave que Aurora ya sabe usar: enlaces rápidos para
 * pegar la clave (abren su página de claves). Se resuelven contra el catálogo
 * (findSource) para heredar label + getKeyUrl reales; si un id cambiara en el
 * catálogo, esa entrada simplemente se omite (degradación defensiva).
 */
const FREE_KEY_SERVICE_IDS = [
  "openrouter-free",
  "groq-free",
  "gemini-free",
  "cerebras-free",
  // Adenda 67 · P3-3 (awesome-freellm-apis): nuevas fuentes gratuitas verificadas.
  "huggingface-router",
  "ollama-cloud",
  "modelscope-free",
  "zai-free",
  "nscale-free",
  "siliconflow-free",
  "cloudflare-workers-ai",
  "cohere-free",
  "mistral-free",
  "github-models-free",
  "sambanova-free",
] as const;

/**
 * (Adenda 67 · P0-2) CONECTAR UNA CLAVE **AQUÍ MISMO**.
 *
 * Antes, este panel decía "conecta una clave gratuita de OpenRouter" y solo
 * ofrecía un enlace externo: la clave había que pegarla en OTRO panel (Ajustes →
 * IA & Modelos), creando una config a mano con la URL base exacta. Si esa URL no
 * coincidía carácter a carácter con la del catálogo, el router NO reconocía la
 * fuente y OpenRouter "no funcionaba". Ahora la clave se pega en la misma fila
 * de la fuente y se guarda con el `baseUrl` y el adaptador CORRECTOS del catálogo.
 *
 * La clave se cifra (AES-GCM, `encryptKey`) con la passphrase por defecto — la
 * misma que usa `chat()` — y NUNCA se sincroniza con la cuenta.
 *
 * (Adenda 67 · P1) EXPORTADO: el Centro de Configuración de Aurora
 * (`components/aurora/setup/*`) lo reutiliza tal cual en su pestaña «Conexiones»,
 * para que exista UNA sola forma de guardar una clave en todo el OS.
 */
export function SourceKeyInput({ source, onSaved }: { source: CatalogSource; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  // Algunas fuentes (Cloudflare) llevan un hueco en la URL: {ACCOUNT}.
  const needsAccount = source.baseUrl.includes("{ACCOUNT}");

  const refresh = useCallback(() => {
    try { setHasKey(!!userConfigForSource(source)?.encryptedKey); } catch { setHasKey(false); }
  }, [source]);
  useEffect(() => { refresh(); }, [refresh]);

  async function save() {
    const key = value.trim();
    if (!key) return;
    if (needsAccount && !account.trim()) {
      toast.error("Falta el Account ID de Cloudflare.");
      return;
    }
    setBusy(true);
    try {
      const enc = await encryptKey(key, "");
      const baseUrl = needsAccount
        ? source.baseUrl.replace("{ACCOUNT}", account.trim())
        : source.baseUrl;
      const configs = loadConfigs();
      const norm = (u: string) => (u || "").replace(/\/+$/, "").toLowerCase();
      const idx = configs.findIndex(
        (c) =>
          norm(c.baseUrl) === norm(baseUrl) ||
          norm(c.baseUrl) === norm(source.baseUrl) ||
          (source.providerId !== "openai-compatible" && source.providerId !== "starseed" && c.id === source.providerId),
      );
      const next: ProviderConfig = {
        id: source.providerId as ProviderId,
        label: source.label,
        baseUrl,
        encryptedKey: enc,
        models: source.models.map((m) => m.id),
        defaultModel: source.models[0]?.id ?? "",
        enabled: true,
      };
      if (idx >= 0) configs[idx] = { ...configs[idx], ...next };
      else configs.push(next);
      saveConfigs(configs);
      setValue("");
      setAccount("");
      setOpen(false);
      refresh();
      onSaved();
      toast.success(`${source.label} conectado. Aurora ya puede usarlo.`);
    } catch {
      toast.error("No se pudo guardar la clave.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    try {
      const cfg = userConfigForSource(source);
      if (!cfg) return;
      const configs = loadConfigs().map((c) =>
        c === cfg || (c.id === cfg.id && c.baseUrl === cfg.baseUrl)
          ? { ...c, encryptedKey: "", enabled: false }
          : c,
      );
      saveConfigs(configs);
      refresh();
      onSaved();
      toast.success(`Clave de ${source.label} eliminada.`);
    } catch {
      toast.error("No se pudo eliminar la clave.");
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="cursor-pointer h-7 px-2 text-[11px]"
        onClick={() => (hasKey ? remove() : setOpen(true))}
        title={hasKey ? "Quitar la clave guardada" : `Pegar tu clave de ${source.label}`}
      >
        <KeyRound className="h-3.5 w-3.5 mr-1" />
        {hasKey ? "Quitar clave" : "Pegar clave"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-xs">
      {needsAccount && (
        <Input
          value={account}
          onChange={(e) => setAccount(e.target.value)}
          placeholder="Account ID de Cloudflare"
          className="h-7 text-xs"
        />
      )}
      <div className="flex items-center gap-1.5">
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          placeholder={`Clave de ${source.label}`}
          autoFocus
          className="h-7 text-xs"
        />
        <Button size="sm" className="h-7 px-2 text-[11px] cursor-pointer" disabled={busy || !value.trim()} onClick={() => void save()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] cursor-pointer" onClick={() => { setOpen(false); setValue(""); }}>
          Cancelar
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Se cifra en este dispositivo. Nunca viaja a la cuenta ni a StarSeed.
      </p>
    </div>
  );
}

/** Icono lucide por tipo de sugerencia de Aurora. */
const SUGGESTION_ICON: Record<SuggestionKind, typeof Gauge> = {
  quota: Gauge,
  "connect-free": KeyRound,
  "local-power": Cpu,
  vision: Eye,
  voice: Volume2,
  upgrade: Sparkles,
  tip: Lightbulb,
  "model-discovery": Compass,
};

/**
 * Botón de instalar/quitar para una fuente DESCARGABLE (SmolLM3, SmolVLM2,
 * WebLLM, Sipp, Gemini Nano). El usuario decide cuándo/dónde: la descarga va en
 * 2º plano (barra de progreso vía MODEL_DOWNLOAD_EVENT) y Aurora sigue con la
 * mejor alternativa gratis mientras tanto. SSR-safe: estado neutro hasta montar.
 */
function DownloadableModelButton({ sourceId, label }: { sourceId: string; label: string }) {
  const [mounted, setMounted] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  const sync = useCallback(() => {
    try {
      setInstalled(isModelInstalled(sourceId));
      setBusy(isDownloading(sourceId));
      setPct(downloadProgress(sourceId));
    } catch { /* defensivo */ }
  }, [sourceId]);

  useEffect(() => {
    setMounted(true);
    sync();
    if (typeof window === "undefined") return;
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent<{ sourceId?: string; pct?: number; done?: boolean }>).detail;
      if (!d || d.sourceId !== sourceId) return;
      if (typeof d.pct === "number") setPct(Math.max(0, Math.min(100, d.pct)));
      if (d.done) sync();
      else setBusy(true);
    };
    window.addEventListener(MODEL_DOWNLOAD_EVENT, onProgress);
    window.addEventListener(INSTALLED_MODELS_EVENT, sync);
    return () => {
      window.removeEventListener(MODEL_DOWNLOAD_EVENT, onProgress);
      window.removeEventListener(INSTALLED_MODELS_EVENT, sync);
    };
  }, [sourceId, sync]);

  const handleInstall = useCallback(async () => {
    setBusy(true);
    const res = await installModelInBackground(sourceId);
    if (res.ok) toast.success(label, { description: res.message });
    else toast.error(label, { description: res.message });
    sync();
  }, [sourceId, label, sync]);

  const handleUninstall = useCallback(() => {
    markModelUninstalled(sourceId);
    sync();
    toast.success(label, { description: "Modelo quitado. Aurora dejará de ofrecerlo (reinstálalo cuando quieras)." });
  }, [sourceId, label, sync]);

  const size = DOWNLOAD_SIZES[sourceId];

  if (!mounted) return <div className="h-7 w-20 shrink-0 animate-pulse rounded-md bg-white/5" />;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {installed ? (
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-emerald-500/30 text-[11px] text-emerald-300 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300 cursor-pointer"
          onClick={handleUninstall}
          title="Instalado — pulsa para quitar"
        >
          <CheckCircle2 className="h-3 w-3" /> Instalado · Quitar
        </Button>
      ) : (
        <Button
          size="sm"
          className="h-7 gap-1.5 bg-teal-600 text-[11px] font-semibold text-white hover:bg-teal-500 cursor-pointer"
          onClick={() => void handleInstall()}
          disabled={busy}
          title={size ? `Descarga ${size} · en segundo plano` : "Descarga en segundo plano"}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          {busy ? "Descargando…" : `Instalar${size ? ` · ${size}` : ""}`}
        </Button>
      )}
      {busy && !installed && (
        <div className="w-28">
          <Progress value={pct} indicatorClassName="bg-teal-400" className="h-1" />
        </div>
      )}
    </div>
  );
}

export function IntelligencePanel() {
  const [settings, setSettings] = useState<IntelligenceSettings>({ ...DEFAULT_INTELLIGENCE });
  const [avail, setAvail] = useState<SourceAvailability[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  // Uso/límites de hoy + fuentes en enfriamiento (agotadas) — SSR-safe: vacío inicial.
  const [usage, setUsage] = useState<ReturnType<typeof allUsageToday>>([]);
  const [cooldowns, setCooldowns] = useState<ReturnType<typeof activeCooldowns>>([]);
  // Sugerencias de Aurora (autonomía): se cargan en efecto y se refrescan por evento.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Capacidades vivas (skills instaladas que Aurora EJECUTA). Se refrescan al
  // instalar/desinstalar desde la Biblioteca (evento "starseed:library").
  const [activeCaps, setActiveCaps] = useState<SkillCapability[]>([]);
  // Contexto Total de Aurora: "Aurora conoce mi contexto" (on/off) + nivel
  // por defecto (breve/completo) que se inyecta automáticamente en cada turno.
  const [userCtx, setUserCtx] = useState<UserContextSettings>({ ...DEFAULT_USER_CONTEXT_SETTINGS });

  /* ── Carga inicial + escucha de eventos (SSR-safe: todo en useEffect) ── */
  const detect = useCallback(async () => {
    setDetecting(true);
    try {
      const list = await detectAvailability();
      setAvail(list);
    } catch { /* defensivo: nunca romper el panel */ }
    setDetecting(false);
  }, []);

  /** Relee uso/límites y enfriamientos desde localStorage (defensivo). */
  const refreshUsage = useCallback(() => {
    try {
      setUsage(allUsageToday());
      setCooldowns(activeCooldowns());
    } catch { /* defensivo: nunca romper el panel */ }
  }, []);

  /** Recalcula las sugerencias de Aurora (gratis-primero). Nunca lanza. */
  const refreshSuggestions = useCallback(async () => {
    try {
      const s = await computeSuggestions();
      setSuggestions(Array.isArray(s) ? s : []);
    } catch { /* defensivo */ }
  }, []);

  useEffect(() => {
    setSettings(getIntelligenceSettings());
    setUserCtx(getUserContextSettings());
    setRoutes(readRouteLog());
    void detect();
    refreshUsage();
    void refreshSuggestions();
    const refreshCaps = () => { try { setActiveCaps(activeCapabilities()); } catch { setActiveCaps([]); } };
    refreshCaps();
    if (typeof window === "undefined") return;
    const onRoute = () => { setRoutes(readRouteLog()); refreshUsage(); };
    const onSettings = () => setSettings(getIntelligenceSettings());
    const onUserCtx = () => setUserCtx(getUserContextSettings());
    const onUsage = () => refreshUsage();
    const onLibrary = () => refreshCaps();
    window.addEventListener("starseed:library", onLibrary);
    // El latido de autonomía emite las sugerencias ya calculadas en `detail`.
    const onSuggestions = (e: Event) => {
      const d = (e as CustomEvent<Suggestion[]>).detail;
      if (Array.isArray(d)) setSuggestions(d);
      else void refreshSuggestions();
    };
    window.addEventListener(ROUTE_EVENT, onRoute);
    window.addEventListener("starseed:astraura-intelligence", onSettings);
    window.addEventListener(USER_CONTEXT_SETTINGS_EVENT, onUserCtx);
    window.addEventListener(USAGE_EVENT, onUsage);
    window.addEventListener(SUGGESTIONS_EVENT, onSuggestions);
    return () => {
      window.removeEventListener(ROUTE_EVENT, onRoute);
      window.removeEventListener("starseed:astraura-intelligence", onSettings);
      window.removeEventListener(USER_CONTEXT_SETTINGS_EVENT, onUserCtx);
      window.removeEventListener(USAGE_EVENT, onUsage);
      window.removeEventListener(SUGGESTIONS_EVENT, onSuggestions);
      window.removeEventListener("starseed:library", onLibrary);
    };
  }, [detect, refreshUsage, refreshSuggestions]);

  /** Guarda un parche de ajustes y sincroniza el estado local. */
  function update(patch: Partial<IntelligenceSettings>) {
    setSettings(saveIntelligenceSettings(patch));
  }

  /** Guarda un parche del Contexto Total de Aurora y sincroniza el estado local. */
  function updateUserCtx(patch: Partial<UserContextSettings>) {
    setUserCtx(saveUserContextSettings(patch));
  }

  /* ── Derivados ── */
  const freeAvail = useMemo(() => (avail ?? []).filter((a) => a.source.tier !== "paid"), [avail]);
  const paidAvail = useMemo(() => (avail ?? []).filter((a) => a.source.tier === "paid"), [avail]);
  /** Fuentes listas y habilitadas: son las elegibles en "Modelo por tarea". */
  const readySources = useMemo(
    () => freeAvail.filter((a) => a.ready && !settings.disabledSources.includes(a.source.id)),
    [freeAvail, settings.disabledSources],
  );
  const recentRoutes = useMemo(() => [...routes].slice(-8).reverse(), [routes]);
  /** Servicios gratis-con-clave resueltos contra el catálogo (label + getKeyUrl). */
  const freeKeyServices = useMemo(
    () =>
      FREE_KEY_SERVICE_IDS
        .map((id) => findSource(id))
        .filter((s): s is NonNullable<typeof s> => !!s && !!s.getKeyUrl),
    [],
  );

  function toggleSource(sourceId: string, enabled: boolean) {
    const next = enabled
      ? settings.disabledSources.filter((id) => id !== sourceId)
      : Array.from(new Set([...settings.disabledSources, sourceId]));
    update({ disabledSources: next });
  }

  /** El usuario fuerza el reintento de una fuente agotada (limpia su cooldown). */
  function reactivate(sourceId: string, label: string) {
    try {
      clearCooldown(sourceId);
      refreshUsage();
      toast.success(`${label} reactivada — Aurora volverá a usarla`);
    } catch { /* defensivo */ }
  }

  function setTaskModel(task: TaskKind, value: string) {
    const perTask = { ...settings.perTask };
    if (value === "auto") delete perTask[task];
    else perTask[task] = value;
    update({ perTask });
    toast.success(value === "auto"
      ? `${TASK_LABELS[task]}: Aurora elige`
      : `${TASK_LABELS[task]}: ${labelForOverride(value)}`);
  }

  return (
    <div className="space-y-6">
      {/* ── Hero: modo Auto vs Manual + anuncio ── */}
      <Card className="bg-gradient-to-br from-primary/10 via-background/40 to-emerald-500/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Inteligencia de Aurora (Astraura)
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Aurora busca siempre la mejor inteligencia <strong>gratuita</strong> disponible para cada tarea
            (tus servicios conectados tienen prioridad) y te dice con transparencia qué modelo usó.
            En modo Manual se respeta tu proveedor activo clásico de «IA & Modelos».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toggle de modo */}
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              onClick={() => { update({ mode: "auto" }); toast.success("Modo: Auto (Aurora elige)"); }}
              className={`text-left rounded-lg border p-3 transition cursor-pointer ${settings.mode === "auto" ? "border-emerald-400/50 bg-emerald-400/5 ring-1 ring-emerald-400/30" : "border-white/5 bg-black/20 hover:border-emerald-400/30"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Wand2 className="h-4 w-4 text-emerald-300" />
                <span className="text-sm font-semibold">Auto</span>
                <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 text-[9px]">Recomendado</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Aurora elige la mejor fuente gratis-primero, con failover si algo falla.</p>
            </button>
            <button
              onClick={() => { update({ mode: "manual" }); toast.success("Modo: Manual (proveedor activo)"); }}
              className={`text-left rounded-lg border p-3 transition cursor-pointer ${settings.mode === "manual" ? "border-amber-400/50 bg-amber-400/5 ring-1 ring-amber-400/30" : "border-white/5 bg-black/20 hover:border-amber-400/30"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <SlidersHorizontal className="h-4 w-4 text-amber-300" />
                <span className="text-sm font-semibold">Manual</span>
              </div>
              <p className="text-[11px] text-muted-foreground">Se usa siempre tu proveedor activo clásico, sin enrutado automático.</p>
            </button>
          </div>

          {/* Anuncio del modelo usado */}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="flex items-start gap-3 min-w-0">
              <Megaphone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Aurora anuncia el modelo usado</p>
                <p className="text-[11px] text-muted-foreground">Transparencia: te dice qué inteligencia atendió cada petición.</p>
              </div>
            </div>
            <Select value={settings.announce} onValueChange={(v) => update({ announce: v as IntelligenceSettings["announce"] })}>
              <SelectTrigger className="w-[150px] bg-background/60 border-white/10 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on-change">Al cambiar</SelectItem>
                <SelectItem value="always">Siempre</SelectItem>
                <SelectItem value="never">Nunca</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ── Contexto Total de Aurora: "Aurora conoce mi contexto" ── */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <UserRound className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <CardTitle className="text-base">Aurora conoce mi contexto</CardTitle>
                <CardDescription className="mt-1 leading-relaxed">
                  Aurora recibe automáticamente un resumen de tu ámbito propio (perfiles, grupos/páginas,
                  archivos, publicaciones, mensajes —solo hilos, nunca su contenido—, notificaciones,
                  recordatorios, escritorios y espacios) para responder con más criterio, sin que se lo pidas.
                  Nunca comparte claves ni datos de otras personas.
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={userCtx.enabled}
              onCheckedChange={(v) => {
                updateUserCtx({ enabled: v });
                toast.success(v ? "Aurora conocerá tu contexto en cada conversación" : "Contexto automático desactivado");
              }}
              aria-label="Aurora conoce mi contexto"
            />
          </div>
        </CardHeader>
        {userCtx.enabled && (
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-black/20 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Nivel por defecto</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  «Breve» (recomendado) mantiene la conversación rápida; Aurora puede pedir el contexto
                  «Completo» ella misma cuando lo necesite. «Completo» lo inyecta siempre, con más detalle.
                </p>
              </div>
              <Select
                value={userCtx.defaultLevel}
                onValueChange={(v) => updateUserCtx({ defaultLevel: v as UserContextLevel })}
              >
                <SelectTrigger className="w-[130px] bg-background/60 border-white/10 cursor-pointer shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breve">Breve</SelectItem>
                  <SelectItem value="completo">Completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Fuentes detectadas ── */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Radar className="h-4 w-4 text-emerald-400" /> Fuentes detectadas
              </CardTitle>
              <CardDescription className="mt-1.5">
                {avail ? summarizeAvailability(avail) : "Detectando fuentes de inteligencia en este dispositivo…"}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="cursor-pointer shrink-0" onClick={() => void detect()} disabled={detecting}>
              <RefreshCw className={`h-4 w-4 ${detecting ? "animate-spin" : ""}`} />
              <span className="sr-only">Volver a detectar</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!avail && (
            <p className="text-xs text-muted-foreground">Sondas rápidas en curso (Ollama, LM Studio, WebGPU, IA del navegador)…</p>
          )}
          {freeAvail.map((a) => {
            const tier = TIER_CHIP[a.source.tier];
            const enabled = !settings.disabledSources.includes(a.source.id);
            return (
              <div key={a.source.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${a.ready ? "bg-emerald-400" : "bg-zinc-600"}`} />
                    <span className="text-sm font-semibold">{a.source.label}</span>
                    <Badge variant="outline" className={`text-[9px] ${tier.cls}`}>{tier.label}</Badge>
                    {a.userConfig && (
                      <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/30">Tu servicio</Badge>
                    )}
                  </div>
                  {a.ready ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{a.source.limits}</p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {a.reason}{" "}
                      {a.source.getKeyUrl && (
                        <a
                          href={a.source.getKeyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          Conseguir clave gratis <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </p>
                  )}
                  {/* Fuentes descargables: el usuario decide cuándo/dónde instalarlas. */}
                  {isDownloadableSource(a.source.id) && (
                    <p className="text-[10px] text-muted-foreground/80 mt-1">
                      Modelo local descargable · opcional. Aurora sigue con la mejor alternativa gratis mientras.
                    </p>
                  )}
                  {/* Fuentes SIN clave que aceptan una opcional para subir límites. */}
                  {a.source.keyOptional && (
                    <p className="text-[10px] text-emerald-300/80 mt-1">
                      Funciona SIN clave. Si añades una (gratuita), sube sus límites.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Pegar la clave AQUÍ MISMO (free-key + keyOptional). */}
                  {(a.source.requiresKey || a.source.keyOptional) && (
                    <SourceKeyInput source={a.source} onSaved={() => void detect()} />
                  )}
                  {isDownloadableSource(a.source.id) && (
                    <DownloadableModelButton sourceId={a.source.id} label={a.source.label} />
                  )}
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => toggleSource(a.source.id, v)}
                    aria-label={`Usar ${a.source.label}`}
                  />
                </div>
              </div>
            );
          })}

          {/* Sugerencias premium (plegadas): Aurora nunca las activa sola */}
          {paidAvail.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full rounded-lg border border-amber-400/15 bg-amber-500/5 p-3 text-sm font-semibold text-amber-200/90 hover:bg-amber-500/10 transition cursor-pointer group">
                <Gem className="h-4 w-4 text-amber-300" /> Sugerencias premium (opcional)
                <ChevronDown className="h-4 w-4 ml-auto transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2">
                <p className="text-[11px] text-muted-foreground px-1">
                  Servicios de pago que Aurora solo <strong>sugiere</strong>: nunca los usa sin que tú los conectes.
                </p>
                {paidAvail.map((a) => (
                  <div key={a.source.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${a.ready ? "bg-emerald-400" : "bg-zinc-600"}`} />
                        <span className="text-sm font-semibold">{a.source.label}</span>
                        <Badge variant="outline" className={`text-[9px] ${TIER_CHIP.paid.cls}`}>{TIER_CHIP.paid.label}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {a.source.why}{" "}
                        {!a.ready && a.source.getKeyUrl && (
                          <a
                            href={a.source.getKeyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            Conectar <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                {/* Failover hacia servicios de pago YA configurados por el usuario */}
                <div className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-black/20 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    Permitir que el failover use tus servicios de pago <strong>ya configurados</strong> como último recurso.
                  </p>
                  <Switch
                    checked={settings.allowConfiguredPaid}
                    onCheckedChange={(v) => update({ allowConfiguredPaid: v })}
                    aria-label="Permitir servicios de pago configurados en el failover"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      {/* ── Modelo por tarea ── */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-cyan-400" /> Modelo por tarea
          </CardTitle>
          <CardDescription>
            Fija un modelo concreto para cada tipo de tarea o deja <strong>Auto</strong> para que Aurora elija (recomendado).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(TASK_LABELS) as TaskKind[]).map((task) => {
            const value = settings.perTask[task] ?? "auto";
            // Override huérfano: la fuente/modelo elegidos ya no están listos.
            const known = value === "auto" || readySources.some((a) =>
              a.source.models.some((m) => `${a.source.id}::${m.id}` === value));
            return (
              <div key={task} className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">{TASK_LABELS[task]}</p>
                <Select value={value} onValueChange={(v) => setTaskModel(task, v)}>
                  <SelectTrigger className="bg-background/60 border-white/10 cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Aurora elige)</SelectItem>
                    {readySources.map((a) => (
                      <SelectGroup key={a.source.id}>
                        <SelectLabel>{a.source.label}</SelectLabel>
                        {a.source.models.map((m) => (
                          <SelectItem key={m.id} value={`${a.source.id}::${m.id}`}>{m.label}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                    {!known && (
                      <SelectItem value={value}>{labelForOverride(value)} (no disponible ahora)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Herramientas & servicios ── */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-4 w-4 text-teal-300" /> Herramientas & servicios
          </CardTitle>
          <CardDescription>
            Ajustes de las herramientas que potencian a Aurora. Todo viene <strong>pre-integrado</strong>:
            aquí afinas el enrutado y conectas más servicios gratis. Puedes ampliar la caja de
            herramientas en la <Link href="/library?tab=destacado" className="text-primary hover:underline cursor-pointer">Biblioteca → Herramientas IA & Agentes</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Enrutado por dificultad (patrón RouteLLM, ya integrado) */}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="flex items-start gap-3 min-w-0">
              <GitBranch className="h-4 w-4 text-teal-300 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Enrutado por dificultad</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Estima lo difícil que es cada petición y usa modelos <strong>fuertes</strong> para lo
                  difícil y <strong>rápidos</strong> para lo trivial (patrón RouteLLM). Siempre respeta
                  gratis-primero.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.difficultyRouting !== false}
              onCheckedChange={(v) => { update({ difficultyRouting: v }); toast.success(v ? "Enrutado por dificultad activado" : "Enrutado por dificultad desactivado"); }}
              aria-label="Enrutado por dificultad"
            />
          </div>

          {/* Selección automática de herramientas (Adenda "Aurora siempre responde", jul-2026) */}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/5 bg-black/20 p-3">
            <div className="flex items-start gap-3 min-w-0">
              <Wand2 className="h-4 w-4 text-teal-300 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Selección automática de herramientas</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  En cada mensaje, Aurora evalúa sola qué herramientas del contexto (web, archivos,
                  widgets del escritorio…) conviene invocar. Desactívalo para que solo actúe cuando
                  se lo pidas explícitamente.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.autoTools !== false}
              onCheckedChange={(v) => { update({ autoTools: v }); toast.success(v ? "Selección automática de herramientas activada" : "Selección automática de herramientas desactivada"); }}
              aria-label="Selección automática de herramientas"
            />
          </div>

          {/* Capacidades vivas: skills instaladas que Aurora EJECUTA (system prompt + routing) */}
          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-fuchsia-300" /> Capacidades activas de Aurora
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
              Las skills que instalas desde la Biblioteca no solo se guardan: Aurora las <strong>ejecuta</strong>
              {" "}(guían su cerebro y su elección de modelo). Se sincronizan con tu cuenta en OS, Nexus y Café.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeCaps.length > 0 ? (
                activeCaps.map((c) => (
                  <Badge key={c.id} variant="secondary" className="bg-fuchsia-500/10 text-fuchsia-200 border-fuchsia-400/20">
                    {c.label}
                  </Badge>
                ))
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Ninguna activa todavía. Añádelas en la{" "}
                  <Link href="/library?tab=destacado" className="text-primary hover:underline cursor-pointer">Biblioteca → Herramientas IA & Agentes</Link>.
                </span>
              )}
            </div>
          </div>

          {/* THE HUGGING BAY: descubrimiento inteligente de modelos reales */}
          <div className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <Compass className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Descubrimiento Hugging Bay</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Aurora consulta{" "}
                    <a href="https://huggingbay.xyz" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline cursor-pointer">
                      THE HUGGING BAY
                    </a>{" "}
                    (registro verificado de modelos open-source) para recomendar el mejor modelo real
                    por tarea, con licencia, confianza y comando de instalación local listo para copiar.
                    Nunca descarga nada sola.
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.huggingBay?.enabled !== false}
                onCheckedChange={(v) => update({ huggingBay: { ...settings.huggingBay, enabled: v } })}
                aria-label="Descubrimiento Hugging Bay"
              />
            </div>
            {settings.huggingBay?.enabled !== false && (
              <div className="grid gap-2 pl-7 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-background/40 p-2.5">
                  <span className="text-[11px] font-medium">Auto-sugerencia</span>
                  <Switch
                    checked={settings.huggingBay?.autoSuggest !== false}
                    onCheckedChange={(v) => update({ huggingBay: { ...settings.huggingBay, autoSuggest: v } })}
                    aria-label="Auto-sugerencia de modelos"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-background/40 p-2.5">
                  <span className="text-[11px] font-medium">Herramienta preferida</span>
                  <Select
                    value={settings.huggingBay?.preferredTool ?? "ollama"}
                    onValueChange={(v) => update({ huggingBay: { ...settings.huggingBay, preferredTool: v as IntelligenceSettings["huggingBay"]["preferredTool"] } })}
                  >
                    <SelectTrigger className="h-7 w-[130px] bg-background/60 border-white/10 text-[11px] cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama">Ollama</SelectItem>
                      <SelectItem value="lmstudio">LM Studio</SelectItem>
                      <SelectItem value="comfyui">ComfyUI</SelectItem>
                      <SelectItem value="transformers">Transformers</SelectItem>
                      <SelectItem value="llama.cpp">llama.cpp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-background/40 p-2.5">
                  <span className="text-[11px] font-medium">Solo licencias permisivas</span>
                  <Switch
                    checked={settings.huggingBay?.permissiveOnly !== false}
                    onCheckedChange={(v) => update({ huggingBay: { ...settings.huggingBay, permissiveOnly: v } })}
                    aria-label="Solo licencias permisivas"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-background/40 p-2.5">
                  <span className="text-[11px] font-medium">Solo hosted/verificados</span>
                  <Switch
                    checked={!!settings.huggingBay?.hostedOnly}
                    onCheckedChange={(v) => update({ huggingBay: { ...settings.huggingBay, hostedOnly: v } })}
                    aria-label="Solo hosted/verificados"
                  />
                </div>
              </div>
            )}
            <p className="pl-7 text-[10px] text-muted-foreground/80">
              Explora el catálogo completo en{" "}
              <Link href="/library?tab=destacado" className="text-cyan-300 hover:underline cursor-pointer">
                Biblioteca → Hugging Bay
              </Link>.
            </p>
          </div>

          {/* Enlaces rápidos para pegar claves de servicios gratis */}
          {freeKeyServices.length > 0 && (
            <div className="rounded-lg border border-white/5 bg-black/20 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <KeyRound className="h-4 w-4 text-sky-300" /> Conectar servicios gratis
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Consigue una clave GRATUITA de cualquiera de estos y pégala arriba, en «Fuentes detectadas».
                Aurora los usará solos, gratis-primero.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {freeKeyServices.map((s) => (
                  <a
                    key={s.id}
                    href={s.getKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-background/60 px-2.5 py-1 text-xs font-medium hover:bg-white/5 transition cursor-pointer"
                    title={`Conseguir clave gratis de ${s.label}`}
                  >
                    {s.label} <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Nota: pre-integrado + ampliable en la Biblioteca */}
          <div className="flex items-start gap-3 rounded-lg border border-teal-400/15 bg-teal-500/5 p-3">
            <LibraryIcon className="h-4 w-4 text-teal-300 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Las herramientas de agentes, sentidos web, calidad de UI y las fuentes locales
              (OpenLLM, Ollama…) vienen pre-integradas. Amplía o gestiona todo en la{" "}
              <Link href="/library?tab=destacado" className="text-teal-300 hover:underline cursor-pointer">
                Biblioteca → Herramientas IA & Agentes
              </Link>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Uso y límites de hoy ── */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-400" /> Uso y límites de hoy
          </CardTitle>
          <CardDescription>
            Cuánto llevas usado hoy de cada fuente y su límite gratuito. Cuando una se agota,
            Aurora pasa <strong>sola</strong> a la siguiente gratis para no dejar de funcionar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Fuentes agotadas (en enfriamiento): chip + botón de reactivar. */}
          {cooldowns.length > 0 && (
            <div className="space-y-2">
              {cooldowns.map((c) => (
                <div key={c.sourceId} className="flex items-center justify-between gap-3 rounded-lg border border-red-400/20 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="h-4 w-4 text-red-400 shrink-0" />
                    <span className="text-sm font-semibold truncate">{c.label}</span>
                    <Badge variant="outline" className="text-[9px] bg-red-500/15 text-red-300 border-red-400/30 shrink-0">
                      agotada · {c.minutesLeft}min
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer shrink-0 h-7 text-xs border-red-400/30 hover:bg-red-500/10"
                    onClick={() => reactivate(c.sourceId, c.label)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Reactivar
                  </Button>
                </div>
              ))}
            </div>
          )}

          {usage.length === 0 && cooldowns.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aún no has usado ninguna fuente hoy. En cuanto hables con Aurora verás aquí tu consumo y tus límites.
            </p>
          )}

          {usage.map((u) => {
            const pct = dailyPercent(u.sourceId);
            const tokens = u.usage.inputTokens + u.usage.outputTokens;
            return (
              <div key={u.sourceId} className="rounded-lg border border-white/5 bg-black/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-sm font-semibold min-w-0 truncate">{u.label}</span>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                    <span>{u.usage.requests} pet.{u.limit ? ` / ${u.limit}` : ""}</span>
                    {tokens > 0 && (
                      <span className="text-muted-foreground/80">· {tokens.toLocaleString("es-ES")} tok.</span>
                    )}
                  </div>
                </div>
                {pct != null && (
                  <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full transition-all ${usageBarColor(pct)}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
                {u.note && (
                  <p className="text-[10px] text-muted-foreground">{u.note}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Sugerencias de Aurora ── */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-300" /> Sugerencias de Aurora
          </CardTitle>
          <CardDescription>
            Ideas para mejorar tu inteligencia gratis-primero. Aurora solo <strong>propone</strong>:
            nunca activa ni descarga nada sin tu permiso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {suggestions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Todo en orden por ahora — Aurora no tiene sugerencias nuevas. Aparecerán aquí cuando pueda mejorar algo.
            </p>
          )}
          {suggestions.map((s, i) => {
            const Icon = SUGGESTION_ICON[s.kind] ?? Lightbulb;
            const href = s.href; // narrow explícito (no a través de const booleana)
            const actionCls = "shrink-0 inline-flex items-center gap-1 rounded-md border border-white/10 bg-background/60 px-2.5 py-1 text-xs font-medium hover:bg-white/5 transition cursor-pointer";
            return (
              <div key={`${s.kind}-${i}`} className="flex items-start gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
                <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{s.detail}</p>
                </div>
                {href && (
                  s.external ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className={actionCls}>
                      Abrir <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <Link href={href} className={actionCls}>
                      Ir <ChevronDown className="h-3 w-3 -rotate-90" />
                    </Link>
                  )
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Últimas rutas (transparencia) ── */}
      <Card className="bg-background/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Últimas rutas (transparencia)
          </CardTitle>
          <CardDescription>
            Qué inteligencia atendió cada petición, por qué y si hubo reintentos. Siempre puedes cambiarla arriba.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentRoutes.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aún no hay rutas registradas: cuando hables con Aurora aparecerán aquí.
            </p>
          )}
          {recentRoutes.map((rec, i) => (
            <div key={`${rec.at}-${i}`} className="flex items-start gap-2 rounded-lg border border-white/5 bg-black/20 p-2.5">
              {rec.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(rec.at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="font-semibold">{rec.taskLabel}</span>
                  <span className="text-muted-foreground">{rec.sourceLabel} · {rec.modelLabel}</span>
                  <Badge
                    variant="outline"
                    className={`text-[9px] ${rec.free ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" : "bg-amber-500/15 text-amber-300 border-amber-400/30"}`}
                  >
                    {rec.free ? "gratis" : "de pago"}
                  </Badge>
                </div>
                {rec.failovers && rec.failovers.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Failover: {rec.failovers.map((f) => f.sourceId).join(" → ")} → {rec.sourceId}
                  </p>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Avatar de Aurora (orbe animado mejorado / Live2D opcional) ── */}
      <AuroraAvatarSettingsCard />
    </div>
  );
}
