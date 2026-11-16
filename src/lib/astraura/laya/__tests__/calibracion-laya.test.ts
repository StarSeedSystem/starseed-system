import { describe, it, expect } from "vitest";
import {
  calibrar, confianzaCalibrada, esExitoso, type CasoLaya, type RegistroAprendizaje,
  type ResultadoCalibracionExitoso,
} from "@/lib/astraura/laya/calibracion-laya";

const caso = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "respuesta.basta",
  ambito: "a1",
  p: 0.9,
  donde: "a1",
  ms: 2000,
  resultado: "aceptada",
  estado: "Ejemplo de caso",
  privado: false,
  ...extra,
});

describe("calibrar", () => {
  it("devuelve 'faltan casos' con menos de 30 casos", () => {
    const reg: RegistroAprendizaje = [caso()];
    const result = calibrar(reg, "respuesta.basta", "a1");
    expect(esExitoso(result)).toBe(false);
    if (!esExitoso(result)) {
      expect(result.motivo).toBe("faltan casos");
      expect(result.n).toBe(1);
    }
  });

  it("devuelve {cajas, umbralSugerido, n} con ≥ 30 casos de éxito", () => {
    const reg: RegistroAprendizaje = Array.from({ length: 30 }, (_, i) =>
      caso({ p: 0.7 + i * 0.01, resultado: i < 25 ? "aceptada" : "corregida" })
    );
    const result = calibrar(reg, "respuesta.basta", "a1");
    expect(esExitoso(result)).toBe(true);
    if (esExitoso(result)) {
      expect(result.n).toBe(30);
      expect(result.cajas).toHaveLength(10);
      expect(result.umbralSugerido).toBeGreaterThanOrEqual(0);
      expect(result.umbralSugerido).toBeLessThanOrEqual(1);
    }
  });

  it("filtra casos por punto y ámbito", () => {
    const reg: RegistroAprendizaje = [
      ...Array.from({ length: 30 }, () => caso({ punto: "respuesta.basta", ambito: "a1" })),
      ...Array.from({ length: 30 }, () => caso({ punto: "respuesta.basta", ambito: "mac" })),
    ];
    const result = calibrar(reg, "respuesta.basta", "a1");
    expect(esExitoso(result)).toBe(true);
    if (esExitoso(result)) {
      expect(result.n).toBe(30);
    }
  });

  it("las cajas tienen tasas de acierto entre 0 y 1", () => {
    const reg: RegistroAprendizaje = Array.from({ length: 35 }, () =>
      caso({ resultado: "aceptada" })
    );
    const result = calibrar(reg, "respuesta.basta", "a1");
    if (esExitoso(result)) {
      for (const caja of result.cajas) {
        expect(caja.tasaAcierto).toBeGreaterThanOrEqual(0);
        expect(caja.tasaAcierto).toBeLessThanOrEqual(1);
      }
    }
  });

  it("el umbral sugerido es el mínimo de las tasas de acierto", () => {
    const reg: RegistroAprendizaje = [
      ...Array.from({ length: 15 }, () => caso({ resultado: "aceptada" })),
      ...Array.from({ length: 15 }, () => caso({ resultado: "corregida" })),
      ...Array.from({ length: 15 }, () => caso({ resultado: "aceptada" })),
      ...Array.from({ length: 15 }, () => caso({ resultado: "aceptada" })),
      ...Array.from({ length: 30 }, () => caso({ resultado: "aceptada" })),
    ];
    const result = calibrar(reg, "respuesta.basta", "a1");
    if (esExitoso(result)) {
      const menorTasa = Math.min(...result.cajas.map((c) => c.tasaAcierto));
      expect(result.umbralSugerido).toBe(menorTasa);
    }
  });
});

describe("confianzaCalibrada", () => {
  it("nunca sube la confianza por encima del umbral observado", () => {
    const cal: ResultadoCalibracionExitoso = {
      cajas: [],
      umbralSugerido: 0.75,
      n: 30,
    };
    const p = 0.95;
    expect(confianzaCalibrada(cal, p)).toBe(0.75);
  });

  it("mantiene la confianza si está por debajo del umbral", () => {
    const cal: ResultadoCalibracionExitoso = {
      cajas: [],
      umbralSugerido: 0.85,
      n: 30,
    };
    const p = 0.65;
    expect(confianzaCalibrada(cal, p)).toBe(0.65);
  });

  it("maneja el caso límite con p = umbralSugerido", () => {
    const cal: ResultadoCalibracionExitoso = {
      cajas: [],
      umbralSugerido: 0.7,
      n: 30,
    };
    expect(confianzaCalibrada(cal, 0.7)).toBe(0.7);
  });

  it("maneja p = 0", () => {
    const cal: ResultadoCalibracionExitoso = {
      cajas: [],
      umbralSugerido: 0.5,
      n: 30,
    };
    expect(confianzaCalibrada(cal, 0)).toBe(0);
  });

  it("maneja p = 1", () => {
    const cal: ResultadoCalibracionExitoso = {
      cajas: [],
      umbralSugerido: 0.88,
      n: 30,
    };
    expect(confianzaCalibrada(cal, 1)).toBe(0.88);
  });
});

describe("cajas con datos sobreconfiados de Laya", () => {
  it("baja la confianza cuando Laya sobreconfía (dice 0,9 y acierta 0,6)", () => {
    const reg: RegistroAprendizaje = Array.from({ length: 40 }, (_, i) => {
      const p = i < 25 ? 0.95 : 0.85;
      const resultado = i < 25 ? "aceptada" : "corregida";
      return caso({ p, resultado });
    });
    const result = calibrar(reg, "respuesta.basta", "a1");
    if (esExitoso(result)) {
      expect(result.umbralSugerido).toBeLessThan(0.62);
    }
  });
});