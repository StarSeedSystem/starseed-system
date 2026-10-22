import { describe, it, expect, beforeEach } from "vitest";
import { fichasProtomolecula } from "../biblioteca-protomolecula";
import { registrarAtomo, limpiarRegistro } from "../registro-atomos";
import type { DefinicionAtomo, Parametro } from "../registro-atomos";

function crearAtomoValido(id: string, nombre: string): DefinicionAtomo {
  const parametro: Parametro = { id: "p", nombre: "P", tipo: "numero" };
  return {
    herramientaId: id,
    nombre,
    categoria: "imagen",
    integracion: "libreria-js",
    control: "total",
    parametros: [parametro],
    entradas: [],
    salidas: [],
  };
}

describe("depuración: átomo con campo proximamente", () => {
  beforeEach(() => limpiarRegistro());

  it("devuelve el motivo y no genera ficha al registrar un átomo proximamente", () => {
    const atomo: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima"),
      proximamente: "Falta implementar el envoltorio nativo",
    };

    const registroResult = registrarAtomo(atomo);
    expect(registroResult.ok).toBe(false);
    if (!registroResult.ok) {
      expect(registroResult.motivo).toBe("Falta implementar el envoltorio nativo");
    }
    expect(fichasProtomolecula()).toEqual([]);
  });
});
