// Vecinos más cercanos de la libreta por ámbito (JLA1116A).
// Módulo puro y barato: sin modelo, cabe en una tableta.

/** Tamaño fijo del vector disperso (≤ 256 posiciones). */
export const DIM_HUELLA = 256;

/** Ejemplo de la libreta con desenlace conocido o desconocido. */
export interface EjemploLibreta {
  readonly punto: string;
  readonly ambito: string;
  readonly estado: string;
  readonly respuesta: string;
  readonly desenlaceOk: boolean | null;
}

/** Vector disperso normalizado: índice -> peso (suma de pesos = 1). */
export type HuellaPalabras = Readonly<Record<number, number>>;

/** Vecino con su similitud. */
export interface Vecino {
  readonly ejemplo: EjemploLibreta;
  readonly similitud: number;
}

/** Resultado de la votación. */
export interface VotoVecinos {
  readonly respuesta: string;
  readonly apoyo: number;
}

/**
 * Convierte un texto en una bolsa de palabras normalizada (vector disperso ≤ 256).
 * Hash FNV-1a de 32 bits para mapear palabras a índices; pesos por frecuencia relativa.
 * Palabras: secuencias de letras/dígitos (Unicode), minúsculas, sin acentos.
 */
export function huellaPalabras(texto: string): HuellaPalabras {
  const palabras = extraerPalabras(texto);
  if (palabras.length === 0) return {};

  const frecuencias: Record<number, number> = {};
  for (const palabra of palabras) {
    const idx = hashPalabra(palabra) % DIM_HUELLA;
    frecuencias[idx] = (frecuencias[idx] ?? 0) + 1;
  }

  const total = palabras.length;
  const resultado: Record<number, number> = {};
  for (const idxStr of Object.keys(frecuencias)) {
    const idx = Number(idxStr);
    resultado[idx] = frecuencias[idx] / total;
  }
  return Object.freeze(resultado);
}

/** Similitud del coseno entre dos vectores dispersos (L2-normalizados internamente). */
export function similitud(a: HuellaPalabras, b: HuellaPalabras): number {
  let producto = 0;
  let normaA = 0;
  let normaB = 0;
  const keysA = Object.keys(a);
  const keysB = new Set(Object.keys(b));

  for (const key of keysA) {
    const valA = a[Number(key)];
    normaA += valA * valA;
    if (keysB.has(key)) {
      producto += valA * b[Number(key)];
    }
  }
  for (const key of keysB) {
    const valB = b[Number(key)];
    normaB += valB * valB;
  }

  if (normaA === 0 || normaB === 0) return 0;
  return producto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

/**
 * Devuelve los k vecinos más cercanos del MISMO ámbito y con desenlace conocido.
 * Orden: mayor similitud primero; empate estable por orden de aparición en la libreta.
 */
export function vecinos(
  libreta: readonly EjemploLibreta[],
  estado: string,
  k: number,
  ambito: string
): readonly Vecino[] {
  const huellaEstado = huellaPalabras(estado);
  const candidatos: Vecino[] = [];

  for (let i = 0; i < libreta.length; i++) {
    const ej = libreta[i];
    if (ej.ambito !== ambito) continue;
    if (ej.desenlaceOk === null) continue;
    const huellaEj = huellaPalabras(ej.estado);
    const sim = similitud(huellaEstado, huellaEj);
    if (sim > 0) {
      candidatos.push({ ejemplo: ej, similitud: sim });
    }
  }

  // Orden estable: mayor similitud, luego índice original (orden de aparición)
  candidatos.sort((a, b) => {
    if (b.similitud !== a.similitud) return b.similitud - a.similitud;
    return 0; // sort es estable en ES2019+, mantiene orden original en empate
  });

  return candidatos.slice(0, k);
}

/**
 * Vota entre los vecinos: respuesta mayoritaria ponderada por similitud.
 * Devuelve null si hay menos de 5 vecinos o el apoyo < 0.6.
 * Desempate estable: primera respuesta en orden de aparición entre los vecinos.
 */
export function votar(vecinos: readonly Vecino[]): VotoVecinos | null {
  if (vecinos.length < 5) return null;

  const votos = new Map<string, { peso: number; primerIndice: number }>();
  for (let i = 0; i < vecinos.length; i++) {
    const v = vecinos[i];
    const resp = v.ejemplo.respuesta;
    const actual = votos.get(resp) ?? { peso: 0, primerIndice: i };
    actual.peso += v.similitud;
    if (actual.primerIndice > i) actual.primerIndice = i;
    votos.set(resp, actual);
  }

  let mejor: { respuesta: string; peso: number; primerIndice: number } | null = null;
  let totalPeso = 0;
  for (const [respuesta, { peso, primerIndice }] of votos) {
    totalPeso += peso;
    if (!mejor || peso > mejor.peso || (peso === mejor.peso && primerIndice < mejor.primerIndice)) {
      mejor = { respuesta, peso, primerIndice };
    }
  }

  if (!mejor) return null;
  const apoyo = mejor.peso / totalPeso;
  if (apoyo < 0.6) return null;

  return { respuesta: mejor.respuesta, apoyo };
}

/** Extrae palabras: letras/dígitos Unicode, minúsculas, sin acentos. */
function extraerPalabras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Hash FNV-1a de 32 bits para una palabra. */
function hashPalabra(palabra: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < palabra.length; i++) {
    h ^= palabra.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}