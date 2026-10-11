import { describe, it, expect } from "vitest";
import { listarAtomos, registrarAtomo } from "../registro-atomos";
import { crearAtomoValido } from "./biblioteca-protomolecula.test.ts";

describe("debug", () => {
  it("should register and list atoms", () => {
    const atomo = crearAtomoValido("test-tool", "Herramienta de Prueba");
    registrarAtomo(atomo);
    
    const atomos = listarAtomos();
    expect(atomos.length).toBe(1);
    expect(atomos[0].nombre).toBe("Herramienta de Prueba");
  });
});