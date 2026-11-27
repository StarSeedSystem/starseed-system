/**
 * Reed-Solomon sobre GF(2^8) — k de n fragmentos.
 *
 * Codificación sistemática: los k primeros fragmentos son los datos tal cual y
 * los n-k restantes son paridad (evaluaciones del polinomio que pasa por los
 * puntos de datos). Con k fragmentos cualesquiera se reconstruye el original.
 * Implementación propia, sin dependencias npm.
 */

const POLINOMIO_PRIMITIVO = 0x11d;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function construirTablas(): void {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if ((x & 0x100) !== 0) x ^= POLINOMIO_PRIMITIVO;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

/** Suma en GF(2^8): es el XOR de los dos bytes. */
export function sumarGF(a: number, b: number): number {
  return a ^ b;
}

/** Multiplica dos elementos de GF(2^8) usando las tablas de logaritmos. */
export function multiplicarGF(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Inverso multiplicativo en GF(2^8); el cero no tiene inverso. */
export function inversoGF(a: number): number {
  if (a === 0) throw new Error("Reed-Solomon: el cero no tiene inverso en GF(2^8).");
  return EXP[255 - LOG[a]];
}

/** División en GF(2^8) como producto por el inverso. */
export function dividirGF(a: number, b: number): number {
  if (b === 0) throw new Error("Reed-Solomon: división por cero en GF(2^8).");
  if (a === 0) return 0;
  return EXP[(LOG[a] + 255 - LOG[b]) % 255];
}

function validarParametros(k: number, n: number): void {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 1 || n < k || n > 255) {
    throw new Error(`Reed-Solomon: parámetros inválidos (k=${k}, n=${n}); se exige 1 ≤ k ≤ n ≤ 255.`);
  }
}

interface Punto {
  x: number;
  y: number;
}

function evaluarLagrange(puntos: readonly Punto[], x: number): number {
  let total = 0;
  for (let i = 0; i < puntos.length; i += 1) {
    let numerador = 1;
    let denominador = 1;
    for (let j = 0; j < puntos.length; j += 1) {
      if (i === j) continue;
      numerador = multiplicarGF(numerador, sumarGF(x, puntos[j].x));
      denominador = multiplicarGF(denominador, sumarGF(puntos[i].x, puntos[j].x));
    }
    total = sumarGF(total, multiplicarGF(puntos[i].y, dividirGF(numerador, denominador)));
  }
  return total;
}

/**
 * Fragmenta `datos` en `n` trozos de igual longitud: los `k` primeros llevan
 * los datos y el resto es paridad. Si la longitud no es múltiplo de `k`, se
 * rellena con ceros al final (la longitud original se recupera al reconstruir).
 */
export function fragmentarReedSolomon(datos: Uint8Array, k: number, n: number): Uint8Array[] {
  validarParametros(k, n);
  const longitud = Math.ceil(datos.length / k);
  const fragmentos = Array.from({ length: n }, () => new Uint8Array(longitud));
  for (let columna = 0; columna < longitud; columna += 1) {
    const puntos: Punto[] = [];
    for (let i = 0; i < k; i += 1) {
      const posicion = i * longitud + columna;
      const valor = posicion < datos.length ? datos[posicion] : 0;
      puntos.push({ x: i, y: valor });
      fragmentos[i][columna] = valor;
    }
    for (let i = k; i < n; i += 1) {
      fragmentos[i][columna] = evaluarLagrange(puntos, i);
    }
  }
  return fragmentos;
}

/**
 * Reconstruye los datos a partir de cualquier conjunto de al menos `k`
 * fragmentos (los huecos se marcan con `null`). Con menos de `k` lanza: no se
 * inventa información que no está.
 */
export function reconstruirReedSolomon(
  fragmentos: ReadonlyArray<Uint8Array | null>,
  k: number,
  n: number,
  longitudOriginal?: number,
): Uint8Array {
  validarParametros(k, n);
  if (fragmentos.length !== n) {
    throw new Error(`Reed-Solomon: se esperaban ${n} posiciones de fragmento y hay ${fragmentos.length}.`);
  }

  const disponibles: number[] = [];
  let longitud = -1;
  for (let i = 0; i < n; i += 1) {
    const fragmento = fragmentos[i];
    if (!fragmento) continue;
    disponibles.push(i);
    if (longitud === -1) longitud = fragmento.length;
    else if (fragmento.length !== longitud) {
      throw new Error("Reed-Solomon: todos los fragmentos deben tener la misma longitud.");
    }
  }
  if (disponibles.length < k) {
    throw new Error(
      `Reed-Solomon: se necesitan al menos ${k} fragmentos para reconstruir y solo hay ${disponibles.length}.`,
    );
  }
  if (longitud === -1) longitud = 0;

  const usados = disponibles.slice(0, k);
  const datos = Array.from({ length: k }, () => new Uint8Array(longitud));
  for (let columna = 0; columna < longitud; columna += 1) {
    const puntos: Punto[] = usados.map((indice) => ({
      x: indice,
      y: (fragmentos[indice] as Uint8Array)[columna],
    }));
    for (let i = 0; i < k; i += 1) {
      const original = fragmentos[i];
      datos[i][columna] = original ? original[columna] : evaluarLagrange(puntos, i);
    }
  }

  const total = new Uint8Array(longitud * k);
  for (let i = 0; i < k; i += 1) total.set(datos[i], i * longitud);
  if (longitudOriginal === undefined) return total;
  if (!Number.isInteger(longitudOriginal) || longitudOriginal < 0 || longitudOriginal > total.length) {
    throw new Error(`Reed-Solomon: longitud original inválida (${longitudOriginal}).`);
  }
  return total.slice(0, longitudOriginal);
}
