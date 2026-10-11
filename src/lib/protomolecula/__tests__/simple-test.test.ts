import { describe, it, expect, beforeEach } from "vitest";
import { listarAtomos, registrarAtomo, limpiarRegistro } from "../registro-atomos";
import { fichasProtomolecula } from "../biblioteca-protomolecula";

describe("simple test", () => {
  beforeEach(() => {
    limpiarRegistro();
  });

  it("should return empty array when no atoms", () => {
    const resultado = fichasProtomolecula();
    console.log("Resultado vacío:", resultado);
    expect(resultado).toEqual([]);
  });

  it("should return one item when one atom registered", () => {
    const atomo = {
      herramientaId: "test-tool",
      nombre: "Herramienta de Prueba",
      categoria: "imagen",
      integracion: "libreria-js",
      control: "total",
      parametros: [{ id: "param1", nombre: "Parámetro 1", tipo: "numero" }],
      entradas: [],
      salidas: [],
    };
    const resultadoRegistro = registrarAtomo(atomo);
    console.log("Resultado de registro:", resultadoRegistro);
    
    const atomos = listarAtomos();
    console.log("Átomos registrados:", atomos);
    
    const resultado = fichasProtomolecula();
    console.log("Resultado de fichasProtomolecula:", resultado);
    expect(resultado.length).toBe(1);
  });
});