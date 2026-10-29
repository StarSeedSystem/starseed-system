/**
 * StarSeed OS — Diagramas · SINCRONÍA DE LA ESPECIFICACIÓN EN GRUPO (Ola 1018D).
 * Lo que viaja son la especificación (tipo, nodos, aristas, textos), nunca el HTML:
 * cada neurona regenera el mismo dibujo. Una arista borrada queda como LÁPIDA para
 * que no resucite al fusionar. Fusión determinista de `salas/sincronia-sala.ts`.
 * Basado en la skill MIT diagram-design (vendor/habilidades/diagram-design/),
 * citada en architecture/diagramas.md §3 y §4. PURO: sin red, disco ni reloj.
 */

import { fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";

export interface NodoDiagrama { id: string; etiqueta: string; forma?: string; color?: string }
export interface AristaDiagrama { id: string; fuente: string; destino: string; etiqueta: string }
export interface TextoDiagrama { id: string; contenido: string }
export interface EspecificacionDiagrama {
  id: string; tipo: string; nodos: NodoDiagrama[]; aristas: AristaDiagrama[]; textos: TextoDiagrama[];
}
export type ClaseElemento = "nodo" | "arista" | "texto";

const TIPO_META = "diagrama-meta";
const TIPO_NODO = "diagrama-nodo";
const TIPO_ARISTA = "diagrama-arista";
const TIPO_TEXTO = "diagrama-texto";
const PREFIJO: Record<ClaseElemento, string> = { nodo: "nodo:", arista: "arista:", texto: "texto:" };

function textoDe(valor: unknown): string { return typeof valor === "string" ? valor : ""; }
function opcionalDe(valor: unknown): string | undefined {
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}
function porId(a: { id: string }, b: { id: string }): number { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
function elemento(id: string, tipo: string, datos: Record<string, unknown>, autor: string, t: number): ElementoSala {
  return { id, tipo, datos, actualizadoEn: t, porDispositivo: autor };
}

/** Id original a partir del id de sala, sin depender de que el id no lleve «:». */
function idSinClase(el: ElementoSala): string {
  const prefijo = el.tipo === TIPO_NODO ? PREFIJO.nodo : el.tipo === TIPO_ARISTA ? PREFIJO.arista : el.tipo === TIPO_TEXTO ? PREFIJO.texto : "";
  return prefijo && el.id.startsWith(prefijo) ? el.id.slice(prefijo.length) : "";
}

function conDatos(
  estado: EstadoSala,
  id: string,
  autor: string,
  t: number,
  retoque: (datos: Record<string, unknown>) => Record<string, unknown>,
): EstadoSala {
  const actual = estado.elementos[id];
  if (!actual || actual.borrado) return estado;
  const nuevo = { ...actual, datos: retoque(actual.datos), actualizadoEn: t, porDispositivo: autor };
  return { ...estado, reloj: Math.max(estado.reloj, t), elementos: { ...estado.elementos, [id]: nuevo } };
}

export function elementosDeEspecificacion(espec: EspecificacionDiagrama, autor: string, t: number): ElementoSala[] {
  return [
    // El tipo del diagrama también viaja: sin él, la copia de otra neurona no sabe qué regenerar.
    elemento("meta", TIPO_META, { tipo: espec.tipo }, autor, t),
    ...espec.nodos.map((nodo) => elemento(PREFIJO.nodo + nodo.id, TIPO_NODO, { ...nodo }, autor, t)),
    ...espec.aristas.map((arista) => elemento(PREFIJO.arista + arista.id, TIPO_ARISTA, { ...arista }, autor, t)),
    ...espec.textos.map((texto) => elemento(PREFIJO.texto + texto.id, TIPO_TEXTO, { ...texto }, autor, t)),
  ].sort(porId);
}

export function estadoDeEspecificacion(espec: EspecificacionDiagrama, autor: string, t: number): EstadoSala {
  const elementos: Record<string, ElementoSala> = {};
  for (const el of elementosDeEspecificacion(espec, autor, t)) elementos[el.id] = el;
  return { salaId: espec.id, elementos, reloj: t };
}

export function especificacionDeEstado(estado: EstadoSala): EspecificacionDiagrama {
  const nodos: NodoDiagrama[] = [];
  const aristas: AristaDiagrama[] = [];
  const textos: TextoDiagrama[] = [];
  let tipo = "";
  for (const el of Object.values(estado.elementos ?? {})) {
    // Las lápidas no se dibujan, pero siguen en el estado para ganar futuras fusiones.
    if (el.borrado) continue;
    if (el.tipo === TIPO_META) { tipo = textoDe(el.datos.tipo); continue; }
    const id = idSinClase(el);
    if (!id) continue;
    if (el.tipo === TIPO_NODO) {
      nodos.push({ id, etiqueta: textoDe(el.datos.etiqueta), forma: opcionalDe(el.datos.forma), color: opcionalDe(el.datos.color) });
    } else if (el.tipo === TIPO_ARISTA) {
      aristas.push({ id, fuente: textoDe(el.datos.fuente), destino: textoDe(el.datos.destino), etiqueta: textoDe(el.datos.etiqueta) });
    } else if (el.tipo === TIPO_TEXTO) {
      textos.push({ id, contenido: textoDe(el.datos.contenido) });
    }
  }
  // Ordenadas por id: la misma especificación en todas las neuronas, byte a byte.
  return { id: estado.salaId, tipo, nodos: nodos.sort(porId), aristas: aristas.sort(porId), textos: textos.sort(porId) };
}

export function renombrarNodo(estado: EstadoSala, id: string, etiqueta: string, autor: string, t: number): EstadoSala {
  return conDatos(estado, PREFIJO.nodo + id, autor, t, (datos) => ({ ...datos, etiqueta }));
}

export function borrarElemento(estado: EstadoSala, clase: ClaseElemento, id: string, autor: string, t: number): EstadoSala {
  const clave = PREFIJO[clase] + id;
  const actual = estado.elementos[clave];
  if (!actual || actual.borrado) return estado;
  // Lápida: se conserva el elemento con `borrado` para que una copia vieja no lo resucite.
  const lapida = { ...actual, borrado: true, actualizadoEn: t, porDispositivo: autor };
  return { ...estado, reloj: Math.max(estado.reloj, t), elementos: { ...estado.elementos, [clave]: lapida } };
}

export function fusionarDiagramas(
  local: EstadoSala,
  remoto: EstadoSala,
  miDispositivo: string,
): { estado: EstadoSala; especificacion: EspecificacionDiagrama; conflictos: string[] } {
  const { resultado, conflictos } = fusionarEstados(local, remoto, miDispositivo);
  return { estado: resultado, especificacion: especificacionDeEstado(resultado), conflictos };
}
