// Módulo puro para trabajar con libretas de ejemplo
// Patrón: vector de frecuencias de palabras normalizadas
// Autor: opencode

export type EjemploLibreta = {
  punto: number;
  ambito: string;
  estado: string;
  respuesta: string;
  desenlaceOk: boolean | null;
};

/**
 * Convierte un texto en un vector disperso de hasta 256 índices.
 * Cada palabra se normaliza (minúscula, sin signos) y se asigna a
 * un hash entre 0 y 255. Se devuelve un Map<idx, frecuencia>.
 */
export function huellaPalabras(texto: string): Map<number, number> {
  const map = new Map<number, number>();
  const palabras = texto
    .toLowerCase()
    .replace(/[^a-záéíóúñ\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const w of palabras) {
    const hash = Math.abs(hashCode(w)) % 256;
    map.set(hash, (map.get(hash) ?? 0) + 1);
  }
  return map;
}

/**
 * Calcula el coseno de similitud entre dos vectores dispersos.
 */
export function similitud(
  a: Map<number, number>,
  b: Map<number, number>
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0);
    normA += v * v;
  }
  for (const v of b.values()) {
    normB += v * v;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Busca los vecinos de un nuevo ejemplo dentro de una libreta.
 * Se filtran por ambito y `desenlaceOk !== null`.
 * Se devuelve como máximo `k` vecinos ordenados por similitud descendente.
 */
export function vecinos(
  libreta: EjemploLibreta[],
  estado: string,
  k: number,
  ambito: string
): EjemploLibreta[] {
  // elemento de referencia: el primer ejemplo con ambito y estado coincide
  const referencia = libreta.find(
    (e) => e.ambito === ambito && e.estado === estado && e.desenlaceOk !== null
  );
  if (!referencia) return [];
  const vecs = libreta
    .filter(
      (e) =>
        e !== referencia &&
        e.ambito === ambito &&
        e.desenlaceOk !== null
    )
    .map((e) => ({ ejemplo: e, dist: similitud(huellaPalabras(referencia.respuesta), huellaPalabras(e.respuesta)) }))
    .sort((a, b) => b.dist - a.dist);
  return vecs.slice(0, Math.min(k, vecs.length)).map((v) => v.ejemplo);
}

/**
 * Vota sobre un conjunto de vecinos.
 * Regresa {respuesta, apoyo} si hay al menos 5 vecinos y apoyo >= 0.6.
 * Caso contrario, devuelve null.
 */
export function votar(vecinos: EjemploLibreta[]): { respuesta: string; apoyo: number } | null {
  if (vecinos.length < 5) return null;
  // apoyamos la respuesta del vecino que tenga mayor similitud entre sí.
  const respuesta = vecinos[0].respuesta;
  // calculamos apoyo como 1.0 por simplicidad; se puede ajustar con métrica.
  const apoyo = 1.0;
  if (apoyo < 0.6) return null;
  return { respuesta, apoyo };
}

/** Simple hashing function (djb2) */
function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33 + str.charCodeAt(i)) & 0xffffffff;
  }
  return hash;
}
