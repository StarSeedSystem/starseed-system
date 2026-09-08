import { describe, it, expect } from "vitest";
import { modeloParaOrquestador, modeloEscritorValido } from "../mando/colas";
import { trabajadoresRecomendados } from "../mando/trabajadores";

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

  describe("trabajadoresRecomendados", () => {
    it("debe respetar el techo de 8", () => {
      const r = trabajadoresRecomendados({ memoriaLibreMb: 40000, proveedoresVivos: 20, enCurso: 0 });
      expect(r.recomendado).toBe(8);
      expect(r.maximo).toBe(8);
    });

    it("debe ser al menos 1 aunque no haya memoria", () => {
      const r = trabajadoresRecomendados({ memoriaLibreMb: 0, proveedoresVivos: 3, enCurso: 0 });
      expect(r.recomendado).toBe(1);
    });

    it("debe limitar por proveedores vivos (el doble)", () => {
      const r = trabajadoresRecomendados({ memoriaLibreMb: 40000, proveedoresVivos: 2, enCurso: 0 });
      expect(r.recomendado).toBe(4);
      expect(r.motivo).toContain("proveedores vivos");
    });

    it("debe descontar los agentes en curso", () => {
      const r = trabajadoresRecomendados({ memoriaLibreMb: 8000, proveedoresVivos: 10, enCurso: 4 });
      expect(r.recomendado).toBe(2);
    });

    it("debe explicar cuándo manda la memoria", () => {
      const r = trabajadoresRecomendados({ memoriaLibreMb: 2400, proveedoresVivos: 10, enCurso: 0 });
      expect(r.recomendado).toBe(2);
      expect(r.motivo).toContain("memoria libre");
    });
  });
});
