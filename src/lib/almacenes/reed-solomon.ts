/**
 * Reed-Solomon (k de n) en GF(2^8) — Módulo puro TypeScript.
 *
 * Cifrado AES-GCM con WebCrypto ANTES de fragmentar (la llave nunca va en el fragmento).
 * Con k fragmentos cualesquiera se reconstruye; se reparan solos cuando un nodo se va.
 */

export const GF256_PRIMITIVE = 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
export const GF256_GENERATOR = 2; // Generador primitivo α = 2

const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint16Array(256);

function initGf256Tables(): void {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= GF256_PRIMITIVE;
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
  GF256_LOG[0] = 0;
}
initGf256Tables();

export function gf256Add(a: number, b: number): number {
  return a ^ b;
}

export function gf256Mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[(GF256_LOG[a] + GF256_LOG[b]) % 255];
}

export function gf256Div(a: number, b: number): number {
  if (b === 0) throw new Error("División por cero en GF(2^8)");
  if (a === 0) return 0;
  return GF256_EXP[(GF256_LOG[a] - GF256_LOG[b] + 255) % 255];
}

export function gf256Pow(a: number, n: number): number {
  if (n === 0) return a === 0 ? 0 : 1;
  if (a === 0) return 0;
  return GF256_EXP[(GF256_LOG[a] * n) % 255];
}

export function gf256Inv(a: number): number {
  if (a === 0) throw new Error("Inverso de cero en GF(2^8)");
  return GF256_EXP[255 - GF256_LOG[a]];
}

export function gf256MulScalar(data: Uint8Array, scalar: number): Uint8Array {
  if (scalar === 1) return new Uint8Array(data);
  if (scalar === 0) return new Uint8Array(data.length);
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = gf256Mul(data[i], scalar);
  }
  return result;
}

function buildVandermonde(n: number, k: number): number[][] {
  // V[i][j] = (α^i)^j for i=0..n-1, j=0..k-1
  const matrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    const x = GF256_EXP[i];
    let pow = 1;
    for (let j = 0; j < k; j++) {
      row.push(pow);
      pow = gf256Mul(pow, x);
    }
    matrix.push(row);
  }
  return matrix;
}

function matVecMul(matrix: number[][], vec: number[]): number[] {
  return matrix.map((row) => {
    let sum = 0;
    for (let j = 0; j < row.length; j++) {
      sum = gf256Add(sum, gf256Mul(row[j], vec[j]));
    }
    return sum;
  });
}

function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const aug: number[][] = [];
  for (let i = 0; i < n; i++) {
    const identityRow = new Array(n).fill(0);
    identityRow[i] = 1;
    aug.push([...matrix[i], ...identityRow]);
  }

  for (let col = 0; col < n; col++) {
    let pivot = col;
    while (pivot < n && aug[pivot][col] === 0) pivot++;
    if (pivot === n) throw new Error("Matriz singular");
    if (pivot !== col) [aug[col], aug[pivot]] = [aug[pivot], aug[col]];

    const inv = gf256Inv(aug[col][col]);
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] = gf256Mul(aug[col][j], inv);
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] = gf256Add(aug[row][j], gf256Mul(factor, aug[col][j]));
      }
    }
  }

  return aug.map((row) => row.slice(n));
}

export interface ReedSolomonParams {
  k: number;
  n: number;
  fragmentSize: number;
}

export function reedSolomonEncode(
  data: Uint8Array,
  k: number,
  n: number
): Uint8Array[] {
  if (k <= 0) throw new Error("k debe ser > 0");
  if (n <= k) throw new Error("n debe ser > k");
  if (n > 255) throw new Error("n no puede exceder 255");

  const fragmentSize = data.length === 0 ? 0 : Math.ceil(data.length / k);
  const paddedSize = fragmentSize * k;
  const padded = new Uint8Array(paddedSize);
  padded.set(data);

  const vandermonde = buildVandermonde(n, k);
  const fragments: Uint8Array[] = Array.from({ length: n }, () => new Uint8Array(fragmentSize));

  for (let pos = 0; pos < fragmentSize; pos++) {
    // Extract the k coefficients for this byte position
    const coeffs: number[] = [];
    for (let i = 0; i < k; i++) {
      coeffs.push(padded[i * fragmentSize + pos]);
    }

    // Compute n evaluations
    const evaluations = matVecMul(vandermonde, coeffs);

    // Store in fragments
    for (let i = 0; i < n; i++) {
      fragments[i][pos] = evaluations[i];
    }
  }

  return fragments;
}

export function reedSolomonDecode(
  fragments: Uint8Array[],
  indices: number[],
  k: number,
  originalLength: number
): Uint8Array {
  if (fragments.length < k) throw new Error("Se necesitan al menos k fragmentos");
  if (indices.length !== fragments.length) throw new Error("Longitud de índices no coincide");

  const uniqueIndices = new Set(indices);
  if (uniqueIndices.size !== indices.length) throw new Error("Índices de fragmentos duplicados");
  if (indices.some((i) => i < 0 || i >= 255)) throw new Error("Índice de fragmento fuera de rango");

  const fragmentSize = fragments[0].length;
  for (const f of fragments) {
    if (f.length !== fragmentSize) throw new Error("Todos los fragmentos deben tener el mismo tamaño");
  }

  if (fragmentSize === 0) return new Uint8Array(0);

  const vandermonde = buildVandermonde(255, k);
  const decodeMatrix: number[][] = indices.map((idx) => vandermonde[idx].slice(0, k));
  const inverted = invertMatrix(decodeMatrix);

  const result = new Uint8Array(fragmentSize * k);

  for (let pos = 0; pos < fragmentSize; pos++) {
    const yValues = fragments.map((f) => f[pos]);
    const coeffs = matVecMul(inverted, yValues);
    for (let i = 0; i < k; i++) {
      result[i * fragmentSize + pos] = coeffs[i];
    }
  }

  return result.slice(0, originalLength);
}

export function reedSolomonCanRecover(available: boolean[], k: number, n?: number): boolean {
  if (n !== undefined && available.length !== n) throw new Error("Longitud de array de disponibilidad debe coincidir con n");
  return available.filter((v) => v).length >= k;
}