/**
 * Ramas 4D — edición del grafo (módulo PURO).
 * Añadir una rama hija de cualquier formato, vincular dos nodos con un tipo de
 * arista, mover una rama de padre y deshacer. Solo en lo propio o en un grupo
 * donde la persona pueda editar. El grafo lleva referencias, nunca contenido.
 * Contrato: `architecture/multiverso-5d.md`.
 */

import type {
  AlcanceNodo,
  FormatoNodo,
  Grafo4D,
  Nodo,
  TipoArista,
  TipoNodo,
} from './modelo';
import { CLAVES_PRIVADAS_PROHIBIDAS, anadirArista, anadirNodo, crearGrafo } from './modelo';

export interface ContextoEdicion {
  usuarioId: string;
  /** Grupos donde la persona puede editar; para nodos de alcance «grupo». */
  gruposConEdicion?: readonly string[];
  ahora?: number;
}

export interface EstadoEdicion {
  grafo: Grafo4D;
  /** Instantáneas anteriores del grafo, de la más vieja a la más reciente. */
  historial: Grafo4D[];
}

export interface NuevaRama {
  id: string;
  titulo: string;
  formato: FormatoNodo;
  ref: string;
  tipo?: TipoNodo;
  alcance?: AlcanceNodo;
  capas?: string[];
  etiquetas?: string[];
  tema?: string;
  categoria?: string;
}

export interface ResultadoEdicion {
  ok: boolean;
  motivo?: string;
  estado: EstadoEdicion;
}

export const MAX_HISTORIAL = 50;

export function crearEstadoEdicion(grafo: Grafo4D = crearGrafo()): EstadoEdicion {
  return { grafo, historial: [] };
}

export function clonarGrafo(grafo: Grafo4D): Grafo4D {
  const nodos = new Map<string, Nodo>();
  for (const [id, n] of grafo.nodos) {
    nodos.set(id, { ...n, capas: [...n.capas], etiquetas: [...n.etiquetas] });
  }
  return {
    nodos,
    aristas: grafo.aristas.map((a) => ({ ...a })),
    ramas: new Map([...grafo.ramas].map(([padre, hijos]) => [padre, [...hijos]])),
  };
}

export function puedeEditarNodo(nodo: Nodo, ctx: ContextoEdicion): boolean {
  if (nodo.dueno === ctx.usuarioId) return true;
  return nodo.alcance === 'grupo' && (ctx.gruposConEdicion ?? []).includes(nodo.dueno);
}

export function puedeDeshacer(estado: EstadoEdicion): boolean {
  return estado.historial.length > 0;
}

export function deshacer(estado: EstadoEdicion): EstadoEdicion {
  if (!puedeDeshacer(estado)) return estado;
  return {
    grafo: estado.historial[estado.historial.length - 1],
    historial: estado.historial.slice(0, -1),
  };
}

export function anadirRamaHija(
  estado: EstadoEdicion,
  padreId: string,
  rama: NuevaRama,
  ctx: ContextoEdicion,
): ResultadoEdicion {
  const padre = estado.grafo.nodos.get(padreId);
  if (!padre) return fallo(estado, 'No encontré la rama de origen.');
  if (!puedeEditarNodo(padre, ctx)) {
    return fallo(estado, 'Solo puedes añadir ramas en lo tuyo o en un grupo donde tengas permiso de edición.');
  }
  if (Object.keys(rama).some((k) => CLAVES_PRIVADAS_PROHIBIDAS.includes(k))) {
    return fallo(estado, 'El grafo lleva referencias, nunca contenido privado.');
  }
  if (estado.grafo.nodos.has(rama.id)) return fallo(estado, 'Ya existe un nodo con ese id.');

  const siguiente = clonarGrafo(estado.grafo);
  const t = ctx.ahora ?? Date.now();
  const esGrupo = padre.dueno !== ctx.usuarioId;
  const nodo: Nodo = {
    id: rama.id,
    tipo: rama.tipo ?? tipoSugerido(rama.formato),
    titulo: rama.titulo,
    formato: rama.formato,
    ref: rama.ref,
    alcance: esGrupo ? 'grupo' : rama.alcance ?? 'privado',
    dueno: esGrupo ? padre.dueno : ctx.usuarioId,
    capas: [...(rama.capas ?? [])],
    t_creado: t,
    t_actividad: t,
    peso: 1,
    etiquetas: [...(rama.etiquetas ?? [])],
    ...(rama.tema !== undefined ? { tema: rama.tema } : {}),
    ...(rama.categoria !== undefined ? { categoria: rama.categoria } : {}),
  };
  if (!anadirNodo(siguiente, nodo)) {
    return fallo(estado, 'La rama necesita id, título y referencia válidos.');
  }
  anadirArista(siguiente, { de: padreId, a: rama.id, tipo: 'contiene', t, intensidad: 1 });
  const hijos = siguiente.ramas.get(padreId) ?? [];
  siguiente.ramas.set(padreId, [...hijos, rama.id]);
  return exito(estado, siguiente);
}

export function vincular(
  estado: EstadoEdicion,
  deId: string,
  aId: string,
  tipo: TipoArista,
  ctx: ContextoEdicion,
): ResultadoEdicion {
  const de = estado.grafo.nodos.get(deId);
  const a = estado.grafo.nodos.get(aId);
  if (!de || !a) return fallo(estado, 'Los dos nodos deben existir para vincularlos.');
  if (!puedeEditarNodo(de, ctx) || !puedeEditarNodo(a, ctx)) {
    return fallo(estado, 'No tienes permiso de edición sobre los dos nodos.');
  }
  const siguiente = clonarGrafo(estado.grafo);
  const t = ctx.ahora ?? Date.now();
  if (!anadirArista(siguiente, { de: deId, a: aId, tipo, t, intensidad: 1 })) {
    return fallo(estado, 'Esa relación ya existe o no es válida.');
  }
  return exito(estado, siguiente);
}

export function moverRama(
  estado: EstadoEdicion,
  nodoId: string,
  nuevoPadreId: string,
  ctx: ContextoEdicion,
): ResultadoEdicion {
  const nodo = estado.grafo.nodos.get(nodoId);
  const nuevoPadre = estado.grafo.nodos.get(nuevoPadreId);
  if (!nodo || !nuevoPadre) return fallo(estado, 'No encontré la rama o su nuevo padre.');
  if (!puedeEditarNodo(nodo, ctx) || !puedeEditarNodo(nuevoPadre, ctx)) {
    return fallo(estado, 'No tienes permiso de edición sobre las dos ramas.');
  }
  if (nodoId === nuevoPadreId || esDescendiente(estado.grafo, nodoId, nuevoPadreId)) {
    return fallo(estado, 'No puedo mover una rama dentro de sí misma.');
  }
  const siguiente = clonarGrafo(estado.grafo);
  const padresAnteriores: string[] = [];
  for (const [padre, hijos] of siguiente.ramas) {
    if (!hijos.includes(nodoId)) continue;
    padresAnteriores.push(padre);
    siguiente.ramas.set(padre, hijos.filter((h) => h !== nodoId));
  }
  siguiente.aristas = siguiente.aristas.filter(
    (a) =>
      !(
        a.tipo === 'contiene' &&
        a.a === nodoId &&
        a.de !== nuevoPadreId &&
        padresAnteriores.includes(a.de)
      ),
  );
  const destino = siguiente.ramas.get(nuevoPadreId) ?? [];
  if (!destino.includes(nodoId)) siguiente.ramas.set(nuevoPadreId, [...destino, nodoId]);
  const t = ctx.ahora ?? Date.now();
  anadirArista(siguiente, { de: nuevoPadreId, a: nodoId, tipo: 'contiene', t, intensidad: 1 });
  return exito(estado, siguiente);
}

const TIPOS_CONOCIDOS: readonly TipoNodo[] = [
  'neurona', 'cerebro', 'carpeta', 'archivo', 'memoria', 'publicacion', 'entidad',
  'propuesta', 'leccion', 'obra', 'agente', 'bot', 'habilidad', 'conector',
  'proceso', 'proyecto', 'capa', 'ola', 'tarea',
];

function tipoSugerido(formato: FormatoNodo): TipoNodo {
  return TIPOS_CONOCIDOS.includes(formato) ? formato : 'archivo';
}

function esDescendiente(grafo: Grafo4D, ancestroId: string, candidatoId: string): boolean {
  const pendientes = [...(grafo.ramas.get(ancestroId) ?? [])];
  const vistos = new Set<string>();
  while (pendientes.length > 0) {
    const id = pendientes.pop()!;
    if (id === candidatoId) return true;
    if (vistos.has(id)) continue;
    vistos.add(id);
    pendientes.push(...(grafo.ramas.get(id) ?? []));
  }
  return false;
}

function fallo(estado: EstadoEdicion, motivo: string): ResultadoEdicion {
  return { ok: false, motivo, estado };
}

function exito(anterior: EstadoEdicion, grafo: Grafo4D): ResultadoEdicion {
  return {
    ok: true,
    estado: {
      grafo,
      historial: [...anterior.historial, anterior.grafo].slice(-MAX_HISTORIAL),
    },
  };
}
