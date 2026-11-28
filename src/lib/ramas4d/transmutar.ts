// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Ramas 4D · transmutar (módulo PURO + puerto de conversión)
// ----------------------------------------------------------------------------
// Contrato `architecture/multiverso-5d.md`: pedir a `src/lib/conversion` otra
// forma del mismo contenido y colgarla como rama hermana con arista
// «transmuta». Si el formato no se puede convertir, se dice y no se inventa.
// La lógica de decisión es pura; la conversión real entra por un puerto, para
// poder simularla en las pruebas sin red ni disco.
// ════════════════════════════════════════════════════════════════════════════

import { formatoDe } from '@/lib/conversion/formatos';
import { consultarDestinos as consultarDestinosReales, convertirBlob } from '@/lib/conversion/cliente';
import {
  anadirArista,
  type Nodo,
} from './modelo';
import {
  anadirRamaHija,
  puedeEditar,
  type ContextoEdicion,
  type DatosRama,
  type EstadoEdicion,
  type ResultadoEdicion,
} from './edicion';

export interface DestinosConversion {
  nombre: string;
  ids: string[];
  destinos: string[];
  conMotor: string[];
}

export interface ConsultaConversion {
  disponible: boolean;
  destinos: DestinosConversion | null;
  motivo?: string;
}

export interface ArchivoConvertido {
  nombre: string;
  formato: string;
}

/** Lo que el motor pide a `src/lib/conversion`; en pruebas se sustituye. */
export interface PuertoConversion {
  consultarDestinos(nombreOFormato: string): Promise<ConsultaConversion>;
  convertir(archivo: Blob, nombre: string, destino: string): Promise<ArchivoConvertido>;
}

export interface PlanTransmutacion {
  ok: boolean;
  destino?: string;
  motivo?: string;
}

export interface OpcionesTransmutar {
  origenId: string;
  destino: string;
  archivo: Blob;
  nombre: string;
  ctx: ContextoEdicion;
  puerto?: PuertoConversion;
  /** Referencia de la nueva forma; nunca contenido privado. */
  ref?: string;
}

export interface ResultadoTransmutacion extends ResultadoEdicion {
  motivo?: string;
}

/**
 * Decide si un destino es alcanzable con lo que hay instalado. Nunca promete
 * una forma que el conversor no pueda dar: distingue motor opcional de imposible.
 */
export function planificarTransmutacion(
  destinos: DestinosConversion | null,
  objetivo: string
): PlanTransmutacion {
  const destino = formatoDe(objetivo) || String(objetivo ?? '').trim().toLowerCase();
  if (!destino) return { ok: false, motivo: 'No reconozco el formato de destino.' };
  if (!destinos) return { ok: false, motivo: 'No se pudo leer qué formatos acepta este contenido.' };
  if (destinos.destinos.includes(destino)) return { ok: true, destino };
  if (destinos.conMotor.includes(destino)) {
    return {
      ok: false,
      destino,
      motivo: `Convertir «${destinos.nombre}» a ${destino} pide un motor opcional (LibreOffice, Pandoc, FFmpeg…); instálalo y vuelve a intentarlo.`,
    };
  }
  return {
    ok: false,
    destino,
    motivo: `No se puede convertir «${destinos.nombre}» a ${destino} con lo instalado; no lo inventamos.`,
  };
}

function fallo(estado: EstadoEdicion, motivo: string): ResultadoTransmutacion {
  return { ok: false, estado, motivo, error: motivo };
}

function padreDe(estado: EstadoEdicion, nodoId: string): string {
  for (const [padre, hijos] of estado.grafo.ramas.entries()) {
    if (hijos.includes(nodoId)) return padre;
  }
  return nodoId;
}

function datosHermanos(origen: Nodo, convertido: ArchivoConvertido, op: OpcionesTransmutar): DatosRama {
  const formato = convertido.formato || formatoDe(op.destino) || op.destino;
  return {
    tipo: origen.tipo,
    titulo: `${origen.titulo} · ${formato}`,
    formato,
    ref: op.ref ?? `${origen.ref}#${formato}`,
    alcance: origen.alcance,
    etiquetas: [...origen.etiquetas],
    capas: [...origen.capas],
    ...(origen.tema !== undefined ? { tema: origen.tema } : {}),
    ...(origen.categoria !== undefined ? { categoria: origen.categoria } : {}),
    peso: origen.peso,
  };
}

/**
 * Pide otra forma del contenido y la cuelga como rama hermana con arista
 * «transmuta». Si el formato no se puede convertir, devuelve el grafo intacto.
 */
export async function transmutarNodo(
  estado: EstadoEdicion,
  op: OpcionesTransmutar
): Promise<ResultadoTransmutacion> {
  const origen = estado.grafo.nodos.get(op.origenId);
  if (!origen) return fallo(estado, 'La rama de origen no existe.');
  if (!puedeEditar(origen, op.ctx)) return fallo(estado, 'No tienes permiso para transmutar esta rama.');

  const puerto = op.puerto ?? crearPuertoConversion();
  let consulta: ConsultaConversion;
  try {
    consulta = await puerto.consultarDestinos(op.nombre);
  } catch {
    return fallo(estado, 'No se pudo consultar el conversor; inténtalo de nuevo.');
  }
  const plan = planificarTransmutacion(consulta.destinos, op.destino);
  if (!plan.ok) return fallo(estado, plan.motivo ?? consulta.motivo ?? 'No se puede convertir este contenido.');

  let convertido: ArchivoConvertido;
  try {
    convertido = await puerto.convertir(op.archivo, op.nombre, plan.destino as string);
  } catch {
    return fallo(estado, 'La conversión falló; el contenido sigue como estaba.');
  }

  const padreId = padreDe(estado, op.origenId);
  const resultado = anadirRamaHija(estado, padreId, datosHermanos(origen, convertido, op), op.ctx);
  if (!resultado.ok || !resultado.nodoId) {
    return { ...resultado, motivo: resultado.error ?? 'No se pudo colgar la nueva forma.' };
  }
  anadirArista(resultado.estado.grafo, {
    de: op.origenId,
    a: resultado.nodoId,
    tipo: 'transmuta',
    t: op.ctx.ahora,
    intensidad: 1,
  });
  return { ok: true, estado: resultado.estado, nodoId: resultado.nodoId };
}

/** Puerto real: Filee a través de `/api/conversion`, con la malla de respaldo. */
export function crearPuertoConversion(): PuertoConversion {
  return {
    consultarDestinos: async (nombre) => {
      const r = await consultarDestinosReales(nombre);
      return { disponible: r.disponible, destinos: r.destinos, motivo: r.motivo };
    },
    convertir: async (archivo, nombre, destino) => {
      const c = await convertirBlob(archivo, nombre, destino);
      return { nombre: c.nombre, formato: formatoDe(c.nombre) || destino };
    },
  };
}
