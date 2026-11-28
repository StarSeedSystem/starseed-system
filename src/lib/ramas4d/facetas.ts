import { agruparPorFaceta, type FacetaAgrupacion } from './agrupar';
import { facetasDe, type Grafo4D, type Nodo } from './modelo';

export const FACETAS_TEXTO = ['tema', 'categoria', 'etiquetas', 'tipo', 'formato', 'alcance', 'dueno', 'sistema', 'capa', 'estado'] as const;
export type FacetaTexto = (typeof FACETAS_TEXTO)[number];
export type SeleccionFacetas = Partial<Record<FacetaTexto, readonly string[]>>;
export type CampoTaxonomia = 'tema' | 'categoria' | 'etiquetas';
export type FacetaAncla = 'tema' | 'categoria' | 'formato';
export type Ancla = readonly [number, number, number];
export interface IndiceFacetas { total: number; porFaceta: Map<FacetaTexto, Map<string, number>>; }
export interface Taxonomia { tema: string[]; categoria: string[]; etiquetas: string[]; }
export type Taxonomias = Record<string, Taxonomia>;

const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5));
const LADOS_FORMATO: Record<string, number> = { texto: 3, imagen: 4, video: 5, audio: 6, modelo3d: 7,
  app: 3, web: 4, documento: 5, tabla: 6, pizarra: 7, presentacion: 3, enlace: 4, flujo: 5 };

function valoresDe(nodo: Nodo, faceta: FacetaTexto): string[] {
  const valor: unknown = facetasDe(nodo)[faceta];
  const bruto = Array.isArray(valor) ? valor : [valor];
  return bruto.filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map(String).filter((v) => v.trim().length > 0);
}

export function indiceDeFacetas(grafo: Grafo4D): IndiceFacetas {
  const porFaceta = new Map<FacetaTexto, Map<string, number>>();
  for (const faceta of FACETAS_TEXTO) porFaceta.set(faceta, new Map());
  for (const nodo of grafo.nodos.values()) {
    for (const faceta of FACETAS_TEXTO) {
      for (const valor of new Set(valoresDe(nodo, faceta))) {
        const cuenta = porFaceta.get(faceta)!;
        cuenta.set(valor, (cuenta.get(valor) ?? 0) + 1);
      }
    }
  }
  return { total: grafo.nodos.size, porFaceta };
}
export function filtrarPorFacetas(grafo: Grafo4D, seleccion: SeleccionFacetas): Grafo4D {
  const activas: Array<[FacetaTexto, readonly string[]]> = [];
  for (const faceta of FACETAS_TEXTO) {
    const valores = seleccion[faceta];
    if (valores && valores.length > 0) activas.push([faceta, valores]);
  }
  if (activas.length === 0) return grafo;

  const nodos = new Map<string, Nodo>();
  for (const [id, nodo] of grafo.nodos.entries()) {
    const coincide = activas.every(([faceta, valores]) =>
      valoresDe(nodo, faceta).some((valor) => valores.includes(valor))
    );
    if (coincide) nodos.set(id, nodo);
  }
  const aristas = grafo.aristas.filter((a) => nodos.has(a.de) && nodos.has(a.a));
  const ramas = new Map<string, string[]>();
  for (const [padre, hijos] of grafo.ramas.entries()) {
    if (!nodos.has(padre)) continue;
    const visibles = hijos.filter((hijo) => nodos.has(hijo));
    if (visibles.length > 0) ramas.set(padre, visibles);
  }
  return { nodos, aristas, ramas };
}

export function agruparFacetas(grafo: Grafo4D, faceta: FacetaTexto | FacetaAgrupacion): Map<string, string[]> {
  const delegadas: FacetaAgrupacion[] = ['dueno', 'cerebro', 'entidad', 'carpeta', 'comunidad'];
  if (delegadas.includes(faceta as FacetaAgrupacion)) {
    return agruparPorFaceta(grafo, faceta as FacetaAgrupacion);
  }
  const grupos = new Map<string, string[]>();
  for (const [id, nodo] of grafo.nodos.entries()) {
    for (const valor of new Set(valoresDe(nodo, faceta as FacetaTexto))) {
      const miembros = grupos.get(valor);
      if (miembros) miembros.push(id);
      else grupos.set(valor, [id]);
    }
  }
  return grupos;
}
export function anclasPorFaceta(grafo: Grafo4D, faceta: FacetaAncla): Map<string, Ancla> {
  const claves = Array.from(agruparFacetas(grafo, faceta).keys()).sort();
  const anclas = new Map<string, Ancla>();
  const phi = (1 + Math.sqrt(5)) / 2;
  claves.forEach((clave, i) => {
    const angulo = faceta === 'categoria' ? i * ANGULO_AUREO : (i * Math.PI * 2) / Math.max(1, claves.length);
    const radio = faceta === 'categoria' ? Math.pow(phi, i + 1) : phi * phi;
    const altura = faceta === 'formato' ? (ladosFormato(clave) - 3) * 0.618 : 0;
    anclas.set(clave, [Math.cos(angulo) * radio, altura, Math.sin(angulo) * radio]);
  });
  return anclas;
}
export function ladosFormato(formato: string): number { return LADOS_FORMATO[formato] ?? 5; }

function taxonomiaVacia(): Taxonomia { return { tema: [], categoria: [], etiquetas: [] }; }
function sinRepetidos(valores: string[]): string[] {
  return valores.filter((v, i) => v.trim() !== '' && valores.findIndex((o) => o.trim().toLocaleLowerCase() === v.trim().toLocaleLowerCase()) === i);
}
function conValor(t: Taxonomia, campo: CampoTaxonomia, valor: string): Taxonomia {
  return { ...t, [campo]: sinRepetidos([...t[campo], valor]) };
}
export function taxonomiasDe(grafo: Grafo4D): Taxonomias {
  const taxonomias: Taxonomias = {};
  for (const n of grafo.nodos.values()) {
    const propia = taxonomias[n.dueno] ?? (taxonomias[n.dueno] = taxonomiaVacia());
    if (n.tema) propia.tema = sinRepetidos([...propia.tema, n.tema]);
    if (n.categoria) propia.categoria = sinRepetidos([...propia.categoria, n.categoria]);
    propia.etiquetas = sinRepetidos([...propia.etiquetas, ...n.etiquetas]);
  }
  return taxonomias;
}
export function crearFaceta(t: Taxonomias, dueno: string, campo: CampoTaxonomia, valor: string): Taxonomias { return { ...t, [dueno]: conValor(t[dueno] ?? taxonomiaVacia(), campo, valor) }; }
export function renombrarFaceta(t: Taxonomias, dueno: string, campo: CampoTaxonomia, anterior: string, nuevo: string): Taxonomias {
  const actual = t[dueno] ?? taxonomiaVacia();
  const renombrados = actual[campo].map((v) => (v === anterior ? nuevo : v));
  return { ...t, [dueno]: conValor({ ...actual, [campo]: sinRepetidos(renombrados) }, campo, nuevo) };
}
export function fusionarFacetas(t: Taxonomias, dueno: string, campo: CampoTaxonomia, origenes: readonly string[], destino: string): Taxonomias {
  const actual = t[dueno] ?? taxonomiaVacia();
  const conservados = actual[campo].filter((v) => !origenes.includes(v));
  return { ...t, [dueno]: conValor({ ...actual, [campo]: conservados }, campo, destino) };
}
