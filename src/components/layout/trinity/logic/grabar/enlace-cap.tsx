"use client";

/**
 * Enlace a la app de escritorio Cap (cap.so · capsoftware/cap), la grabadora de pantalla abierta en la
 * que se inspira esta sección. Es la alternativa NATIVA (más calidad, sin los límites del navegador);
 * se instala aparte: desde aquí no se instala nada, solo se abre su página oficial.
 */
import { ExternalLink, MonitorDown } from "lucide-react";

export const URL_CAP = "https://cap.so";

export function EnlaceCap() {
  return (
    <a
      href={URL_CAP}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="enlace-cap"
      className="group flex min-h-[56px] cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 outline-none transition-[border-color,background-color] duration-200 hover:border-amber-300/40 hover:bg-amber-400/[0.08] focus-visible:ring-2 focus-visible:ring-amber-300/70"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.07] text-amber-100/80">
        <MonitorDown className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight text-amber-50">App de escritorio Cap</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-amber-100/60">
          Grabadora de pantalla de código abierto, sin los límites del navegador. Se instala aparte; aquí no instalamos nada.
        </span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-amber-200/60 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
      <span className="sr-only">(abre cap.so en una pestaña nueva)</span>
    </a>
  );
}
