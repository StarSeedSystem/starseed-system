/**
 * DGM1018N · Ola 1018D — Edición en grupo de diagramas en tiempo real
 * (contrato architecture/diagramas.md §3-6, tarea N).
 *
 * Entre las neuronas NO viaja el HTML: viaja la ESPECIFICACIÓN del diagrama
 * (tipo, nodos, aristas, grupos, textos), una entidad de sala por pieza —
 * regla del área: el contenido es una entidad única y se referencia, nunca se
 * duplica. Cada neurona regenera su HTML local y lo muestra solo en iframe
 * sandbox (aislar-diagrama). La fusión es la MISMA de las salas
 * (`fusionarEstados`, determinista): dos personas renombrando nodos distintos
 * a la vez y una borrando una arista convergen al mismo diagrama fusionen en
 * el orden que fusionen. Módulo PURO: sin red, sin disco, sin reloj.
 */

import { fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";
import type { ResultadoDiagrama } from "./importar";

/** Especificación editable del diagrama: la que regenera el HTML en cada neurona. */
export interface EspecificacionDiagrama extends ResultadoDiagrama {
  /** Slug de la skill diagram-design («architecture», «sankey», «flowchart»…). */
  tipo: string;
}

// Prefijos de id: el id de sala referencia la entidad, no la duplica.
const PREFIJO_NODO = "nodo:";
const PREFIJO_ARISTA = "arista:";
const PREFIJO_TEXTO = "texto:";
const PREFIJO_GRUPO = "grupo:";
/** El tipo de diagrama es también una pieza: lo cambiaron con la última edición. */
const ID_TIPO = "diagrama:tipo";
/** Falta de tipo explícito: el más general de la skill. */
const TIPO_DEFECTO = "flowchart";

/** Una pieza nueva de sala, con su autor y su marca de tiempo. */
function pieza(
  id: string,
  tipo: string,
  datos: Record<string, unknown>,
  autor: string,
  t: number,
  borrado = false,
): ElementoSala {
  return {
    id, tipo, datos, actualizadoEn: t, porDispositivo: autor,
    ...(borrado ? { borrado: true } : {}),
  };
}

/** Los miembros de un grupo y los campos de texto: cadena o nada. */
function cadena(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}
function listaNodos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.map((v) => (typeof v === "string" ? v : String(v))) : [];
}

/** Descompone la especificación en entidades de sala: una por tipo, nodo, arista, grupo y texto. */
export function elementosDeEspecificacion(
  espec: EspecificacionDiagrama,
  autor: string,
  t: number,
): Record<string, ElementoSala> {
  const elementos: Record<string, ElementoSala> = {
    [ID_TIPO]: pieza(ID_TIPO, "diagrama", { tipo: espec.tipo ?? TIPO_DEFECTO }, autor, t),
  };
  for (const n of espec.nodos ?? []) {
    elementos[PREFIJO_NODO + n.id] = pieza(PREFIJO_NODO + n.id, "nodo", {
      etiqueta: n.etiqueta,
      forma: n.forma ?? "",
    }, autor, t);
  }
  for (const a of espec.aristas ?? []) {
    elementos[PREFIJO_ARISTA + a.id] = pieza(PREFIJO_ARISTA + a.id, "arista", {
      fuente: a.fuente,
      destino: a.destino,
      etiqueta: a.etiqueta,
    }, autor, t);
  }
  (espec.grupos ?? []).forEach((g) => {
    elementos[PREFIJO_GRUPO + g.id] = pieza(PREFIJO_GRUPO + g.id, "grupo", {
      etiqueta: g.etiqueta,
      nodos: [...g.nodos],
    }, autor, t);
  });
  (espec.textos ?? []).forEach((valor, i) => {
    const id = `${PREFIJO_TEXTO}${i}`;
    elementos[id] = pieza(id, "texto", { valor }, autor, t);
  });
  return elementos;
}

/** Índice numérico de una pieza «texto:<i>»; lo no numérico cae al principio. */
function indiceDe(id: string): number {
  const n = Number(id.slice(PREFIJO_TEXTO.length));
  return Number.isFinite(n) ? n : 0;
}

/** Recompone la especificación desde el estado de la sala (fusionando con un estado remoto si llega). */
export function especificacionDeEstado(
  estado: EstadoSala,
  remoto?: EstadoSala,
  miDispositivo?: string,
): EspecificacionDiagrama {
  const fusion = remoto && miDispositivo
    ? fusionarEstados(estado, remoto, miDispositivo).resultado
    : estado;
  const nodos: { id: string; etiqueta: string; forma: string }[] = [];
  const aristas: { id: string; fuente: string; destino: string; etiqueta: string }[] = [];
  const grupos: { id: string; etiqueta: string; nodos: string[] }[] = [];
  const textos: { i: number; valor: string }[] = [];
  let tipo = TIPO_DEFECTO;

  for (const [id, el] of Object.entries(fusion.elementos ?? {})) {
    if (el.borrado) continue; // una lápida ya no es diagrama: la pieza se quitó.
    const datos = el.datos ?? {};
    if (id === ID_TIPO) {
      if (typeof datos.tipo === "string") tipo = datos.tipo;
    } else if (id.startsWith(PREFIJO_NODO)) {
      nodos.push({
        id: id.slice(PREFIJO_NODO.length),
        etiqueta: cadena(datos.etiqueta),
        forma: cadena(datos.forma),
      });
    } else if (id.startsWith(PREFIJO_ARISTA)) {
      aristas.push({
        id: id.slice(PREFIJO_ARISTA.length),
        fuente: cadena(datos.fuente),
        destino: cadena(datos.destino),
        etiqueta: cadena(datos.etiqueta),
      });
    } else if (id.startsWith(PREFIJO_GRUPO)) {
      grupos.push({
        id: id.slice(PREFIJO_GRUPO.length),
        etiqueta: cadena(datos.etiqueta),
        nodos: listaNodos(datos.nodos),
      });
    } else if (id.startsWith(PREFIJO_TEXTO)) {
      textos.push({ i: indiceDe(id), valor: cadena(datos.valor) });
    }
  }

  // Orden determinista: todas las neuronas componen la misma lista de piezas.
  nodos.sort((x, y) => x.id.localeCompare(y.id));
  aristas.sort((x, y) => x.id.localeCompare(y.id));
  grupos.sort((x, y) => x.id.localeCompare(y.id));
  textos.sort((x, y) => x.i - y.i);
  return { tipo, nodos, aristas, grupos, textos: textos.map((tp) => tp.valor) };
}
