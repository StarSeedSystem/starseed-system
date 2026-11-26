/**
 * Generador determinista mulberry32 — misma semilla = misma secuencia.
 * Sin Math.random: reproducible en cualquier máquina y en CI.
 */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = Math.imul(t ^ (t >>> 7), t | 61) + t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero uniforme en [min, max] inclusive. */
export function entero(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

/** Elección uniforme de un array. */
export function elegir<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[entero(rnd, 0, arr.length - 1)];
}

/** Baraja (Fisher-Yates) in-place, determinista. */
export function barajar<T>(rnd: () => number, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = entero(rnd, 0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Semilla por defecto para tests del enjambre. */
export const SEMILLA_ENJAMBRE = 1025;