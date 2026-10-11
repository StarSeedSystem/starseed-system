import { describe, it, expect, beforeEach } from "vitest";
import { limpiarRegistro, registrarAtomo } from "../registro-atomos";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import type { DefinicionAtomo, Parametro } from "../registro-atomos";

// Helper para crear un parámetro de prueba
function crearParametro(id: string, nombre: string, tipo: Parametro["tipo"] = "numero"): Parametro {
  return { id, nombre, tipo };
}

// Helper para crear una definición de átomo válida
function crearAtomoValido(herramientaId: string, nombre: string, categoria: string = "imagen"): DefinicionAtomo {
  return {
    herramientaId,
    nombre,
    categoria: categoria as any, // TypeScript necesita esta conversión
    integracion: "libreria-js",
    control: "total",
    parametros: [crearParametro(`${herramientaId}-param`, "Parámetro de prueba")],
    entradas: ["entrada"],
    salidas: ["salida"],
  };
}

describe("debug proximamente from atom", () => {
  beforeEach(() => {
    limpiarRegistro();
  });

  it("should show proximamente when atom has proximamente field", () => {
    const atomo: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima"),
      proximamente: "Falta implementar el envoltorio nativo"
    };
    const registroResult = registrarAtomo(atomo);
    console.log("Registro result:", registroResult);
    
    const resultado = fichasProtomolecula();
    console.log("Resultado:", resultado);
    console.log("Resultado length:", resultado.length);
    
    if (resultado.length > 0) {
      console.log("First item:", resultado[0]);
      console.log("Verified:", resultado[0].verified);
      console.log("Description:", resultado[0].description);
    }
    
    expect(resultado[0].description).toContain("Próximamente: Falta implementar el envoltorio nativo");
    expect(resultado[0].verified).toBe(false);
  });
});