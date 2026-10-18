import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo } from "../registro-atomos";

function crearAtomoValido(id: string, nombre: string, categoria: string = "protomolecula"): DefinicionAtomo {
  const parametro = { id: "p", nombre: "P", tipo: "numero" };
  return {
    herramientaId: id,
    nombre,
    categoria,
    integracion: "libreria-js",
    control: "total",
    parametros: [parametro],
    entradas: [],
    salidas: [],
  };
}

describe("debug-proximamente-atom", () => {
  beforeEach(() => limpiarRegistro());

  it("should show proximamente when atom has proximamente field", () => {
    const atomo: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima", "protomolecula"),
      proximamente: "Falta implementar el envoltorio nativo"
    };
    registrarAtomo(atomo);

    const resultado = fichasProtomolecula();

    expect(resultado.length).toBeGreaterThan(0);
    expect(resultado[0].proximamente).toBe("próximamente: Falta implementar el envoltorio nativo");
    expect(resultado[0].estado).toBe("integrada");
    expect(resultado[0].descripcion).toBe("Átomo integrado de Herramienta Próxima");
  });
});