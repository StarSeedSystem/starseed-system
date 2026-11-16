// Vecinos más cercanos de la libreta por ámbito (JLA1116A).
// Módulo puro: sin red, sin disco, sin reloj. Vector disperso por hash (≤256), coseno, voto con umbral.
export type EjemploLibreta = {
  readonly punto: string;
  readonly ambito: string;
  readonly estado: string;
  readonly respuesta: string;
  readonly desenlaceOk: boolean | null;
};

export type Voto = { readonly respuesta: string; readonly apoyo: number } | null;

const DIM = 256;

/** Normaliza: minúsculas, quita acentos, solo alfanumérico y espacios. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

/** Huella de palabras: bolsa de palabras normalizada a vector disperso de ≤256 posiciones. */
export function huellaPalabras(texto: string): ReadonlyMap<number, number> {
  const palabras = normalizar(texto).split(" ").filter((p) => p.length > 0);
  const mapa = new Map<number, number>();
  for (const p of palabras) {
    const idx = hashPalabra(p) % DIM;
    mapa.set(idx, (mapa.get(idx) ?? 0) + 1);
  }
  return mapa;
}

/** Norma euclídea de un vector disperso. */
function norma(v: ReadonlyMap<number, number>): number {
  let suma = 0;
  for (const val of Array.from(v.values())) suma += val * val;
  return Math.sqrt(suma);
}

/** Similitud del coseno entre dos vectores dispersos. */
export function similitud(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let prod = 0;
  for (const [idx, va] of Array.from(a.entries())) {
    const vb = b.get(idx);
    if (vb !== undefined) prod += va * vb;
  }
  const na = norma(a), nb = norma(b);
  if (na === 0 || nb === 0) return 0;
  return prod / (na * nb);
}

/** Vecinos: solo ejemplos del MISMO ámbito y con desenlace conocido (no null). */
export function vecinos(
  libreta: readonly EjemploLibreta[],
  estado: string,
  k: number,
  ambito: string
): readonly EjemploLibreta[] {
  const objetivo = huellaPalabras(estado);
  const candidatos = libreta
    .filter((e) => e.ambito === ambito && e.desenlaceOk !== null)
    .map((e) => ({ ejemplo: e, sim: similitud(objetivo, huellaPalabras(e.estado)) }))
    .filter((v) => v.sim > 0)
    .sort((a, b) => {
      if (b.sim !== a.sim) return b.sim - a.sim;
      // Desempate estable: por punto y respuesta (orden lexicográfico)
      const ca = a.ejemplo.punto.localeCompare(b.ejemplo.punto);
      if (ca !== 0) return ca;
      return a.ejemplo.respuesta.localeCompare(b.ejemplo.respuesta);
    })
    .slice(0, k)
    .map((v) => v.ejemplo);
  return candidatos;
}

/** Voto mayoritario de los vecinos: necesita ≥5 vecinos y apoyo ≥0,6. */
export function votar(vecinos: readonly EjemploLibreta[]): Voto {
  if (vecinos.length < 5) return null;
  const conteo = new Map<string, number>();
  for (const v of vecinos) {
    conteo.set(v.respuesta, (conteo.get(v.respuesta) ?? 0) + 1);
  }
  let mejor: string | null = null;
  let max = 0;
  for (const [resp, n] of Array.from(conteo.entries())) {
    if (n > max || (n === max && (mejor === null || resp.localeCompare(mejor) < 0))) {
      max = n;
      mejor = resp;
    }
  }
  if (mejor === null) return null;
  const apoyo = max / vecinos.length;
  if (apoyo < 0.6) return null;
  return { respuesta: mejor, apoyo };
}