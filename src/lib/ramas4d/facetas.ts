import { facetasDe, type Grafo4D, type Nodo } from './modelo';
import { podarGrafo, type Observador } from './alcance';
import { agruparPorFaceta } from './agrupar';

export type ClaveFaceta = 'tema' | 'categoria' | 'etiquetas' | 'tipo' | 'formato' | 'alcance' | 'dueno' | 'sistema' | 'capa' | 'fecha' | 'estado';
export interface EntradaFaceta { valor: string; recuento: number; ids: string[] }
export type IndiceFacetas = Record<ClaveFaceta, EntradaFaceta[]>;
export interface FiltroFacetas { valores?: Partial<Record<ClaveFaceta, string[]>>; busqueda?: string }
export type OrdenPorFaceta = 'tema' | 'categoria' | 'formato';
export interface AnclaFaceta { centro: [number, number, number]; region: number; anillo: number; forma: string }
export type AnclasPorFaceta = Map<string, AnclaFaceta>;
export interface Taxonomia { temas: string[]; categorias: string[]; etiquetas: string[] }
export type TipoTaxonomia = 'tema' | 'categoria' | 'etiqueta';

export const CLAVES_FACETA: ClaveFaceta[] = ['tema', 'categoria', 'etiquetas', 'tipo', 'formato', 'alcance', 'dueno', 'sistema', 'capa', 'fecha', 'estado'];
const ANILLOS_FIBONACCI = [8, 13, 21, 34, 55, 89];
const FORMAS_PLATONICAS = ['esfera', 'cubo', 'tetraedro', 'octaedro', 'dodecaedro', 'icosaedro', 'toroide'];
const CLAVE_TAXONOMIA: Record<TipoTaxonomia, keyof Taxonomia> = { tema: 'temas', categoria: 'categorias', etiqueta: 'etiquetas' };

function normalizar(texto: string): string { return texto.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function valoresFaceta(nodo: Nodo, clave: ClaveFaceta): string[] {
  const valor = facetasDe(nodo)[clave];
  return (Array.isArray(valor) ? valor : [valor]).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
}
function visibles(grafo: Grafo4D, observador?: Observador): Grafo4D { return podarGrafo(grafo, observador ?? { id: '' }); }

export function indiceFacetas(grafo: Grafo4D, observador?: Observador): IndiceFacetas {
  const nodos = visibles(grafo, observador).nodos;
  const indice = {} as IndiceFacetas;
  for (const clave of CLAVES_FACETA) {
    const entradas = new Map<string, EntradaFaceta>();
    for (const [id, nodo] of nodos) {
      for (const valor of valoresFaceta(nodo, clave)) {
        const entrada = entradas.get(valor) ?? { valor, recuento: 0, ids: [] };
        entrada.recuento += 1; entrada.ids.push(id); entradas.set(valor, entrada);
      }
    }
    indice[clave] = Array.from(entradas.values()).sort((a, b) => b.recuento - a.recuento || a.valor.localeCompare(b.valor, 'es'));
  }
  return indice;
}
export function buscarFacetas(indice: IndiceFacetas, texto: string): IndiceFacetas {
  const busqueda = normalizar(texto);
  if (!busqueda) return indice;
  const resultado = {} as IndiceFacetas;
  for (const clave of CLAVES_FACETA) resultado[clave] = indice[clave].filter((e) => normalizar(e.valor).includes(busqueda));
  return resultado;
}
export function filtrarPorFacetas(grafo: Grafo4D, filtro: FiltroFacetas, observador?: Observador): Grafo4D {
  const visible = visibles(grafo, observador);
  const seleccion = filtro.valores ?? {};
  const activas = CLAVES_FACETA.filter((clave) => (seleccion[clave]?.length ?? 0) > 0);
  const busqueda = normalizar(filtro.busqueda ?? '');
  const ids = new Set<string>();
  for (const [id, nodo] of visible.nodos) {
    if (!activas.every((clave) => (seleccion[clave] ?? []).some((valor) => valoresFaceta(nodo, clave).includes(valor)))) continue;
    const texto = normalizar([nodo.titulo, nodo.ref, ...CLAVES_FACETA.flatMap((c) => valoresFaceta(nodo, c))].join(' '));
    if (busqueda && !texto.includes(busqueda)) continue;
    ids.add(id);
  }
  return { nodos: new Map(Array.from(visible.nodos).filter(([id]) => ids.has(id))), aristas: visible.aristas.filter((a) => ids.has(a.de) && ids.has(a.a)), ramas: new Map(Array.from(visible.ramas).map(([p, h]) => [p, h.filter((id) => ids.has(id))] as const).filter(([, h]) => h.length > 0)) };
}
export function agruparFacetas(grafo: Grafo4D, clave: ClaveFaceta, observador?: Observador): Map<string, string[]> {
  const visible = visibles(grafo, observador);
  if (clave === 'dueno' || clave === 'carpeta') return agruparPorFaceta(visible, clave);
  if (clave === 'sistema') return agruparPorFaceta(visible, 'cerebro');
  const grupos = new Map<string, string[]>();
  for (const [id, nodo] of visible.nodos) for (const valor of valoresFaceta(nodo, clave)) {
    const miembros = grupos.get(valor) ?? []; miembros.push(id); grupos.set(valor, miembros);
  }
  return grupos;
}
export function anclasPorFaceta(grafo: Grafo4D, clave: OrdenPorFaceta, observador?: Observador): AnclasPorFaceta {
  const grupos = agruparFacetas(grafo, clave, observador);
  const valores = [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  const anclas = new Map<string, AnclaFaceta>();
  for (const [indice, valor] of valores.entries()) {
    const angulo = indice * 2.399963229728653;
    const anillo = indice % ANILLOS_FIBONACCI.length;
    const radio = clave === 'categoria' ? ANILLOS_FIBONACCI[anillo] : 21;
    const centro: [number, number, number] = [Math.cos(angulo) * radio, clave === 'formato' ? (indice % 3 - 1) * 8 : (clave === 'tema' ? 0 : (anillo - 2) * 3), Math.sin(angulo) * radio];
    const forma = FORMAS_PLATONICAS[indice % FORMAS_PLATONICAS.length];
    for (const id of grupos.get(valor) ?? []) anclas.set(id, { centro, region: clave === 'tema' ? indice : 0, anillo, forma });
  }
  return anclas;
}
export function aplicarAnclas(posiciones: Float32Array, ids: string[], anclas: AnclasPorFaceta): Float32Array {
  const resultado = new Float32Array(posiciones);
  ids.forEach((id, indice) => { const ancla = anclas.get(id); const inicio = indice * 3; if (ancla && inicio + 2 < resultado.length) resultado.set(ancla.centro, inicio); });
  return resultado;
}
export function taxonomiaVacia(): Taxonomia { return { temas: [], categorias: [], etiquetas: [] }; }
export function crearFaceta(taxonomia: Taxonomia, tipo: TipoTaxonomia, nombre: string): Taxonomia {
  const clave = CLAVE_TAXONOMIA[tipo]; const valor = nombre.trim();
  if (!valor || taxonomia[clave].some((v) => normalizar(v) === normalizar(valor))) return taxonomia;
  return { ...taxonomia, [clave]: [...taxonomia[clave], valor] };
}
export function renombrarFaceta(taxonomia: Taxonomia, tipo: TipoTaxonomia, anterior: string, nuevo: string): Taxonomia {
  const clave = CLAVE_TAXONOMIA[tipo]; const destino = nuevo.trim();
  if (!destino) return taxonomia;
  return { ...taxonomia, [clave]: taxonomia[clave].map((v) => v === anterior ? destino : v) };
}
export function fusionarFacetas(taxonomia: Taxonomia, tipo: TipoTaxonomia, origen: string, destino: string): Taxonomia {
  const clave = CLAVE_TAXONOMIA[tipo]; const nuevo = destino.trim();
  if (!nuevo) return taxonomia;
  const valores = taxonomia[clave].filter((v) => v !== origen && normalizar(v) !== normalizar(nuevo));
  return { ...taxonomia, [clave]: valores.includes(nuevo) ? valores : [...valores, nuevo] };
}
export function renombrarFacetasEnGrafo(grafo: Grafo4D, tipo: TipoTaxonomia, anterior: string, nuevo: string): Grafo4D {
  const nodos = new Map<string, Nodo>();
  for (const [id, nodo] of grafo.nodos) {
    if (tipo === 'tema' && nodo.tema === anterior) nodos.set(id, { ...nodo, tema: nuevo });
    else if (tipo === 'categoria' && nodo.categoria === anterior) nodos.set(id, { ...nodo, categoria: nuevo });
    else if (tipo === 'etiqueta' && nodo.etiquetas.includes(anterior)) nodos.set(id, { ...nodo, etiquetas: Array.from(new Set(nodo.etiquetas.map((v) => v === anterior ? nuevo : v))) });
    else nodos.set(id, nodo);
  }
  return { ...grafo, nodos };
}
