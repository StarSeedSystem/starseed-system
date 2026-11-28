import { formatoDe, ordenarDestinos, etiquetaFormato } from "@/lib/conversion/formatos";
import type { ConsultaDestinos, Convertido } from "@/lib/conversion/cliente";
import { consultarDestinos, convertirBlob } from "@/lib/conversion/cliente";
import { anadirRama, puedeEditar, referenciaValida } from "./edicion";
import type { DatosRamaNueva, EditorRamas, EstadoEdicion } from "./edicion";

export interface ServicioConversion {
  consultar(formato: string): Promise<ConsultaDestinos>;
  convertir(archivo: Blob, nombre: string, destino: string): Promise<Convertido>;
}

export interface ResultadoDestino {
  ok: boolean;
  motivo?: string;
}

export interface OpcionesTransmutacion {
  servicio: ServicioConversion;
  archivo: Blob;
  nombre: string;
  refNueva: string;
  editor: EditorRamas;
  t?: number;
}

export function servicioConversion(fetchImpl: typeof fetch = fetch): ServicioConversion {
  return {
    consultar: (formato) => consultarDestinos(formato, fetchImpl),
    convertir: (archivo, nombre, destino) => convertirBlob(archivo, nombre, destino, { fetchImpl }),
  };
}

export function destinosTransmutables(consulta: ConsultaDestinos, origen: string): string[] {
  if (!consulta.disponible || !consulta.destinos) return [];
  return ordenarDestinos(consulta.destinos.destinos, formatoDe(origen) || origen);
}

export function evaluarDestino(consulta: ConsultaDestinos, origen: string, destino: string): ResultadoDestino {
  const de = formatoDe(origen) || origen;
  const a = formatoDe(destino);
  if (!a) return { ok: false, motivo: "No reconozco el formato de destino." };
  if (!consulta.disponible) {
    return { ok: false, motivo: consulta.motivo ?? "Aquí no se puede convertir ahora mismo." };
  }
  if (!destinosTransmutables(consulta, de).includes(a)) {
    return {
      ok: false,
      motivo: `No se puede convertir ${etiquetaFormato(de)} a ${etiquetaFormato(a)} aquí.`,
    };
  }
  return { ok: true };
}

export async function transmutarRama(
  estado: EstadoEdicion, nodoId: string, destino: string, opciones: OpcionesTransmutacion,
): Promise<EstadoEdicion> {
  const nodo = estado.grafo.nodos.get(nodoId);
  if (!nodo || !puedeEditar(nodo, opciones.editor)) {
    return { ...estado, error: "No tienes permiso para transmutar esta rama." };
  }
  const origen = formatoDe(nodo.formato) || formatoDe(nodo.ref);
  if (!origen) return { ...estado, error: "No sé de qué formato parte esta rama." };
  const consulta = await opciones.servicio.consultar(origen);
  const evaluacion = evaluarDestino(consulta, origen, destino);
  if (!evaluacion.ok) return { ...estado, error: evaluacion.motivo ?? "No se puede convertir." };
  if (!referenciaValida(opciones.refNueva)) {
    return { ...estado, error: "Guarda la rama convertida antes de colgar su referencia." };
  }
  const padreId = [...estado.grafo.ramas.entries()].find(([, hijos]) => hijos.includes(nodoId))?.[0];
  if (!padreId) return { ...estado, error: "Esta rama no cuelga de ninguna rama padre." };
  const a = formatoDe(destino);
  if (!a) return { ...estado, error: "No reconozco el formato de destino." };
  const convertido = await opciones.servicio.convertir(opciones.archivo, opciones.nombre, a);
  const hora = opciones.t ?? Date.now();
  const datos: DatosRamaNueva = {
    id: `${nodoId}-${a}-${hora}`,
    titulo: convertido.nombre,
    formato: a,
    tipo: nodo.tipo,
    ref: opciones.refNueva,
  };
  const conHermana = anadirRama(estado, padreId, datos, opciones.editor, hora);
  if (conHermana.error || !conHermana.grafo.nodos.has(datos.id)) return conHermana;
  conHermana.grafo.aristas.push({ de: nodoId, a: datos.id, tipo: "transmuta", t: hora, intensidad: 1 });
  return { ...conHermana, error: undefined };
}
