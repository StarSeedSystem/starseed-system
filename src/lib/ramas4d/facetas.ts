import type { Grafo4D, Nodo } from './modelo';
import { facetasDe } from './modelo';
import { agruparPorFaceta } from './agrupar';

export type ClaveFaceta = 'tema' | 'categoria' | 'etiqueta' | 'tipo' | 'formato' | 'alcance' | 'dueno' | 'sistema';
export const CLAVES_FACETA: readonly ClaveFaceta[] = ['tema', 'categoria', 'etiqueta', 'tipo', 'formato', 'alcance', 'dueno', 'sistema'];
export interface ValorFaceta { valor: string; cuenta: number }
export type IndiceFacetas = Record<ClaveFaceta, ValorFaceta[]>;
export type SeleccionFacetas = Partial<Record<ClaveFaceta, string[]>>;

function valoresDeFaceta(nodo: Nodo, faceta: ClaveFaceta): string[] {
  const facetas = facetasDe(nodo);
  if (faceta === 'etiqueta') {
    const etiquetas = facetas.etiquetas;
    return Array.isArray(etiquetas) ? etiquetas.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];
  }
  const valor = facetas[faceta];
  return typeof valor === 'string' && valor.length > 0 ? [valor] : [];
}

export function indiceFacetas(grafo: Grafo4D): IndiceFacetas {
  const cuentas: Record<ClaveFaceta, Map<string, number>> = {
    tema: new Map(), categoria: new Map(), etiqueta: new Map(), tipo: new Map(),
    formato: new Map(), alcance: new Map(), dueno: new Map(), sistema: new Map(),
  };
  for (const nodo of grafo.nodos.values())
    for (const faceta of CLAVES_FACETA)
      for (const valor of valoresDeFaceta(nodo, faceta))
        cuentas[faceta].set(valor, (cuentas[faceta].get(valor) ?? 0) + 1);
  const indice = {} as IndiceFacetas;
  for (const faceta of CLAVES_FACETA)
    indice[faceta] = [...cuentas[faceta]].map(([valor, cuenta]) => ({ valor, cuenta }))
      .sort((a, b) => b.cuenta - a.cuenta || a.valor.localeCompare(b.valor, 'es'));
  return indice;
}

function coincide(nodo: Nodo, seleccion: SeleccionFacetas): boolean {
  return CLAVES_FACETA.every((faceta) => {
    const elegidos = seleccion[faceta];
    if (!elegidos?.length) return true;
    const valores = valoresDeFaceta(nodo, faceta);
    return elegidos.some((v) => valores.includes(v));
  });
}

export function filtrarPorFacetas(grafo: Grafo4D, seleccion: SeleccionFacetas): Grafo4D {
  if (!CLAVES_FACETA.some((f) => seleccion[f]?.length)) {
    return { nodos: new Map(grafo.nodos), aristas: [...grafo.aristas], ramas: new Map(grafo.ramas) };
  }
  const nodos = new Map([...grafo.nodos].filter(([, nodo]) => coincide(nodo, seleccion)));
  const aristas = grafo.aristas.filter((a) => nodos.has(a.de) && nodos.has(a.a));
  const ramas = new Map<string, string[]>();
  for (const [padre, hijos] of grafo.ramas) {
    const visibles = nodos.has(padre) ? hijos.filter((h) => nodos.has(h)) : [];
    if (visibles.length) ramas.set(padre, visibles);
  }
  return { nodos, aristas, ramas };
}

export function agruparPorFacetaClave(grafo: Grafo4D, faceta: ClaveFaceta): Map<string, string[]> {
  if (faceta === 'dueno') return agruparPorFaceta(grafo, 'dueno');
  if (faceta === 'sistema') return agruparPorFaceta(grafo, 'cerebro');
  const grupos = new Map<string, string[]>();
  for (const [id, nodo] of grafo.nodos)
    for (const valor of valoresDeFaceta(nodo, faceta)) grupos.set(valor, [...(grupos.get(valor) ?? []), id]);
  return grupos;
}

export type DisposicionFaceta = 'region' | 'anillo' | 'forma';
export interface AnclaFaceta { faceta: ClaveFaceta; valor: string; indice: number; posicion: [number, number, number]; forma: string }
const FORMAS = ['icosaedro', 'octaedro', 'tetraedro', 'cubo', 'dodecaedro'] as const;
const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));

export function anclasDeFaceta(grafo: Grafo4D, faceta: ClaveFaceta, disposicion: DisposicionFaceta = 'region', radio = 60): AnclaFaceta[] {
  const valores = indiceFacetas(grafo)[faceta].map((v) => v.valor);
  const total = Math.max(valores.length, 1);
  return valores.map((valor, indice) => {
    if (disposicion === 'anillo') {
      const r = radio * (0.35 + (0.65 * indice) / Math.max(total - 1, 1));
      return { faceta, valor, indice, posicion: [r, 0, 0], forma: '' };
    }
    if (disposicion === 'forma') {
      const y = 1 - (2 * (indice + 0.5)) / total;
      const anillo = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = indice * ANGULO_AUREO;
      const posicion: [number, number, number] = [radio * Math.cos(theta) * anillo, radio * y, radio * Math.sin(theta) * anillo];
      return { faceta, valor, indice, posicion, forma: FORMAS[indice % FORMAS.length] };
    }
    const theta = (2 * Math.PI * indice) / total;
    return { faceta, valor, indice, posicion: [radio * Math.cos(theta), 0, radio * Math.sin(theta)], forma: '' };
  });
}

export type ClaveTaxonomia = 'temas' | 'categorias' | 'etiquetas';
export interface Taxonomia { id: string; temas: string[]; categorias: string[]; etiquetas: string[] }

export function crearTaxonomia(id: string): Taxonomia {
  return { id, temas: [], categorias: [], etiquetas: [] };
}

export function anadirValor(taxonomia: Taxonomia, clave: ClaveTaxonomia, valor: string): Taxonomia {
  const limpio = valor.trim();
  if (!limpio || taxonomia[clave].includes(limpio)) return taxonomia;
  return { ...taxonomia, [clave]: [...taxonomia[clave], limpio] };
}

export function renombrarValor(taxonomia: Taxonomia, clave: ClaveTaxonomia, anterior: string, nuevo: string): Taxonomia {
  const limpio = nuevo.trim();
  const lista = taxonomia[clave];
  if (!limpio || !lista.includes(anterior) || limpio === anterior) return taxonomia;
  if (lista.includes(limpio)) return fusionarValores(taxonomia, clave, anterior, limpio);
  return { ...taxonomia, [clave]: lista.map((v) => (v === anterior ? limpio : v)) };
}

export function fusionarValores(taxonomia: Taxonomia, clave: ClaveTaxonomia, origen: string, destino: string): Taxonomia {
  const lista = taxonomia[clave];
  if (!lista.includes(origen) || !lista.includes(destino) || origen === destino) return taxonomia;
  return { ...taxonomia, [clave]: lista.filter((v) => v !== origen) };
}
