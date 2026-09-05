import { describe, expect, test } from "vitest";
import {
  ModeloFuente,
  MODELOS_FUENTE,
  FaseForja,
  FASES_FORJA,
  ModuloPrograma,
  MODULOS_PROGRAMA,
  progresoFase,
  progresoForja,
  modelosPorEstado,
  modelosUsablesEnProducto
} from "../manifiesto";

describe("Manifiesto de la Forja de Voz 1.58", () => {
  test("debe tener 13 modelos fuente", () => {
    expect(MODELOS_FUENTE).toHaveLength(13);
  });

  test("ninguno de modelosUsablesEnProducto tiene 'NC' en licencia ni licenciaPesos", () => {
    const modelosUsables = modelosUsablesEnProducto();
    modelosUsables.forEach(modelo => {
      expect(modelo.licencia).not.toContain("NC");
      if (modelo.licenciaPesos) {
        expect(modelo.licenciaPesos).not.toContain("NC");
      }
    });
  });

  test("progresoFase de una fase con 2 de 4 hechos es 50", () => {
    const fase: FaseForja = {
      id: 1,
      nombre: "programa único",
      descripcion: "fusionar con criterio el código de varios modelos abiertos en UN programa de voz propio",
      hitos: [
        { id: "hito1", titulo: "Hito 1", estado: "hecho" },
        { id: "hito2", titulo: "Hito 2", estado: "hecho" },
        { id: "hito3", titulo: "Hito 3", estado: "pendiente" },
        { id: "hito4", titulo: "Hito 4", estado: "pendiente" }
      ]
    };
    expect(progresoFase(fase)).toBe(50);
  });

  test("progresoForja está entre 0 y 100", () => {
    const progreso = progresoForja();
    expect(progreso).toBeGreaterThanOrEqual(0);
    expect(progreso).toBeLessThanOrEqual(100);
  });

  test("todos los repos empiezan por https://github.com/", () => {
    MODELOS_FUENTE.forEach(modelo => {
      expect(modelo.repo).toMatch(/^https:\/\/github\.com\//);
    });
  });
});