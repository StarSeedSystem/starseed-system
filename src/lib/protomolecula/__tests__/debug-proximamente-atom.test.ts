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

  it("un átomo con proximamente no se registra y no genera ficha (regla del núcleo)", () => {
    const atomo: DefinicionAtomo = {
      ...crearAtomoValido("proximate-tool", "Herramienta Próxima"),
      proximamente: "Falta implementar el envoltorio nativo",
    };

    const registroResult = registrarAtomo(atomo);
    expect(registroResult.ok).toBe(false);
<<<<<<< HEAD
    expect((registroResult as { ok: false; motivo: string }).motivo).toBe("Falta implementar el envoltorio nativo");
=======
    if (!registroResult.ok) {
      expect(registroResult.motivo).toBe("Falta implementar el envoltorio nativo");
    }
>>>>>>> c159ff78 (salvavidas · RTPM1010F2Kd-d1b: trabajo del agente antes de las puertas (tsc / vitest))

    const resultado = fichasProtomolecula();
    expect(resultado).toHaveLength(0);
  });
});
