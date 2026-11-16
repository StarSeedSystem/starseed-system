// Variantes sin filtros pequeñas (0.8B, 2B) añadidas (MOD1116).
// Nota: huihui_ai/qwen3.5-abliterated:0.8B NO se añade porque qwen3.5:0.8b base no existe en MODELOS_SEMILLA.
import { describe, expect, it } from "vitest";
import { catalogoSemilla, MODELOS_SIN_FILTROS_SEMILLA } from "../catalogo-datos";
import { modeloValido, listableSinFiltros } from "../catalogo";

const semilla = catalogoSemilla();
const SF = semilla.modelos.filter((m) => m.clase === "abliterated");

describe("variante 2B: baseId qwen3.5:2b SÍ existe en la semilla", () => {
  it("modeloValido acepta 2B con baseId existente", () => {
    const m2b = SF.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:2B");
    expect(m2b).toBeTruthy();
    expect(m2b?.baseId).toBe("qwen3.5:2b");
    expect(m2b?.descargaGb).toBe(1.9);
    expect(modeloValido(m2b!)).toBe(true);
  });
  it("base qwen3.5:2b SÍ existe en MODELOS_SEMILLA", () => {
    const base2b = semilla.modelos.find((m) => m.id === "qwen3.5:2b");
    expect(base2b).toBeTruthy();
    expect(base2b?.descargaGb).toBe(2.7);
  });
});

describe("0.8B NO se añade: baseId qwen3.5:0.8b ausente en MODELOS_SEMILLA", () => {
  it("qwen3.5:0.8b base no existe, por lo que 0.8B no se agrega", () => {
    const base08 = semilla.modelos.find((m) => m.id === "qwen3.5:0.8b");
    expect(base08).toBeUndefined();
    const m08 = SF.find((m) => m.id === "huihui_ai/qwen3.5-abliterated:0.8B");
    expect(m08).toBeUndefined();
  });
});

describe("todas las variantes sin filtros en la semilla", () => {
  it("las variantes tienen clase abliterated, comprobado, fuentes vivas, y baseId", () => {
    for (const m of MODELOS_SIN_FILTROS_SEMILLA) {
      expect(m.clase).toBe("abliterated");
      expect(m.comprobado).toBe("2026-11-10");
      expect(m.estado).toBe("comprobado");
      expect(m.publicador).toMatch(/huihui_ai/);
      expect(m.fuentes.length).toBeGreaterThan(0);
      expect(m.fuentes.every((f) => f.startsWith("https://ollama.com/huihui_ai/"))).toBe(true);
      expect(listableSinFiltros(m)).toBe(true);
    }
  });
  it("todas tienen puntuacion null (sin medir)", () => {
    for (const m of MODELOS_SIN_FILTROS_SEMILLA) {
      expect(m.puntuacion).toBeNull();
    }
  });
  it("las variantes conservan herramientas y visión (no pierden como DeepSeek-R1)", () => {
    for (const m of MODELOS_SIN_FILTROS_SEMILLA) {
      if (!m.id.includes("deepseek")) {
        expect(m.herramientas).toBe(true);
        expect(m.vision).toBe(true);
      }
    }
  });
});

describe("licencia de qwen3.5:9b actualizada", () => {
  it("licencia es Apache 2.0 con nota de revisión", () => {
    const m9 = semilla.modelos.find((m) => m.id === "qwen3.5:9b");
    expect(m9?.licencia).toBe("Apache 2.0 (ficha de Ollama, 2026-11-16)");
    expect(m9?.nota).toContain("RESTRINGIDA");
    expect(m9?.nota).toContain("ficha de Qwen");
  });
});