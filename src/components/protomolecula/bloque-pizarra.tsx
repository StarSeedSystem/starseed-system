"use client";

import { useMemo } from "react";
import { PanelProtomoleculaAutonomo } from "@/components/protomolecula/panel-protomolecula";
import { analizarConvergencia, type Arista, type AtomoGrafo } from "@/lib/protomolecula/grafo-convergencia";
import { rutaDeConversion, normalizarFormato } from "@/lib/protomolecula/convertidores";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import type { CanvasEdge } from "@/lib/canvas/workcenters";

export interface BloquePizarraProtomoleculaProps {
  moleculaId: string;
  aristasEntrantes: CanvasEdge[];
  aristasSalientes: CanvasEdge[];
}

// Wrapper para adaptar rutaDeConversion al tipo RutaDe que espera analizarConvergencia
const rutaDeFormato: (de: string, a: string) => string[] | null = (de, a) => {
  const ruta = rutaDeConversion(de, a);
  if (!ruta) return null;
  return ruta.pasos.map((p) => `${normalizarFormato(p.de)} → ${normalizarFormato(p.a)}`);
};

export function BloquePizarraProtomolecula({
  moleculaId,
  aristasEntrantes,
  aristasSalientes,
}: BloquePizarraProtomoleculaProps) {
  const aristas: Arista[] = useMemo(() => [
    ...aristasEntrantes.map((e) => ({ de: e.from, a: e.to })),
    ...aristasSalientes.map((e) => ({ de: e.from, a: e.to })),
  ], [aristasEntrantes, aristasSalientes]);

  const atomos: AtomoGrafo[] = useMemo(() => {
    const ids = new Set<string>();
    aristas.forEach((a) => { ids.add(a.de); ids.add(a.a); });
    return [...ids].map((id) => {
      const atomo = obtenerAtomo(id);
      return { id, herramientaId: atomo?.herramientaId ?? "desconocido" };
    });
  }, [aristas]);

  const diagnostico = useMemo(() => {
    if (atomos.length === 0 || aristas.length === 0) return null;
    return analizarConvergencia(atomos, aristas, obtenerAtomo, rutaDeFormato);
  }, [atomos, aristas]);

  const convergenciaInfo = useMemo(() => {
    if (!diagnostico) return { recibeDe: [] as string[], alimentaA: [] as string[], avisos: [] as string[] };
    const recibeDe = aristasEntrantes.map((e) => e.from);
    const alimentaA = aristasSalientes.map((e) => e.to);
    const avisos: string[] = [];
    if (diagnostico.incompatibles.length > 0) {
      diagnostico.incompatibles.forEach((inc) => {
        const ruta = rutaDeConversion(
          inc.salidas[0] ?? "",
          inc.entradas[0] ?? ""
        );
        if (ruta) {
          const pasos = ruta.pasos.map((p) => `${normalizarFormato(p.de)} → ${normalizarFormato(p.a)}`).join(" → ");
          avisos.push(`Incompatible: ${inc.arista.de} → ${inc.arista.a} (ruta: ${pasos})`);
        } else {
          avisos.push(`Incompatible: ${inc.arista.de} → ${inc.arista.a} (sin conversor)`);
        }
      });
    }
    if (diagnostico.conversiones.length > 0) {
      diagnostico.conversiones.forEach((conv) => {
        const pasos = conv.ruta.join(" → ");
        avisos.push(`Conversión necesaria: ${conv.arista.de} → ${conv.arista.a} (${pasos})`);
      });
    }
    return { recibeDe, alimentaA, avisos };
  }, [diagnostico, aristasEntrantes, aristasSalientes]);

  return (
    <div className="flex flex-col h-full w-full gap-2">
      <PanelProtomoleculaAutonomo compacto moleculaId={moleculaId} />
      <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
        <div className="grid grid-cols-2 gap-1 mb-1">
          <div>
            <span className="text-white/50">Recibe de: </span>
            <span className="text-white/80">
              {convergenciaInfo.recibeDe.length > 0
                ? convergenciaInfo.recibeDe.join(", ")
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-white/50">Alimenta a: </span>
            <span className="text-white/80">
              {convergenciaInfo.alimentaA.length > 0
                ? convergenciaInfo.alimentaA.join(", ")
                : "—"}
            </span>
          </div>
        </div>
        {convergenciaInfo.avisos.length > 0 && (
          <div className="border-t border-white/10 pt-1 space-y-0.5">
            {convergenciaInfo.avisos.map((aviso, i) => (
              <div key={i} className="text-amber-200/80">{aviso}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}