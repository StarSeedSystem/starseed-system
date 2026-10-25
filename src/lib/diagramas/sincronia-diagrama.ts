/**
 * StarSeed OS — Diagramas · edición en grupo (Ola 1018D-N; contracto
 * architecture/diagramas.md §3.6). Por la sala viaja la ESPECIFICACIÓN
 * (tipo, nodos, aristas, textos y colores), nunca el HTML; cada neurona la
 * regenera con la skill MIT Diagram Design (vendor/habilidades/diagram-design/).
 * Los borrados viajan como lápidas del formato de `sincronia-sala.ts`, y la
 * fusión determinista de esa sala decide quién gana. Módulo PURO.
 */

import { fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";

/** Nodo del diagrama: cajita, círculo, rombo… con color y posición opcionales. */
export interface NodoDiagrama {
  id: string; etiqueta: string;
  forma?: string; color?: string;
  x?: number; y?: number;
}

/** Arista dirigida entre dos nodos, con etiqueta y color opcionales. */
export interface AristaDiagrama {
  id: string; fuente: string; destino: string;
  etiqueta?: string; color?: string;
}

/** Texto suelto del lienzo (nota, título, anotación), fuera de toda caja. */
export interface TextoDiagrama { id: string; texto: string; color?: string; }

/* La especificación que viaja por la sala: COMPLETA o DELTA (lo que no viene, no se
 * toca); los `*Eliminados` tumban elementos y la fusión los convierte en lápidas. */
export interface EspecificacionDiagrama {
  tipo: string;
  nodos: NodoDiagrama[];
  aristas: AristaDiagrama[];
  textos: TextoDiagrama[];
  nodosEliminados?: string[];
  aristasEliminadas?: string[];
  textosEliminados?: string[];
}

/** Prefijos de identidad de cada trozo del diagrama en el mapa de la sala. */
const PREF_NODO = "dg:nodo:";
const PREF_ARISTA = "dg:arista:";
const PREF_TEXTO = "dg:texto:";
export const ID_TIPO_DIAGRAMA = "dg:tipo"; // el tipo del diagrama: UNO por sala.

const cad = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** Lápida: el id queda, el contenido se tumba. */
const lapida = (id: string, autor: string, t: number): ElementoSala =>
  ({ id, tipo: "diagrama", datos: {}, actualizadoEn: t, porDispositivo: autor, borrado: true });

/** Convierte la especificación en elementos de sala listos para `fusionarEstados`. */
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama, autor: string, t: number,
): Record<string, ElementoSala> {
  const elementos: Record<string, ElementoSala> = {};
  const poner = (id: string, tipo: string, datos: Record<string, unknown>): void => {
    elementos[id] = { id, tipo, datos, actualizadoEn: t, porDispositivo: autor };
  };
  if (espec.tipo) poner(ID_TIPO_DIAGRAMA, "diagrama:tipo", { tipo: espec.tipo });
  for (const n of espec.nodos ?? []) poner(PREF_NODO + n.id, "diagrama:nodo", { ...n });
  for (const a of espec.aristas ?? []) poner(PREF_ARISTA + a.id, "diagrama:arista", { ...a });
  for (const x of espec.textos ?? []) poner(PREF_TEXTO + x.id, "diagrama:texto", { ...x });
  for (const id of espec.nodosEliminados ?? []) elementos[PREF_NODO + id] = lapida(PREF_NODO + id, autor, t);
  for (const id of espec.aristasEliminadas ?? []) elementos[PREF_ARISTA + id] = lapida(PREF_ARISTA + id, autor, t);
  for (const id of espec.textosEliminados ?? []) elementos[PREF_TEXTO + id] = lapida(PREF_TEXTO + id, autor, t);
  return elementos;
}

/** Recompone la especificación viva (sin lápidas ni eliminados) desde un estado. */
export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const espec: EspecificacionDiagrama = { tipo: "", nodos: [], aristas: [], textos: [] };
  for (const el of Object.values(estado?.elementos ?? {})) {
    if (el.borrado) continue; // lo tumbado ya no existe para la escena.
    const d = el.datos ?? {};
    if (el.id === ID_TIPO_DIAGRAMA) {
      espec.tipo = cad(d["tipo"]) ?? "";
    } else if (el.id.startsWith(PREF_NODO)) {
      const id = el.id.slice(PREF_NODO.length);
      if (!id) continue;
      const n: NodoDiagrama = { id, etiqueta: cad(d["etiqueta"]) ?? "" };
      const forma = cad(d["forma"]); if (forma) n.forma = forma;
      const color = cad(d["color"]); if (color) n.color = color;
      const x = num(d["x"]); if (x !== undefined) n.x = x;
      const y = num(d["y"]); if (y !== undefined) n.y = y;
      espec.nodos.push(n);
    } else if (el.id.startsWith(PREF_ARISTA)) {
      const id = el.id.slice(PREF_ARISTA.length);
      if (!id) continue;
      const a: AristaDiagrama = { id, fuente: cad(d["fuente"]) ?? "", destino: cad(d["destino"]) ?? "" };
      const etiqueta = cad(d["etiqueta"]); if (etiqueta) a.etiqueta = etiqueta;
      const color = cad(d["color"]); if (color) a.color = color;
      espec.aristas.push(a);
    } else if (el.id.startsWith(PREF_TEXTO)) {
      const id = el.id.slice(PREF_TEXTO.length);
      if (!id) continue;
      const x: TextoDiagrama = { id, texto: cad(d["texto"]) ?? "" };
      const color = cad(d["color"]); if (color) x.color = color;
      espec.textos.push(x);
    }
  }
  // Orden determinista por id: la misma escena se lee igual en cualquier neurona.
  const porId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  espec.nodos.sort(porId); espec.aristas.sort(porId); espec.textos.sort(porId);
  return espec;
}

/** Aplica la especificación de otro dispositivo sobre tu estado con la fusión de salas. */
export function fusionarEspecificacion(
  estado: EstadoSala, espec: EspecificacionDiagrama, autor: string, t: number, miDispositivo: string,
): { resultado: EstadoSala; conflictos: string[] } {
  const entrante: EstadoSala = {
    salaId: estado.salaId,
    elementos: elementosDeEspecificacion(espec, autor, t),
    reloj: Math.max(estado.reloj ?? 0, t),
  };
  return fusionarEstados(estado, entrante, miDispositivo);
}
