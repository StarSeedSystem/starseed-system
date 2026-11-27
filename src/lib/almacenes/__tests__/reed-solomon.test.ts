import { describe, it, expect } from "vitest";
import {
  sumarGF,
  multiplicarGF,
  inversoGF,
  dividirGF,
  fragmentarReedSolomon,
  reconstruirReedSolomon,
} from "../reed-solomon";

function datosDePrueba(longitud: number): Uint8Array {
  const datos = new Uint8Array(longitud);
  for (let i = 0; i < longitud; i += 1) datos[i] = (i * 37 + 11) % 256;
  return datos;
}

function reunir(
  fragmentos: readonly Uint8Array[],
  indices: readonly number[],
  n: number,
): Array<Uint8Array | null> {
  const posiciones: Array<Uint8Array | null> = new Array(n).fill(null);
  for (const indice of indices) posiciones[indice] = fragmentos[indice];
  return posiciones;
}

describe("Reed-Solomon sobre GF(2^8)", () => {
  it("suma, multiplica, invierte y divide en el cuerpo de Galois", () => {
    expect(sumarGF(0b1010, 0b0110)).toBe(0b1100);
    expect(multiplicarGF(0, 123)).toBe(0);
    expect(multiplicarGF(1, 123)).toBe(123);
    expect(dividirGF(multiplicarGF(2, 128), 2)).toBe(128);
    for (let a = 1; a < 256; a += 17) {
      expect(multiplicarGF(a, inversoGF(a))).toBe(1);
    }
    expect(() => inversoGF(0)).toThrow(/cero/);
  });

  it("reconstruye con cualquier subconjunto de k fragmentos", () => {
    const datos = datosDePrueba(101);
    const k = 3;
    const n = 6;
    const fragmentos = fragmentarReedSolomon(datos, k, n);
    expect(fragmentos).toHaveLength(n);
    const subconjuntos = [
      [0, 1, 2],
      [0, 3, 5],
      [1, 2, 4],
      [2, 3, 4],
      [1, 4, 5],
    ];
    for (const indices of subconjuntos) {
      const reconstruido = reconstruirReedSolomon(reunir(fragmentos, indices, n), k, n, datos.length);
      expect(Array.from(reconstruido)).toEqual(Array.from(datos));
    }
  });

  it("falla con k-1 fragmentos y no inventa datos", () => {
    const datos = datosDePrueba(64);
    const fragmentos = fragmentarReedSolomon(datos, 4, 7);
    expect(() => reconstruirReedSolomon(reunir(fragmentos, [0, 2, 5], 7), 4, 7)).toThrow(
      /al menos 4/,
    );
  });

  it("detecta fragmentos de distinta longitud y parámetros inválidos", () => {
    const fragmentos = fragmentarReedSolomon(datosDePrueba(20), 2, 4);
    const mezclados: Array<Uint8Array | null> = [fragmentos[0], new Uint8Array(1), fragmentos[2], null];
    expect(() => reconstruirReedSolomon(mezclados, 2, 4)).toThrow(/misma longitud/);
    expect(() => fragmentarReedSolomon(datosDePrueba(10), 5, 3)).toThrow(/parámetros/);
    expect(() => fragmentarReedSolomon(datosDePrueba(10), 0, 3)).toThrow(/parámetros/);
  });
});
