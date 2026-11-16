import { describe, expect, it } from "vitest";
import { MODELOS_API, modelosValidos, modeloApiValido, type ModeloApi } from "../modelos-api";

describe("modelos-api", () => {
  describe("MODELOS_API", () => {
    it("contiene los 4 modelos de abliteration.ai verificados el 2026-11-16", () => {
      expect(MODELOS_API).toHaveLength(4);
    });

    it("el modelo ablitrated-model es vigente con base null", () => {
      const m = MODELOS_API.find((x) => x.id === "abliterated-model")!;
      expect(m.proveedor).toBe("abliteration.ai");
      expect(m.contextoK).toBe(262144);
      expect(m.vision).toBe(true);
      expect(m.herramientas).toBe(true);
      expect(m.razonamientoDesactivable).toBe(true);
      expect(m.precioEntradaUsd).toBe(1);
      expect(m.precioEntradaCacheUsd).toBe(0.1);
      expect(m.precioSalidaUsd).toBe(3);
      expect(m.base).toBeNull();
      expect(m.sinFiltros).toBe(true);
      expect(m.estado).toBe("vigente");
      expect(m.fuentes).toContain("https://docs.abliteration.ai/models.md");
      expect(m.comprobado).toBe("2026-11-16");
    });

    it("el modelo large-flash tiene base DeepSeek V4.1-Flash-1017", () => {
      const m = MODELOS_API.find((x) => x.id === "abliterated-model-large-flash")!;
      expect(m.contextoK).toBe(1048576);
      expect(m.precioSalidaUsd).toBe(2);
      expect(m.base).toBe("DeepSeek V4.1-Flash-1017");
      expect(m.estado).toBe("vigente");
    });

    it("el modelo large-v2 tiene base GLM-5.3", () => {
      const m = MODELOS_API.find((x) => x.id === "abliterated-model-large-v2")!;
      expect(m.contextoK).toBe(1000000);
      expect(m.vision).toBe(false);
      expect(m.precioEntradaUsd).toBe(3);
      expect(m.precioSalidaUsd).toBe(5);
      expect(m.base).toBe("GLM-5.3");
      expect(m.estado).toBe("vigente");
    });

    it("el modelo large está marcado como obsoleto", () => {
      const m = MODELOS_API.find((x) => x.id === "abliterated-model-large")!;
      expect(m.estado).toBe("obsoleto");
    });
  });

  describe("modeloApiValido", () => {
    it("acepta modelos vigentes con fuentes y sin precios negativos", () => {
      const m: ModeloApi = {
        proveedor: "test",
        id: "test-model",
        contextoK: 1000,
        vision: false,
        herramientas: false,
        razonamientoDesactivable: false,
        precioEntradaUsd: 0.01,
        precioEntradaCacheUsd: 0.001,
        precioSalidaUsd: 0.1,
        base: null,
        sinFiltros: true,
        estado: "vigente",
        fuentes: ["https://example.com"],
        comprobado: "2026-11-16",
      };
      expect(modeloApiValido(m)).toBe(true);
    });

    it("rechaza el modelo obsoleto (no es válido)", () => {
      const m = MODELOS_API.find((x) => x.id === "abliterated-model-large")!;
      expect(modeloApiValido(m)).toBe(false);
    });

    it("rechaza un modelo sin fuentes", () => {
      const m: ModeloApi = {
        proveedor: "test",
        id: "test-model",
        contextoK: 1000,
        vision: false,
        herramientas: false,
        razonamientoDesactivable: false,
        precioEntradaUsd: 0.01,
        precioEntradaCacheUsd: 0.001,
        precioSalidaUsd: 0.1,
        base: null,
        sinFiltros: true,
        estado: "vigente",
        fuentes: [],
        comprobado: "2026-11-16",
      };
      expect(modeloApiValido(m)).toBe(false);
    });

    it("rechaza un modelo sin campo comprobado", () => {
      const m: ModeloApi = {
        proveedor: "test",
        id: "test-model",
        contextoK: 1000,
        vision: false,
        herramientas: false,
        razonamientoDesactivable: false,
        precioEntradaUsd: 0.01,
        precioEntradaCacheUsd: 0.001,
        precioSalidaUsd: 0.1,
        base: null,
        sinFiltros: true,
        estado: "vigente",
        fuentes: ["https://example.com"],
        comprobado: "",
      };
      expect(modeloApiValido(m)).toBe(false);
    });

    it("rechaza un modelo con precio de salida negativo", () => {
      const m: ModeloApi = {
        proveedor: "test",
        id: "test-model",
        contextoK: 1000,
        vision: false,
        herramientas: false,
        razonamientoDesactivable: false,
        precioEntradaUsd: 0.01,
        precioEntradaCacheUsd: 0.001,
        precioSalidaUsd: -1,
        base: null,
        sinFiltros: true,
        estado: "vigente",
        fuentes: ["https://example.com"],
        comprobado: "2026-11-16",
      };
      expect(modeloApiValido(m)).toBe(false);
    });
  });

  describe("modelosValidos", () => {
    it("filtra MODELOS_API dejando solo los 3 modelos vigentes", () => {
      const validos = modelosValidos(MODELOS_API);
      expect(validos).toHaveLength(3);
      const ids = validos.map((m) => m.id);
      expect(ids).toContain("abliterated-model");
      expect(ids).toContain("abliterated-model-large-flash");
      expect(ids).toContain("abliterated-model-large-v2");
      expect(ids).not.toContain("abliterated-model-large");
    });

    it("descarta el modelo obsoleto de MODELOS_API", () => {
      const validos = modelosValidos(MODELOS_API);
      expect(validos.find((m) => m.id === "abliterated-model-large")).toBeUndefined();
    });

    it("devuelve vacío para una lista vacía", () => {
      expect(modelosValidos([])).toEqual([]);
    });
  });
});