"use client";

import { useMemo } from "react";
import { PanelProtomoleculaAutonomo } from "./panel-protomolecula";
import { analizarConvergencia, type Arista, type Diagnostico } from "@/lib/protomolecula/grafo-convergencia";
import { rutaDeConversion } from "@/lib/protomolecula/convertidores";
import { type CanvasEdge } from "@/lib/canvas/workcenters";

interface BloquePizarraProtomoleculaProps {
  moleculaId: string;
  aristasEntrantes: CanvasEdge[];
  aristasSalientes: CanvasEdge[];
}

export function BloquePizarraProtomolecula({
  moleculaId,
  aristasEntrantes,
  aristasSalientes,
}: BloquePizarraProtomoleculaProps) {
  // We need to build a graph of the current block and the connected blocks.
  // However, we don't have the moleculeId of the connected blocks.
  // For now, we'll just show the panel and a placeholder for the status.
  // TODO: Implement convergence analysis when we have the connected blocks' moleculeIds.

  // Placeholder for the status text
  const estadoTexto = useMemo(() => {
    // We would normally compute the diagnostics here.
    // For now, return a static message.
    return `Recibe de ${aristasEntrantes.length} bloque(s), alimenta a ${aristasSalientes.length} bloque(s).`;
  }, [aristasEntrantes.length, aristasSalientes.length]);

  return (
    <div className="space-y-2">
      <PanelProtomoleculaAutonomo compacto moleculaId={moleculaId} />
      <div className="text-xs text-white/50">{estadoTexto}</div>
    </div>
  );
}