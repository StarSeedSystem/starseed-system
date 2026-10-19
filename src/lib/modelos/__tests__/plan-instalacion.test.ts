// src/lib/modelos/__tests__/plan-instalacion.test.ts
import { describe, it, expect } from "vitest";
import { planInstalacion, NeuronaVigia, Entrada, PlanArea } from "../plan-instalacion";

describe("planInstalacion", () => {
  it("should return empty plan for empty inputs", () => {
    const neurona: NeuronaVigia = {
      medio: "pwa",
      ramMB: 4096,
      discoLibreMB: 10240,
      gpu: "ninguna",
      sistema: "linux",
    };
    const catalogo: Record<string, Entrada[]> = {};
    const preferencias: any = {};
    const instalados: string[] = [];
    const result = planInstalacion(neurona, catalogo, preferencias, instalados);
    expect(result).toEqual({});
  });
});