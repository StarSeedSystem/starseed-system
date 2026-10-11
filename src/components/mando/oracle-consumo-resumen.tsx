"use client";

import { Cloud, TriangleAlert } from "lucide-react";
import { useConsumoOracle } from "./medidor-consumo";
import { vistaOracle } from "@/lib/mando/oracle-consumo-tipos";

export default function OracleConsumoResumen() {
  const { datos } = useConsumoOracle();
  const v = datos ? vistaOracle(datos, Date.now()) : null;
  const gasto = v?.filas.find((f) => f.id === "gasto");

  if (!v) {
    return (
      <p className="text-xs text-white/50">Oracle sin medir todavía</p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
      <Cloud className="h-4 w-4 text-cyan-200/80" aria-hidden />
      <span className="font-medium">Oracle · Always Free</span>
      <span className="text-[10px] text-white/50">{v.estado.texto}</span>
      <span className="font-mono">{gasto ? gasto.valor : "—"}</span>
      {v.reclamacion && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${v.reclamacion.tono === "peligro" ? "bg-rose-400/20 text-rose-200" : v.reclamacion.tono === "aviso" ? "bg-amber-400/20 text-amber-200" : "bg-emerald-400/20 text-emerald-200"}`}>
          <TriangleAlert className="h-3 w-3" aria-hidden />
          {v.reclamacion.texto}
        </span>
      )}
      <a
        href="/genesis?pestana=metagenesis"
        className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[11px] text-cyan-100 hover:bg-cyan-400/20"
      >
        Ver en Consumo y créditos
      </a>
    </div>
  );
}
