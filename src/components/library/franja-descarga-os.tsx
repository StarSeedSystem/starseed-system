// Franja «Descarga StarSeed OS» — Destacado de la Biblioteca (Ola 303).
// Rediseñada para ser más llamativa, con el botón GRANDE «Información y versiones».
// La versión y la fecha salen SIEMPRE de src/lib/version/os-release.ts (única fuente
// de verdad), jamás de una constante local.
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { InstallButton } from "@/components/welcome/install-button";
import { OS_CANAL, OS_VERSION, etiquetaBuild, formatearFechaBuild } from "@/lib/version/os-release";
import { Download, ExternalLink, Info } from "lucide-react";

/** URL oficial del despliegue de StarSeed OS (fuente: CLAUDE.md §1). */
const OS_WEB_URL = "https://starseed-os.vercel.app";

const CANAL_LABEL: Record<typeof OS_CANAL, string> = {
  alpha: "Alpha",
  beta: "Beta",
  estable: "Estable",
};

export function FranjaDescargaOs({ onAbrirFicha }: { onAbrirFicha: () => void }) {
  return (
    <GlassCard
      variant="hover"
      className="relative overflow-hidden border-emerald-400/25 bg-gradient-to-br from-emerald-900/35 via-teal-900/20 to-transparent p-6 md:p-8"
      data-testid="franja-descarga-os"
    >
      {/* Resplandores de fondo para darle presencia (nada de emojis, solo luz). */}
      <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-emerald-300/10" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="shrink-0 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3 shadow-[0_0_24px_rgba(16,185,129,0.25)]">
            <Download className="h-8 w-8 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-headline text-2xl font-bold leading-tight text-emerald-50 md:text-3xl">
                Descarga StarSeed OS
              </h2>
              <Badge
                variant="outline"
                className="gap-1 border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200"
              >
                {CANAL_LABEL[OS_CANAL]}
              </Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground" title={etiquetaBuild()}>
              Última versión publicada el {formatearFechaBuild(OS_VERSION)}. Instálala como app en tu
              dispositivo (Android, iOS, escritorio) o ábrela en la web oficial.
            </p>
            <p className="mt-1 text-xs text-emerald-200/60">Versión {OS_VERSION}</p>
          </div>
        </div>

        {/* Acciones: ficha, instalación PWA real y web oficial */}
        <div className="flex w-full flex-col gap-3 lg:w-72 shrink-0">
          <Button
            type="button"
            size="lg"
            onClick={onAbrirFicha}
            className="w-full gap-2 bg-emerald-500 text-emerald-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
            data-testid="boton-informacion-versiones"
          >
            <Info className="h-5 w-5" /> Información y versiones
          </Button>
          <InstallButton className="w-full" />
          <a
            href={OS_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[13px] border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors duration-200 hover:bg-white/[0.08]"
          >
            <ExternalLink className="h-4 w-4" /> Abrir en la web
          </a>
        </div>
      </div>
    </GlassCard>
  );
}