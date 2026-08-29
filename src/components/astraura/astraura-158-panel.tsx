"use client";

import { QuantumOrbAvatar } from "@/components/aurora/quantum-orb-avatar";

/**
 * PANEL «ASTRAURA 1.58-BIT» — sistema primario de inteligencia (Adenda 153).
 * ----------------------------------------------------------------------------
 * Vive en `/agent?tab=astraura-158` (grupo Infraestructura). SOP:
 * architecture/astraura-158-sistema-primario.md §7.
 *
 * STUDIO 1.58 (Ola 3 · Adenda 155): enseña y opera, desde el OS, TODO lo que
 * el backend soberano Astraura 1.58-bit expone: estado honesto del motor
 * (BitNet nativo / Ollama / plantillas), endpoint de esta neurona (local · LAN
 * · túnel · nube propia), sistema primario (cuenta / neurona) y las pestañas
 * `s158/*`: resumen de procesos, personalidades, agentes (director + enjambre +
 * bóveda), imaginación intuitiva, notificaciones/eventos, cerebros, memoria,
 * sentidos/privacidad, almacenamiento, proyectos/creaciones/workflows, voz,
 * habilidades e instalación. Deep-link: `/agent?tab=astraura-158&sub=<pestaña>`.
 *
 * Lectura vía `astraura-158-client.ts` (local directo · nube por el proxy del
 * OS). Nunca lanza: cada bloque degrada a un estado «sin conexión» explícito.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  Binary, Cpu, Cloud, HardDrive, RefreshCw, Loader2, CheckCircle2, XCircle, Sparkles, Bot,
  Brain, Wand2, Download, ExternalLink, Radio, Link2, AlertTriangle, Users, Network, Activity, Bell, Eye, FolderKanban, Mic, Database,
  MessageSquare, Globe, HardDriveDownload, BookOpen, Gauge, TerminalSquare, SlidersHorizontal, Workflow, KeyRound,
  ShieldCheck, Box,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { thisDeviceId, settingsFor, setNeuronSettings, NEURON_EVENT } from "@/lib/neurons/neurons";
import { listPersonalityProfiles, getActivePersonality, type PersonalityProfile } from "@/lib/aurora/personalities";
import { ASTRAURA_158_PERSONAS, persona158For } from "@/ai/providers/astraura-158";
import {
  activateAstraura158Brain, activateAstraura158Personality, astraura158Endpoint, describeAstraura158Engine,
  fetchAstraura158Manifest, fetchAstraura158Status, fetchAstraura158Tunnel, probeAstraura158,
  fetchAstraura158Counters, toggleAstraura158Skill,
  type Astraura158Counters, type Astraura158Manifest, type Astraura158Status, type Astraura158Target, type Astraura158Tunnel,
} from "@/lib/astraura/astraura-158-client";
import type { S158TabId } from "@/components/astraura/s158/shared";

const tabLoading = () => <p className="mt-3 text-[11px] text-white/50">Cargando pestaña…</p>;
const ResumenTab = dynamic(() => import("@/components/astraura/s158/resumen-tab"), { ssr: false, loading: tabLoading });
const ImaginacionTab = dynamic(() => import("@/components/astraura/s158/imaginacion-tab"), { ssr: false, loading: tabLoading });
const AgentesTab = dynamic(() => import("@/components/astraura/s158/agentes-tab"), { ssr: false, loading: tabLoading });
const NotificacionesTab = dynamic(() => import("@/components/astraura/s158/notificaciones-tab"), { ssr: false, loading: tabLoading });
const SentidosTab = dynamic(() => import("@/components/astraura/s158/sentidos-tab"), { ssr: false, loading: tabLoading });
const AlmacenamientoTab = dynamic(() => import("@/components/astraura/s158/almacenamiento-tab"), { ssr: false, loading: tabLoading });
const ProyectosTab = dynamic(() => import("@/components/astraura/s158/proyectos-tab"), { ssr: false, loading: tabLoading });
const VozTab = dynamic(() => import("@/components/astraura/s158/voz-tab"), { ssr: false, loading: tabLoading });
const MemoriaTab = dynamic(() => import("@/components/astraura/s158/memoria-tab"), { ssr: false, loading: tabLoading });
// (Ola 4 · Adenda 156) Pestañas que faltaban para cubrir las 21 del original.
const ChatTab = dynamic(() => import("@/components/astraura/s158/chat-tab"), { ssr: false, loading: tabLoading });
const NavegadorTab = dynamic(() => import("@/components/astraura/s158/navegador-tab"), { ssr: false, loading: tabLoading });
const DispositivoTab = dynamic(() => import("@/components/astraura/s158/dispositivo-tab"), { ssr: false, loading: tabLoading });
const BibliotecaTab = dynamic(() => import("@/components/astraura/s158/biblioteca-tab"), { ssr: false, loading: tabLoading });
const TelemetriaTab = dynamic(() => import("@/components/astraura/s158/telemetria-tab"), { ssr: false, loading: tabLoading });
const TerminalTab = dynamic(() => import("@/components/astraura/s158/terminal-tab"), { ssr: false, loading: tabLoading });
const ConfiguracionTab = dynamic(() => import("@/components/astraura/s158/configuracion-tab"), { ssr: false, loading: tabLoading });
// (Ola 5 · Adenda 157) Centro de orquestación autónoma y sala de gobierno de permisos.
const OrquestacionTab = dynamic(() => import("@/components/astraura/s158/orquestacion-tab"), { ssr: false, loading: tabLoading });
const PermisosTab = dynamic(() => import("@/components/astraura/s158/permisos-tab"), { ssr: false, loading: tabLoading });
// (Ola 6 · Adenda 158) las 4 áreas del original que aún no tenían pestaña propia.
const BovedaTab = dynamic(() => import("@/components/astraura/s158/boveda-tab"), { ssr: false, loading: tabLoading });
const WorkflowsTab = dynamic(() => import("@/components/astraura/s158/workflows-tab"), { ssr: false, loading: tabLoading });
const PrivacidadTab = dynamic(() => import("@/components/astraura/s158/privacidad-tab"), { ssr: false, loading: tabLoading });
const InstaladorTab = dynamic(() => import("@/components/astraura/s158/instalador-tab"), { ssr: false, loading: tabLoading });
import { PrimaryChoiceEditor } from "@/components/astraura/primary-choice-editor";
import { readRouteLog, type RouteRecord } from "@/ai/astraura/router";

type Tab = S158TabId;

const TABS: { id: Tab; label: string; icon: typeof Sparkles; badge?: keyof Astraura158Counters }[] = [
  { id: "resumen", label: "Resumen", icon: Activity },
  { id: "personalidades", label: "Personalidades", icon: Sparkles },
  { id: "agentes", label: "Agentes", icon: Bot, badge: "running" },
  { id: "orquestacion", label: "Orquestación", icon: Workflow, badge: "running" },
  { id: "permisos", label: "Permisos y accesos", icon: KeyRound, badge: "pending" },
  { id: "imaginacion", label: "Imaginación", icon: Wand2, badge: "pending" },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "notificaciones", label: "Notificaciones", icon: Bell, badge: "unread" },
  { id: "cerebros", label: "Cerebros", icon: Brain },
  { id: "memoria", label: "Memoria", icon: Database },
  { id: "sentidos", label: "Sentidos", icon: Eye },
  { id: "privacidad", label: "Privacidad", icon: ShieldCheck },
  { id: "almacenamiento", label: "Almacenamiento", icon: HardDrive },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "voz", label: "Voz", icon: Mic },
  { id: "chat", label: "Chat multiagente", icon: MessageSquare },
  { id: "navegador", label: "Navegador", icon: Globe },
  { id: "dispositivo", label: "Dispositivo", icon: HardDriveDownload },
  { id: "biblioteca", label: "Biblioteca", icon: BookOpen },
  { id: "telemetria", label: "Telemetría", icon: Gauge },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "habilidades", label: "Habilidades", icon: Network },
  { id: "boveda", label: "Bóveda", icon: KeyRound },
  { id: "configuracion", label: "Configuración", icon: SlidersHorizontal },
  { id: "instalador", label: "Instalador & scan", icon: Box },
  { id: "instalacion", label: "Instalación", icon: Download },
];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

/** `?sub=` → pestaña (alias tolerantes para deep-links del OS). */
export function s158TabFromParam(raw: string | null | undefined): Tab {
  const v = String(raw ?? "").trim().toLowerCase();
  const alias: Record<string, Tab> = {
    imagination: "imaginacion", suenos: "imaginacion", "sueños": "imaginacion", dream: "imaginacion",
    swarm: "agentes", enjambre: "agentes", director: "agentes", agents: "agentes",
    notifications: "notificaciones", eventos: "notificaciones", events: "notificaciones",
    sensorium: "sentidos", sensors: "sentidos",
    storage: "almacenamiento", almacen: "almacenamiento",
    projects: "proyectos", creaciones: "proyectos", workflows: "proyectos",
    voice: "voz", brains: "cerebros", memory: "memoria", skills: "habilidades", install: "instalacion", summary: "resumen", procesos: "resumen",
    multiagente: "chat", voz2: "voz",
    browser: "navegador", web: "navegador", navegador: "navegador",
    device: "dispositivo", explorador: "dispositivo", archivos: "dispositivo",
    library: "biblioteca", biblioteca: "biblioteca",
    telemetry: "telemetria", metricas: "telemetria",
    sandbox: "terminal", consola: "terminal",
    config: "configuracion", ajustes: "configuracion", preferencias: "configuracion",
    orchestration: "orquestacion", orquesta: "orquestacion", metis: "orquestacion", "segundo-plano": "orquestacion",
    permissions: "permisos", accesos: "permisos", aprobaciones: "permisos", gobernanza: "permisos", autorizaciones: "permisos",
    // Ola 6 · Adenda 158.
    vault: "boveda", credenciales: "boveda", tokens: "boveda",
    automatizacion: "workflows", automation: "workflows", flujos: "workflows",
    privacy: "privacidad", sensores: "privacidad",
    installer: "instalador", scan: "instalador", descubrimiento: "instalador",
  };
  if (TAB_IDS.has(v)) return v as Tab;
  return alias[v] ?? "resumen";
}

const CARD = "rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl";
const PILL = "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const PILL_ON = "border-cyan-400/40 bg-cyan-500/15 text-cyan-100";
const PILL_OFF = "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/25";
const BTN = "inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 transition-colors hover:border-cyan-400/40 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50";

interface EndpointState {
  target: Astraura158Target;
  endpoint: string;
  status: Astraura158Status | null;
  error?: string;
  loading: boolean;
}

function StatusDot({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-white/60" aria-label="comprobando" />;
  return ok
    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" aria-label="en línea" />
    : <XCircle className="h-3.5 w-3.5 text-rose-300" aria-label="sin respuesta" />;
}

export function Astraura158Panel(props: { className?: string }) {
  return (
    <Suspense fallback={<p className="text-[11px] text-white/50">Cargando Studio 1.58…</p>}>
      <Astraura158PanelInner {...props} />
    </Suspense>
  );
}

function Astraura158PanelInner({ className }: { className?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subParam = searchParams?.get("sub") ?? null;
  const deviceId = useMemo(() => { try { return thisDeviceId(); } catch { return ""; } }, []);
  const [local, setLocal] = useState<EndpointState>({ target: "local", endpoint: "", status: null, loading: true });
  const [nube, setNube] = useState<EndpointState>({ target: "nube", endpoint: "", status: null, loading: true });
  const [target, setTarget] = useState<Astraura158Target>("local");
  const [manifest, setManifest] = useState<Astraura158Manifest | null>(null);
  const [manifestErr, setManifestErr] = useState<string>("");
  const [tab, setTabState] = useState<Tab>(() => s158TabFromParam(subParam));
  const [counters, setCounters] = useState<Astraura158Counters | null>(null);
  // Deep-link: `?sub=` manda cuando cambia (p. ej. desde el centro de notificaciones).
  useEffect(() => { if (subParam) setTabState(s158TabFromParam(subParam)); }, [subParam]);
  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "astraura-158");
      url.searchParams.set("sub", t);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    } catch { /* sin navegación */ }
  }, [router]);
  const [tunnel, setTunnel] = useState<Astraura158Tunnel | null>(null);
  const [busy, setBusy] = useState<string>("");

  // Endpoint de ESTA neurona (ajuste propio).
  const [endpointDraft, setEndpointDraft] = useState<string>("");
  const [localEnabled, setLocalEnabled] = useState<boolean>(true);
  const [probe, setProbe] = useState<{ ok: boolean; model?: string; error?: string } | null>(null);
  const [probing, setProbing] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLocal((s) => ({ ...s, loading: true }));
    setNube((s) => ({ ...s, loading: true }));
    const [l, n] = await Promise.all([fetchAstraura158Status("local"), fetchAstraura158Status("nube")]);
    setLocal({ target: "local", endpoint: l.endpoint, status: l.ok ? l.data : null, error: l.ok ? undefined : l.error, loading: false });
    setNube({ target: "nube", endpoint: n.endpoint, status: n.ok ? n.data : null, error: n.ok ? undefined : n.error, loading: false });
    // Destino efectivo para las pestañas: local si responde; si no, nube.
    setTarget(l.ok ? "local" : n.ok ? "nube" : "local");
  }, []);

  const refreshManifest = useCallback(async (t: Astraura158Target) => {
    setManifestErr("");
    const r = await fetchAstraura158Manifest(t);
    if (r.ok) setManifest(r.data);
    else { setManifest(null); setManifestErr(r.error); }
    const tn = await fetchAstraura158Tunnel(t);
    setTunnel(tn.ok ? tn.data.tunnel ?? null : null);
  }, []);

  useEffect(() => {
    try {
      const s = settingsFor(deviceId).astraura158;
      setEndpointDraft(s?.endpoint ?? "");
      setLocalEnabled(s?.enabled !== false);
    } catch { /* */ }
    void refreshStatus();
    const h = () => {
      try {
        const s = settingsFor(deviceId).astraura158;
        setEndpointDraft(s?.endpoint ?? "");
        setLocalEnabled(s?.enabled !== false);
      } catch { /* */ }
    };
    window.addEventListener(NEURON_EVENT, h);
    return () => window.removeEventListener(NEURON_EVENT, h);
  }, [deviceId, refreshStatus]);

  useEffect(() => {
    if (local.loading && nube.loading) return;
    void refreshManifest(target);
  }, [target, local.loading, nube.loading, refreshManifest]);

  // Contadores para los badges (notificaciones sin leer · propuestas pendientes · tareas vivas).
  useEffect(() => {
    let alive = true;
    const tick = async () => { const c = await fetchAstraura158Counters(target); if (alive) setCounters(c); };
    void tick();
    const id = window.setInterval(() => { if (!document.hidden) void tick(); }, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [target]);
  const refreshAll = useCallback(async () => { await refreshManifest(target); setCounters(await fetchAstraura158Counters(target)); }, [refreshManifest, target]);

  const engineLocal = describeAstraura158Engine(local.status);
  const engineNube = describeAstraura158Engine(nube.status);
  const anyOnline = !!local.status || !!nube.status;
  const lastRoutes = useMemo<RouteRecord[]>(() => {
    try { return readRouteLog().filter((r) => r.primary).slice(-5).reverse(); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  async function saveEndpoint() {
    const v = endpointDraft.trim().replace(/\/+$/, "");
    try {
      setNeuronSettings(deviceId, { astraura158: { endpoint: v || undefined, enabled: localEnabled } });
      toast.success("Endpoint de Astraura 1.58 guardado", { description: v || "Local por defecto (127.0.0.1:8000)." });
      await refreshStatus();
    } catch { toast.error("No se pudo guardar el endpoint."); }
  }

  async function doProbe() {
    setProbing(true);
    const r = await probeAstraura158(endpointDraft.trim() || astraura158Endpoint("local"));
    setProbe(r);
    setProbing(false);
  }

  function toggleLocal(v: boolean) {
    setLocalEnabled(v);
    try {
      setNeuronSettings(deviceId, { astraura158: { enabled: v } });
      toast.success(v ? "Fuente local activada en esta neurona" : "Fuente local desactivada en esta neurona", {
        description: v ? "Astraura 1.58 local vuelve a ser candidata." : "El router usará la nube 1.58 o los secundarios.",
      });
    } catch { /* */ }
  }

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(label);
    const r = await fn();
    setBusy("");
    if (r.ok) { toast.success(label); await refreshManifest(target); }
    else toast.error(`${label}: ${r.error ?? "error"}`);
  }

  const osProfiles = useMemo<PersonalityProfile[]>(() => { try { return listPersonalityProfiles(); } catch { return []; } }, []);
  const activeOs = useMemo(() => { try { return getActivePersonality(); } catch { return null; } }, []);

  return (
    <div className={cn("space-y-4 p-1", className)}>
      {/* ── Cabecera ── */}
      <div className={cn(CARD, "relative overflow-hidden p-4")}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-headline text-lg font-semibold text-white">
              <Binary className="h-5 w-5 text-cyan-300" aria-hidden="true" /> Astraura 1.58-bit
              <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 font-code text-[10px] text-cyan-200">sistema primario</span>
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-snug text-white/65">
              Tu backend soberano (BitNet b1.58 / motor local, personalidades, agentes, habilidades y cerebros) va
              <strong className="text-white/85"> primero</strong> en toda la inteligencia del OS. Si no responde, los
              sistemas secundarios (Ollama, WebLLM, fuentes gratis, Neurocortex…) siguen respondiendo.
            </p>
          </div>
          <button type="button" onClick={() => { void refreshStatus(); }} className={BTN} title="Volver a comprobar">
            <RefreshCw className={cn("h-3.5 w-3.5", (local.loading || nube.loading) && "animate-spin")} aria-hidden="true" /> Comprobar
          </button>
        </div>

        {/* Dos destinos */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[{ s: local, eng: engineLocal, icon: HardDrive, title: "Esta neurona (local)" }, { s: nube, eng: engineNube, icon: Cloud, title: "Nube StarSeed (Cloud Run / proxy)" }].map(({ s, eng, icon: Icon, title }) => (
            <div key={s.target} className={cn("rounded-lg border px-3 py-2", s.status ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-white/10 bg-black/20")}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/90"><Icon className="h-3.5 w-3.5 text-white/60" aria-hidden="true" /> {title}</p>
                <StatusDot ok={!!s.status} loading={s.loading} />
              </div>
              <p className="mt-1 truncate font-code text-[10px] text-white/55" title={s.endpoint}>{s.endpoint}</p>
              <p className="mt-1 text-[11px] text-white/80">
                {s.status ? (
                  <>
                    Motor: <span className={cn("font-medium", eng.bitnet ? "text-cyan-200" : eng.real ? "text-white" : "text-amber-200")}>{eng.label}</span>
                    {!eng.real && <span className="ml-1 text-amber-200/90">· sin modelo real: arranca Ollama o compila BitNet</span>}
                  </>
                ) : (
                  <span className="text-white/55">{s.loading ? "Comprobando…" : s.error ?? "sin respuesta"}</span>
                )}
              </p>
              {s.status?.memory_summary && (
                <p className="mt-0.5 font-code text-[10px] text-white/45">
                  grafo {s.status.memory_summary.knowledge_nodes ?? 0} nodos · vectores {s.status.memory_summary.vector_documents ?? 0} · habilidades {s.status.skills_active ?? 0}
                </p>
              )}
            </div>
          ))}
        </div>
        {!anyOnline && !local.loading && !nube.loading && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] text-amber-100/90">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Ningún backend 1.58 responde ahora. Aurora sigue contestando con los sistemas secundarios; arranca el
            backend en esta neurona (pestaña Instalación) o declara un endpoint (túnel/LAN/nube propia).
          </p>
        )}
      </div>

      {/* ── Endpoint de esta neurona + sistema primario ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={cn(CARD, "p-3")}>
          <p className="flex items-center gap-2 text-[12px] font-semibold text-white/90"><Link2 className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" /> Endpoint de esta neurona</p>
          <p className="mt-0.5 text-[10px] leading-snug text-white/55">
            Local por defecto. Puedes apuntar a la LAN (<span className="font-code">http://192.168.x.x:8000</span>), al
            túnel <span className="font-code">*.trycloudflare.com</span> o a tu Cloud Run. Se publica en las capacidades de la neurona.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <input
              value={endpointDraft}
              onChange={(e) => setEndpointDraft(e.target.value)}
              placeholder="http://127.0.0.1:8000"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 font-code text-[11px] text-white outline-none transition-colors focus:border-cyan-400/50"
              aria-label="Endpoint del backend Astraura 1.58 para esta neurona"
            />
            <button type="button" onClick={() => { void doProbe(); }} className={BTN} disabled={probing}>
              {probing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Radio className="h-3.5 w-3.5" aria-hidden="true" />} Probar
            </button>
            <button type="button" onClick={() => { void saveEndpoint(); }} className={cn(BTN, "border-cyan-400/40 text-cyan-100")}>Guardar</button>
          </div>
          {probe && (
            <p className={cn("mt-1.5 text-[11px]", probe.ok ? "text-emerald-200" : "text-rose-200")}>
              {probe.ok ? `Responde · motor: ${probe.model ?? "desconocido"}` : `No responde: ${probe.error}`}
            </p>
          )}
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[11px] text-white/80">
            <Switch checked={localEnabled} onCheckedChange={toggleLocal} aria-label="Usar la fuente Astraura 1.58 local en esta neurona" />
            Usar la fuente 1.58 de esta neurona como candidata
          </label>
          {tunnel?.url && (
            <p className="mt-2 truncate font-code text-[10px] text-white/50" title={tunnel.url}>túnel activo: {tunnel.url}</p>
          )}
        </div>
        <div className="space-y-3">
          <PrimaryChoiceEditor scope="cuenta" context={{ deviceId }} compact scopeLabel="la cuenta" />
          <PrimaryChoiceEditor scope="neurona" scopeId={deviceId} context={{ deviceId }} compact scopeLabel="esta neurona" />
        </div>
      </div>

      {/* ── Pestañas ── */}
      <div className={cn(CARD, "p-3")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Secciones de Astraura 1.58">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn(PILL, tab === t.id ? PILL_ON : PILL_OFF)}>
                  <Icon className="h-3 w-3" aria-hidden="true" /> {t.label}
                  {t.badge && counters && counters[t.badge] > 0 && <span className="ml-0.5 rounded-full bg-cyan-400/20 px-1.5 text-[9px] text-cyan-100" aria-label={`${counters[t.badge]} pendientes`}>{counters[t.badge]}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/55">
            <span>Leyendo de:</span>
            {(["local", "nube"] as Astraura158Target[]).map((t) => (
              <button key={t} type="button" onClick={() => setTarget(t)} className={cn(PILL, "px-2 py-0.5 text-[10px]", target === t ? PILL_ON : PILL_OFF)}>
                {t === "local" ? "neurona" : "nube"}
              </button>
            ))}
            <button type="button" onClick={() => { void refreshManifest(target); }} className={BTN} title="Recargar"><RefreshCw className="h-3 w-3" aria-hidden="true" /></button>
          </div>
        </div>

        {manifestErr && !manifest && (
          <p className="mt-3 text-[11px] text-white/60">No se pudo leer el catálogo del backend ({target}): {manifestErr}.</p>
        )}
        {manifest && !manifest.bridge && (
          <p className="mt-2 text-[10px] text-white/45">Backend sin el puente <span className="font-code">/api/starseed/*</span> (versión anterior): se leen los endpoints clásicos.</p>
        )}

        {/* Personalidades */}
        {tab === "personalidades" && (
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {(manifest?.personalities.length ? manifest.personalities : ASTRAURA_158_PERSONAS.map((p) => ({ id: p.id, name: p.label, title: p.organ, color: p.color }))).map((p) => {
                const isActive = manifest?.activePersona === p.id;
                return (
                  <div key={p.id} className={cn("rounded-lg border px-3 py-2", isActive ? "border-cyan-400/40 bg-cyan-500/[0.08]" : "border-white/10 bg-black/20")}>
                    <div className="flex items-center gap-2">
                      {/* (Adenda 176) Avatar de orbe vivo por personalidad — cierra el pendiente de la Adenda 158 §8.3. */}
                      <QuantumOrbAvatar personaId={p.id} size={28} className="shrink-0" />
                      <p className="min-w-0 truncate text-[12px] font-medium text-white/90">{p.name}</p>
                      {isActive && <span className="ml-auto rounded-full border border-cyan-400/30 px-1.5 py-0.5 text-[9px] text-cyan-200">activa</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[10px] text-white/55">{p.title ?? ""}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button type="button" className={BTN} disabled={!manifest || busy !== ""} onClick={() => { void run(`Activar ${p.name} en el backend`, () => activateAstraura158Personality(target, p.id)); }}>Activar</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <p className="flex items-center gap-2 text-[12px] font-semibold text-white/90"><Users className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden="true" /> Correlación con las personalidades del OS</p>
              <p className="mt-0.5 text-[10px] text-white/55">En «auto», cada personalidad del OS habla con su personalidad 1.58 afín; el prompt del OS manda. Fija otra en la ventana de sistemas (pestaña LLM).</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {osProfiles.map((pr) => {
                  const p158 = persona158For(pr);
                  const meta = ASTRAURA_158_PERSONAS.find((x) => x.id === p158);
                  return (
                    <li key={pr.id} className="flex items-center justify-between gap-2 rounded-md border border-white/5 px-2 py-1 text-[11px]">
                      <span className="truncate text-white/85">{pr.name}{activeOs?.id === pr.id ? " · activa" : ""}</span>
                      <span className="shrink-0 font-code text-[10px]" style={{ color: meta?.color ?? "#00f0ff" }}>→ {p158}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* Resumen de procesos (puente) */}
        {tab === "resumen" && <div className="mt-3"><ResumenTab target={target} manifest={manifest} refresh={refreshAll} onNavigate={setTab} /></div>}

        {/* Agentes: director + enjambre + bóveda + ecosistema */}
        {tab === "agentes" && <div className="mt-3"><AgentesTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Imaginación intuitiva · sueños · síntesis */}
        {tab === "imaginacion" && <div className="mt-3"><ImaginacionTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Notificaciones · eventos · orquestador */}
        {tab === "notificaciones" && <div className="mt-3"><NotificacionesTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Sentidos · privacidad */}
        {tab === "sentidos" && <div className="mt-3"><SentidosTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Almacenamiento · enrutamiento · malla */}
        {tab === "almacenamiento" && <div className="mt-3"><AlmacenamientoTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Proyectos · creaciones · workflows */}
        {tab === "proyectos" && <div className="mt-3"><ProyectosTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Voz */}
        {tab === "voz" && <div className="mt-3"><VozTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* (Ola 4) Chat multiagente · Navegador · Dispositivo · Biblioteca · Telemetría · Terminal · Configuración */}
        {tab === "chat" && <div className="mt-3"><ChatTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "navegador" && <div className="mt-3"><NavegadorTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "dispositivo" && <div className="mt-3"><DispositivoTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "biblioteca" && <div className="mt-3"><BibliotecaTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "telemetria" && <div className="mt-3"><TelemetriaTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "terminal" && <div className="mt-3"><TerminalTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "configuracion" && <div className="mt-3"><ConfiguracionTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* (Ola 5) Orquestación autónoma del enjambre y gobierno de permisos/accesos */}
        {tab === "orquestacion" && <div className="mt-3"><OrquestacionTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "permisos" && <div className="mt-3"><PermisosTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {/* Ola 6 · Adenda 158 — bóveda, workflows, privacidad e instalador. */}
        {tab === "boveda" && <div className="mt-3"><BovedaTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "workflows" && <div className="mt-3"><WorkflowsTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "privacidad" && <div className="mt-3"><PrivacidadTab target={target} manifest={manifest} refresh={refreshAll} /></div>}
        {tab === "instalador" && <div className="mt-3"><InstaladorTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Habilidades */}
        {tab === "habilidades" && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-white/55">Habilidades declaradas por el backend (flags). Las equivalentes del OS viven en Habilidades → Capacidades.</p>
            {!manifest?.skills.length && <p className="text-[11px] text-white/60">Sin habilidades leídas{manifest ? "" : " (sin conexión)"}.</p>}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {manifest?.skills.map((s) => (
                <div key={s.id} className="flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-white/90">{s.name}</p>
                    <p className="line-clamp-2 text-[10px] text-white/55">{s.blurb ?? s.category ?? ""}</p>
                  </div>
                  <Switch checked={s.enabled} disabled={busy !== ""} onCheckedChange={(v) => { void run(`${v ? "Activar" : "Desactivar"} ${s.name}`, () => toggleAstraura158Skill(target, s.id, v)); }} aria-label={`Activar ${s.name}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cerebros */}
        {tab === "cerebros" && (
          <div className="mt-3 space-y-2">
            <p className="text-[10px] text-white/55">Cerebros del backend (capas soul · ego · style · skills · memory · dream · accounts · tasks · logs — el mismo contrato que el memory root del OS).</p>
            {!manifest?.brains.length && <p className="text-[11px] text-white/60">Sin cerebros leídos{manifest ? "" : " (sin conexión)"}.</p>}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {manifest?.brains.map((b) => {
                const isActive = manifest.activeBrain === b.id;
                const layers = Object.keys(b.md_layers ?? {});
                return (
                  <div key={b.id} className={cn("rounded-lg border px-3 py-2", isActive ? "border-violet-400/40 bg-violet-500/[0.08]" : "border-white/10 bg-black/20")}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color ?? "#a855f7" }} aria-hidden="true" />
                      <p className="min-w-0 truncate text-[12px] font-medium text-white/90">{b.name}</p>
                      {isActive && <span className="ml-auto rounded-full border border-violet-400/30 px-1.5 py-0.5 text-[9px] text-violet-200">activo</span>}
                    </div>
                    <p className="mt-0.5 text-[10px] text-white/55">{b.role ?? b.scope ?? ""}{b.active_persona ? ` · persona ${b.active_persona}` : ""}</p>
                    {layers.length > 0 && <p className="mt-1 truncate font-code text-[10px] text-white/45">{layers.join(" · ")}</p>}
                    {b.memory_neurons?.length ? <p className="mt-0.5 text-[10px] text-white/45">{b.memory_neurons.length} neurona(s) de memoria</p> : null}
                    <div className="mt-2"><button type="button" className={BTN} disabled={busy !== "" || isActive} onClick={() => { void run(`Activar cerebro ${b.name}`, () => activateAstraura158Brain(target, b.id)); }}>Activar</button></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Memoria */}
        {tab === "memoria" && <div className="mt-3"><MemoriaTab target={target} manifest={manifest} refresh={refreshAll} /></div>}

        {/* Instalación */}
        {tab === "instalacion" && (
          <div className="mt-3 space-y-3 text-[11px] text-white/80">
            <p className="text-[10px] text-white/55">El backend corre en tu equipo (macOS · Linux · Windows/WSL · Termux). Requiere Python 3.11 y, para inferencia real, Ollama con un modelo o BitNet compilado con un GGUF <span className="font-code">i2_s</span>.</p>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 font-code text-[11px] leading-relaxed text-cyan-100/90">
              <p className="text-white/50"># macOS / Linux</p>
              <p>curl -fsSL https://astraura.vercel.app/install.sh | bash</p>
              <p className="mt-2 text-white/50"># Windows (PowerShell)</p>
              <p>irm https://astraura.vercel.app/install.ps1 | iex</p>
              <p className="mt-2 text-white/50"># Desde el repo (clon propio)</p>
              <p>git clone https://github.com/StarSeedSystem/astraura.git &amp;&amp; cd astraura &amp;&amp; ./install_and_run.sh</p>
              <p className="mt-2 text-white/50"># BitNet nativo (opcional): compila y descarga el modelo ternario</p>
              <p>bash scripts/setup_bitnet.sh &amp;&amp; python3 scripts/download_model.py</p>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              <li><a className={BTN} href="https://github.com/StarSeedSystem/astraura" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" aria-hidden="true" /> Repositorio StarSeedSystem/astraura</a></li>
              <li><a className={BTN} href="https://astraura.vercel.app/" target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" aria-hidden="true" /> UI completa (imaginación, enjambre, sensorium, proyectos…)</a></li>
              <li><a className={BTN} href={`${astraura158Endpoint("local")}/`} target="_blank" rel="noopener noreferrer"><HardDrive className="h-3 w-3" aria-hidden="true" /> UI local de esta neurona</a></li>
              <li><Link className={BTN} href="/agent?tab=config-ia"><Cpu className="h-3 w-3" aria-hidden="true" /> Sistemas de Astraura en esta neurona</Link></li>
            </ul>
            <p className="text-[10px] text-amber-200/80">Honesto: el backend expone ejecución de comandos y archivos sin clave. No publiques su túnel sin protegerlo; el OS solo lo usa para chat y lectura, y su proxy aplica allowlist.</p>
          </div>
        )}
      </div>

      {/* ── Transparencia: últimas rutas con sistema primario ── */}
      {lastRoutes.length > 0 && (
        <div className={cn(CARD, "p-3")}>
          <p className="text-[12px] font-semibold text-white/90">Últimas respuestas y sistema primario</p>
          <ul className="mt-1.5 space-y-1">
            {lastRoutes.map((r) => (
              <li key={r.at} className="flex flex-wrap items-center gap-2 text-[11px] text-white/75">
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px]", r.primary?.ready ? "border-cyan-400/30 text-cyan-200" : "border-amber-400/30 text-amber-200")}>
                  primario {r.primary?.modo} · {r.primary?.provenance}{r.primary?.ready ? "" : " · no listo"}
                </span>
                <span className="truncate">respondió {r.sourceLabel} · {r.modelLabel} · {r.ms} ms{r.attempts && r.attempts > 1 ? ` · ${r.attempts} intentos` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
