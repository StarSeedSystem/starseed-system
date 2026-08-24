"use client";

/**
 * ANFITRIÓN DE PESTAÑAS 1.58 EN PRIMER NIVEL — Ola 6 · Adenda 158.
 * ----------------------------------------------------------------------------
 * Hasta la Ola 5, las 22 pestañas del Studio 1.58 (`s158/*`) solo se alcanzaban
 * DENTRO del panel «Astraura 1.58» (`/agent?tab=astraura-158&sub=…`). El menú de
 * «Astraura AI & Orchestration» no reflejaba las áreas del sistema original, así
 * que para el usuario no existían.
 *
 * Este anfitrión resuelve por su cuenta lo mismo que resuelve el panel —destino
 * efectivo (local si responde, si no la nube), manifiesto y recarga— y monta UNA
 * pestaña `s158` como sección de primer nivel del menú. Así cada área del
 * original (Sensorium, Notificaciones, Enjambre, Bóveda, Telemetría…) es una
 * entrada real del menú, sin duplicar su lógica ni su código.
 *
 * Regla: nunca inventa datos. Si el backend soberano no responde, enseña el
 * estado «sin conexión» con su motivo y el enlace para configurarlo.
 */

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AlertTriangle, Binary, Cloud, Cpu, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  astraura158Endpoint, fetchAstraura158Counters, fetchAstraura158Manifest, fetchAstraura158Status,
  type Astraura158Counters, type Astraura158Manifest, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import type { S158TabId, S158TabProps } from "@/components/astraura/s158/shared";

const loading = () => (
  <p className="mt-3 flex items-center gap-2 text-[11px] text-white/50">
    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando pestaña…
  </p>
);

/** Registro de las pestañas montables en primer nivel (carga diferida, igual que el panel). */
const TAB_COMPONENTS: Partial<Record<S158TabId, ComponentType<S158TabProps>>> = {
  chat: dynamic(() => import("@/components/astraura/s158/chat-tab").then((m) => m.ChatTab), { ssr: false, loading }),
  voz: dynamic(() => import("@/components/astraura/s158/voz-tab").then((m) => m.VozTab), { ssr: false, loading }),
  proyectos: dynamic(() => import("@/components/astraura/s158/proyectos-tab").then((m) => m.ProyectosTab), { ssr: false, loading }),
  almacenamiento: dynamic(() => import("@/components/astraura/s158/almacenamiento-tab").then((m) => m.AlmacenamientoTab), { ssr: false, loading }),
  sentidos: dynamic(() => import("@/components/astraura/s158/sentidos-tab").then((m) => m.SentidosTab), { ssr: false, loading }),
  permisos: dynamic(() => import("@/components/astraura/s158/permisos-tab").then((m) => m.PermisosTab), { ssr: false, loading }),
  notificaciones: dynamic(() => import("@/components/astraura/s158/notificaciones-tab").then((m) => m.NotificacionesTab), { ssr: false, loading }),
  memoria: dynamic(() => import("@/components/astraura/s158/memoria-tab").then((m) => m.MemoriaTab), { ssr: false, loading }),
  orquestacion: dynamic(() => import("@/components/astraura/s158/orquestacion-tab").then((m) => m.OrquestacionTab), { ssr: false, loading }),
  agentes: dynamic(() => import("@/components/astraura/s158/agentes-tab").then((m) => m.AgentesTab), { ssr: false, loading }),
  navegador: dynamic(() => import("@/components/astraura/s158/navegador-tab").then((m) => m.NavegadorTab), { ssr: false, loading }),
  dispositivo: dynamic(() => import("@/components/astraura/s158/dispositivo-tab").then((m) => m.DispositivoTab), { ssr: false, loading }),
  biblioteca: dynamic(() => import("@/components/astraura/s158/biblioteca-tab").then((m) => m.BibliotecaTab), { ssr: false, loading }),
  telemetria: dynamic(() => import("@/components/astraura/s158/telemetria-tab").then((m) => m.TelemetriaTab), { ssr: false, loading }),
  terminal: dynamic(() => import("@/components/astraura/s158/terminal-tab").then((m) => m.TerminalTab), { ssr: false, loading }),
  configuracion: dynamic(() => import("@/components/astraura/s158/configuracion-tab").then((m) => m.ConfiguracionTab), { ssr: false, loading }),
  imaginacion: dynamic(() => import("@/components/astraura/s158/imaginacion-tab").then((m) => m.ImaginacionTab), { ssr: false, loading }),
  // (Ola 6 · Adenda 158) las 4 áreas nuevas.
  boveda: dynamic(() => import("@/components/astraura/s158/boveda-tab").then((m) => m.BovedaTab), { ssr: false, loading }),
  workflows: dynamic(() => import("@/components/astraura/s158/workflows-tab").then((m) => m.WorkflowsTab), { ssr: false, loading }),
  privacidad: dynamic(() => import("@/components/astraura/s158/privacidad-tab").then((m) => m.PrivacidadTab), { ssr: false, loading }),
  instalador: dynamic(() => import("@/components/astraura/s158/instalador-tab").then((m) => m.InstaladorTab), { ssr: false, loading }),
};

export interface S158HostState {
  target: Astraura158Target;
  manifest: Astraura158Manifest | null;
  counters: Astraura158Counters | null;
  online: boolean;
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Resuelve destino + manifiesto + contadores del backend soberano.
 * Compartido por el anfitrión y por cualquier superficie que quiera hablar con
 * 1.58 sin montar el panel entero (la página de Imaginación, por ejemplo).
 */
export function useAstraura158Host(pollCountersMs = 30_000): S158HostState {
  const [target, setTarget] = useState<Astraura158Target>("local");
  const [manifest, setManifest] = useState<Astraura158Manifest | null>(null);
  const [counters, setCounters] = useState<Astraura158Counters | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const resolve = useCallback(async () => {
    setLoading(true);
    const [l, n] = await Promise.all([fetchAstraura158Status("local"), fetchAstraura158Status("nube")]);
    const t: Astraura158Target = l.ok ? "local" : n.ok ? "nube" : "local";
    setTarget(t);
    setOnline(l.ok || n.ok);
    setError(l.ok || n.ok ? "" : l.error || n.error || "sin respuesta");
    const m = await fetchAstraura158Manifest(t);
    setManifest(m.ok ? m.data : null);
    setCounters(await fetchAstraura158Counters(t));
    setLoading(false);
  }, []);

  useEffect(() => { void resolve(); }, [resolve]);

  useEffect(() => {
    if (!online || pollCountersMs <= 0) return;
    let alive = true;
    const id = window.setInterval(async () => {
      if (document.hidden) return;
      const c = await fetchAstraura158Counters(target);
      if (alive) setCounters(c);
    }, pollCountersMs);
    return () => { alive = false; window.clearInterval(id); };
  }, [target, online, pollCountersMs]);

  return { target, manifest, counters, online, error, loading, refresh: resolve };
}

/** Cinta de estado del backend soberano, común a todas las secciones 1.58. */
export function S158EndpointStrip({ state, className }: { state: S158HostState; className?: string }) {
  const endpoint = useMemo(() => astraura158Endpoint(state.target), [state.target]);
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-[11px]", className)}>
      <Binary className="h-3.5 w-3.5 text-cyan-300" />
      <span className="font-code text-[10px] uppercase tracking-wide text-white/45">Astraura 1.58</span>
      {state.target === "local"
        ? <Cpu className="h-3.5 w-3.5 text-emerald-300" aria-label="neurona local" />
        : <Cloud className="h-3.5 w-3.5 text-sky-300" aria-label="nube propia" />}
      <span className="truncate text-white/70">{endpoint || "sin endpoint"}</span>
      {state.loading
        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-white/50" />
        : state.online
          ? <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200">en línea</span>
          : <span className="inline-flex items-center gap-1 rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
              <AlertTriangle className="h-3 w-3" /> {state.error || "sin conexión"}
            </span>}
      <button
        type="button"
        onClick={() => void state.refresh()}
        className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 transition-colors hover:border-cyan-400/40 hover:text-cyan-100"
      >
        <RefreshCw className={cn("h-3 w-3", state.loading && "animate-spin")} /> Actualizar
      </button>
      <Link
        href="/agent?tab=astraura-158"
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-white/85 transition-colors hover:border-cyan-400/40 hover:text-cyan-100"
      >
        Studio 1.58 <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

/**
 * Monta una pestaña `s158` como sección de primer nivel.
 * `state` es opcional: si el contenedor ya resolvió el destino (una página con
 * varias pestañas 1.58), se comparte y no se duplican las llamadas de sondeo.
 */
export function S158TabHost({ tab, state, showStrip = true, className }: {
  tab: S158TabId;
  state?: S158HostState;
  showStrip?: boolean;
  className?: string;
}) {
  const own = useAstraura158Host(state ? 0 : 30_000);
  const s = state ?? own;
  const Tab = TAB_COMPONENTS[tab];
  return (
    <div className={cn("space-y-3", className)}>
      {showStrip && <S158EndpointStrip state={s} />}
      {Tab
        ? <Tab target={s.target} manifest={s.manifest} refresh={s.refresh} />
        : <p className="text-[11px] text-white/50">Esta pestaña todavía no está disponible.</p>}
    </div>
  );
}
