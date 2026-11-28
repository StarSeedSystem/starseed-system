// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Ramas 4D · edición (módulo PURO)
// ----------------------------------------------------------------------------
// Contrato `architecture/multiverso-5d.md`: añadir ramas hijas de cualquier
// formato, vincular dos nodos con un tipo de arista, mover una rama de padre y
// deshacer. Solo se edita lo propio o lo que un grupo permite editar. No crea
// registros nuevos en ningún servidor: opera sobre el grafo que ya existe.
// Sin red, sin disco, sin `node:*`; lo usan la escena, el editor y las pruebas.
// ════════════════════════════════════════════════════════════════════════════

import type { Observador } from './alcance';
import {
  anadirArista,
  anadirNodo,
  ancestrosDeRama,
  type AlcanceNodo,
  type FormatoNodo,
  type Grafo4D,
  type Nodo,
  type TipoArista,
  type TipoNodo,
} from './modelo';

export interface PermisoEdicion {
  /** Grupos donde el observador puede editar, no solo mirar. */
  grupos?: readonly string[];
  /** Dueños que le han dado permiso de edición directo. */
  duenos?: readonly string[];
}

export interface ContextoEdicion {
  observador: Observador;
  permiso?: PermisoEdicion;
  /** Instante de la edición; en pruebas se fija para que sea determinista. */
  ahora: number;
}

export interface EstadoEdicion {
  grafo: Grafo4D;
  /** Pila de grafos anteriores; el último es el que deshace. */
  deshacer: Grafo4D[];
}

export interface ResultadoEdicion {
  ok: boolean;
  estado: EstadoEdicion;
  error?: string;
  /** Id del nodo creado o movido, cuando la operación lo produce. */
  nodoId?: string;
}

export interface DatosRama {
  id?: string;
  tipo: TipoNodo;
  titulo: string;
  formato: FormatoNodo;
  ref: string;
  alcance?: AlcanceNodo;
  etiquetas?: string[];
  capas?: string[];
  tema?: string;
  categoria?: string;
  peso?: number;
}

const MAX_HISTORIAL = 50;

/** Copia profunda del grafo: deshacer nunca comparte mapas ni listas con el presente. */
export function clonarGrafo(grafo: Grafo4D): Grafo4D {
  const nodos = new Map<string, Nodo>();
  for (const [id, n] of grafo.nodos.entries()) {
    nodos.set(id, { ...n, capas: [...n.capas], etiquetas: [...n.etiquetas] });
  }
  const ramas = new Map<string, string[]>();
  for (const [padre, hijos] of grafo.ramas.entries()) {
    ramas.set(padre, [...hijos]);
  }
  return { nodos, aristas: grafo.aristas.map((a) => ({ ...a })), ramas };
}

export function estadoInicial(grafo: Grafo4D): EstadoEdicion {
  return { grafo: clonarGrafo(grafo), deshacer: [] };
}

function conHistorial(estado: EstadoEdicion, grafo: Grafo4D): EstadoEdicion {
  const pila = [...estado.deshacer, clonarGrafo(estado.grafo)];
  return { grafo, deshacer: pila.slice(-MAX_HISTORIAL) };
}

function fallo(estado: EstadoEdicion, error: string): ResultadoEdicion {
  return { ok: false, estado, error };
}

function enLista(ids: Observador['grupos'], id: string): boolean {
  if (!ids) return false;
  return Array.isArray(ids)
    ? (ids as readonly string[]).includes(id)
    : (ids as ReadonlySet<string>).has(id);
}

function esDueno(nodo: Nodo, observador: Observador, permiso?: PermisoEdicion): boolean {
  if (nodo.dueno === observador.id) return true;
  if (permiso?.duenos?.includes(nodo.dueno)) return true;
  if (nodo.alcance !== 'grupo') return false;
  return enLista(observador.grupos, nodo.dueno) && (permiso?.grupos?.includes(nodo.dueno) ?? false);
}

/** Solo lo propio o lo que un grupo permite editar. */
export function puedeEditar(nodo: Nodo, ctx: ContextoEdicion): boolean {
  return esDueno(nodo, ctx.observador, ctx.permiso);
}

function idNuevo(grafo: Grafo4D, datos: DatosRama, ctx: ContextoEdicion): string {
  if (datos.id && !grafo.nodos.has(datos.id)) return datos.id;
  const base = `${datos.formato}-${ctx.ahora}-${grafo.nodos.size}`;
  let id = base;
  let n = 1;
  while (grafo.nodos.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Cuelga una rama hija del padre, de cualquier formato, con arista «contiene». */
export function anadirRamaHija(
  estado: EstadoEdicion,
  padreId: string,
  datos: DatosRama,
  ctx: ContextoEdicion
): ResultadoEdicion {
  const padre = estado.grafo.nodos.get(padreId);
  if (!padre) return fallo(estado, 'La rama padre no existe.');
  if (!puedeEditar(padre, ctx)) return fallo(estado, 'No tienes permiso para editar esta rama.');
  const id = idNuevo(estado.grafo, datos, ctx);
  const nodo: Nodo = {
    id,
    tipo: datos.tipo,
    titulo: datos.titulo,
    formato: datos.formato,
    ref: datos.ref,
    alcance: datos.alcance ?? 'privado',
    dueno: ctx.observador.id,
    capas: datos.capas ?? [],
    t_creado: ctx.ahora,
    t_actividad: ctx.ahora,
    peso: datos.peso ?? 1,
    etiquetas: datos.etiquetas ?? [],
    ...(datos.tema !== undefined ? { tema: datos.tema } : {}),
    ...(datos.categoria !== undefined ? { categoria: datos.categoria } : {}),
  };
  const grafo = clonarGrafo(estado.grafo);
  if (!anadirNodo(grafo, nodo)) return fallo(estado, 'No se pudo crear la rama: revisa el título y la referencia.');
  anadirArista(grafo, { de: padreId, a: id, tipo: 'contiene', t: ctx.ahora, intensidad: 1 });
  const hijos = grafo.ramas.get(padreId) ?? [];
  grafo.ramas.set(padreId, [...hijos, id]);
  return { ok: true, estado: conHistorial(estado, grafo), nodoId: id };
}

/** Vincula dos nodos con el tipo de arista indicado; exige edición en ambos. */
export function vincularNodos(
  estado: EstadoEdicion,
  de: string,
  a: string,
  tipo: TipoArista,
  ctx: ContextoEdicion,
  intensidad = 1
): ResultadoEdicion {
  const origen = estado.grafo.nodos.get(de);
  const destino = estado.grafo.nodos.get(a);
  if (!origen || !destino) return fallo(estado, 'Alguno de los nodos no existe.');
  if (de === a) return fallo(estado, 'Un nodo no se puede vincular consigo mismo.');
  if (!puedeEditar(origen, ctx) || !puedeEditar(destino, ctx)) {
    return fallo(estado, 'No tienes permiso para vincular estos nodos.');
  }
  const grafo = clonarGrafo(estado.grafo);
  if (!anadirArista(grafo, { de, a, tipo, t: ctx.ahora, intensidad })) {
    return fallo(estado, 'Ese vínculo ya existe.');
  }
  return { ok: true, estado: conHistorial(estado, grafo) };
}

/** Mueve una rama a otro padre, sin permitir ciclos. */
export function moverNodo(
  estado: EstadoEdicion,
  nodoId: string,
  nuevoPadreId: string,
  ctx: ContextoEdicion
): ResultadoEdicion {
  const nodo = estado.grafo.nodos.get(nodoId);
  const nuevoPadre = estado.grafo.nodos.get(nuevoPadreId);
  if (!nodo || !nuevoPadre) return fallo(estado, 'Alguno de los nodos no existe.');
  if (nodoId === nuevoPadreId) return fallo(estado, 'Un nodo no se puede mover dentro de sí mismo.');
  if (!puedeEditar(nodo, ctx) || !puedeEditar(nuevoPadre, ctx)) {
    return fallo(estado, 'No tienes permiso para mover esta rama.');
  }
  if (ancestrosDeRama(estado.grafo, nuevoPadreId).includes(nodoId)) {
    return fallo(estado, 'No se puede mover un nodo dentro de su propio descendiente.');
  }
  const grafo = clonarGrafo(estado.grafo);
  for (const [padre, hijos] of grafo.ramas.entries()) {
    const limpios = hijos.filter((h) => h !== nodoId);
    if (limpios.length > 0) grafo.ramas.set(padre, limpios);
    else grafo.ramas.delete(padre);
  }
  grafo.aristas = grafo.aristas.filter((arista) => !(arista.a === nodoId && arista.tipo === 'contiene'));
  grafo.ramas.set(nuevoPadreId, [...(grafo.ramas.get(nuevoPadreId) ?? []), nodoId]);
  anadirArista(grafo, { de: nuevoPadreId, a: nodoId, tipo: 'contiene', t: ctx.ahora, intensidad: 1 });
  return { ok: true, estado: conHistorial(estado, grafo), nodoId };
}

/** Deshace la última edición; sin historial lo dice y no cambia nada. */
export function deshacer(estado: EstadoEdicion): ResultadoEdicion {
  if (estado.deshacer.length === 0) {
    return fallo(estado, 'No hay nada que deshacer.');
  }
  const pila = estado.deshacer.slice(0, -1);
  const previo = estado.deshacer[estado.deshacer.length - 1];
  return { ok: true, estado: { grafo: previo, deshacer: pila } };
}

