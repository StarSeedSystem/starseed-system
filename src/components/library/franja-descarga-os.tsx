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
// · (2026-11-07, LIB1107A) Diseño: el símbolo oficial de StarSeed a la cabeza, una
//   jerarquía clara (descargar → información y versiones → web), lo recomendado para
//   este dispositivo con formato y tamaño, y los demás sistemas en segundo plano.
//   Composición centrada en el móvil; dos columnas alineadas en el escritorio.
// · Movimiento con los tokens de src/lib/design/movimiento.ts y respeto a
//   prefers-reduced-motion.
// ════════════════════════════════════════════════════════════════════════════
"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { InstallButton } from "@/components/welcome/install-button";
import { cn } from "@/lib/utils";
import { CURVA, DURACION } from "@/lib/design/movimiento";
import { tamanoLegible } from "@/lib/apps-oficiales/apps-oficiales";
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
import { CheckCircle2, Clock, Download, ExternalLink, Info } from "lucide-react";

import { SimboloStarSeed } from "./simbolo-starseed";
import { extensionDe } from "./ventanas-descarga-os";

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

const ENLACE =
  "inline-flex cursor-pointer items-center gap-1 rounded font-medium text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-trinity-emerald";

export function FranjaDescargaOs({ onAbrirFicha }: { onAbrirFicha: () => void }) {
  const reducido = useMovimientoReducido();
  // El mismo plan que ejecuta el botón: lo que aquí se anuncia es lo que se descargará.
  const { plan, release, cargando } = useInstalarOS();
  const rapidos = instaladoresPorSistema(release).map((g) => ({ etiqueta: g.etiqueta, asset: g.archivos[0] }));
  const tag = release ? (release.tag.startsWith("v") ? release.tag : `v${release.tag}`) : "";
  const disponible = plan.tipo !== "ya-instalada";
  const detalle =
    plan.tipo === "descargar"
      ? [plan.version, plan.asset.formato, tamanoLegible(plan.asset.bytes)].filter(Boolean).join(" · ")
      : plan.tipo === "web"
        ? `App web (PWA) · ${plan.detalle}`
        : plan.detalle;

  // Movimiento con la voz única del OS; con movimiento reducido, duración 0.
  const transicion = `${reducido ? 0 : DURACION.normal}ms ${CURVA.entrada}`;

  return (
    <GlassCard className="relative overflow-hidden border-white/10 p-5 sm:p-8" data-testid="franja-descarga-os">
      {/* Acento radial de la marca detrás del símbolo (decorativo). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 42% 75% at 18% 35%, hsl(var(--trinity-azure-hsl) / 0.13), transparent 70%), radial-gradient(ellipse 36% 60% at 95% 105%, hsl(var(--trinity-emerald-hsl) / 0.10), transparent 70%)",
        }}
      />

      {/* Composición centrada: en pantallas anchas el bloque no pasa de 64 rem y se centra en la
          franja (sin un vacío entre el texto y las acciones). */}
      <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem] lg:gap-10">
        <div className="flex min-w-0 flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-left">
          <SimboloStarSeed size={96} halo />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:justify-start">
              <h2 className="font-headline text-2xl font-bold leading-tight text-foreground md:text-3xl">
                Descarga StarSeed OS
              </h2>
              <span
                className="rounded-full border border-trinity-emerald/40 bg-trinity-emerald/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-200"
                title={etiquetaBuild()}
              >
                {CANAL_LABEL[OS_CANAL]} · {OS_VERSION}
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Última versión publicada el{" "}
              <strong className="font-semibold text-foreground">{formatearFechaBuild(OS_FECHA)}</strong>. Instálala
              como app en tu ordenador o tu móvil, o úsala en la web oficial.
            </p>

            {/* Detector inteligente: qué conviene a ESTE dispositivo, con honestidad. */}
            <div
              className="mt-4 inline-flex max-w-xl flex-col gap-0.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
              data-testid="recomendacion-dispositivo"
            >
              <p className="text-xs font-medium text-muted-foreground">Para este dispositivo</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
                {plan.titulo}
                {cargando ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" aria-hidden /> Buscando la última versión…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {disponible ? "Disponible ahora" : "Ya instalada"}
                  </span>
                )}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">{detalle}</p>
            </div>
          </div>
        </div>

        {/* Acciones: descargar (principal), ficha con versiones (secundaria) y la web (terciaria). */}
        <div className="mx-auto flex w-full max-w-sm flex-col gap-2.5 lg:max-w-none">
          <InstallButton compact className="w-full" />
          <button
            type="button"
            onClick={onAbrirFicha}
            title="Ficha completa del OS: versiones, notas y enlaces oficiales"
            className={cn(
              "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-foreground",
              "hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-trinity-emerald",
            )}
            style={{ transition: `background-color ${transicion}` }}
            data-testid="boton-informacion-versiones"
          >
            <Info className="h-4 w-4 shrink-0" aria-hidden /> Información y versiones
          </button>
          <a
            href={OS_WEB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(ENLACE, "min-h-11 justify-center text-sm")}
          >
            Abrir en la web <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>

      {/* Los demás sistemas, en segundo plano: un toque descarga su archivo directo. */}
      <nav
        aria-label="Descargas directas por sistema"
        className="relative z-10 mx-auto mt-6 flex max-w-5xl flex-col items-center gap-3 border-t border-white/[0.08] pt-5 xl:flex-row xl:justify-between"
      >
        <p className="text-sm text-muted-foreground">
          Descarga directa{tag ? ` · ${tag}` : ""}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-2">
          {rapidos.map(({ etiqueta, asset }) => (
            <li key={asset.nombre}>
              <a
                href={asset.url}
                download={asset.nombre}
                title={`${asset.nombre}${asset.bytes ? ` · ${tamanoLegible(asset.bytes)}` : ""}`}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 text-sm font-medium text-foreground/90 hover:border-white/25 hover:bg-white/[0.09] focus-visible:outline focus-visible:outline-2 focus-visible:outline-trinity-emerald"
                style={{ transition: `background-color ${transicion}, border-color ${transicion}` }}
              >
                <Download className="h-3.5 w-3.5 text-emerald-300" aria-hidden />
                {etiqueta}
                <span className="text-xs text-muted-foreground">{extensionDe(asset.nombre)}</span>
              </a>
            </li>
          ))}
          <li>
            <a href={OS_RELEASES_ULTIMA_URL} target="_blank" rel="noopener noreferrer" className={cn(ENLACE, "min-h-11 px-2 text-sm")}>
              Todas <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </li>
          <li>
            <a href={OS_REPO_URL} target="_blank" rel="noopener noreferrer" className={cn(ENLACE, "min-h-11 px-2 text-sm")}>
              Código fuente <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </li>
        </ul>
      </nav>
    </GlassCard>
  );
}
