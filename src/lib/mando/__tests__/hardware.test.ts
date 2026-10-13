import { describe, it, expect } from "vitest";
import { cpuEntre, analizarVmStat, analizarIoreg, analizarPmset } from "../hardware";

describe("analizarVmStat", () => {
  it("devuelve null para entrada vacía", () => {
    expect(analizarVmStat("", 0)).toBeNull();
  });
});

describe("analizarIoreg", () => {
  it("devuelve valores nulos para entrada vacía", () => {
    expect(analizarIoreg("")).toEqual({ gpuPct: null, gpuNombre: null });
  });
});

describe("analizarPmset", () => {
  it("devuelve valores nulos para entrada vacía", () => {
    expect(analizarPmset("")).toEqual({ bateriaPct: null, cargando: null });
  });
});

describe("cpuEntre", () => {
  it("devuelve 0 para mismas lecturas", () => {
    const cpus = [{ model: "Intel", speed: 2000, times: { user: 0, nice: 0, sys: 0, idle: 10, irq: 0 } }];
    expect(cpuEntre(cpus, cpus)).toBe(0);
  });
});