"use client";

/**
 * Banner de ALIAS (Adenda I2 · tarea 6): /memorias y /memorias-3d ahora son
 * accesos directos al pilar Memoria de Cerebros. Muestra el aviso y un botón que
 * lleva a /cerebro con la sub-vista correspondiente, PRESERVANDO los query params
 * actuales de la página.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Brain } from "lucide-react";
import type { MemoryViewId, MemoryListSub } from "@/components/cerebro/memory-views";

export default function CerebroAliasBanner({
  view,
  sub,
}: {
  view: MemoryViewId;
  sub?: MemoryListSub;
}) {
  const base = `/cerebro?tab=memoria&mview=${view}${sub ? `&msub=${sub}` : ""}`;
  const [href, setHref] = useState(base);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      p.set("tab", "memoria");
      p.set("mview", view);
      if (sub) p.set("msub", sub);
      setHref(`/cerebro?${p.toString()}`);
    } catch {
      /* mantiene el href por defecto */
    }
  }, [view, sub]);

  return (
    <div className="mb-4 rounded-xl border border-cyan-500/25 bg-cyan-950/15 p-3 flex flex-wrap items-center gap-3">
      <Brain className="w-5 h-5 text-cyan-300 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-cyan-50">Ahora vive en Cerebros</div>
        <div className="text-[11px] text-cyan-300/70">
          Tus memorias son parte del pilar <span className="text-cyan-200">Memoria</span> de cada cerebro (por perfil).
          Esta página es un acceso directo al mismo contenido.
        </div>
      </div>
      <Link
        href={href}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 transition hover:bg-cyan-500/20"
      >
        Abrir en Cerebros <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
