// Ficha de versiones del StarSeed OS
// Contrato: architecture/centro-versiones-1105.md
"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import { OS_VERSION, OS_FECHA, formatearFechaBuild } from "@/lib/version/os-release";
import { type VersionPublicada } from "@/lib/version/versiones-publicadas";

interface ApiResponse {
  versiones: VersionPublicada[];
  generadoEn: string;
  aviso?: string;
}

function formatearBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function VersionesOS() {
  const [cargando, setCargando] = useState(true);
  const [versiones, setVersiones] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/os/versiones")
      .then((r) => r.json())
      .then((data) => {
        setVersiones(data);
        setCargando(false);
      })
      .catch((e) => {
        setError(e.message);
        setCargando(false);
      });
  }, []);

  if (cargando) {
    return (
      <GlassCard className="p-4">
        <p className="text-muted-foreground">Cargando historial de versiones…</p>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-4">
        <p className="text-destructive">Error al cargar versiones: {error}</p>
      </GlassCard>
    );
  }

  if (!versiones || versiones.versiones.length === 0) {
    return (
      <GlassCard className="p-4">
        <p className="text-muted-foreground">No hay versiones disponibles</p>
      </GlassCard>
    );
  }

  const versionActual = OS_VERSION;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Versiones de StarSeed OS</h3>
        <Badge variant="outline">{versionActual}</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Última versión publicada: <strong>{formatearFechaBuild(OS_FECHA)}</strong>
      </p>

      {versiones.aviso && (
        <p className="text-xs text-amber-600">{versiones.aviso}</p>
      )}

      <div className="flex flex-col gap-3">
        {versiones.versiones.map((v) => {
          const esActual = v.version === `v${versionActual}` || v.version === versionActual;
          const archivos = v.archivos.os;

          return (
            <GlassCard key={v.version} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{v.version}</span>
                    {esActual && <Badge variant="outline">Actual</Badge>}
                    <Badge variant="secondary" className="text-xs">
                      {v.fecha}
                    </Badge>
                  </div>
                  {v.notas && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{v.notas}</p>
                  )}
                </div>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 rounded p-1 text-muted-foreground hover:text-foreground"
                  title="Ver release en GitHub"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18 6 6 18 18z" />
                    <path d="M9 10a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1z" />
                  </svg>
                </a>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {archivos.macos.length > 0 && (
                  <a
                    href={archivos.macos[0].href}
                    download
                    className="cursor-pointer text-sm font-medium text-emerald-300 hover:underline"
                    title={archivos.macos[0].nombre}
                  >
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      macOS: {archivos.macos[0].nombre} ({formatearBytes(archivos.macos[0].bytes)})
                    </span>
                  </a>
                )}
                {archivos.windows.length > 0 && (
                  <a
                    href={archivos.windows[0].href}
                    download
                    className="cursor-pointer text-sm font-medium text-emerald-300 hover:underline"
                    title={archivos.windows[0].nombre}
                  >
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      Windows: {archivos.windows[0].nombre} ({formatearBytes(archivos.windows[0].bytes)})
                    </span>
                  </a>
                )}
                {archivos.linux.length > 0 && (
                  <a
                    href={archivos.linux[0].href}
                    download
                    className="cursor-pointer text-sm font-medium text-emerald-300 hover:underline"
                    title={archivos.linux[0].nombre}
                  >
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      Linux: {archivos.linux[0].nombre} ({formatearBytes(archivos.linux[0].bytes)})
                    </span>
                  </a>
                )}
                {archivos.android.length > 0 && (
                  <a
                    href={archivos.android[0].href}
                    download
                    className="cursor-pointer text-sm font-medium text-emerald-300 hover:underline"
                    title={archivos.android[0].nombre}
                  >
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      Android: {archivos.android[0].nombre} ({formatearBytes(archivos.android[0].bytes)})
                    </span>
                  </a>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}