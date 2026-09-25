// ════════════════════════════════════════════════════════════════════════════
// Franja «Descarga StarSeed OS» — Destacado de la Biblioteca (Ola 303 · cableada 2026-09-10)
// ----------------------------------------------------------------------------
// · La versión y la fecha salen SIEMPRE de src/lib/version/os-release.ts (fuente
//   ÚNICA de verdad). Aquí NO hay constantes de fecha ni variables de entorno:
//   así es imposible que este medio vuelva a divergir del resto (ver el test
//   franja-descarga-os.test.tsx, que ata la franja y vigila page.tsx).
// · Detector inteligente (2026-09-25): el MISMO plan que el botón de instalar
//   (useInstalarOS → planInstalarOS): sistema detectado, archivo de la ÚLTIMA
//   versión publicada en GitHub y, si no hay app nativa, la web instalable.
// · Botón grande «Información y versiones» → ficha completa del OS.
// · Movimiento con los tokens de src/lib/design/movimiento.ts y respeto a
//   prefers-reduced-motion. Una sola columna en móvil.
// ════════════════════════════════════════════════════════════════════════════
"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { InstallButton } from "@/components/welcome/install-button";
import { cn } from "@/lib/utils";
import { CURVA, DURACION } from "@/lib/design/movimiento";
import { OS_REPO_URL, OS_WEB_URL } from "@/lib/install/device-install";
import { useInstalarOS } from "@/lib/install/instalar-os";
import { instaladoresPorSistema, OS_RELEASES_ULTIMA_URL } from "@/lib/install/instalar-os-logica";
import {
  OS_CANAL,
  OS_FECHA,
  OS_VERSION,
  etiquetaBuild,
  formatearFechaBuild,
} from "@/lib/version/os-release";
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Info,
  MonitorSmartphone,
  Package,
} from "lucide-react";

const CANAL_LABEL: Record<typeof OS_CANAL, string> = {
  alpha: "Alpha",
  beta: "Beta",
  estable: "Estable",
};

/** ¿El usuario pidió menos movimiento? SSR-safe y defensivo. */
function useMovimientoReducido(): boolean {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    let mq: MediaQueryList | undefined;
    try {
      mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    } catch {
      mq = undefined;
    }
    if (!mq) return;
    setReducido(mq.matches);
    const alCambiar = (e: MediaQueryListEvent) => setReducido(e.matches);
    mq.addEventListener?.("change", alCambiar);
    return () => mq?.removeEventListener?.("change", alCambiar);
  }, []);
  return reducido;
}

export function FranjaDescargaOs({ onAbrirFicha }: { onAbrirFicha: () => void }) {
  const reducido = useMovimientoReducido();
  // El mismo plan que ejecuta el botón: lo que aquí se anuncia es lo que se descargará.
  const { plan, release, cargando } = useInstalarOS();
  const rapidos = instaladoresPorSistema(release).map((g) => ({ etiqueta: g.etiqueta, asset: g.archivos[0] }));
  const tag = release ? (release.tag.startsWith("v") ? release.tag : `v${release.tag}`) : "";
  const disponible = plan.tipo !== "ya-instalada";
  const formato =
    plan.tipo === "descargar" ? plan.asset.formato : plan.tipo === "web" ? "App web (PWA)" : "App instalada";

  // Movimiento con la voz única del OS; con movimiento reducido, duración 0.
  const transicion = `${reducido ? 0 : DURACION.normal}ms ${CURVA.entrada}`;

  return (
    <GlassCard
      variant="hover"
      className="relative overflow-hidden border-emerald-400/30 bg-gradient-to-br from-emerald-900/40 via-teal-900/25 to-transparent p-5 shadow-[0_0_60px_-30px_rgba(16,185,129,0.6)] md:p-8"
      data-testid="franja-descarga-os"
    >
      {/* Resplandores de fondo para darle presencia (solo luz, nada de emojis). */}
      <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-emerald-300/15" />

      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="hidden shrink-0 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-3 shadow-[0_0_24px_rgba(16,185,129,0.25)] sm:block">
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
                title={etiquetaBuild()}
              >
                {CANAL_LABEL[OS_CANAL]} · {OS_VERSION}
              </Badge>
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Última versión publicada el{" "}
              <strong className="font-semibold text-emerald-100">
                {formatearFechaBuild(OS_FECHA)}
              </strong>
              . Instálala como app en tu dispositivo (Android, iOS, escritorio) o ábrela en la web
              oficial.
            </p>

            {/* Detector inteligente: qué conviene a ESTE dispositivo, con honestidad. */}
            <div
              className={cn(
                "mt-3 max-w-xl rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-3",
                !reducido && "hover:border-emerald-400/40",
              )}
              style={{ transition: `border-color ${transicion}` }}
              data-testid="recomendacion-dispositivo"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-200/80">
                <MonitorSmartphone className="h-3.5 w-3.5" /> Mejor opción para tu dispositivo
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-emerald-50">
                {plan.titulo}
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-white/70">
                  {formato}
                </span>
                {cargando ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-white/60">
                    <Clock className="h-3.5 w-3.5" /> Buscando la última versión…
                  </span>
                ) : disponible ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Disponible ahora
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ya instalada
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{plan.detalle}</p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <a
                href={OS_WEB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center gap-1 font-medium text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                starseed-os.vercel.app <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={OS_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center gap-1 font-medium text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                Código fuente / releases <ExternalLink className="h-3 w-3" />
              </a>
              {rapidos.length > 0 && (
                <span
                  className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
                  title="Enlaces directos a los archivos de la última versión publicada en GitHub."
                >
                  <Package className="h-3 w-3" /> Nativas{tag ? ` (${tag})` : ""}:
                  {rapidos.map(({ etiqueta, asset }) => (
                    <a
                      key={asset.nombre}
                      href={asset.url}
                      download={asset.nombre}
                      title={asset.nombre}
                      className="cursor-pointer font-medium text-emerald-300 hover:text-emerald-200 hover:underline"
                    >
                      {etiqueta}
                    </a>
                  ))}
                  <a
                    href={OS_RELEASES_ULTIMA_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer font-medium text-emerald-300 hover:text-emerald-200 hover:underline"
                  >
                    Todas
                  </a>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Acciones: ficha (botón grande), instalación PWA real y web oficial */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
          <Button
            type="button"
            size="lg"
            onClick={onAbrirFicha}
            title="Ficha completa del OS: versiones, notas y enlaces oficiales"
            className={cn(
              "h-14 w-full cursor-pointer gap-2 px-6 text-base font-bold",
              "bg-emerald-400 text-emerald-950 shadow-lg shadow-emerald-500/30",
              "hover:bg-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-200",
              !reducido && "hover:-translate-y-0.5",
            )}
            style={{ transition: `transform ${transicion}, background-color ${transicion}` }}
            data-testid="boton-informacion-versiones"
          >
            <Info className="h-5 w-5 shrink-0" /> Información y versiones
          </Button>
          <InstallButton className="w-full" />
          <a
            href={OS_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-[13px] border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/[0.08]"
            style={{ transition: `background-color ${transicion}` }}
          >
            <ExternalLink className="h-4 w-4" /> Abrir en la web
          </a>
        </div>
      </div>
    </GlassCard>
  );
}
