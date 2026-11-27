import type { Grafo4D, Nodo } from './modelo';

export type Identificadores = readonly string[] | ReadonlySet<string>;

export interface Observador {
  id: string;
  contactos?: Identificadores;
  grupos?: Identificadores;
  comunidades?: Identificadores;
}

function esLista(identificadores: Identificadores): identificadores is readonly string[] {
  return Array.isArray(identificadores);
}

function contiene(identificadores: Identificadores | undefined, id: string): boolean {
  if (!identificadores) {
    return false;
  }
  return esLista(identificadores)
    ? identificadores.includes(id)
    : identificadores.has(id);
}

export function visiblePara(nodo: Nodo, observador: Observador): boolean {
  if (nodo.dueno === observador.id) {
    return true;
  }
  switch (nodo.alcance) {
    case 'publico':
      return true;
    case 'contactos':
      return contiene(observador.contactos, nodo.dueno);
    case 'grupo':
      return contiene(observador.grupos, nodo.dueno);
    case 'comunidad':
      return contiene(observador.comunidades, nodo.dueno);
    case 'privado':
      return false;
    default:
      return false;
  }
}

function copiarReferencia(nodo: Nodo): Nodo {
  const copia: Nodo = {
    id: nodo.id,
    tipo: nodo.tipo,
    titulo: nodo.titulo,
    formato: nodo.formato,
    ref: nodo.ref,
    alcance: nodo.alcance,
    dueno: nodo.dueno,
    capas: [...nodo.capas],
    t_creado: nodo.t_creado,
    t_actividad: nodo.t_actividad,
    peso: nodo.peso,
    etiquetas: [...nodo.etiquetas],
  };
  if (nodo.tema !== undefined) {
    copia.tema = nodo.tema;
  }
  if (nodo.categoria !== undefined) {
    copia.categoria = nodo.categoria;
  }
  return copia;
}

export function podarGrafo(grafo: Grafo4D, observador: Observador): Grafo4D {
  const nodos = new Map<string, Nodo>();
  for (const [id, nodo] of grafo.nodos.entries()) {
    if (visiblePara(nodo, observador)) {
      nodos.set(id, copiarReferencia(nodo));
    }
  }

  const aristas = grafo.aristas.filter(
    (arista) => nodos.has(arista.de) && nodos.has(arista.a)
  );

  const ramas = new Map<string, string[]>();
  for (const [padreId, hijos] of grafo.ramas.entries()) {
    if (!nodos.has(padreId)) {
      continue;
    }
    const hijosVisibles = hijos.filter((hijoId) => nodos.has(hijoId));
    if (hijosVisibles.length > 0) {
      ramas.set(padreId, hijosVisibles);
    }
  }

  return { nodos, aristas, ramas };
}
