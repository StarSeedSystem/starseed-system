/**
 * agrupar — agrupación jerárquica y zoom semántico de Ramas 4D (MV1125D · parte 1 de 2).
 * Lejos, una galaxia es un cuerpo (tamaño = suma de pesos); cerca se abre en
 * sistemas, planetas y contenido. Puro y determinista; sin contenido privado.
 */
import type { Grafo4D, Nodo } from './modelo';
export type FacetaAgrupacion = 'dueno' | 'cerebro' | 'entidad' | 'carpeta' | 'comunidad';
export type NivelZoom = 'galaxia' | 'sistema' | 'contenido';
export interface Grupo {
  id: string; faceta: FacetaAgrupacion; etiqueta: string;
  peso: number; nodos: string[]; subgrupos: Grupo[];
}
export interface Cuerpo {
  id: string; etiqueta: string; peso: number; nodos: string[];
  colapsado: boolean;
}
export interface OpcionesZoom {
  topeCuerpos?: number; umbralAbrir?: number;
}
export interface NivelDetalle {
  distancia: number; nivel: NivelZoom; cuerpos: Cuerpo[]; ocultos: number;
}
export const DISTANCIA_GALAXIA = 64;
export const DISTANCIA_SISTEMA = 24;
export const CUERPOS_VISIBLES_POR_DEFECTO = 5000;
export const UMBRAL_ABRIR_POR_DEFECTO = 8;
const SIN_DATO = 'sin-dato';
function valorPrefijado(nodo: Nodo, prefijo: string): string | null {
  const fuente = nodo.capas.find((valor) => valor.startsWith(prefijo))
    ?? nodo.etiquetas.find((valor) => valor.startsWith(prefijo));
  return fuente ? fuente.slice(prefijo.length) || SIN_DATO : null;
}
function carpetaDeRef(ref: string): string {
  const partes = ref.split('?')[0].split('#')[0].split('/').filter(Boolean);
  if (partes.length === 0) return SIN_DATO;
  return partes.length === 1 ? partes[0] : partes.slice(0, -1).join('/');
}
/** Valor de agrupación de una faceta, leído de los datos existentes del nodo. */
export function valorDeFaceta(nodo: Nodo, faceta: FacetaAgrupacion): string {
  switch (faceta) {
    case 'dueno': return nodo.dueno || SIN_DATO;
    case 'cerebro':
      return valorPrefijado(nodo, 'cerebro:') ?? (nodo.tipo === 'cerebro' ? nodo.id : SIN_DATO);
    case 'entidad':
      return valorPrefijado(nodo, 'entidad:') ?? nodo.categoria ?? nodo.tema ?? SIN_DATO;
    case 'carpeta':
      return valorPrefijado(nodo, 'carpeta:') ?? carpetaDeRef(nodo.ref);
    case 'comunidad':
      return valorPrefijado(nodo, 'comunidad:') ?? (nodo.alcance === 'comunidad' ? nodo.dueno : SIN_DATO);
  }
}
function pesoDe(nodo: Nodo): number {
  return Number.isFinite(nodo.peso) ? nodo.peso : 0;
}
function construirGrupos(
  nodos: Nodo[], faceta: FacetaAgrupacion, secundaria?: FacetaAgrupacion,
): Grupo[] {
  const porValor = new Map<string, Nodo[]>();
  for (const nodo of nodos) {
    const valor = valorDeFaceta(nodo, faceta);
    const lista = porValor.get(valor);
    if (lista) lista.push(nodo);
    else porValor.set(valor, [nodo]);
  }
  const grupos: Grupo[] = [];
  for (const [valor, lista] of porValor) {
    grupos.push({
      id: `${faceta}:${valor}`, faceta, etiqueta: valor,
      peso: lista.reduce((suma, nodo) => suma + pesoDe(nodo), 0),
      nodos: lista.map((nodo) => nodo.id),
      subgrupos: secundaria ? construirGrupos(lista, secundaria) : [],
    });
  }
  grupos.sort((a, b) => b.peso - a.peso || a.id.localeCompare(b.id));
  return grupos;
}
/** Agrupa los nodos del grafo; con `secundaria`, deja la jerarquía anidada. */
export function agrupar(
  grafo: Grafo4D, faceta: FacetaAgrupacion, secundaria?: FacetaAgrupacion,
): Grupo[] {
  return construirGrupos(Array.from(grafo.nodos.values()), faceta, secundaria);
}
/**
 * Qué cuerpos se ven a una distancia dada. Lejos se colapsa todo; en «sistema»
 * se abren los grupos con peso suficiente; cerca se abre lo que cabe bajo el
 * tope de cuerpos visibles (cada nodo abierto cuenta como un cuerpo).
 */
export function nivelDeDetalle(
  distancia: number, grupos: Grupo[] = [], opciones: OpcionesZoom = {},
): NivelDetalle {
  const tope = Math.max(1, Math.floor(opciones.topeCuerpos ?? CUERPOS_VISIBLES_POR_DEFECTO));
  const umbral = opciones.umbralAbrir ?? UMBRAL_ABRIR_POR_DEFECTO;
  const d = Number.isFinite(distancia) ? Math.max(0, distancia) : DISTANCIA_GALAXIA;
  const nivel: NivelZoom =
    d >= DISTANCIA_GALAXIA ? 'galaxia' : d >= DISTANCIA_SISTEMA ? 'sistema' : 'contenido';
  const ordenados = [...grupos].sort((a, b) => b.peso - a.peso || a.id.localeCompare(b.id));
  const cuerpos: Cuerpo[] = [];
  let ocupados = 0;
  let ocultos = 0;
  for (const grupo of ordenados) {
    if (ocupados >= tope) {
      ocultos += 1;
      continue;
    }
    const quiereAbrir = nivel === 'contenido' || (nivel === 'sistema' && grupo.peso >= umbral);
    const costeAbierto = Math.max(1, grupo.nodos.length);
    const abierto = quiereAbrir && ocupados + costeAbierto <= tope;
    if (!abierto && ocupados + 1 > tope) {
      ocultos += 1;
      continue;
    }
    ocupados += abierto ? costeAbierto : 1;
    cuerpos.push({
      id: grupo.id, etiqueta: grupo.etiqueta, peso: grupo.peso,
      nodos: grupo.nodos, colapsado: !abierto,
    });
  }
  return { distancia: d, nivel, cuerpos, ocultos };
}
