"use client";

// ════════════════════════════════════════════════════════════════
// InstalledServicesPanel — "Mis servicios e integraciones"
// ----------------------------------------------------------------
// Sección de la BIBLIOTECA PERSONAL (Mi Biblioteca). Muestra:
//   • los servicios que el usuario CONECTÓ (tiene ≥1 conexión), y
//   • los PREDETERMINADOS integrados por StarSeed (enabledByDefault),
// con su estado (conectado por ti vs. preintegrado por defecto),
// nº de conexiones, y accesos para configurarlos (página /servicios)
// o abrir su repositorio.
//
// Deja CLARO qué viene preintegrado por defecto (badge "Predeterminado")
// y qué instaló el usuario (badge "Conectado por ti").
//
// Reactivo (useOssConnections), SSR-safe (hidrata en cliente),
// defensivo. Crystal Liquid Glass · responsive · español.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import {
  Boxes,
  Plug,
  Settings2,
  Github,
  CheckCircle2,
  Sparkles,
  Brain,
  Mic2,
  Image as ImageIcon,
  Clapperboard,
  Workflow,
  CalendarDays,
  FileText,
  PenTool,
  Globe2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useOssConnections } from "@/lib/services/oss-connections";
import type { OssServiceCategory } from "@/lib/services/oss-services";
import {
  listInstalledServices,
  type InstalledServiceView,
} from "@/lib/library/oss-catalog-bridge";

const FUNCTION_ICON: Record<OssServiceCategory, LucideIcon> = {
  llm: Brain,
  stt: Mic2,
  tts: Mic2,
  image: ImageIcon,
  video: Clapperboard,
  workflow: Workflow,
  calendar: CalendarDays,
  docs: FileText,
  design: PenTool,
  website: Globe2,
};

function ServiceRow({ view }: { view: InstalledServiceView }) {
  const Icon = FUNCTION_ICON[view.serviceCategory] ?? Boxes;
  const byUser = view.userInstalled;

  return (
    <GlassCard
      variant="hover"
      intensity="low"
      className="flex items-center gap-3 border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-3"
    >
      <div className="shrink-0 rounded-xl border border-white/10 bg-black/30 p-2.5 text-indigo-300">
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{view.name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {byUser ? (
            <Badge
              variant="outline"
              className="gap-1 border-emerald-400/40 bg-emerald-500/10 text-emerald-300 text-[10px]"
            >
              <CheckCircle2 className="h-3 w-3" /> Conectado por ti
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 border-sky-400/40 bg-sky-500/10 text-sky-300 text-[10px]"
            >
              <Sparkles className="h-3 w-3" /> Predeterminado
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{view.functionLabel}</span>
          {view.connectionCount > 0 && (
            <span className="text-[10px] text-emerald-300/80">
              · {view.connectionCount} conexión{view.connectionCount === 1 ? "" : "es"}
            </span>
          )}
          {!byUser && (
            <span className="text-[10px] text-muted-foreground">· integrado por StarSeed</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          asChild
          className="h-8 gap-1.5 border-white/15 text-xs hover:bg-white/10 cursor-pointer"
          title="Configurar en Servicios"
        >
          <a href="/servicios">
            <Settings2 className="h-3.5 w-3.5" /> Configurar
          </a>
        </Button>
        {view.repoUrl && (
          <Button
            size="sm"
            variant="ghost"
            asChild
            className="h-8 w-8 p-0 text-muted-foreground hover:text-white cursor-pointer"
            title="Repositorio de código abierto"
          >
            <a href={view.repoUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

/**
 * Sección "Mis servicios e integraciones" para la Biblioteca personal.
 * Aditiva: si no hay nada, muestra una nota honesta con acceso a Servicios.
 */
export function InstalledServicesPanel() {
  const { connections } = useOssConnections();

  const views = useMemo(() => listInstalledServices(connections), [connections]);
  const connectedByUser = views.filter((v) => v.userInstalled);
  const preintegrated = views.filter((v) => !v.userInstalled);

  return (
    <section className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/20">
            <Boxes className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-[clamp(1.25rem,2.5vw,1.75rem)] font-bold font-headline text-indigo-200">
              Mis servicios e integraciones
            </h2>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Lo que has conectado y lo que StarSeed trae preintegrado por defecto. Configura endpoint,
              clave o webhook de cada uno.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          asChild
          className="gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer shrink-0"
        >
          <a href="/servicios">
            <Plug className="w-4 h-4" /> Gestionar servicios
          </a>
        </Button>
      </div>

      {views.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground border border-dashed border-white/10 rounded-3xl bg-white/5">
          <Boxes className="w-10 h-10 mb-3 opacity-25" />
          <p className="text-sm">Aún no hay servicios integrados.</p>
          <p className="text-xs mt-1">
            Conéctalos desde Explorar → «Servicios / Integraciones», o desde la página de Servicios.
          </p>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="mt-4 gap-2 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 cursor-pointer"
          >
            <a href="/servicios">
              <Settings2 className="w-3.5 h-3.5" /> Abrir Servicios
            </a>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Conectados por el usuario */}
          {connectedByUser.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                <h3 className="text-sm font-bold text-white/90">Conectados por ti</h3>
                <span className="text-[10px] text-muted-foreground">
                  {connectedByUser.length}
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-2.5">
                {connectedByUser.map((v) => (
                  <ServiceRow key={v.serviceId} view={v} />
                ))}
              </div>
            </div>
          )}

          {/* Predeterminados integrados */}
          {preintegrated.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-300" />
                <h3 className="text-sm font-bold text-white/90">Predeterminados integrados</h3>
                <Badge variant="outline" className="border-sky-400/30 text-sky-300 text-[10px]">
                  por StarSeed
                </Badge>
                <span className="text-[10px] text-muted-foreground">{preintegrated.length}</span>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-0.5">
                Vienen listos por defecto. Añade una conexión propia para personalizar su endpoint o clave.
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-2.5">
                {preintegrated.map((v) => (
                  <ServiceRow key={v.serviceId} view={v} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default InstalledServicesPanel;
