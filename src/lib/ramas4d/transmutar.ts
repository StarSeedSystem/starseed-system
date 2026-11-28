import type { DestinosFormato } from '@/lib/conversion/formatos';
import { esFormatoValido, etiquetaFormato, formatoDe } from '@/lib/conversion/formatos';
import { anadirArista, type Grafo4D, type Nodo } from './modelo';
import {
  agregarRamaHija,
  padresDeRama,
  puedeEditar,
  type HistorialEdicion,
  type PermisoEdicion,
  type ResultadoEdicion,
} from './edicion';

/** Lo que el conversor de este medio sabe de un contenido. */
export interface FormaDisponible {
  disponible: boolean;
  destinos: DestinosFormato | null;
  motivo?: string;
}

export interface PlanTransmutacion {
  origen: Nodo;
  /** Id del formato de destino («pdf», «md», «pptx»…). */
  destino: string;
  titulo: string;
  ref: string;
}

export type ResultadoPlan =
  | { ok: true; plan: PlanTransmutacion }
  | { ok: false; motivo: string };

/** Decide si otra forma del mismo contenido es posible. Si no, lo dice y no inventa. */
export function planearTransmutacion(
  origen: Nodo,
  destino: string,
  formas: FormaDisponible,
): ResultadoPlan {
  const f = formatoDe(destino);
  if (!f || !esFormatoValido(f)) {
    return { ok: false, motivo: 'Ese formato de destino no es válido.' };
  }
  if (!formas.disponible) {
    return { ok: false, motivo: formas.motivo ?? 'En este medio no hay con qué convertir el contenido.' };
  }
  if (!formas.destinos) {
    return { ok: false, motivo: 'No sé a qué formatos se puede convertir este contenido.' };
  }
  if (f === formatoDe(origen.formato)) {
    return { ok: false, motivo: `Ya está en ${etiquetaFormato(f)}.` };
  }
  if (formas.destinos.destinos.includes(f)) {
    return {
      ok: true,
      plan: {
        origen,
        destino: f,
        titulo: `${origen.titulo} · ${etiquetaFormato(f)}`,
        ref: `${origen.ref}#transmuta-${f}`,
      },
    };
  }
  if (formas.destinos.conMotor.includes(f)) {
    return {
      ok: false,
      motivo: `Convertir a ${etiquetaFormato(f)} pide un motor opcional que este medio no tiene.`,
    };
  }
  return {
    ok: false,
    motivo: `Este contenido no se puede convertir a ${etiquetaFormato(f)}; no me lo invento.`,
  };
}

/** Cuelga la forma nueva como rama hermana del origen, con arista `transmuta`. */
export function aplicarTransmutacion(
  grafo: Grafo4D,
  historial: HistorialEdicion,
  permiso: PermisoEdicion,
  plan: PlanTransmutacion,
  idHermano: string,
): ResultadoEdicion {
  const origen = grafo.nodos.get(plan.origen.id);
  if (!origen) return { ok: false, motivo: 'La rama de origen ya no existe.' };
  if (!puedeEditar(origen, permiso)) {
    return { ok: false, motivo: 'Solo puedes transmutar lo tuyo o lo de un grupo donde puedas editar.' };
  }
  const padres = padresDeRama(grafo, origen.id);
  const ancla = padres.length > 0 ? padres[0] : origen.id;
  const resultado = agregarRamaHija(grafo, historial, permiso, ancla, {
    id: idHermano,
    titulo: plan.titulo,
    formato: plan.destino,
    ref: plan.ref,
    tipo: origen.tipo,
    alcance: origen.alcance,
    capas: [...origen.capas],
    tema: origen.tema,
    categoria: origen.categoria,
    etiquetas: [...origen.etiquetas, 'transmuta'],
  });
  if (!resultado.ok) return resultado;
  anadirArista(grafo, {
    de: origen.id,
    a: idHermano,
    tipo: 'transmuta',
    t: Date.now(),
    intensidad: 1,
  });
  return resultado;
}

/** Pregunta al conversor del medio qué formas admite este contenido. */
export async function consultarFormas(nombreOFormato: string): Promise<FormaDisponible> {
  const { consultarDestinos } = await import('@/lib/conversion/cliente');
  const r = await consultarDestinos(nombreOFormato);
  return { disponible: r.disponible, destinos: r.destinos, motivo: r.motivo };
}

/** Convierte el contenido real; la rama solo guarda la referencia, nunca el contenido. */
export async function convertirForma(archivo: Blob, nombre: string, destino: string) {
  const { convertirBlob } = await import('@/lib/conversion/cliente');
  return convertirBlob(archivo, nombre, destino);
}
