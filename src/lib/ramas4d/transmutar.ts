/**
 * Ramas 4D — transmutar (módulo PURO).
 * Pide a `src/lib/conversion` otra forma del mismo contenido y la cuelga como
 * rama hermana con arista «transmuta». Si el formato no se puede convertir, lo
 * dice con honestidad y no inventa. Contrato: `architecture/multiverso-5d.md`.
 */

import type { DestinosFormato } from '@/lib/conversion/formatos';
import {
  esFormatoValido,
  etiquetaFormato,
  formatoDe,
  nombreDeSalida,
  ordenarDestinos,
} from '@/lib/conversion/formatos';
import { enlaceConversor } from '@/lib/conversion/cliente';
import type { Grafo4D, Nodo } from './modelo';
import { anadirArista, anadirNodo } from './modelo';
import { clonarGrafo } from './edicion';

export interface OpcionesTransmutar {
  ahora?: number;
  idNuevo?: string;
  /** Referencia que devolvió la conversión real; sin ella se enlaza al conversor. */
  refSalida?: string;
  capas?: string[];
  etiquetas?: string[];
}

export interface SolicitudTransmutar {
  nodoOrigenId: string;
  formatoDestino: string;
  nombreSalida: string;
}

export interface ResultadoTransmutar {
  ok: boolean;
  motivo?: string;
  grafo: Grafo4D;
  nodoId?: string;
}

export function destinosDisponibles(origen: string, destinos: DestinosFormato | null): string[] {
  if (!destinos) return [];
  return ordenarDestinos(destinos.destinos, origen);
}

export function motivoNoTransmutable(
  origen: string,
  destino: string,
  destinos: DestinosFormato | null,
): string | null {
  const o = formatoDe(origen);
  const d = formatoDe(destino) || destino;
  if (!o) return 'No reconozco el formato del contenido de origen.';
  if (!esFormatoValido(d)) return 'Ese formato de destino no es válido.';
  if (o === d) return 'El contenido ya está en ese formato.';
  if (!destinos) {
    return 'No sé a qué formatos puede pasar este contenido en este medio; no me lo invento.';
  }
  if (destinos.destinos.includes(d)) return null;
  if (destinos.conMotor.includes(d)) {
    return `Convertir a ${etiquetaFormato(d)} necesita un motor opcional que esta neurona no tiene.`;
  }
  return `No puedo convertir «${etiquetaFormato(o)}» a ${etiquetaFormato(d)}; no me lo invento.`;
}

export function sePuedeTransmutar(
  origen: string,
  destino: string,
  destinos: DestinosFormato | null,
): boolean {
  return motivoNoTransmutable(origen, destino, destinos) === null;
}

export function construirSolicitud(nodo: Nodo, destino: string): SolicitudTransmutar {
  const d = formatoDe(destino) || destino;
  return {
    nodoOrigenId: nodo.id,
    formatoDestino: d,
    nombreSalida: nombreDeSalida(nodo.titulo, d),
  };
}

export function transmutar(
  grafo: Grafo4D,
  nodoId: string,
  destino: string,
  destinos: DestinosFormato | null,
  opciones: OpcionesTransmutar = {},
): ResultadoTransmutar {
  const origen = grafo.nodos.get(nodoId);
  if (!origen) {
    return { ok: false, motivo: 'No encontré el nodo que quieres transmutar.', grafo };
  }
  const motivo = motivoNoTransmutable(origen.formato, destino, destinos);
  if (motivo) return { ok: false, motivo, grafo };

  const d = formatoDe(destino) || destino;
  const idNuevo = opciones.idNuevo ?? `${nodoId}--${d}`;
  if (grafo.nodos.has(idNuevo)) {
    return { ok: false, motivo: 'Ya existe una variante con ese id.', grafo };
  }

  const siguiente = clonarGrafo(grafo);
  const t = opciones.ahora ?? Date.now();
  const nodo: Nodo = {
    id: idNuevo,
    tipo: origen.tipo,
    titulo: `${origen.titulo} (${etiquetaFormato(d)})`,
    formato: d,
    ref: opciones.refSalida ?? enlaceConversor({ nombre: origen.titulo, a: d }),
    alcance: origen.alcance,
    dueno: origen.dueno,
    capas: [...(opciones.capas ?? origen.capas)],
    t_creado: t,
    t_actividad: t,
    peso: origen.peso,
    etiquetas: [...(opciones.etiquetas ?? [...origen.etiquetas, 'transmuta'])],
    ...(origen.tema !== undefined ? { tema: origen.tema } : {}),
    ...(origen.categoria !== undefined ? { categoria: origen.categoria } : {}),
  };
  if (!anadirNodo(siguiente, nodo)) {
    return { ok: false, motivo: 'No pude crear la variante con esos datos.', grafo };
  }
  anadirArista(siguiente, { de: nodoId, a: idNuevo, tipo: 'transmuta', t, intensidad: 1 });
  for (const [padre, hijos] of siguiente.ramas) {
    if (hijos.includes(nodoId) && !hijos.includes(idNuevo)) {
      siguiente.ramas.set(padre, [...hijos, idNuevo]);
    }
  }
  return { ok: true, grafo: siguiente, nodoId: idNuevo };
}
