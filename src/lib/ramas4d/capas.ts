import { Nodo, Grafo4D } from './modelo';
import { Observador, podarGrafo } from './alcance';

export type CapaQuintaDimension =
  | 'conciencia'
  | 'capacidades'
  | 'senales'
  | 'alcance'
  | 'sistema'
  | 'universosParalelos';

export interface CatalogoCapas {
  conciencia: string[];
  capacidades: string[];
  senales: string[];
  alcance: string[];
  sistema: string[];
  universosParalelos: string[];
}

export const CAPAS_QUINTA_DIMENSION: CatalogoCapas = {
  conciencia: ['individual', 'colectiva', 'universal'],
  capacidades: ['cognitivas', 'creativas', 'tecnicas', 'sociales'],
  senales: ['internas', 'externas', 'sincronizacion'],
  alcance: ['privado', 'contactos', 'grupo', 'comunidad', 'publico'],
  sistema: [
    'politico',
    'educativo',
    'cultural',
    'social',
    'ia',
    'creacion',
    'metagenesis',
  ],
  universosParalelos: ['variaciones', 'versiones'],
};

function nodoTieneCapa(nodo: Nodo, capaBuscada: string): boolean {
  return nodo.capas.some((capa) => capa.startsWith(capaBuscada));
}

export function filtrarPorCapas(grafo: Grafo4D, capasFiltro: string[]): Grafo4D {
  if (capasFiltro.length === 0) {
    return { ...grafo };
  }

  const nodosFiltrados = new Map<string, Nodo>();
  for (const [id, nodo] of grafo.nodos.entries()) {
    const coincide = capasFiltro.some((capa) => nodoTieneCapa(nodo, capa));
    if (coincide) {
      nodosFiltrados.set(id, nodo);
    }
  }

  const idsFiltrados = new Set(nodosFiltrados.keys());

  const aristasFiltradas = grafo.aristas.filter(
    (arista) => idsFiltrados.has(arista.de) && idsFiltrados.has(arista.a)
  );

  const ramasFiltradas = new Map<string, string[]>();
  for (const [padreId, hijos] of grafo.ramas.entries()) {
    if (idsFiltrados.has(padreId)) {
      const hijosVisibles = hijos.filter((hijoId) => idsFiltrados.has(hijoId));
      if (hijosVisibles.length > 0) {
        ramasFiltradas.set(padreId, hijosVisibles);
      }
    }
  }

  return {
    nodos: nodosFiltrados,
    aristas: aristasFiltradas,
    ramas: ramasFiltradas,
  };
}

export interface FiltroCapasQuintaDimension {
  conciencia?: string[];
  capacidades?: string[];
  senales?: string[];
  alcance?: string[];
  sistema?: string[];
  universosParalelos?: string[];
}

function expandirFiltroCapas(filtro: FiltroCapasQuintaDimension): string[] {
  const expandidas: string[] = [];
  for (const [categoria, valores] of Object.entries(filtro)) {
    if (valores && valores.length > 0) {
      for (const valor of valores) {
        expandidas.push(`${categoria}-${valor}`);
      }
    }
  }
  return expandidas;
}

export function filtrarGrafoPorCapasQuintaDimension(
  grafo: Grafo4D,
  filtro: FiltroCapasQuintaDimension,
  observador?: Observador
): Grafo4D {
  const capasExpandidas = expandirFiltroCapas(filtro);
  const grafoVisible = podarGrafo(grafo, observador ?? { id: '' });
  return filtrarPorCapas(grafoVisible, capasExpandidas);
}