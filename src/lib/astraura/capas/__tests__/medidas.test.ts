import { describe, it, expect, vi } from "vitest";
import { registrarMedida, ordenarPorMedidas, type AlmacenMedidas, type Medida } from "../medidas";

describe("Medidas de Capas", () => {
  const mockAlmacen: AlmacenMedidas = {
    registrarMedida: vi.fn(),
    obtenerMedia: vi.fn(),
  };

  it("debe registrar medida", () => {
    const medida: Medida = { neurona: "n1", modelo: "m1", capa: "reflejo", latenciaMs: 100 };
    registrarMedida(mockAlmacen, medida);
    expect(mockAlmacen.registrarMedida).toHaveBeenCalledWith(medida);
  });

  it("debe ordenar candidatos por medidas", () => {
    const neurona = "n1";
    const candidatos = [{ modelo: "m1" }, { modelo: "m2" }];
    
    mockAlmacen.obtenerMedia = vi.fn((modelo: string) => {
      if (modelo === "m1") return { latenciaMs: 200, tokPorS: 10, acierto: 0.9 };
      if (modelo === "m2") return { latenciaMs: 100, tokPorS: 50, acierto: 0.9 };
      return null;
    });

    const ordenados = ordenarPorMedidas(candidatos, mockAlmacen, neurona);
    expect(ordenados[0].modelo).toBe("m2");
    expect(ordenados[1].modelo).toBe("m1");
  });
});
