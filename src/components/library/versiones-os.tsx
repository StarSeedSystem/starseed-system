// StarSeed OS · Biblioteca — VersionesOS (Ola 1105H, tarea VER1105H).
// Enseña la versión instalada, la nueva disponible con «Actualizar» y el historial.
// Lee /api/os/versiones. Compatible móvil y escritorio.

"use client";

import { useEffect, useState } from "react";
import { ArrowUpRightDots, Loader2, ExternalLink, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { VersionPublicada } from "@/lib/version/versiones-publicadas";
import { formatearFechaISO, bytesAFormato, procesarVersion, VersionInfoProcesada } from "./versiones-os-logica";

const API_VERSIOES = "/api/os/versiones";

interface EstadoVersion {
  instalada: string;
  disponible?: VersionInfoProcesada;
  loading: boolean;
  error?: string;
}

export function VersionesOs() {
  const [estado, setEstado] = useState<EstadoVersion>({
    instalada: "2026.10.09",
    loading: true,
  });
  const searchParams = useSearchParams();
  const modo = (searchParams?.get("modo") || "desktop").toLowerCase();

  useEffect(() => {
    fetch(API_VERSIOES, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Versiones no disponibles");
        return res.json();
      })
      .then((data: { versiones: VersionPublicada[] }) => {
        const versiones = data.versiones ?? [];
        const versionMasReciente = versiones[0];
        setEstado({
          instalada: "2026.10.09",
          disponible: versionMasReciente ? procesarVersion(versionMasReciente) : undefined,
          loading: false,
        });
      })
      .catch((e) => {
        setEstado({
          instalada: "2026.10.09",
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

  const { disponible, instalada } = estado;
  const versionNueva = disponible?.version ?? instalada;
  const esNueva = disponible && disponible.version && disponible.version !== instalada;

  // Determina si es móvil
  const esMovil = modo === "mobile" || (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent));

  return (
    <section className="space-y-4">
      {/* Versión instalada vs nueva */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm text-muted-foreground">Versión instalada</span>
            <p className="font-bold text-lg">{instalada}</p>
          </div>
          <div className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm",
            esNueva && "bg-amber-500/10 text-amber-200 border-amber-500/30",
            !esNueva && "bg-emerald-500/10 text-emerald-200 border-emerald-500/30",
          )}>
            <span className="text-amber-200">{versionNueva}</span>
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
            variant="outline"
            className="mt-2 w-full"
            onClick={() => {
              // Lógica de actualización - abriría el updater
              window.dispatchEvent(new CustomEvent("starseed:actualizar-version", { detail: { version: disponible?.version } }));
            }}
          >
            <ArrowUpRightDots className="h-4 w-4 mr-2" /> Actualizar
          </Button>
        )}
      </GlassCard>

      {/* Historial */}
      <GlassCard className="p-4">
        <span className="text-sm text-muted-foreground font-medium">Historial de versiones</span>
        <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
          {disponible ? [
            {
              version: disponible.version,
              fecha: formatearFechaISO(disponible.fecha),
              notas: disponible.notas.substring(0, 100) + (disponible.notas.length > 100 ? "…" : ""),
            },
            {
              version: instalada,
              fecha: "—",
              notas: "Versión actualmente instalada",
            },
          ] : [
            {
              version: instalada,
              fecha: "—",
              notas: "Versión instalada (sin datos de actualización)",
            },
          ]}
          {disponible && disponible.archivos.length > 0 && (
            <div className="pt-2 border-t text-xs text-muted-foreground">
              <span>•</span> {disponible.archivos.length} archivos para este sistema
            </div>
          )}
        </div>
      </GlassCard>

      {/* Archivos por sistema */}
      <GlassCard className="p-4">
        <span className="text-sm text-muted-foreground font-medium">Archivos por sistema</span>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {disponible?.archivos?.map((f) => (
            <GlassCard
              key={f.nombre}
              className="p-3 text-sm"
              style={{ borderColor: "rgba(255,255,255,0.2)" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{f.nombre}</span>
                <span className="text-[10px] text-muted-foreground">{bytesAFormato(f.bytes)}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-1">
                <span>{f.sistema}</span>
              </div>
              <a
                href={f.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary hover:underline cursor-pointer"
                download={f.nombre}
              >
                Descargar
              </a>
            </GlassCard>
          ))}
          {(!disponible || !disponible.archivos?.length) && (
            <p className="text-xs text-muted-foreground">No hay archivos disponibles</p>
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
          {!disponible?.archivos?.[0] && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(API_VERSIOES, "_blank")}
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