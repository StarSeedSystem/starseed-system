/**
 * arbol — árbol de Merkle SHA-256 al estilo BEP 52 (ENJ1110A · 2026-11-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/enjambre-datos.md` §3.
 *
 *  · Hojas de 16 KiB (la última puede ser más corta); hash de hoja = SHA-256 del bloque.
 *  · Nodo interno = SHA-256(izquierdo ‖ derecho). El nivel de hojas se completa hasta una potencia de dos con
 *    hashes CERO (como BEP 52), así que la `raíz` de un archivo es la misma que su `pieces root` en un torrent v2.
 *  · Una PIEZA (trozo) es una capa del árbol: 2^k hojas = 16 KiB · 2^k. La «capa de piezas» son los 32 bytes
 *    de cada nodo de esa altura; con ella (verificada contra la raíz) basta comparar el hash de cada trozo.
 *  · Sin la capa, un trozo se verifica con su PRUEBA: los hashes hermanos desde su nodo hasta la raíz.
 *  · Archivo vacío: una sola hoja vacía (raíz = SHA-256 de nada).
 *
 * Puro: solo WebCrypto. Los hashes se pasan como `Uint8Array` de 32 bytes.
 */

import { igualesBytes, log2Entero, potenciaDeDos, sha256, concatenar } from "./util";

export const TAM_HOJA = 16 * 1024;
export const BYTES_HASH = 32;
/** Tope de tamaño de contenido (1 TiB): por encima la aritmética de enteros de JS deja de ser exacta con holgura. */
export const MAX_TAMANO_CONTENIDO = 2 ** 40;
export const MIN_TAMANO_PIEZA = TAM_HOJA;
export const MAX_TAMANO_PIEZA = 4 * 1024 * 1024;

const CERO = new Uint8Array(BYTES_HASH);
const cerosCache: Uint8Array[] = [CERO];

/** Hash del subárbol vacío de altura `h` (relleno del árbol). */
export async function cerosHasta(h: number): Promise<Uint8Array> {
  while (cerosCache.length <= h) {
    const p = cerosCache[cerosCache.length - 1];
    cerosCache.push(await hashPar(p, p));
  }
  return cerosCache[h];
}

export function hashHoja(bloque: Uint8Array): Promise<Uint8Array> {
  return sha256(bloque);
}

export function hashPar(izq: Uint8Array, der: Uint8Array): Promise<Uint8Array> {
  return sha256(concatenar([izq, der]));
}

/* ───────────────────────────── Geometría ───────────────────────────── */

export interface Geometria {
  tamano: number;
  nHojas: number;
  /** Altura de la raíz (0 si hay una sola hoja). */
  profundidad: number;
  /** Altura de los nodos que son piezas (≤ profundidad). */
  nivelPieza: number;
  /** Tamaño EFECTIVO de pieza: 16 KiB · 2^nivelPieza. */
  tamanoPieza: number;
  nPiezas: number;
}

export function profundidadDe(nHojas: number): number {
  let p = 0;
  let n = 1;
  while (n < nHojas) {
    n *= 2;
    p++;
  }
  return p;
}

/**
 * Geometría de un contenido de `tamano` bytes con piezas nominales de `tamanoPieza` (potencia de dos entre
 * 16 KiB y 4 MiB). Si el contenido es más pequeño que la pieza, la pieza se encoge a lo que hace falta (nivel
 * máximo = profundidad) y hay una sola. Null si los datos no valen.
 */
export function geometria(tamano: number, tamanoPieza: number): Geometria | null {
  if (!Number.isSafeInteger(tamano) || tamano < 0 || tamano > MAX_TAMANO_CONTENIDO) return null;
  if (!potenciaDeDos(tamanoPieza) || tamanoPieza < MIN_TAMANO_PIEZA || tamanoPieza > MAX_TAMANO_PIEZA) return null;
  const nHojas = Math.max(1, Math.ceil(tamano / TAM_HOJA));
  const profundidad = profundidadDe(nHojas);
  const nivelPieza = Math.min(log2Entero(tamanoPieza / TAM_HOJA), profundidad);
  const efectivo = TAM_HOJA * 2 ** nivelPieza;
  return { tamano, nHojas, profundidad, nivelPieza, tamanoPieza: efectivo, nPiezas: Math.max(1, Math.ceil(nHojas / 2 ** nivelPieza)) };
}

/** Bytes que ocupa la pieza `i` (la última puede ser más corta). 0 si `i` está fuera. */
export function longitudPieza(g: Geometria, i: number): number {
  if (!Number.isInteger(i) || i < 0 || i >= g.nPiezas) return 0;
  return i < g.nPiezas - 1 ? g.tamanoPieza : g.tamano - i * g.tamanoPieza;
}

/** Nodos que hay en la altura `nivel`. */
export function nodosEnNivel(g: Geometria, nivel: number): number {
  return Math.max(1, Math.ceil(g.nHojas / 2 ** nivel));
}

/**
 * Tamaño de pieza por defecto según el tamaño del contenido: entre 64 KiB y 1 MiB, la menor que deja ≤ 2048
 * piezas. Es una función del tamaño: dos neuronas que solo conocen la raíz y el tamaño (un imán) coinciden.
 */
export function elegirTamanoPieza(tamano: number): number {
  let p = 64 * 1024;
  while (p < 1024 * 1024 && tamano / p > 2048) p *= 2;
  return p;
}

/* ───────────────────────────── Construcción ───────────────────────────── */

export interface ArbolMerkle {
  tamano: number;
  /** capas[0] = hojas reales; capas[h] = nodos reales de altura h; la última tiene la raíz. */
  capas: Uint8Array[][];
  raiz: Uint8Array;
  profundidad: number;
}

/** Sube un árbol desde sus hojas reales. */
export async function capasDeHojas(hojas: Uint8Array[]): Promise<Uint8Array[][]> {
  const capas: Uint8Array[][] = [hojas];
  let actual = hojas;
  let h = 0;
  while (actual.length > 1) {
    const sig: Uint8Array[] = [];
    for (let i = 0; i < actual.length; i += 2) sig.push(await hashPar(actual[i], i + 1 < actual.length ? actual[i + 1] : await cerosHasta(h)));
    capas.push(sig);
    actual = sig;
    h++;
  }
  return capas;
}

/** Constructor en flujo: se le dan los bytes por tandas de cualquier tamaño; guarda solo los 32 bytes de cada hoja. */
export class ConstructorArbol {
  private buf = new Uint8Array(TAM_HOJA);
  private n = 0;
  private hojas: Uint8Array[] = [];
  private total = 0;
  private cerrado = false;

  async agregar(datos: Uint8Array): Promise<void> {
    if (this.cerrado) throw new Error("arbol: constructor cerrado");
    let o = 0;
    while (o < datos.length) {
      const k = Math.min(TAM_HOJA - this.n, datos.length - o);
      this.buf.set(datos.subarray(o, o + k), this.n);
      this.n += k;
      o += k;
      this.total += k;
      if (this.n === TAM_HOJA) {
        this.hojas.push(await hashHoja(this.buf));
        this.n = 0;
      }
    }
  }

  get bytes(): number {
    return this.total;
  }

  async cerrar(): Promise<ArbolMerkle> {
    if (this.cerrado) throw new Error("arbol: constructor cerrado");
    this.cerrado = true;
    if (this.n > 0 || this.hojas.length === 0) this.hojas.push(await hashHoja(this.buf.subarray(0, this.n)));
    const capas = await capasDeHojas(this.hojas);
    return { tamano: this.total, capas, raiz: capas[capas.length - 1][0], profundidad: capas.length - 1 };
  }
}

export async function arbolDeBytes(datos: Uint8Array): Promise<ArbolMerkle> {
  const c = new ConstructorArbol();
  await c.agregar(datos);
  return c.cerrar();
}

/** Los hashes de la capa de piezas de un árbol construido (nodos de la altura de la pieza). */
export function capaDePiezas(arbol: ArbolMerkle, g: Geometria): Uint8Array[] {
  return arbol.capas[g.nivelPieza];
}

/* ───────────────────────────── Pruebas ───────────────────────────── */

/** Hashes hermanos desde el nodo (`nivel`, `indice`) hasta debajo de la raíz. */
export async function pruebaDeNodo(capas: Uint8Array[][], nivel: number, indice: number): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  let idx = indice;
  for (let h = nivel; h < capas.length - 1; h++) {
    out.push(capas[h][idx ^ 1] ?? (await cerosHasta(h)));
    idx = Math.floor(idx / 2);
  }
  return out;
}

/** Raíz que resulta de poner `hash` en (`nivel`, `indice`) con esa prueba. */
export async function raizDesdePrueba(hash: Uint8Array, indice: number, prueba: readonly Uint8Array[]): Promise<Uint8Array> {
  let cur = hash;
  let idx = indice;
  for (const h of prueba) {
    cur = idx % 2 === 0 ? await hashPar(cur, h) : await hashPar(h, cur);
    idx = Math.floor(idx / 2);
  }
  return cur;
}

/** ¿El nodo (`nivel`, `indice`) con hash `hash` pertenece al árbol de `raiz`? La longitud de la prueba debe ser exacta. */
export async function verificarPrueba(g: Geometria, hash: Uint8Array, nivel: number, indice: number, prueba: readonly Uint8Array[], raiz: Uint8Array): Promise<boolean> {
  if (!Number.isInteger(nivel) || nivel < 0 || nivel > g.profundidad) return false;
  if (!Number.isInteger(indice) || indice < 0 || indice >= nodosEnNivel(g, nivel)) return false;
  if (hash.length !== BYTES_HASH || prueba.length !== g.profundidad - nivel) return false;
  for (const p of prueba) if (p.length !== BYTES_HASH) return false;
  return igualesBytes(await raizDesdePrueba(hash, indice, prueba), raiz);
}

/**
 * Hash de la pieza a partir de sus bytes: hojas de 16 KiB y se sube `nivelPieza` alturas rellenando con ceros
 * (la última pieza suele tener menos hojas que las 2^k). Null si los bytes no caben en una pieza.
 */
export async function hashPieza(datos: Uint8Array, nivelPieza: number): Promise<Uint8Array | null> {
  const maxHojas = 2 ** nivelPieza;
  if (datos.length > maxHojas * TAM_HOJA) return null;
  let capa: Uint8Array[] = [];
  for (let o = 0; o < datos.length || capa.length === 0; o += TAM_HOJA) capa.push(await hashHoja(datos.subarray(o, Math.min(datos.length, o + TAM_HOJA))));
  for (let h = 0; h < nivelPieza; h++) {
    const sig: Uint8Array[] = [];
    for (let i = 0; i < capa.length; i += 2) sig.push(await hashPar(capa[i], i + 1 < capa.length ? capa[i + 1] : await cerosHasta(h)));
    capa = sig;
  }
  return capa[0];
}

/** Raíz que sale de una capa de piezas COMPLETA (todos los nodos de esa altura). */
export async function raizDesdeCapa(g: Geometria, hashes: readonly Uint8Array[]): Promise<Uint8Array | null> {
  if (hashes.length !== nodosEnNivel(g, g.nivelPieza)) return null;
  let actual = hashes.slice();
  for (let h = g.nivelPieza; h < g.profundidad; h++) {
    const sig: Uint8Array[] = [];
    for (let i = 0; i < actual.length; i += 2) sig.push(await hashPar(actual[i], i + 1 < actual.length ? actual[i + 1] : await cerosHasta(h)));
    actual = sig;
  }
  return actual[0];
}

/** ¿Esta capa de piezas completa lleva a `raiz`? */
export async function verificarCapa(g: Geometria, hashes: readonly Uint8Array[], raiz: Uint8Array): Promise<boolean> {
  for (const h of hashes) if (h.length !== BYTES_HASH) return false;
  const r = await raizDesdeCapa(g, hashes);
  return r !== null && igualesBytes(r, raiz);
}

/* ───────────────────────────── Rangos de la capa (estilo BEP 52 «hashes») ───────────────────────────── */

export const MAX_HASHES_RANGO = 512;

/** Un rango pedible: `cuantas` potencia de dos, `desde` múltiplo de `cuantas`, dentro de la capa. */
export function rangoValido(g: Geometria, desde: number, cuantas: number): boolean {
  if (!potenciaDeDos(cuantas) || cuantas > MAX_HASHES_RANGO) return false;
  if (!Number.isInteger(desde) || desde < 0 || desde % cuantas !== 0) return false;
  return desde < nodosEnNivel(g, g.nivelPieza);
}

/** Hashes del rango (rellenado con ceros si pasa del final de la capa) y la prueba hasta la raíz. */
export async function rangoConPrueba(capas: Uint8Array[][], g: Geometria, desde: number, cuantas: number): Promise<{ hashes: Uint8Array[]; prueba: Uint8Array[] } | null> {
  if (!rangoValido(g, desde, cuantas)) return null;
  const capa = capas[g.nivelPieza];
  const hashes: Uint8Array[] = [];
  for (let i = desde; i < Math.min(desde + cuantas, capa.length); i++) hashes.push(capa[i]);
  const altura = log2Entero(cuantas);
  const nivelArriba = Math.min(g.nivelPieza + altura, g.profundidad);
  const prueba = await pruebaDeNodo(capas, nivelArriba, Math.floor(desde / 2 ** (nivelArriba - g.nivelPieza)));
  return { hashes, prueba };
}

/** Verifica un rango recibido contra la raíz. Los hashes pueden venir sin el relleno del final. */
export async function verificarRango(g: Geometria, desde: number, cuantas: number, hashes: readonly Uint8Array[], prueba: readonly Uint8Array[], raiz: Uint8Array): Promise<boolean> {
  if (!rangoValido(g, desde, cuantas)) return false;
  const total = nodosEnNivel(g, g.nivelPieza);
  const esperados = Math.min(desde + cuantas, total) - desde;
  if (hashes.length !== esperados) return false;
  for (const h of hashes) if (h.length !== BYTES_HASH) return false;
  let actual = hashes.slice();
  const altura = log2Entero(cuantas);
  const nivelArriba = Math.min(g.nivelPieza + altura, g.profundidad);
  for (let h = g.nivelPieza; h < nivelArriba; h++) {
    const sig: Uint8Array[] = [];
    for (let i = 0; i < actual.length; i += 2) sig.push(await hashPar(actual[i], i + 1 < actual.length ? actual[i + 1] : await cerosHasta(h)));
    actual = sig;
  }
  if (actual.length !== 1) return false;
  return verificarPrueba(g, actual[0], nivelArriba, Math.floor(desde / 2 ** (nivelArriba - g.nivelPieza)), prueba, raiz);
}
