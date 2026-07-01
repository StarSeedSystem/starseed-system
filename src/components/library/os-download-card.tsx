"use client";

// ════════════════════════════════════════════════════════════════
// OsDownloadCard — Descarga/instalación de la ÚLTIMA versión de StarSeed OS
// ----------------------------------------------------------------
// Tarjeta destacada al TOPE de la Librería que ofrece la última versión del
// sistema operativo StarSeed para instalar (PWA) o abrir en la web oficial.
// Reutiliza el botón inteligente de instalación (`InstallButton`, que ya
// gestiona Chrome/Edge/Android/iOS/escritorio) y enlaza al despliegue
// oficial. Aditiva y defensiva: si algo no está disponible, degrada.
// ════════════════════════════════════════════════════════════════

import { Download, ExternalLink, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { InstallButton } from "@/components/welcome/install-button";

/** URL oficial de despliegue de StarSeed OS (fuente: CLAUDE.md / config). */
const OS_DOWNLOAD_URL = "https://starseed-os.vercel.app";

export interface OsDownloadCardProps {
  /** Etiqueta de versión a mostrar (por defecto la del runtime). */
  version?: string;
}

export function OsDownloadCard({ version = "1.0.0-alpha" }: OsDownloadCardProps) {
  return (
    <GlassCard
      variant="hover"
      className="relative overflow-hidden p-6 border-emerald-400/20 bg-gradient-to-br from-emerald-900/30 via-teal-900/20 to-transparent"
    >
      {/* Decoración de fondo */}
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
            <Download className="h-7 w-7 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold font-headline text-emerald-100">
                Descarga StarSeed OS
              </h2>
              <Badge
                variant="outline"
                className="gap-1 border-emerald-400/40 text-emerald-300 text-[10px]"
              >
                <Sparkles className="h-3 w-3" /> Última versión · {version}
              </Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Instala el sistema operativo social en tu dispositivo (Android, iOS,
              escritorio) como app, o ábrelo en la web oficial. Siempre la versión
              más reciente, lista para tu soberanía digital.
            </p>
            <a
              href={OS_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200 hover:underline cursor-pointer"
            >
              starseed-os.vercel.app <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Acciones de instalación / descarga */}
        <div className="flex w-full flex-col gap-2 md:w-64 shrink-0">
          <InstallButton />
          <a
            href={OS_DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[13px] border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/[0.08] cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" /> Abrir en la web
          </a>
        </div>
      </div>
    </GlassCard>
  );
}

export default OsDownloadCard;
