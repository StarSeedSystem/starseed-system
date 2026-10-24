"use client";

/**
 * Protomolécula · BLOQUE DE PIZARRA. Ventana `protomolecula` del tablero (canvas-board, motor «starseed»):
 * CITA una molécula del almacén con su id (Entidad Única: el bloque solo guarda `{moleculaId}`) y monta el
 * panel autónomo compacto. Debajo, una FRANJA INFORMATIVA (nunca bloquea) con el grafo de convergencia
 * (F2A) y los convertidores (F2B): «Recibe de…», «Alimenta a…», y las aristas que piden conversión
 * (ruta OBJ → glTF) o no tienen arreglo.
 */
import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { blockKindDef, type CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";
import { analizarConvergencia, type AtomoGrafo, type Arista } from "@/lib/protomolecula/grafo-convergencia";
import { rutaDeConversion } from "@/lib/protomolecula/convertidores";
import { obtenerAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import { esMoleculaValidaNucleo } from "@/lib/protomolecula/bloque-protomolecula";
import { controladorActivo } from "@/lib/protomolecula/controlador-activo";
import { cargarMolecula, almacenNavegador } from "@/lib/protomolecula/almacen-moleculas";
import type { Molecula } from "@/lib/protomolecula/tipos";
import { PanelProtomoleculaAutonomo } from "./panel-protomolecula";
export interface VentanaArista { id: string; otraId: string; otraTitulo: string; otraMoleculaId: string }
export interface TablaPizarra { bloques: CanvasBlock[]; aristas: CanvasEdge[] }
export interface BloquePizarraProps { moleculaId: string; aristasEntrantes: VentanaArista[]; aristasSalientes: VentanaArista[] }
/** Pide conversión (con el camino de formatos) o no tiene arreglo; sin marca = encaja directa. */
export type MarcaArista = { tipo: "conversion"; ruta: string[] } | { tipo: "incompatible" };

/** Aristas del tablero que tocan al bloque, enriquecidas con los datos de la otra ventana. */
export function aristasDeBloque(tabla: TablaPizarra, blockId: string): { entrantes: VentanaArista[]; salientes: VentanaArista[] } {
  const otra = (otroId: string, aristaId: string): VentanaArista => {
    const bloque = tabla.bloques.find((b) => b.id === otroId);
    const datos = bloque?.data ?? {};
    const cita = typeof datos.moleculaId === "string" ? datos.moleculaId : "";
    const titulo = (bloque?.title && bloque.title.trim()) || blockKindDef(bloque?.kind ?? "text")?.label || otroId;
    return { id: aristaId, otraId: otroId, otraTitulo: titulo, otraMoleculaId: cita };
  };
  return {
    entrantes: tabla.aristas.filter((e) => e.to === blockId).map((e) => otra(e.from, e.id)),
    salientes: tabla.aristas.filter((e) => e.from === blockId).map((e) => otra(e.to, e.id)),
  };
}

/** La molécula como átomo del grafo: unión de formatos de SUS átomos activos ya registrados. */
function defDeMolecula(m: Molecula): DefinicionAtomo | null {
  const defs = m.atomos.filter((a) => a.estado === "activo").flatMap((a) => obtenerAtomo(a.herramientaId) ?? []);
  const entradas = [...new Set(defs.flatMap((d) => d.entradas))];
  const salidas = [...new Set(defs.flatMap((d) => d.salidas))];
  if (entradas.length === 0 && salidas.length === 0) return null;
  return { herramientaId: m.id, nombre: m.titulo || m.id, categoria: "codigo", integracion: "libreria-js",
    control: "total", parametros: [], entradas, salidas };
}
/** Marca por id de CanvasEdge: analizarConvergencia (F2A) con rutaDeConversion (F2B). Pura. */
export function marcasDeAristas(moleculaId: string, entrantes: VentanaArista[], salientes: VentanaArista[],
  moleculaDe: (id: string) => Molecula | null): Record<string, MarcaArista> {
  const marcas: Record<string, MarcaArista> = {};
  const defs = new Map<string, DefinicionAtomo>();
  const ids: string[] = [];
  for (const id of [moleculaId, ...[...entrantes, ...salientes].map((a) => a.otraMoleculaId)]) {
    if (!id || ids.includes(id)) continue;
    const m = moleculaDe(id);
    const def = m && esMoleculaValidaNucleo(m) ? defDeMolecula(m) : null;
    if (def) { defs.set(id, def); ids.push(id); }
  }
  // Una arista solo se evalúa si las DOS ventanas exponen formatos; si no, queda a secas.
  const pares = new Map<string, string>(); // «molécula>molécula» → id de la CanvasEdge (la primera gana)
  const registrar = (aristaId: string, de: string, a: string): void => {
    const clave = `${de}>${a}`;
    if (de !== a && defs.has(de) && defs.has(a) && !pares.has(clave)) pares.set(clave, aristaId);
  };
  entrantes.forEach((a) => registrar(a.id, a.otraMoleculaId, moleculaId));
  salientes.forEach((a) => registrar(a.id, moleculaId, a.otraMoleculaId));
  if (pares.size === 0) return marcas;
  const atomos: AtomoGrafo[] = ids.map((id) => ({ id, herramientaId: id }));
  const aristasGrafo: Arista[] = [...pares.keys()].map((clave) => ({ de: clave.split(">")[0], a: clave.split(">")[1] }));
  const rutaFormato = (de: string, a: string): string[] | null => {
    const ruta = rutaDeConversion(de, a);
    return !ruta ? null : ruta.pasos.length === 0 ? [de] : [de, ...ruta.pasos.map((paso) => paso.a)];
  };
  const diag = analizarConvergencia(atomos, aristasGrafo, (h) => defs.get(h), rutaFormato);
  for (const { arista, ruta } of diag.conversiones) { const id = pares.get(`${arista.de}>${arista.a}`); if (id) marcas[id] = { tipo: "conversion", ruta }; }
  for (const { arista } of diag.incompatibles) { const id = pares.get(`${arista.de}>${arista.a}`); if (id) marcas[id] = { tipo: "incompatible" }; }
  return marcas;
}
/** Molécula viva (controlador de su sesión abierta) o guardada en el almacén local; solo forma del núcleo. */
export function moleculaNucleoDe(id: string): Molecula | null {
  const viva = controladorActivo(id)?.obtener().molecula;
  if (viva && esMoleculaValidaNucleo(viva)) return viva;
  try {
    const almacen = almacenNavegador();
    const guardada = almacen ? cargarMolecula(almacen, id) : null;
    return guardada && esMoleculaValidaNucleo(guardada) ? guardada : null;
  } catch { return null; }
}

export function BloquePizarraProtomolecula({ moleculaId, aristasEntrantes, aristasSalientes }: BloquePizarraProps) {
  const [marcas, setMarcas] = useState<Record<string, MarcaArista>>({});
  useEffect(() => {
    setMarcas(marcasDeAristas(moleculaId, aristasEntrantes, aristasSalientes, moleculaNucleoDe));
  }, [moleculaId, aristasEntrantes, aristasSalientes]); // tras montar: almacén y controladores, en cliente
  const fila = (texto: string, arista: VentanaArista, icono: "recibe" | "alimenta", clave: string) => {
    const marca = marcas[arista.id];
    return (
      <li key={clave} className="flex items-start gap-1">
        {icono === "recibe"
          ? <ArrowDownToLine className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
          : <ArrowUpFromLine className="mt-0.5 h-3 w-3 shrink-0 text-fuchsia-300" />}
        <span className="text-white/70">{texto}
          {marca?.tipo === "conversion" && <span className="ml-1 text-amber-200">conversión: {marca.ruta.join(" → ")}</span>}
          {marca?.tipo === "incompatible" && <span className="ml-1 text-red-300">no encaja: sin conversor</span>}
        </span>
      </li>
    );
  };
  const vacias = aristasEntrantes.length === 0 && aristasSalientes.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelProtomoleculaAutonomo compacto moleculaId={moleculaId} />
      </div>
      {vacias
        ? <p className="shrink-0 border-t border-white/10 px-2 py-1.5 text-[10px] italic text-white/35">Sin conexiones: une ventanas con «Conectar bloques».</p>
        : <ul className="shrink-0 space-y-0.5 border-t border-white/10 px-2 py-1.5 text-[10px] leading-4">
            {aristasEntrantes.map((a, i) => fila(`Recibe de ${a.otraTitulo}`, a, "recibe", `r-${i}`))}
            {aristasSalientes.map((a, i) => fila(`Alimenta a ${a.otraTitulo}`, a, "alimenta", `s-${i}`))}
          </ul>}
    </div>
  );
}
