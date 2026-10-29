import { describe, it, expect } from "vitest";
import { decidirInterrupcion } from "../interrumpir-por-voz";

function gen(muestras: Array<[number, number]>): { tiempo: number; energia: number }[] {
  return muestras.map(([t, e]) => ({ tiempo: t, energia: e }));
}

describe("decidirInterrupcion", () => {
  const estado = { ultimoFinHablaGlobal: null } as any;
  it("no interrumpe con poca energía", () => {
    const muestras = gen([[0, 1], [10, 1], [20, 1], [30, 1]]);
    expect(decidirInterrupcion(muestras, estado, { umbralDb: 5, minimoMs: 250 })).toBe(false);
  });
  it("interrumpe cuando el promedio supera el umbral en 250ms", () => {
    const muestras = gen([[0, 10], [50, 10], [100, 10], [150, 10], [200, 10], [250, 10]]);
    expect(decidirInterrupcion(muestras, estado, { umbralDb: 5, minimoMs: 250 })).toBe(true);
  });
  it("resetea el contador después de interrumpir", () => {
    const estado2 = { ultimoFinHablaGlobal: 0 } as any;
    const muestras = gen([[0, 10], [50, 10], [100, 10], [150, 10], [200, 10], [250, 10]]);
    expect(decidirInterrupcion(muestras, estado2, { umbralDb: 5, minimoMs: 250 })).toBe(true);
  });
});
