import { describe, expect, it } from "vitest";
import { aPixelesRgba, entradaUnet, f32AMitad, latenteLimpio, mitadAF32, ruidoNormal } from "../webgpu-sd-turbo.worker";

describe("worker de SD-Turbo (partes puras)", () => {
  it("importar el módulo fuera de un worker no arranca nada", () => {
    expect(typeof ruidoNormal).toBe("function");
  });
  it("media precisión: ida y vuelta de valores exactos", () => {
    for (const v of [0, 1, -1, 0.5, 2, -3.5, 65504]) expect(mitadAF32(f32AMitad(v))).toBe(v);
    expect(mitadAF32(f32AMitad(1e9))).toBe(Infinity);
  });
  it("el ruido es determinista por semilla", () => {
    const a = ruidoNormal(64, 7), b = ruidoNormal(64, 7), c = ruidoNormal(64, 8);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
  it("entrada del UNet y latente limpio", () => {
    const l = new Float32Array([14.6146, 0]);
    expect(entradaUnet(l)[0]).toBeCloseTo(14.6146 / Math.sqrt(14.6146 ** 2 + 1), 4);
    expect(latenteLimpio(new Float32Array([0]), new Float32Array([0]))[0]).toBe(0);
  });
  it("píxeles RGBA: -1→0, 1→255, alfa 255", () => {
    const px = aPixelesRgba(new Float32Array([-1, 1, 0, 0, 0, 0]), 2, 1);
    expect(Array.from(px.slice(0, 4))).toEqual([0, 128, 128, 255]);
    expect(px[4]).toBe(255);
  });
});
