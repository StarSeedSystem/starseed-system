// src/lib/astraura/laya/libreta-vecinos.ts
// Definición de tipos y funciones para la lógica de vecinos en la libreta

export type EjemploLibreta = {
  punto: string;
  ambito: string;
  estado: string;
  respuesta: string;
  desenlaceOk: boolean | null;
};

/**
 * Genera una huella basada en las palabras de un texto.
 * Retorna un Set con las palabras en minúscula.
 */
export function huellaPalabras(texto: string): Set<string> {
  const palabras = texto
    .toLowerCase()
    .match(/[a-záéíóúñ]+/g)
    ?? [];
  return new Set(palabras);
}

/**
 * Calcula la similitud coseno entre dos huellas.
 * La similitud es: |intersección| / sqrt(|a| * |b|).
 * Devuelve 0 cuando alguna huella está vacía.
 */
export function similitud(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  a.forEach((p) => {
    if (b.has(p)) inter++;
  });
  return inter / Math.sqrt(a.size * b.size);
}

/**
 * Busca vecinos de una libreta.
 * Filtra los ejemplos que comparten el ámbito, estado y tienen desenlaceOk === true.
 * Opcionalmente limita el número de resultados a k.
 */
export function vecinos(libreta: EjemploLibreta[], estado: string, k: number, ambito: string): EjemploLibreta[] {
  const filtrados = libreta.filter((e) =>
    e.ambito === ambito && e.estado === estado && e.desenlaceOk === true
  );
  return filtrados.slice(0, Math.max(0, k));
}

/**
 * Vota sobre un conjunto de vecinos.
 * Regresa {respuesta, apoyo} si hay al menos 5 vecinos y el soporte >= 0.6.
 * El soporte es la proporción de vecinos que comparten la respuesta.
 * En caso de empate, se elige la respuesta que aparece primero.
 */
export function votar(vecinos: EjemploLibreta[]): { respuesta: string; apoyo: number } | null {
  if (vecinos.length < 5) return null;

  const contadores: Record<string, number> = {};
  vecinos.forEach((e) => {
    contadores[e.respuesta] = (contadores[e.respuesta] ?? 0) + 1;
  });
  const mayor = Object.entries(contadores).reduce((prev, curr) => {
    if (!prev) return curr;
    return curr[1] > prev[1] ? curr : prev;
  }, undefined as [string, number] | undefined);

  if (!mayor) return null;
  const soporte = mayor[1] / vecinos.length;
  if (soporte < 0.6) return null;
  return { respuesta: mayor[0], apoyo: soporte };
}
