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

describe("regla del núcleo: un átomo con «proximamente» no entra al registro", () => {
  beforeEach(() => limpiarRegistro());

  it("no se registra, devuelve el motivo como texto del proximamente y no genera ficha", () => {
    const def: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima"),
      proximamente: "Falta implementar el envoltorio nativo",
    };

    const r = registrarAtomo(def);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("Falta implementar el envoltorio nativo");

    expect(fichasProtomolecula()).toHaveLength(0);
  });
});
