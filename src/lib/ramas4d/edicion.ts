import { visiblePara, type Identificadores, type Observador } from "./alcance";
import type { FormatoNodo, Grafo4D, Nodo, TipoArista, TipoNodo } from "./modelo";
import { validarNodo } from "./modelo";

export interface EditorRamas extends Observador { puedeEditarEn?: Identificadores; }

export interface DatosRamaNueva {
  id: string; titulo: string; formato: FormatoNodo; tipo?: TipoNodo; ref: string;
}

export interface EstadoEdicion { grafo: Grafo4D; historial: Grafo4D[]; error?: string; }

const MAX_HISTORIAL = 20;

function pertenece(ids: Identificadores | undefined, id: string): boolean {
  if (!ids) return false;
  if (ids instanceof Set) return ids.has(id);
  return (ids as readonly string[]).includes(id);
}

function clonarGrafo(grafo: Grafo4D): Grafo4D {
  const nodos = new Map<string, Nodo>();
  for (const [id, n] of grafo.nodos) nodos.set(id, { ...n, capas: [...n.capas], etiquetas: [...n.etiquetas] });
  const ramas = new Map<string, string[]>();
  for (const [id, hijos] of grafo.ramas) ramas.set(id, [...hijos]);
  return { nodos, aristas: grafo.aristas.map((a) => ({ ...a })), ramas };
}

function rechazar(estado: EstadoEdicion, error: string): EstadoEdicion { return { ...estado, error }; }

function confirmar(estado: EstadoEdicion, grafo: Grafo4D): EstadoEdicion {
  return { grafo, historial: [...estado.historial, estado.grafo].slice(-MAX_HISTORIAL) };
}

export function crearEstadoEdicion(grafo: Grafo4D): EstadoEdicion { return { grafo, historial: [] }; }

export function referenciaValida(ref: string): boolean {
  const limpia = String(ref ?? "").trim();
  if (!limpia || limpia.length > 512 || /\s/.test(limpia)) return false;
  if (/^(data|blob|javascript):/i.test(limpia)) return false;
  return limpia.startsWith("/") || /^https?:\/\//i.test(limpia) ||
    /^[A-Za-z0-9._:-]{1,128}$/.test(limpia);
}

export function puedeEditar(nodo: Nodo | undefined, editor: EditorRamas): boolean {
  if (!nodo || !visiblePara(nodo, editor)) return false;
  if (nodo.dueno === editor.id) return true;
  if (nodo.alcance !== "grupo" && nodo.alcance !== "comunidad") return false;
  const miembro = nodo.alcance === "grupo" ? editor.grupos : editor.comunidades;
  return pertenece(miembro, nodo.dueno) && pertenece(editor.puedeEditarEn, nodo.dueno);
}
export function anadirRama(
  estado: EstadoEdicion, padreId: string, datos: DatosRamaNueva, editor: EditorRamas, t = Date.now(),
): EstadoEdicion {
  const padre = estado.grafo.nodos.get(padreId);
  if (!padre || !puedeEditar(padre, editor)) return rechazar(estado, "No tienes permiso para añadir ramas aquí.");
  if (!referenciaValida(datos.ref)) return rechazar(estado, "La rama debe llevar una referencia, no contenido privado.");
  const hijo: Nodo = {
    id: datos.id, tipo: datos.tipo ?? "archivo", titulo: datos.titulo.trim(),
    formato: datos.formato, ref: datos.ref.trim(), alcance: padre.alcance, dueno: padre.dueno,
    capas: [...padre.capas], t_creado: t, t_actividad: t, peso: 1, etiquetas: [],
  };
  if (!validarNodo(hijo).valido || estado.grafo.nodos.has(hijo.id)) {
    return rechazar(estado, "La rama no es válida o ese id ya existe.");
  }
  const grafo = clonarGrafo(estado.grafo);
  grafo.nodos.set(hijo.id, hijo);
  grafo.ramas.set(padreId, [...(grafo.ramas.get(padreId) ?? []), hijo.id]);
  grafo.aristas.push({ de: padreId, a: hijo.id, tipo: "contiene", t, intensidad: 1 });
  return confirmar(estado, grafo);
}

export function vincularNodos(
  estado: EstadoEdicion, deId: string, aId: string, tipo: TipoArista, editor: EditorRamas, t = Date.now(),
): EstadoEdicion {
  const de = estado.grafo.nodos.get(deId);
  const a = estado.grafo.nodos.get(aId);
  if (!de || !a || deId === aId) return rechazar(estado, "Necesitas dos nodos distintos para vincular.");
  if (!puedeEditar(de, editor) || !puedeEditar(a, editor)) {
    return rechazar(estado, "Solo puedes vincular lo tuyo o un grupo que puedas editar.");
  }
  if (!tipo.trim()) return rechazar(estado, "Elige el tipo de vínculo.");
  const yaExiste = estado.grafo.aristas.some((x) => x.de === deId && x.a === aId && x.tipo === tipo);
  if (yaExiste) return rechazar(estado, "Esos nodos ya están vinculados así.");
  const grafo = clonarGrafo(estado.grafo);
  grafo.aristas.push({ de: deId, a: aId, tipo, t, intensidad: 1 });
  return confirmar(estado, grafo);
}
export function moverRama(
  estado: EstadoEdicion, nodoId: string, nuevoPadreId: string, editor: EditorRamas, t = Date.now(),
): EstadoEdicion {
  const nodo = estado.grafo.nodos.get(nodoId);
  const padre = estado.grafo.nodos.get(nuevoPadreId);
  if (!nodo || !padre || nodoId === nuevoPadreId) return rechazar(estado, "Necesitas otra rama de destino para mover este nodo.");
  if (!puedeEditar(nodo, editor) || !puedeEditar(padre, editor)) {
    return rechazar(estado, "Solo puedes mover lo tuyo o un grupo que puedas editar.");
  }
  const visitados = new Set<string>();
  let actual: string | undefined = nuevoPadreId;
  while (actual && !visitados.has(actual)) {
    if (actual === nodoId) return rechazar(estado, "No puedes meter una rama dentro de ella misma.");
    visitados.add(actual);
    actual = [...estado.grafo.ramas.entries()].find(([, hijos]) => hijos.includes(actual ?? ""))?.[0];
  }
  const grafo = clonarGrafo(estado.grafo);
  for (const [id, hijos] of grafo.ramas) grafo.ramas.set(id, hijos.filter((hijo) => hijo !== nodoId));
  grafo.ramas.set(nuevoPadreId, [...(grafo.ramas.get(nuevoPadreId) ?? []), nodoId]);
  const movido = grafo.nodos.get(nodoId);
  if (movido) movido.t_actividad = t;
  return confirmar(estado, grafo);
}

export function deshacer(estado: EstadoEdicion): EstadoEdicion {
  const anterior = estado.historial[estado.historial.length - 1];
  if (!anterior) return rechazar(estado, "No hay nada que deshacer.");
  return { grafo: anterior, historial: estado.historial.slice(0, -1) };
}
