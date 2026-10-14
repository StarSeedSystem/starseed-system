/** Protomolécula · CONVERGENCIA EN PIZARRAS (F2I). Puro: sin React, sin node:*. */
import { analizarConvergencia, type Arista, type Diagnostico } from "./grafo-convergencia";
import { rutaDeConversion } from "./convertidores";
import { getEdges, type CanvasEdge } from "@/lib/canvas/workcenters";
import type { Canvas, CanvasBlock } from "@/lib/canvas/canvas";

function aristasDeEdges(edges: CanvasEdge[]): Arista[] {
  return edges.map((e) => ({ de: e.from, a: e.to }));
}

export function analizarConvergenciaCanvas(
  canvas: Canvas,
  definicion: (herramientaId: string) => import("./registro-atomos").DefinicionAtomo | undefined,
): Diagnostico {
  const bloques = (canvas.blocks ?? []) as (CanvasBlock & { herramientaId?: string })[];
  const atomos = bloques.map((b) => ({
    id: b.id,
    herramientaId: b.herramientaId || b.kind || b.id,
  }));
  const aristas = aristasDeEdges(getEdges(canvas));
  return analizarConvergencia(atomos, aristas, definicion, (de, a) => {
    const r = rutaDeConversion(de, a);
    return r ? r.pasos.map((p) => p.nombre) : null;
  });
}
