import { describe, it, expect } from "vitest";
import {
  type ModoRendimiento,
  type FasePotenciacion,
  MODOS,
  ORDEN_FASES,
  leerModo,
  configDeModo,
  faseActiva,
  fpsObjetivo,
  escalaFondo,
  MODOS_UI,
  migrarConfiguracionAntigua,
} from "../modo-rendimiento";

describe("modo-rendimiento — funciones puras de decisión", () => {
  describe("leerModo", () => {
    it("devuelve 'auto' para valor nulo o indefinido", () => {
      expect(leerModo(null)).toBe("auto");
      expect(leerModo(undefined)).toBe("auto");
    });

    it("devuelve 'auto' para valores no reconocidos", () => {
      expect(leerModo("invalido")).toBe("auto");
      expect(leerModo("")).toBe("auto");
      expect(leerModo("high")).toBe("auto"); // legacy, se migra en device-tier
    });

    it("devuelve el modo correcto para valores válidos", () => {
      expect(leerModo("auto")).toBe("auto");
      expect(leerModo("alto")).toBe("alto");
      expect(leerModo("eco")).toBe("eco");
      expect(leerModo("eficiente")).toBe("eficiente");
    });
  });

  describe("configDeModo", () => {
    it("devuelve configuración completa para cada modo", () => {
      const configAuto = configDeModo("auto");
      expect(configAuto.modo).toBe("auto");
      expect(configAuto.fases).toEqual([]);
      expect(configAuto.fpsObjetivo).toBe(0);
      expect(configAuto.escalaFondo).toBe(1);

      const configAlto = configDeModo("alto");
      expect(configAlto.modo).toBe("alto");
      expect(configAlto.fases).toEqual([]);
      expect(configAlto.fpsObjetivo).toBe(0);
      expect(configAlto.escalaFondo).toBe(1);

      const configEco = configDeModo("eco");
      expect(configEco.modo).toBe("eco");
      expect(configEco.fases).toContain("animaciones");
      expect(configEco.fases).toContain("transiciones");
      expect(configEco.fases).toContain("fondos-dinamicos");
      expect(configEco.fpsObjetivo).toBe(30);
      expect(configEco.escalaFondo).toBe(0.5);

      const configEficiente = configDeModo("eficiente");
      expect(configEficiente.modo).toBe("eficiente");
      expect(configEficiente.fases).toEqual(ORDEN_FASES);
      expect(configEficiente.fpsObjetivo).toBe(10);
      expect(configEficiente.escalaFondo).toBe(0.35);
    });
  });

  describe("faseActiva", () => {
    it("devuelve false para todas las fases en modo 'auto'", () => {
      ORDEN_FASES.forEach((fase) => {
        expect(faseActiva("auto", fase)).toBe(false);
      });
    });

    it("devuelve false para todas las fases en modo 'alto'", () => {
      ORDEN_FASES.forEach((fase) => {
        expect(faseActiva("alto", fase)).toBe(false);
      });
    });

    it("devuelve true solo para las fases de eco en modo 'eco'", () => {
      expect(faseActiva("eco", "animaciones")).toBe(true);
      expect(faseActiva("eco", "transiciones")).toBe(true);
      expect(faseActiva("eco", "fondos-dinamicos")).toBe(true);
      expect(faseActiva("eco", "backdrop-filter")).toBe(false);
      expect(faseActiva("eco", "reflejos")).toBe(false);
      expect(faseActiva("eco", "canvas-webgl")).toBe(false);
      expect(faseActiva("eco", "requestAnimationFrame")).toBe(false);
    });

    it("devuelve true para TODAS las fases en modo 'eficiente'", () => {
      ORDEN_FASES.forEach((fase) => {
        expect(faseActiva("eficiente", fase)).toBe(true);
      });
    });
  });

  describe("fpsObjetivo", () => {
    it("devuelve 0 para auto y alto (sin límite)", () => {
      expect(fpsObjetivo("auto")).toBe(0);
      expect(fpsObjetivo("alto")).toBe(0);
    });

    it("devuelve 30 para eco", () => {
      expect(fpsObjetivo("eco")).toBe(30);
    });

    it("devuelve 10 para eficiente", () => {
      expect(fpsObjetivo("eficiente")).toBe(10);
    });
  });

  describe("escalaFondo", () => {
    it("devuelve 1 para auto y alto", () => {
      expect(escalaFondo("auto")).toBe(1);
      expect(escalaFondo("alto")).toBe(1);
    });

    it("devuelve 0.5 para eco", () => {
      expect(escalaFondo("eco")).toBe(0.5);
    });

    it("devuelve 0.35 para eficiente", () => {
      expect(escalaFondo("eficiente")).toBe(0.35);
    });
  });

  describe("MODOS_UI", () => {
    it("contiene los 4 modos con etiquetas y descripciones", () => {
      expect(MODOS_UI).toHaveLength(4);
      const ids = MODOS_UI.map((m) => m.id);
      expect(ids).toEqual(["auto", "alto", "eco", "eficiente"]);
      MODOS_UI.forEach((m) => {
        expect(m.etiqueta).toBeTruthy();
        expect(m.descripcion).toBeTruthy();
      });
    });
  });

  describe("migrarConfiguracionAntigua", () => {
    it("migra 'high' legacy a 'alto'", () => {
      expect(migrarConfiguracionAntigua("high")).toBe("alto");
    });

    it("mantiene 'eco' legacy", () => {
      expect(migrarConfiguracionAntigua("eco")).toBe("eco");
    });

    it("devuelve 'auto' para valores desconocidos o nulos", () => {
      expect(migrarConfiguracionAntigua(null)).toBe("auto");
      expect(migrarConfiguracionAntigua("desconocido")).toBe("auto");
      expect(migrarConfiguracionAntigua("")).toBe("auto");
    });
  });

  describe("ORDEN_FASES", () => {
    it("tiene el orden correcto de menos a más agresivo", () => {
      expect(ORDEN_FASES).toEqual([
        "animaciones",
        "transiciones",
        "backdrop-filter",
        "reflejos",
        "fondos-dinamicos",
        "canvas-webgl",
        "requestAnimationFrame",
      ]);
    });
  });

  describe("MODOS — estructura completa", () => {
    it("cada modo tiene todas las propiedades requeridas", () => {
      (["auto", "alto", "eco", "eficiente"] as ModoRendimiento[]).forEach((modo) => {
        const config = MODOS[modo];
        expect(config.modo).toBe(modo);
        expect(Array.isArray(config.fases)).toBe(true);
        expect(typeof config.fpsObjetivo).toBe("number");
        expect(typeof config.escalaFondo).toBe("number");
        expect(typeof config.etiqueta).toBe("string");
        expect(typeof config.descripcion).toBe("string");
        expect(config.etiqueta.length).toBeGreaterThan(0);
        expect(config.descripcion.length).toBeGreaterThan(0);
      });
    });

    it("modo eficiente incluye todas las fases de ORDEN_FASES", () => {
      expect(MODOS.eficiente.fases).toEqual(ORDEN_FASES);
    });

    it("modo eco es subconjunto de eficiente", () => {
      const ecoFases = new Set(MODOS.eco.fases);
      const eficienteFases = new Set(MODOS.eficiente.fases);
      ecoFases.forEach((f) => expect(eficienteFases.has(f)).toBe(true));
    });
  });
});