"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TextosInternet } from "@/lib/malla/internet/tipos";

type Props = {
  visible: boolean;
  onActivar: () => void;
  onAhoraNo: () => void;
  textos: Pick<typeof TextosInternet, "sugerirTitulo" | "sugerirCuerpo" | "sugerirActivar" | "sugerirAhoraNo">;
};

export function SugerenciaModoBanco({
  visible,
  onActivar,
  onAhoraNo,
  textos,
}: Props) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-4 space-y-3 max-w-sm w-full"
    >
      <p className="text-[11px] font-medium text-white/85">{textos.sugerirTitulo}</p>
      <p className="text-[10px] leading-snug text-white/55">{textos.sugerirCuerpo}</p>
      <div className="flex gap-2">
        <button
          onClick={onActivar}
          className="flex-1 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
          type="button"
        >
          {textos.sugerirActivar}
        </button>
        <button
          onClick={onAhoraNo}
          className="flex-1 rounded-md border border-white/15 bg-white/[0.01] px-3 py-2.5 text-[11px] font-medium text-white/60 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2"
          type="button"
        >
          {textos.sugerirAhoraNo}
        </button>
      </div>
    </div>
  );
}