"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TextosInternet } from "@/lib/malla/internet/tipos";

type Props = {
  visible: boolean;
  onActivar: () => void;
  onAhoraNo: () => void;
  textos: Pick<
    TextosInternet,
    "sugerirTitulo" | "sugerirCuerpo" | "sugerirActivar" | "sugerirAhoraNo"
  >;
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
      aria-label={textos.sugerirTitulo}
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 max-w-sm w-full",
      )}
    >
      <p className="text-[11px] font-medium text-white/90">{textos.sugerirTitulo}</p>
      <p className="text-[10px] leading-snug text-white/60 mt-1">{textos.sugerirCuerpo}</p>
      <div className="mt-3 flex gap-2">
        <Button
          onClick={onActivar}
          variant="default"
          className={cn("flex-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-medium text-emerald-100 transition-colors duration-200 hover:border-emerald-400/45 hover:text-white cursor-pointer")}
        >
          {textos.sugerirActivar}
        </Button>
        <Button
          onClick={onAhoraNo}
          variant="outline"
          className={cn("flex-1 rounded-lg border border-white/20 bg-white/[0.02] px-3 py-1.5 text-[10px] font-medium text-white/80 transition-colors duration-200 hover:border-white/35 cursor-pointer")}
        >
          {textos.sugerirAhoraNo}
        </Button>
      </div>
    </div>
  );
}