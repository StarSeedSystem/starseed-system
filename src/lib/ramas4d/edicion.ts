import type {
  AlcanceNodo,
  Arista,
  FormatoNodo,
  Grafo4D,
  Nodo,
  TipoArista,
  TipoNodo,
} from './modelo';
import { anadirArista, anadirNodo } from './modelo';

/** Formatos que ofrece el editor de ramas; el modelo es abierto, esto son atajos. */
export const FORMATOS_RAMA: readonly FormatoNodo[] = [
  'texto', 'documento', 'imagen', 'video', 'audio', 'enlace', 'app',
  'presentacion', 'tabla', 'pizarra', 'modelo3d', 'web', 'flujo', 'leccion', 'publicacion',
];

export type Identificadores = readonly string[] | ReadonlySet<string>;

export interface PermisoEdicion {
  editor: string;
  gruposEdicion?: Identificadores;
}

export interface NuevaRama {
  id: string;
  titulo: string;
  formato: FormatoNodo;
  ref: string;
  tipo?: TipoNodo;
  alcance?: AlcanceNodo;
  capas?: string[];
  tema?: string;
  categoria?: string;
  etiquetas?: string[];
}

export interface Vinculo {
  de: string;
  a: string;
  tipo: TipoArista;
  intensidad?: number;
}

export interface Movimiento {
  nodoId: string;
  aPadreId: string;
}

export interface HistorialEdicion {
  pila: Grafo4D[];
  maximo: number;
}

export type ResultadoEdicion =
  | { ok: true; nodo?: Nodo; arista?: Arista }
  | { ok: false; motivo: string };

function contiene(ids: Identificadores | undefined, id: string): boolean {
  if (!ids) return false;
  return Array.isArray(ids) ? ids.includes(id) : ids.has(id);
}

/** Lo propio siempre; lo de un grupo o comunidad solo con permiso de edición de ese grupo. */
export function puedeEditar(nodo: Nodo, permiso: PermisoEdicion): boolean {
  if (nodo.dueno === permiso.editor) return true;
  if (nodo.alcance === 'grupo' || nodo.alcance === 'comunidad') {
    return contiene(permiso.gruposEdicion, nodo.dueno);
  }
  return false;
}

export function nodosEditables(grafo: Grafo4D, permiso: PermisoEdicion): Nodo[] {
  return [...grafo.nodos.values()].filter((n) => puedeEditar(n, permiso));
}

export function crearHistorial(maximo = 20): HistorialEdicion {
  return { pila: [], maximo: Math.max(1, maximo) };
}

/** La rama nueva hereda dueño, alcance y capas del padre; el contenido se pide al abrir. */
export function crearRama(dueno: string, datos: NuevaRama): Nodo {
  return {
    id: datos.id,
    tipo: datos.tipo ?? 'archivo',
    titulo: datos.titulo,
    formato: datos.formato,
    ref: datos.ref,
    alcance: datos.alcance ?? 'privado',
    dueno,
    capas: datos.capas ?? [],
    t_creado: Date.now(),
    t_actividad: Date.now(),
    peso: 1,
    tema: datos.tema,
    categoria: datos.categoria,
    etiquetas: datos.etiquetas ?? [],
  };
}

export function padresDeRama(grafo: Grafo4D, nodoId: string): string[] {
  const padres: string[] = [];
  for (const [padreId, hijos] of grafo.ramas) {
    if (hijos.includes(nodoId)) padres.push(padreId);
  }
  return padres;
}

function clonarGrafo(grafo: Grafo4D): Grafo4D {
  const nodos = new Map<string, Nodo>();
  for (const [id, nodo] of grafo.nodos) {
    nodos.set(id, { ...nodo, capas: [...nodo.capas], etiquetas: [...nodo.etiquetas] });
  }
  const ramas = new Map<string, string[]>();
  for (const [id, hijos] of grafo.ramas) ramas.set(id, [...hijos]);
  return { nodos, aristas: grafo.aristas.map((a) => ({ ...a })), ramas };
}

function apuntar(grafo: Grafo4D, historial: HistorialEdicion): void {
  historial.pila.push(clonarGrafo(grafo));
  while (historial.pila.length > historial.maximo) historial.pila.shift();
}

function restaurar(grafo: Grafo4D, copia: Grafo4D): void {
  grafo.nodos.clear();
  for (const [id, nodo] of copia.nodos) grafo.nodos.set(id, nodo);
  grafo.aristas.length = 0;
  grafo.aristas.push(...copia.aristas);
  grafo.ramas.clear();
  for (const [id, hijos] of copia.ramas) grafo.ramas.set(id, hijos);
}

/** Vuelve al estado anterior a la última edición. False si no había nada que deshacer. */
export function deshacer(grafo: Grafo4D, historial: HistorialEdicion): boolean {
  const copia = historial.pila.pop();
  if (!copia) return false;
  restaurar(grafo, copia);
  return true;
}

export function agregarRamaHija(
  grafo: Grafo4D,
  historial: HistorialEdicion,
  permiso: PermisoEdicion,
  padreId: string,
  datos: NuevaRama,
): ResultadoEdicion {
  const padre = grafo.nodos.get(padreId);
  if (!padre) return { ok: false, motivo: 'La rama de origen no existe.' };
  if (!puedeEditar(padre, permiso)) {
    return { ok: false, motivo: 'Solo puedes ramificar lo tuyo o lo de un grupo donde puedas editar.' };
  }
  if (grafo.nodos.has(datos.id)) {
    return { ok: false, motivo: 'Ya existe una rama con ese identificador.' };
  }
  const nodo = crearRama(padre.dueno, {
    ...datos,
    alcance: datos.alcance ?? padre.alcance,
    capas: datos.capas ?? [...padre.capas],
  });
  apuntar(grafo, historial);
  if (!anadirNodo(grafo, nodo)) {
    historial.pila.pop();
    return { ok: false, motivo: 'No se pudo añadir la rama.' };
  }
  grafo.ramas.set(padreId, [...(grafo.ramas.get(padreId) ?? []), nodo.id]);
  const arista: Arista = { de: padreId, a: nodo.id, tipo: 'contiene', t: Date.now(), intensidad: 1 };
  anadirArista(grafo, arista);
  return { ok: true, nodo, arista };
}

export function vincularNodos(
  grafo: Grafo4D,
  historial: HistorialEdicion,
  permiso: PermisoEdicion,
  vinculo: Vinculo,
): ResultadoEdicion {
  const de = grafo.nodos.get(vinculo.de);
  const a = grafo.nodos.get(vinculo.a);
  if (!de || !a) return { ok: false, motivo: 'Los dos nodos tienen que existir para vincularlos.' };
  if (de.id === a.id) return { ok: false, motivo: 'Un nodo no se puede vincular consigo mismo.' };
  if (!puedeEditar(de, permiso) || !puedeEditar(a, permiso)) {
    return { ok: false, motivo: 'Solo puedes vincular lo tuyo o lo de un grupo donde puedas editar.' };
  }
  const arista: Arista = {
    de: de.id,
    a: a.id,
    tipo: vinculo.tipo,
    t: Date.now(),
    intensidad: vinculo.intensidad ?? 1,
  };
  apuntar(grafo, historial);
  if (!anadirArista(grafo, arista)) {
    historial.pila.pop();
    return { ok: false, motivo: 'Ese vínculo ya existe entre los dos nodos.' };
  }
  return { ok: true, arista };
}

function esAncestro(grafo: Grafo4D, posible: string, nodoId: string): boolean {
  const pila = [nodoId];
  const vistos = new Set<string>();
  while (pila.length > 0) {
    const actual = pila.pop() as string;
    if (actual === posible) return true;
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    for (const [padreId, hijos] of grafo.ramas) {
      if (hijos.includes(actual)) pila.push(padreId);
    }
  }
  return false;
}

export function moverNodo(
  grafo: Grafo4D,
  historial: HistorialEdicion,
  permiso: PermisoEdicion,
  mov: Movimiento,
): ResultadoEdicion {
  const nodo = grafo.nodos.get(mov.nodoId);
  const destino = grafo.nodos.get(mov.aPadreId);
  if (!nodo || !destino) return { ok: false, motivo: 'El nodo o su nueva rama no existen.' };
  if (nodo.id === destino.id) return { ok: false, motivo: 'Una rama no puede colgar de sí misma.' };
  if (!puedeEditar(nodo, permiso) || !puedeEditar(destino, permiso)) {
    return { ok: false, motivo: 'Solo puedes mover lo tuyo o lo de un grupo donde puedas editar.' };
  }
  if (esAncestro(grafo, nodo.id, destino.id)) {
    return { ok: false, motivo: 'No puedes mover una rama dentro de una de sus propias ramas.' };
  }
  apuntar(grafo, historial);
  for (const [padreId, hijos] of [...grafo.ramas]) {
    const sin = hijos.filter((h) => h !== nodo.id);
    if (sin.length > 0) grafo.ramas.set(padreId, sin);
    else grafo.ramas.delete(padreId);
  }
  grafo.ramas.set(destino.id, [...(grafo.ramas.get(destino.id) ?? []), nodo.id]);
  return { ok: true, nodo };
}
