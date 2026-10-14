/**
 * Protomolécula · GRAFO DE CONVERGENCIA. Módulo PURO: sin React, sin red, sin efectos.
 * Contrato: architecture/protomolecula.md §11.1.
 */
import type { DefinicionAtomo } from "./registro-atomos";

/** Átomo → átomo: la salida de `de` alimenta a `a`; en una pizarra es una CanvasEdge entre ventanas. */
export interface Arista { de: string; a: string }

export interface Diagnostico {
  ok: boolean;
  /** Orden topológico estable; si hay ciclos, solo contiene lo ordenable. */
  orden: string[];
  /** Ids de cada ciclo. */
  ciclos: string[][];
  conversiones: { arista: Arista; ruta: string[] }[];
  incompatibles: { arista: Arista; salidas: string[]; entradas: string[] }[];
  avisos: string[];
}

/** «.PNG» → «png». */
export function normalizarFormato(formato: string): string {
  return formato.toLowerCase().replace(/^\./, "");
}

export function analizarConvergencia(
  atomos: { id: string; herramientaId: string }[],
  aristas: Arista[],
  definicion: (herramientaId: string) => DefinicionAtomo | undefined,
  rutaDe: (de: string, a: string) => string[] | null,
): Diagnostico {
  const defs = new Map<string, DefinicionAtomo | undefined>();
  for (const a of atomos) defs.set(a.id, definicion(a.herramientaId));

  const conversiones: Diagnostico["conversiones"] = [];
  const incompatibles: Diagnostico["incompatibles"] = [];
  const avisos: string[] = [];

  for (const arista of aristas) {
    const de = defs.get(arista.de);
    const a = defs.get(arista.a);
    if (!de || !a) {
      const cual = !de? arista.de : arista.a;
      incompatibles.push({ arista, salidas: [], entradas: [] });
      avisos.push(`El átomo «${cual}» no está declarado en la molécula.`);
      continue;
    }
    if (a.entradas.length === 0) {
      incompatibles.push({ arista, salidas: [], entradas: [] });
      avisos.push(`La herramienta ${a.nombre} no recibe archivos.`);
      continue;
    }
    const entradas = a.entradas.map(normalizarFormato);
    const salidas = de.salidas.map(normalizarFormato);
    const directa = salidas.find((s) => entradas.includes(s));
    if (directa) continue;
    let ruta: string[] | null = null;
    for (const s of salidas) {
      for (const e of entradas) {
        ruta = rutaDe(s, e);
        if (ruta) break;
      }
      if (ruta) break;
    }
    if (ruta) conversiones.push({ arista, ruta });
    else incompatibles.push({ arista, salidas, entradas });
  }

  const ids = atomos.map((a) => a.id);
  const ciclos = encontrarCiclos(ids, aristas);
  const orden = ordenTopologico(ids, aristas);
  const ok = ciclos.length === 0;
  return { ok, orden, ciclos, conversiones, incompatibles, avisos };
}