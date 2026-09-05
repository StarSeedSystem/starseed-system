import { describe, it, expect } from "vitest";
import { modeloParaOrquestador, modeloEscritorValido } from "../mando/colas";

describe("Funciones de colas del mando", () => {
  describe("modeloParaOrquestador", () => {
    it("debe convertir nim/ a nvidia/", () => {
      expect(modeloParaOrquestador("nim/moonshotai/kimi-k3")).toBe("nvidia/moonshotai/kimi-k3");
    });

    it("debe mantener otros modelos igual", () => {
      expect(modeloParaOrquestador("xkiro/qwen/qwen3-coder-plus:free")).toBe("xkiro/qwen/qwen3-coder-plus:free");
      expect(modeloParaOrquestador("nvidia/test/model")).toBe("nvidia/test/model");
      expect(modeloParaOrquestador("aihubmix/test/model")).toBe("aihubmix/test/model");
    });
  });

  describe("modeloEscritorValido", () => {
    it("debe retornar true para modelos válidos", () => {
      expect(modeloEscritorValido("xkiro/qwen/qwen3-coder-plus:free")).toBe(true);
      expect(modeloEscritorValido("nvidia/moonshotai/kimi-k3")).toBe(true);
    });

    it("debe retornar false para modelos inválidos", () => {
      expect(modeloEscritorValido("ollama/qwen2.5:1.5b")).toBe(false);
      expect(modeloEscritorValido("sin-barra")).toBe(false);
      expect(modeloEscritorValido("")).toBe(false);
    });
  });
});
