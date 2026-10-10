"use client";

import { useConsumoOracle } from "./medidor-consumo";
import { vistaOracle } from "@/lib/mando/oracle-consumo-tipos";
import { Cloud, TriangleAlert } from "lucide-react";

export default function OracleConsumoResumen() {
  const { datos } = useConsumoOracle();

  if (!datos) {
    return <p className="text-white/50">Oracle sin medir todavía</p>;
  }

  const vista = vistaOracle(datos, Date.now());
  const estadoTexto = vista.estado.texto;

  // Buscar la fila de gasto
  const gastoFila = vista.filas.find((fila) => fila.id === "gasto");
  const gastoValor = gastoFila ? gastoFila.valor : "—";

  // Texto de reclamación si existe
  const reclamacionTexto = vista.reclamacion?.texto ?? null;

  return (
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <div className="text-white/60">
        {estadoTexto} - {gastoValor}
        {reclamacionTexto ? ` - ${reclamacionTexto}` : ""}
      </div>
      <a
        href="/genesis?pestana=metagenesis"
        className="ml-auto cursor-pointer flex items-center gap-1 text-white/70 hover:text-white"
      >
        <Cloud className="h-3 w-3" aria-hidden />
        Ver en Consumo y créditos
        <TriangleAlert className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );
}