/**
 * Matemática pura de la película de scroll: la fracción de avance de la sección,
 * qué fotograma toca y con cuánta opacidad se funde el siguiente. Sin DOM, sin
 * disco y sin red: el motor de canvas solo pone los píxeles.
 */

export interface CuadroPelicula {
  /** Índice del fotograma que se dibuja a opacidad completa. */
  actual: number;
  /** Índice del fotograma que se dibuja encima, fundido. */
  siguiente: number;
  /** Opacidad del siguiente, 0..1. */
  mezcla: number;
}

export interface ResumenJank {
  p95: number;
  maximo: number;
  muestras: number;
}

/** Acota un número a un rango; lo no finito cae al mínimo. */
export function acotar(valor: number, minimo = 0, maximo = 1): number {
  if (!Number.isFinite(valor)) return minimo;
  return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Fracción 0..1 del recorrido de una sección: 0 cuando su borde superior toca
 * el de arriba de la ventana y 1 cuando ya ha pasado su alto útil.
 */
export function fraccionDeScroll(scrollY: number, inicio: number, alto: number): number {
  if (!Number.isFinite(alto) || alto <= 0) return 0;
  return acotar((scrollY - inicio) / alto);
}

/** Reparte la fracción entre el fotograma actual y el siguiente. */
export function cuadroDeFraccion(fraccion: number, total: number, fundido = true): CuadroPelicula {
  const n = Math.max(0, Math.floor(total));
  if (n <= 1) return { actual: 0, siguiente: 0, mezcla: 0 };
  const recorrido = acotar(fraccion) * (n - 1);
  const actual = Math.min(n - 1, Math.floor(recorrido));
  const siguiente = Math.min(n - 1, actual + 1);
  const mezcla = fundido ? acotar(recorrido - actual) : 0;
  return { actual, siguiente, mezcla };
}

/** Fracción a partir del rectángulo de la sección y el alto de la ventana. */
export function fraccionDeSeccion(
  rect: { top: number; height: number },
  altoVentana: number,
): number {
  return fraccionDeScroll(-rect.top, 0, Math.max(1, rect.height - altoVentana));
}

export interface Encaje {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rectángulo donde dibujar la imagen: cubre el lienzo o cabe entero, centrado. */
export function encaje(
  anchoNatural: number,
  altoNatural: number,
  ancho: number,
  alto: number,
  cubrir: boolean,
): Encaje {
  if (anchoNatural <= 0 || altoNatural <= 0) return { x: 0, y: 0, w: ancho, h: alto };
  const escala = cubrir
    ? Math.max(ancho / anchoNatural, alto / altoNatural)
    : Math.min(ancho / anchoNatural, alto / altoNatural);
  const w = anchoNatural * escala;
  const h = altoNatural * escala;
  return { x: (ancho - w) / 2, y: (alto - h) / 2, w, h };
}

/** Con el movimiento apagado o reducido se queda el último fotograma, sin fundido. */
export function cuadroApagado(total: number): CuadroPelicula {
  const ultimo = Math.max(0, Math.floor(total) - 1);
  return { actual: ultimo, siguiente: ultimo, mezcla: 0 };
}

/** p95 y máximo de las duraciones por fotograma, en milisegundos. */
export function resumenJank(muestras: readonly number[]): ResumenJank {
  const validas = muestras.filter((m) => Number.isFinite(m) && m >= 0);
  if (validas.length === 0) return { p95: 0, maximo: 0, muestras: 0 };
  const orden = [...validas].sort((a, b) => a - b);
  const indice = Math.min(orden.length - 1, Math.max(0, Math.ceil(orden.length * 0.95) - 1));
  return { p95: orden[indice], maximo: orden[orden.length - 1], muestras: orden.length };
}
