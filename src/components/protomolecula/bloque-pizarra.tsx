"use client";

/**
 * Protomolécula · VENTANA DE PIZARRA (Ola 1010P · PM1010F2I).
 * Pinta la molécula dentro de un bloque de la pizarra y, debajo, una franja
 * informativa con las dependencias de sus aristas: «la salida de A alimenta a B».
 * Reutiliza el panel autónomo y el diagnóstico puro de convergencia; NO bloquea.
 */

import { useMemo } from "react";

import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import { almacenNavegador, cargarMolecula } from "@/lib/protomolecula/almacen-moleculas";
import { rutaDeConversion } from "@/lib/protomolecula/convertidores";
import {
  analizarConvergencia,
  type AtomoGrafo,
  type DefinicionAtomo,
} from "@/lib/protomolecula/grafo-convergencia";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import type { Molecula } from "@/lib/protomolecula/tipos";

import { PanelProtomoleculaAutonomo } from "./panel-protomolecula";
import { useMolecula } from "./use-molecula";

export interface BloquePizarraProtomoleculaProps {
  moleculaId: string;
  aristasEntrantes: CanvasEdge[];
  aristasSalientes: CanvasEdge[];
  /** Las demás ventanas del tablero, para nombrar cada arista y leer sus formatos. */
  ventanas?: CanvasBlock[];
}

export type EstadoArista = "directa" | "conversion" | "incompatible" | "sin-datos";

export interface DependenciaVentana {
  id: string;
  titulo: string;
  sentido: "recibe" | "alimenta";
  estado: EstadoArista;
  detalle?: string;
}

export interface FormatosVentana {
  entradas: string[];
  salidas: string[];
}

const unicos = (xs: string[]): string[] =>
  [...new Set(xs.map((x) => x.trim().toLowerCase().replace(/^\.+/, "")).filter((x) => x.length > 0))];

const definicion = (id: string, nombre: string, entradas: string[], salidas: string[]): DefinicionAtomo => ({
  herramientaId: id,
  nombre,
  categoria: "codigo",
  integracion: "libreria-js",
  control: "total",
  parametros: [],
  entradas,
  salidas,
});

export function formatosDeMolecula(
  m: { atomos: ReadonlyArray<{ herramientaId?: unknown }> } | null | undefined,
): FormatosVentana {
  const defs = (m?.atomos ?? [])
    .map((a) => (typeof a.herramientaId === "string" ? obtenerAtomo(a.herramientaId) : undefined))
    .filter((d): d is DefinicionAtomo => d !== undefined);
  return {
    entradas: unicos(defs.flatMap((d) => d.entradas)),
    salidas: unicos(defs.flatMap((d) => d.salidas)),
  };
}

function extensiones(valor: unknown): string[] {
  if (typeof valor !== "string") return [];
  const limpio = valor.split(/[?#]/)[0];
  const m = /\.([a-z0-9]{1,8})$/i.exec(limpio);
  return m ? [m[1].toLowerCase()] : [];
}

function formatosDeVentana(block: CanvasBlock | undefined): FormatosVentana {
  if (!block) return { entradas: [], salidas: [] };
  const d = (block.data ?? {}) as Record<string, unknown>;
  if (block.kind === "protomolecula" && typeof d.moleculaId === "string" && d.moleculaId) {
    try {
      const almacen = almacenNavegador();
      const m = almacen ? cargarMolecula(almacen, d.moleculaId) : null;
      if (m) return formatosDeMolecula(m);
    } catch {
      // Sin almacén no se puede leer la vecina: la franja lo dirá como «sin datos».
    }
  }
  if (block.kind === "image" || block.kind === "file") {
    return { entradas: [], salidas: unicos([...extensiones(d.fileName), ...extensiones(d.url)]) };
  }
  return { entradas: [], salidas: [] };
}

export function resumirDependencia(args: {
  id: string;
  titulo: string;
  sentido: "recibe" | "alimenta";
  vecina: CanvasBlock | undefined;
  propias: FormatosVentana;
}): DependenciaVentana {
  const base = { id: args.id, titulo: args.titulo, sentido: args.sentido };
  const vecina = formatosDeVentana(args.vecina);
  const salidas = args.sentido === "recibe" ? vecina.salidas : args.propias.salidas;
  const entradas = args.sentido === "recibe" ? args.propias.entradas : vecina.entradas;
  if (!salidas.length || !entradas.length) {
    return {
      ...base,
      estado: "sin-datos",
      detalle: "Falta saber qué formato produce o acepta una de las ventanas.",
    };
  }
  const defs = new Map<string, DefinicionAtomo>([
    ["origen", definicion("origen", "Ventana que produce", [], salidas)],
    ["destino", definicion("destino", "Ventana que recibe", entradas, [])],
  ]);
  const atomos: AtomoGrafo[] = [
    { id: "origen", herramientaId: "origen" },
    { id: "destino", herramientaId: "destino" },
  ];
  const d = analizarConvergencia(
    atomos,
    [{ de: "origen", a: "destino" }],
    (id) => defs.get(id),
    (de, a) => {
      const r = rutaDeConversion(de, a);
      return r ? [r.pasos[0]?.de ?? de, ...r.pasos.map((p) => p.a)] : null;
    },
  );
  if (d.incompatibles.length > 0) {
    return { ...base, estado: "incompatible", detalle: d.avisos[0] ?? "Formatos incompatibles." };
  }
  const conversion = d.conversiones[0];
  if (conversion) {
    return { ...base, estado: "conversion", detalle: conversion.ruta.map((f) => f.toUpperCase()).join(" → ") };
  }
  return { ...base, estado: "directa" };
}

export function BloquePizarraProtomolecula(props: BloquePizarraProtomoleculaProps) {
  return null;
}

export default BloquePizarraProtomolecula;
