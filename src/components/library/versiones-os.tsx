// StarSeed OS · Biblioteca — VersionesOS (Ola 1105H, tarea VER1105H).
// Enseña la versión instalada, la nueva disponible con «Actualizar» y el historial.
// Lee /api/os/versiones. Compatible móvil y escritorio.

"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, ExternalLink, Search, Shield, Cpu, Smartphone, Monitor, Apple } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  extraerVersionMasReciente,
  hayActualizacionDisponible,
  obtenerSistemasConArchivos,
  obtenerRequisitosYPermisos,
  formatearFechaISO,
  bytesAFormato,
  ETIQUETAS_SISTEMA,
  type ApiVersionesResponse,
  type VersionTransformada,
} from "@/lib/version/versiones-logica";

const API_VERSIONES = "/api/os/versiones";
const VERSION_INSTALADA = "2026.10.09";

interface EstadoVersion {
  instalada: string;
  disponible?: VersionTransformada;
  loading: boolean;
  error?: string;
  aviso?: string;
}

function IconoSistema({ sistema }: { sistema: string }) {
  const iconos: Record<string, React.ReactNode> = {
    macos: <Apple className="h-4 w-4" />,
    windows: <Monitor className="h-4 w-4" />,
    linux: <Cpu className="h-4 w-4" />,
    android: <Smartphone className="h-4 w-4" />,
    ios: <Smartphone className="h-4 w-4" />,
    web: <Monitor className="h-4 w-4" />,
  };
  return iconos[sistema] || <Cpu className="h-4 w-4" />;
}

export function VersionesOs() {
  const [estado, setEstado] = useState<EstadoVersion>({
    instalada: VERSION_INSTALADA,
    loading: true,
  });
  const searchParams = useSearchParams();
  const modo = (searchParams?.get("modo") || "desktop").toLowerCase();

  useEffect(() => {
    fetch(API_VERSIONES, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Versiones no disponibles");
        return res.json();
      })
      .then((data: ApiVersionesResponse) => {
        const disponible = extraerVersionMasReciente(data);
        setEstado({
          instalada: VERSION_INSTALADA,
          disponible,
          loading: false,
          aviso: data.aviso,
        });
      })
      .catch((e) => {
        setEstado({
          instalada: VERSION_INSTALADA,
          loading: false,
          error: e instanceof Error ? e.message : "Error al cargar versiones",
        });
      });
  }, []);

  if (estado.loading)
    return (
      <GlassCard className="p-6 text-center">
        <Loader2 className="h-8 w-8 mx-auto animate-spin" />
        <p className="mt-2 text-muted-foreground">Cargando información de versiones…</p>
      </GlassCard>
    );

  if (estado.error)
    return (
      <GlassCard className="p-6 text-center">
        <p className="text-amber-300">Error: {estado.error}</p>
        <Button variant="outline" onClick={() => void window.location.reload()}>
          Reintentar
        </Button>
      </GlassCard>
    );

  const { disponible, instalada, aviso } = estado;
  const versionNueva = disponible?.version ?? instalada;
  const esNueva = disponible && hayActualizacionDisponible(instalada, versionNueva);
  const esMovil = modo === "mobile" || (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent));

  const sistemasConArchivos = disponible ? obtenerSistemasConArchivos(disponible.archivos.os) : [];
  const requisitosPermisos = disponible ? obtenerRequisitosYPermisos(sistemasConArchivos.map((s) => s.sistema)) : [];

  return (
    <section className="space-y-4" role="region" aria-label="Información de versiones de StarSeed OS">
      {aviso && (
        <GlassCard className="p-3 border-amber-500/30 bg-amber-500/5">
          <p className="text-sm text-amber-200 flex items-center gap-2">
            <Shield className="h-4 w-4" /> {aviso}
          </p>
        </GlassCard>
      )}

      {/* Versión instalada vs nueva */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="text-sm text-muted-foreground">Versión instalada</span>
            <p className="font-bold text-lg">{instalada}</p>
          </div>
          <div className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm border",
            esNueva && "bg-amber-500/10 text-amber-200 border-amber-500/30",
            !esNueva && "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
          )}>
            <span className="font-mono">{versionNueva}</span>
            {esNueva ? (
              <span className="text-[10px] text-amber-300 font-semibold">Actualización disponible</span>
            ) : (
              <span className="text-muted-foreground">Actualizada</span>
            )}
          </div>
        </div>
        {esNueva && (
          <Button
            size="sm"
            variant="default"
            className="mt-2 w-full sm:w-auto"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("starseed:actualizar-version", { detail: { version: disponible?.version } }));
            }}
          >
            <ArrowUpRight className="h-4 w-4 mr-2" /> Actualizar
          </Button>
        )}
      </GlassCard>

      {/* Historial */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground font-medium">Historial de versiones</span>
          {disponible && (
            <a
              href={disponible.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" /> Ver todas en GitHub
            </a>
          )}
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {disponible ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm p-3 rounded-lg bg-white/5">
                <span className="font-mono text-primary min-w-[100px]">{disponible.version}</span>
                <span className="text-muted-foreground whitespace-nowrap">{formatearFechaISO(disponible.fecha)}</span>
                <span className="flex-1 min-w-0 truncate">{disponible.notas || "Sin notas"}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm p-3 rounded-lg bg-white/5 border border-white/10">
                <span className="font-mono min-w-[100px]">{instalada}</span>
                <span className="text-muted-foreground whitespace-nowrap">—</span>
                <span className="flex-1 min-w-0 truncate text-muted-foreground">Versión actualmente instalada</span>
              </div>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm p-3 rounded-lg bg-white/5">
              <span className="font-mono min-w-[100px]">{instalada}</span>
              <span className="text-muted-foreground whitespace-nowrap">—</span>
              <span className="flex-1 min-w-0 truncate text-muted-foreground">Versión instalada (sin datos de actualización)</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Archivos por sistema */}
      <GlassCard className="p-4">
        <span className="text-sm text-muted-foreground font-medium">Archivos por sistema</span>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {sistemasConArchivos.length > 0 ? (
            sistemasConArchivos.map(({ sistema, archivos }) => (
              <GlassCard key={sistema} className="p-3 text-sm" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <IconoSistema sistema={sistema} />
                  <span className="font-medium">{ETIQUETAS_SISTEMA[sistema as keyof typeof ETIQUETAS_SISTEMA]}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{archivos.length} archivo{archivos.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {archivos.map((f) => (
                    <a
                      key={f.nombre}
                      href={f.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-[11px] text-primary hover:underline cursor-pointer group p-1.5 rounded hover:bg-white/5 transition-colors"
                      download={f.nombre}
                    >
                      <span className="truncate mr-2">{f.nombre}</span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap group-hover:text-primary">{bytesAFormato(f.bytes)}</span>
                    </a>
                  ))}
                </div>
              </GlassCard>
            ))
          ) : (
            <p className="text-xs text-muted-foreground col-span-full text-center py-4">No hay archivos disponibles</p>
          )}
        </div>
      </GlassCard>

      {/* Requisitos y permisos por sistema */}
      <GlassCard className="p-4">
        <span className="text-sm text-muted-foreground font-medium">Requisitos y permisos por sistema</span>
        <div className="mt-3 space-y-3">
          {requisitosPermisos.length > 0 ? (
            requisitosPermisos.map(({ sistema, config }) => (
              <details key={sistema} className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <IconoSistema sistema={sistema} />
                  <span className="font-medium">{ETIQUETAS_SISTEMA[sistema]}</span>
                  <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                    v{config.versionMinima} · {config.arquitecturas.join(", ")}
                  </span>
                </summary>
                <div className="mt-2 ml-6 space-y-1.5 border-l border-white/10 pl-3">
                  <div className="text-xs text-muted-foreground">Permisos ({config.permisos.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {config.permisos.slice(0, 8).map((p) => (
                      <span key={p.nombre} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground hover:text-white hover:bg-white/10 transition-colors" title={p.texto}>
                        {p.nombre}
                      </span>
                    ))}
                    {config.permisos.length > 8 && (
                      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5">+{config.permisos.length - 8} más</span>
                    )}
                  </div>
                  {config.noPermiteSistema && config.noPermiteSistema.length > 0 && (
                    <div className="mt-1.5 text-xs text-amber-300/80">
                      <strong>No permite:</strong> {config.noPermiteSistema.slice(0, 3).join("; ")}
                      {config.noPermiteSistema.length > 3 && ` +${config.noPermiteSistema.length - 3} más`}
                    </div>
                  )}
                </div>
              </details>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Información de requisitos no disponible</p>
          )}
        </div>
      </GlassCard>

      {/* Acciones */}
      <GlassCard className="p-4">
        <span className="text-sm text-muted-foreground font-medium">Acciones</span>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(disponible?.url ?? "#", "_blank")}
            disabled={!disponible}
          >
            <ExternalLink className="h-4 w-4" /> Ver en GitHub
          </Button>
          {!disponible?.archivos?.os?.macos?.[0] && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(API_VERSIONES, "_blank")}
              disabled={!disponible}
            >
              <Search className="h-4 w-4" /> Ver API
            </Button>
          )}
        </div>
      </GlassCard>
    </section>
  );
}