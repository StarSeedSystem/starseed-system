"use client";

import { Cloud, Server, TriangleAlert } from "lucide-react";
import { useConsumoOracle } from "./medidor-consumo";
import { vistaOracle } from "@/lib/mando/oracle-consumo-tipos";
import type { TonoConsumo } from "@/lib/mando/consumo-tipos";

/** El mismo mapa de tonos para la insignia de reclamación y el chip del nodo. */
function claseTono(tono: TonoConsumo): string {
  if (tono === "peligro") return "bg-rose-400/20 text-rose-200";
  if (tono === "aviso") return "bg-amber-400/20 text-amber-200";
  // «sin medir» no es «todo bien»: en gris, no en verde (p. ej. «Sin métricas de uso»)
  if (tono === "neutro") return "bg-white/10 text-white/60";
  return "bg-emerald-400/20 text-emerald-200";
}

export default function OracleConsumoResumen() {
  const { datos } = useConsumoOracle();
  const v = datos ? vistaOracle(datos, Date.now()) : null;
  const gasto = v?.filas.find((f) => f.id === "gasto");
  // El estado real del servidor (servicios caídos, guardián en rojo, sin latido) llega en los mismos
  // datos del medidor: solo hay chip si el medidor trae nodo (nada inventado, ninguna petición nueva).
  const nodo = v?.filas.find((f) => f.id === "nodo");

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
      {nodo && (
        <span
          data-testid="oracle-resumen-nodo"
          title={nodo.detalle}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${claseTono(nodo.tono)}`}
        >
          <Server className="h-3 w-3" aria-hidden />
          {`Nodo A1 · ${nodo.valor}`}
        </span>
      )}
      {v.reclamacion && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${claseTono(v.reclamacion.tono)}`}>
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
