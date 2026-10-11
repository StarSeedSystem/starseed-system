import { describe, it, expect } from "vitest";
import { sanearDefinicion } from "../registro-atomos";
import type { DefinicionAtomo } from "../registro-atomos";

describe("sanearDefinicion", () => {
  it("should clean a definition with proximamente field", () => {
    const definicionConProximamente = {
      herramientaId: "test-tool",
      nombre: "Herramienta de Prueba",
      categoria: "imagen",
      integracion: "libreria-js",
      control: "total",
      parametros: [{ id: "param1", nombre: "Parámetro 1", tipo: "numero" }],
      entradas: ["entrada"],
      salidas: ["salida"],
      proximamente: "Falta implementar el envoltorio nativo"
    };
    
    const resultado = sanearDefinicion(definicionConProximamente);
    console.log("Resultado de sanearDefinicion:", resultado);
    expect(resultado).not.toBeNull();
    expect(resultado?.herramientaId).toBe("test-tool");
    expect(resultado?.nombre).toBe("Herramienta de Prueba");
    // The proximamente field should not be in the returned object since it's not part of DefinicionAtomo
    expect("proximamente" in resultado).toBeFalse();
  });
});