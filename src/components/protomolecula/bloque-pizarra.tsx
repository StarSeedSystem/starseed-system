"use client";

/**
 * Protomolécula · VENTANA DE PIZARRA. El bloque CITA una molécula (`moleculaId`),
 * no la copia. La franja inferior enseña sus dependencias (`CanvasEdge`) y avisa,
 * sin bloquear, de las conversiones que pide cada arista.
 */
import { blockKindDef, type CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import { rutaDeConversion } from "@/lib/protomolecula/convertidores";
import { analizarConvergencia, type Arista, type AtomoGrafo } from "@/lib/protomolecula/grafo-convergencia";
import type { DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";

import { PanelProtomoleculaAutonomo } from "./panel-protomolecula";

export interface ExtremoVentana {
  id: string; nombre: string; herramientaId?: string; entradas?: string[]; salidas?: string[];
}

/** Arista entre ventanas: «la salida de `de` alimenta a `a`». */
export interface AristaPizarra { id: string; de: ExtremoVentana; a: ExtremoVentana }

export type DiagnosticoArista =
  | { estado: "directa" }
  | { estado: "conversion"; ruta: string[] }
  | { estado: "incompatible"; motivo: string }
  | { estado: "sin-datos"; motivo: string };

export interface BloquePizarraProtomoleculaProps {
  moleculaId: string; aristasEntrantes: AristaPizarra[]; aristasSalientes: AristaPizarra[];
}

const texto = (x: unknown): x is string => typeof x === "string" && x.trim().length > 0;

const lista = (x: unknown): string[] | undefined => {
  if (!Array.isArray(x)) return undefined;
  const formatos = x.filter(texto).map((f) => f.trim().toLowerCase());
  return formatos.length > 0 ? formatos : undefined;
};

const extremoDe = (bloque: CanvasBlock): ExtremoVentana => {
  const d = (bloque.data ?? {}) as Record<string, unknown>;
  return { id: bloque.id, nombre: bloque.title || blockKindDef(bloque.kind)?.label || bloque.kind,
    herramientaId: texto(d.herramientaId) ? d.herramientaId : undefined,
    entradas: lista(d.entradas), salidas: lista(d.salidas) };
};

/** Traduce las aristas del tablero a extremos con nombre y formatos declarados. */
export function aristasDePizarra(edges: readonly CanvasEdge[], bloques: readonly CanvasBlock[]): AristaPizarra[] {
  const porId = new Map(bloques.map((b) => [b.id, b]));
  return edges.flatMap((edge) => {
    const de = porId.get(edge.from), a = porId.get(edge.to);
    return de && a ? [{ id: edge.id, de: extremoDe(de), a: extremoDe(a) }] : [];
  });
}

const definicionDe = (extremos: readonly ExtremoVentana[]) => (herramientaId: string): DefinicionAtomo | undefined => {
  const e = extremos.find((x) => (x.herramientaId ?? x.id) === herramientaId);
  if (!e?.entradas || !e.salidas) return undefined;
  return { herramientaId, nombre: e.nombre, categoria: "codigo", integracion: "libreria-js",
    control: "ventana", parametros: [], entradas: e.entradas, salidas: e.salidas };
};

/** Una arista: directa, con ruta de conversión, sin conversor o sin datos de formato. */
export function diagnosticarArista({ de, a }: AristaPizarra): DiagnosticoArista {
  if (!de.salidas || !a.entradas) {
    return { estado: "sin-datos", motivo: "Alguna ventana no declara sus formatos." };
  }
  const atomos: AtomoGrafo[] = [{ id: de.id, herramientaId: de.herramientaId ?? de.id },
    { id: a.id, herramientaId: a.herramientaId ?? a.id }];
  const aristas: Arista[] = [{ de: de.id, a: a.id }];
  const diagnostico = analizarConvergencia(atomos, aristas, definicionDe([de, a]), (origen, destino) => {
    const ruta = rutaDeConversion(origen, destino);
    return ruta ? [origen, ...ruta.pasos.map((paso) => paso.a)] : null;
  });
  if (diagnostico.incompatibles.length > 0) {
    return { estado: "incompatible", motivo: diagnostico.avisos[0] ?? "No hay conversor conocido." };
  }
  const conversion = diagnostico.conversiones[0];
  return conversion ? { estado: "conversion", ruta: conversion.ruta } : { estado: "directa" };
}

const estadoDe = (d: DiagnosticoArista): [string, string] => {
  if (d.estado === "conversion") return [`Necesita conversión: ${d.ruta.join(" → ")}`, "text-amber-300"];
  if (d.estado === "incompatible") return [`Sin conversor: ${d.motivo}`, "text-rose-300"];
  return d.estado === "directa" ? ["Formato compatible", "text-emerald-300/80"] : ["Formato sin declarar", "text-white/40"];
};

function FilaArista({ direccion, vecino, arista }: {
  direccion: "Recibe de" | "Alimenta a"; vecino: ExtremoVentana; arista: AristaPizarra;
}) {
  const [detalle, clase] = estadoDe(diagnosticarArista(arista));
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-white/70">{direccion} «{vecino.nombre}»</span>
      <span className={clase} title={detalle}>{detalle}</span>
    </li>
  );
}

export function BloquePizarraProtomolecula({ moleculaId, aristasEntrantes, aristasSalientes }: BloquePizarraProtomoleculaProps) {
  const hay = aristasEntrantes.length + aristasSalientes.length > 0;
  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelProtomoleculaAutonomo compacto moleculaId={moleculaId || undefined} />
      </div>
      <div className="shrink-0 border-t border-white/10 px-2 py-1.5 text-[10px]">
        {hay ? (
          <ul className="space-y-0.5" aria-label="Dependencias de la ventana">
            {aristasEntrantes.map((a) => <FilaArista key={a.id} direccion="Recibe de" vecino={a.de} arista={a} />)}
            {aristasSalientes.map((a) => <FilaArista key={a.id} direccion="Alimenta a" vecino={a.a} arista={a} />)}
          </ul>
        ) : <p className="text-white/40">Sin conexiones. Pulsa «Conectar» para unirla con otra ventana.</p>}
      </div>
    </div>
  );
}
