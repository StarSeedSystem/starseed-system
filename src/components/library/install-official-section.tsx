"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * InstallOfficialSection — "Instalar StarSeed" (instalación OFICIAL)
 * ---------------------------------------------------------------------------
 * Sección especial de la Biblioteca, claramente diferenciada del catálogo, que
 * reúne TODAS las instalaciones oficiales del OS (petición del dueño):
 *
 *   1. Instalar StarSeed OS en este dispositivo → detecta el SO, ofrece PWA
 *      (vía real hoy), estado "ya instalada" si standalone, y las opciones
 *      nativas con su estado HONESTO (soon/link).
 *   2. Dar control total a Aurora (compañero local) → explica terminal/permisos
 *      con honestidad, pasos por SO, y botón para conceder los permisos WEB.
 *   3. Modelos de IA locales (opcional) → los DOWNLOADABLE_SOURCES del catálogo
 *      con su tamaño y botón Instalar (2º plano) / Instalado ✓ / progreso.
 *
 * Estética cristal (ss-crystal/ss-neon si existen; fallback glass). SSR-safe:
 * todo lo que toca window/navigator se calcula tras montar. Nunca rompe la UI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Rocket, DownloadCloud, MonitorSmartphone, Terminal, ShieldCheck, Cpu, Package,
  ExternalLink, CheckCircle2, Clock, Download, Loader2, Github, KeyRound, Share,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  detectOS, nativePackages, companionInfo, requestMaxPermissions,
  canInstallPWA, promptInstallPWA, isRunningStandalone, initPwaCapture,
  registerAsAgentNeuron, PWA_STATE_EVENT,
  type DetectedOs, type NativeOption, type CompanionInfo,
} from "@/lib/install/device-install";
import { findSource } from "@/ai/astraura/free-catalog";
import {
  DOWNLOADABLE_SOURCES, DOWNLOAD_SIZES, MODEL_DOWNLOAD_EVENT,
  INSTALLED_MODELS_EVENT, installModelInBackground, isModelInstalled,
  isDownloading, downloadProgress, markModelUninstalled,
} from "@/ai/astraura/installed-models";

/** Mapa nombre-lucide → componente (fallback defensivo: Package). */
const ICON_MAP: Record<string, LucideIcon> = { Download, Github, Package, ExternalLink };
function NativeIcon({ name, className }: { name?: string; className?: string }) {
  const Icon = (name && ICON_MAP[name]) || Package;
  return <Icon className={className} />;
}

/* ───────────────────────── Bloque 1 · Instalar el OS ───────────────────────── */

function InstallOsBlock({ os }: { os: DetectedOs }) {
  const [standalone, setStandalone] = useState(false);
  const [canPwa, setCanPwa] = useState(false);
  const [busy, setBusy] = useState(false);
  const options = useMemo(() => nativePackages(os.os), [os.os]);

  useEffect(() => {
    initPwaCapture();
    const sync = () => { setStandalone(isRunningStandalone()); setCanPwa(canInstallPWA()); };
    sync();
    if (typeof window === "undefined") return;
    window.addEventListener(PWA_STATE_EVENT, sync);
    window.addEventListener("appinstalled", sync);
    return () => {
      window.removeEventListener(PWA_STATE_EVENT, sync);
      window.removeEventListener("appinstalled", sync);
    };
  }, []);

  const handlePwa = useCallback(async () => {
    setBusy(true);
    const res = await promptInstallPWA();
    setBusy(false);
    if (res === "accepted") toast.success("StarSeed OS", { description: "Instalada como app en este dispositivo." });
    else if (res === "dismissed") toast.message("StarSeed OS", { description: "Instalación cancelada. Puedes hacerlo cuando quieras." });
    else toast.message("StarSeed OS", { description: os.os === "ios" ? "En iPhone/iPad: Compartir → «Añadir a pantalla de inicio»." : "Tu navegador aún no ofrece el diálogo. Interactúa un poco y reintenta, o usa el menú «Instalar app»." });
  }, [os.os]);

  return (
    <GlassCard className="ss-crystal relative overflow-hidden border-emerald-400/20 bg-gradient-to-br from-emerald-900/25 via-teal-900/15 to-transparent p-5">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10">
            <MonitorSmartphone className="h-6 w-6 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-emerald-100">Instalar StarSeed OS en este dispositivo</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Detectado: <span className="font-semibold text-emerald-200">{os.label}</span>
              {os.arch ? ` · ${os.arch}` : ""}. La instalación real hoy es la PWA (app con pantalla completa y offline).
            </p>
          </div>
        </div>

        {/* Estado / acción principal PWA */}
        {standalone ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Ya está instalada como app en este dispositivo. Ábrela desde tu pantalla de inicio.
          </div>
        ) : (
          <Button
            className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer sm:w-auto"
            onClick={() => void handlePwa()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : os.os === "ios" ? <Share className="h-4 w-4" /> : <DownloadCloud className="h-4 w-4" />}
            {os.os === "ios" ? "Añadir a pantalla de inicio" : "Instalar como app (PWA)"}
            {!canPwa && os.os !== "ios" && <span className="text-[10px] opacity-70">(o menú del navegador)</span>}
          </Button>
        )}

        {/* Opciones nativas por SO, con estado honesto */}
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((opt: NativeOption, i) => (
            <div
              key={`${opt.label}-${i}`}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3",
                opt.status === "pwa" ? "border-emerald-400/25 bg-emerald-500/[0.06]"
                  : opt.status === "release" ? "border-sky-400/25 bg-sky-500/[0.05]"
                  : opt.status === "link" ? "border-white/10 bg-white/[0.03]"
                  : "border-white/10 bg-white/[0.02] opacity-90",
              )}
            >
              <div className="mt-0.5 shrink-0">
                <NativeIcon name={opt.icon} className={cn("h-4 w-4", opt.status === "pwa" ? "text-emerald-300" : "text-muted-foreground")} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-gray-100">{opt.label}</span>
                  {opt.status === "soon" && (
                    <Badge variant="outline" className="border-white/15 bg-white/5 text-[9px] text-muted-foreground gap-1">
                      <Clock className="h-2.5 w-2.5" /> Próximamente
                    </Badge>
                  )}
                  {opt.status === "release" && (
                    <Badge variant="outline" className="border-sky-400/30 bg-sky-500/10 text-[9px] text-sky-200 gap-1">
                      <DownloadCloud className="h-2.5 w-2.5" /> Releases
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{opt.note}</p>
                {opt.href && (opt.status === "link" || opt.status === "pwa" || opt.status === "release") && (
                  <a
                    href={opt.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 text-[11px] font-medium hover:underline cursor-pointer",
                      opt.status === "release" ? "text-sky-300 hover:text-sky-200" : "text-emerald-300 hover:text-emerald-200",
                    )}
                  >
                    {opt.status === "release" ? "Ver releases" : "Abrir"} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

/* ─────────────────── Bloque 2 · Compañero local (control total) ─────────────────── */

function CompanionBlock({ os }: { os: DetectedOs }) {
  const info: CompanionInfo = useMemo(() => companionInfo(os.os), [os.os]);
  const [busy, setBusy] = useState(false);

  const handlePermissions = useCallback(async () => {
    setBusy(true);
    const report = await requestMaxPermissions();
    // Enlaza este equipo como neurona con permiso 'agent' (best-effort).
    void registerAsAgentNeuron();
    setBusy(false);
    toast.success("Permisos del dispositivo", { description: report.summary });
  }, []);

  return (
    <GlassCard className="ss-crystal relative overflow-hidden border-amber-400/20 bg-gradient-to-br from-amber-900/20 via-orange-900/10 to-transparent p-5">
      <div className="pointer-events-none absolute -left-16 -bottom-20 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-400/25 bg-amber-500/10">
            <Terminal className="h-6 w-6 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-amber-100">Dar control total a Aurora (compañero local)</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{info.intro}</p>
          </div>
        </div>

        {/* Límite honesto del navegador */}
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <p className="text-[11px] leading-relaxed text-amber-100/90">{info.browserLimit}</p>
        </div>

        {/* Qué desbloquea */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qué desbloquea el compañero</p>
          <ul className="grid gap-1">
            {info.unlocks.map((u, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" /> {u}
              </li>
            ))}
          </ul>
        </div>

        {/* Pasos por SO */}
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Package className="h-3.5 w-3.5" /> Pasos en {os.label}
            <Badge variant="outline" className="border-white/15 bg-white/5 text-[9px] text-muted-foreground gap-1">
              <Clock className="h-2.5 w-2.5" /> instalador en preparación
            </Badge>
          </p>
          <ol className="grid list-decimal gap-1 pl-4 text-xs text-gray-300">
            {info.steps.map((s, i) => (
              <li key={i} className="leading-relaxed">{s}</li>
            ))}
          </ol>
        </div>

        {/* Acciones: conceder permisos web ahora + repo del compañero */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="gap-2 bg-amber-600 text-white hover:bg-amber-500 cursor-pointer"
            onClick={() => void handlePermissions()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Conceder permisos web ahora
          </Button>
          {info.href && (
            <a
              href={info.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/[0.08] cursor-pointer"
            >
              <Github className="h-3.5 w-3.5" /> Repo del compañero <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Los permisos de arriba son los que el navegador SÍ concede (notificaciones, almacenamiento persistente,
          wake lock). El control por terminal y el acceso al sistema requieren instalar el compañero nativo y
          otorgarle permisos aparte — no lo puede hacer el navegador solo.
        </p>
      </div>
    </GlassCard>
  );
}

/* ─────────────────── Bloque 3 · Modelos de IA locales (opcional) ─────────────────── */

interface ModelRowState { installed: boolean; downloading: boolean; pct: number; }

function LocalModelsBlock() {
  const [mounted, setMounted] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, ModelRowState>>({});

  const refresh = useCallback(() => {
    const next: Record<string, ModelRowState> = {};
    for (const id of DOWNLOADABLE_SOURCES) {
      try {
        next[id] = { installed: isModelInstalled(id), downloading: isDownloading(id), pct: downloadProgress(id) };
      } catch {
        next[id] = { installed: false, downloading: false, pct: 0 };
      }
    }
    setState(next);
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();
    if (typeof window === "undefined") return;
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent<{ sourceId?: string; pct?: number; done?: boolean }>).detail;
      if (!d?.sourceId) return;
      setState((prev) => ({
        ...prev,
        [d.sourceId!]: {
          installed: d.done && !((e as CustomEvent<{ error?: string }>).detail?.error) ? true : (prev[d.sourceId!]?.installed ?? false),
          downloading: !d.done,
          pct: typeof d.pct === "number" ? d.pct : (prev[d.sourceId!]?.pct ?? 0),
        },
      }));
      if (d.done) refresh();
    };
    window.addEventListener(MODEL_DOWNLOAD_EVENT, onProgress);
    window.addEventListener(INSTALLED_MODELS_EVENT, refresh);
    return () => {
      window.removeEventListener(MODEL_DOWNLOAD_EVENT, onProgress);
      window.removeEventListener(INSTALLED_MODELS_EVENT, refresh);
    };
  }, [refresh]);

  const handleInstall = useCallback(async (id: string) => {
    setBusyId(id);
    const src = findSource(id);
    const res = await installModelInBackground(id);
    setBusyId(null);
    if (res.ok) toast.success(src?.label ?? "Modelo", { description: res.message });
    else toast.error(src?.label ?? "Modelo", { description: res.message });
    refresh();
  }, [refresh]);

  const handleUninstall = useCallback((id: string) => {
    const src = findSource(id);
    markModelUninstalled(id);
    refresh();
    toast.success(src?.label ?? "Modelo", { description: "Quitado. Aurora dejará de ofrecerlo (puedes reinstalarlo cuando quieras)." });
  }, [refresh]);

  return (
    <GlassCard className="ss-crystal border-teal-400/20 bg-gradient-to-br from-teal-900/20 via-cyan-900/10 to-transparent p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-teal-400/25 bg-teal-500/10">
            <Cpu className="h-6 w-6 text-teal-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-teal-100">Modelos de IA locales (opcional)</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Corren 100% en tu dispositivo (privacidad total). La primera vez descargan sus pesos; la descarga
              va en segundo plano y Aurora sigue funcionando con la mejor alternativa gratis mientras tanto.
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          {DOWNLOADABLE_SOURCES.map((id) => {
            const src = findSource(id);
            if (!src) return null;
            const size = DOWNLOAD_SIZES[id];
            const st = state[id] ?? { installed: false, downloading: false, pct: 0 };
            const busy = busyId === id || st.downloading;
            return (
              <div key={id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-gray-100">{src.label}</span>
                      {size && (
                        <Badge variant="outline" className="border-teal-400/30 bg-teal-500/10 text-[9px] text-teal-200">{size}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{src.why}</p>
                  </div>
                  {/* Botón según estado (SSR-safe: neutro hasta montar) */}
                  {!mounted ? (
                    <div className="h-8 w-24 shrink-0 animate-pulse rounded-md bg-white/5" />
                  ) : st.installed ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 gap-1.5 border-emerald-500/30 text-xs text-emerald-300 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30 cursor-pointer"
                      onClick={() => handleUninstall(id)}
                      title="Instalado — pulsa para quitar"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Instalado · Quitar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 bg-teal-600 text-xs font-semibold text-white hover:bg-teal-500 cursor-pointer"
                      onClick={() => void handleInstall(id)}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {busy ? "Descargando…" : "Instalar"}
                    </Button>
                  )}
                </div>
                {mounted && st.downloading && (
                  <div className="mt-2 space-y-1">
                    <Progress value={st.pct} indicatorClassName="bg-teal-400" />
                    <p className="text-[10px] text-muted-foreground">
                      Descargando en segundo plano… {st.pct > 0 ? `${Math.round(st.pct)}%` : ""}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          También puedes gestionarlos desde Ajustes → Inteligencia. Requieren WebGPU en tu navegador; si no está
          disponible, Aurora seguirá usando las fuentes gratuitas en la nube.
        </p>
      </div>
    </GlassCard>
  );
}

/* ───────────────────────── Sección completa ───────────────────────── */

export function InstallOfficialSection() {
  // SSR-safe: detectamos el SO tras montar (userAgent no está en el servidor).
  const [os, setOs] = useState<DetectedOs>({ os: "unknown", label: "tu sistema" });
  useEffect(() => { setOs(detectOS()); }, []);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-500/10">
          <Rocket className="h-5 w-5 text-emerald-300" />
        </div>
        <div>
          <h2 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold font-headline text-emerald-100">Instalar StarSeed</h2>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Instalación oficial del sistema: el OS en tu dispositivo, el control total de Aurora y los modelos
            de IA locales. Todo con honestidad sobre qué puede y qué no puede hacer el navegador.
          </p>
        </div>
      </div>

      <InstallOsBlock os={os} />
      <CompanionBlock os={os} />
      <LocalModelsBlock />
    </section>
  );
}

export default InstallOfficialSection;
