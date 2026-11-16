import { describe, it, expect } from "vitest";
import {
  calibrar,
  confianzaCalibrada,
  type CalibracionLaya,
  type CajaConfianza,
} from "@/lib/astraura/laya/calibracion-laya";
import { MIN_CASOS_UMBRAL } from "@/lib/astraura/laya/aprendizaje-laya";
import type { CasoLaya } from "@/lib/astraura/laya/aprendizaje-laya";

const caso = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "respuesta.basta",
  ambito: "a1",
  p: 0.9,
  donde: "a1",
  ms: 2000,
  resultado: "aceptada",
  estado: "Respuesta de ejemplo",
  privado: false,
  ...extra,
});

describe("calibrar", () => {
  it("devuelve motivo 'faltan casos' con menos de 30 casos", () => {
    const pocos = Array.from({ length: MIN_CASOS_UMBRAL - 1 }, () => caso());
    const resultado = calibrar(pocos, "respuesta.basta", "a1");
    expect(resultado).toEqual({ n: MIN_CASOS_UMBRAL - 1, motivo: "faltan casos" });
  });

  it("devuelve motivo 'faltan casos' con 0 casos", () => {
    const resultado = calibrar([], "respuesta.basta", "a1");
    expect(resultado).toEqual({ n: 0, motivo: "faltan casos" });
  });

  it("con 30 casos devuelve calibración con 10 cajas, umbral sugerido y n", () => {
    const reg = Array.from({ length: MIN_CASOS_UMBRAL }, (_, i) => caso({ p: 0.1 + (i % 10) * 0.1 }));
    const resultado = calibrar(reg, "respuesta.basta", "a1");
    expect("cajas" in resultado).toBe(true);
    if ("cajas" in resultado) {
      expect(resultado.cajas).toHaveLength(10);
      expect(resultado.n).toBe(MIN_CASOS_UMBRAL);
      expect(typeof resultado.umbralSugerido).toBe("number");
      expect(resultado.umbralSugerido).toBeGreaterThanOrEqual(0);
      expect(resultado.umbralSugerido).toBeLessThanOrEqual(1);
    }
  });

  it("cajas vacías no rompen: cada caja tiene total, aciertos y tasa", () => {
    // Solo casos en cajas altas, las bajas quedan vacías
    const reg = Array.from({ length: MIN_CASOS_UMBRAL }, (_, i) => caso({ p: 0.8 + (i % 3) * 0.05 }));
    const resultado = calibrar(reg, "respuesta.basta", "a1");
    expect("cajas" in resultado).toBe(true);
    if ("cajas" in resultado) {
      for (const caja of resultado.cajas) {
        expect(typeof caja.inicio).toBe("number");
        expect(typeof caja.fin).toBe("number");
        expect(typeof caja.total).toBe("number");
        expect(typeof caja.aciertos).toBe("number");
        expect(typeof caja.tasa).toBe("number");
        expect(caja.tasa).toBeGreaterThanOrEqual(0);
        expect(caja.tasa).toBeLessThanOrEqual(1);
        if (caja.total === 0) {
          expect(caja.aciertos).toBe(0);
          expect(caja.tasa).toBe(0);
        }
      }
    }
  });

  it("Laya sobreconfiada (dice 0.9 y acierta 0.6) baja la confianza calibrada", () => {
    // 30 casos con p=0.9, pero solo 18 aciertos (tasa 0.6)
    const reg: CasoLaya[] = [
      ...Array.from({ length: 18 }, () => caso({ p: 0.9, resultado: "aceptada" })),
      ...Array.from({ length: 12 }, () => caso({ p: 0.9, resultado: "corregida" })),
    ];
    const resultado = calibrar(reg, "respuesta.basta", "a1");
    expect("cajas" in resultado).toBe(true);
    if ("cajas" in resultado) {
      const cajaAlta = resultado.cajas.find((c) => c.inicio <= 0.9 && c.fin > 0.9);
      expect(cajaAlta).toBeDefined();
      if (cajaAlta) {
        expect(cajaAlta.tasa).toBeCloseTo(0.6, 1);
        expect(cajaAlta.tasa).toBeLessThan(0.9);
      }
    }
  });

  it("umbral sugerido está en una caja con buena tasa", () => {
    const reg: CasoLaya[] = [
      ...Array.from({ length: 20 }, () => caso({ p: 0.8, resultado: "aceptada" })),
      ...Array.from({ length: 10 }, () => caso({ p: 0.4, resultado: "corregida" })),
    ];
    const resultado = calibrar(reg, "respuesta.basta", "a1");
    expect("cajas" in resultado).toBe(true);
    if ("cajas" in resultado) {
      expect(resultado.umbralSugerido).toBeGreaterThan(0.4);
      expect(resultado.umbralSugerido).toBeLessThanOrEqual(0.8);
    }
  });
});

describe("confianzaCalibrada", () => {
  it("para p en una caja con datos devuelve la tasa de esa caja (nunca la supera)", () => {
    const cal: CalibracionLaya = {
      cajas: [
        { inicio: 0.0, fin: 0.1, total: 10, aciertos: 1, tasa: 0.1 },
        { inicio: 0.1, fin: 0.2, total: 10, aciertos: 3, tasa: 0.3 },
        { inicio: 0.2, fin: 0.3, total: 10, aciertos: 6, tasa: 0.6 },
        { inicio: 0.3, fin: 0.4, total: 10, aciertos: 8, tasa: 0.8 },
        { inicio: 0.4, fin: 0.5, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.5, fin: 0.6, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.6, fin: 0.7, total: 10, aciertos: 10, tasa: 1.0 },
        { inicio: 0.7, fin: 0.8, total: 10, aciertos: 10, tasa: 1.0 },
        { inicio: 0.8, fin: 0.9, total: 10, aciertos: 10, tasa: 1.0 },
        { inicio: 0.9, fin: 1.0, total: 10, aciertos: 10, tasa: 1.0 },
      ],
      umbralSugerido: 0.3,
      n: 100,
    };

    // p=0.25 está en la caja 0.2-0.3 (tasa 0.6): nunca supera 0.6
    expect(confianzaCalibrada(cal, 0.25)).toBeCloseTo(0.6, 1);
    // p=0.35 está en la caja 0.3-0.4 (tasa 0.8)
    expect(confianzaCalibrada(cal, 0.35)).toBeCloseTo(0.8, 1);
  });

  it("nunca sube la confianza por encima de la tasa observada en la caja", () => {
    const cal: CalibracionLaya = {
      cajas: [
        { inicio: 0.0, fin: 0.1, total: 10, aciertos: 1, tasa: 0.1 },
        { inicio: 0.1, fin: 0.2, total: 10, aciertos: 2, tasa: 0.2 },
        { inicio: 0.2, fin: 0.3, total: 10, aciertos: 3, tasa: 0.3 },
        { inicio: 0.3, fin: 0.4, total: 10, aciertos: 4, tasa: 0.4 },
        { inicio: 0.4, fin: 0.5, total: 10, aciertos: 5, tasa: 0.5 },
        { inicio: 0.5, fin: 0.6, total: 10, aciertos: 6, tasa: 0.6 },
        { inicio: 0.6, fin: 0.7, total: 10, aciertos: 7, tasa: 0.7 },
        { inicio: 0.7, fin: 0.8, total: 10, aciertos: 8, tasa: 0.8 },
        { inicio: 0.8, fin: 0.9, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.9, fin: 1.0, total: 10, aciertos: 6, tasa: 0.6 }, // tasa baja en caja alta
      ],
      umbralSugerido: 0.5,
      n: 100,
    };

    // p=0.95 cae en la última caja (tasa 0.6)
    // confianzaCalibrada no debe devolver más de 0.6
    expect(confianzaCalibrada(cal, 0.95)).toBeLessThanOrEqual(0.6);
    expect(confianzaCalibrada(cal, 0.95)).toBeGreaterThanOrEqual(0);
  });

  it("devuelve 0 para p < 0 y 1 para p > 1 (clamping)", () => {
    const cal: CalibracionLaya = {
      cajas: Array.from({ length: 10 }, (_, i) => ({
        inicio: i * 0.1,
        fin: (i + 1) * 0.1,
        total: 10,
        aciertos: 5,
        tasa: 0.5,
      })),
      umbralSugerido: 0.5,
      n: 100,
    };

    expect(confianzaCalibrada(cal, -0.5)).toBe(0);
    expect(confianzaCalibrada(cal, 1.5)).toBe(1);
  });

  it("en el borde exacto de una caja usa la tasa de la caja a la que pertenece", () => {
    const cal: CalibracionLaya = {
      cajas: [
        { inicio: 0.0, fin: 0.1, total: 10, aciertos: 1, tasa: 0.1 },
        { inicio: 0.1, fin: 0.2, total: 10, aciertos: 5, tasa: 0.5 },
        { inicio: 0.2, fin: 0.3, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.3, fin: 0.4, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.4, fin: 0.5, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.5, fin: 0.6, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.6, fin: 0.7, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.7, fin: 0.8, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.8, fin: 0.9, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.9, fin: 1.0, total: 10, aciertos: 9, tasa: 0.9 },
      ],
      umbralSugerido: 0.2,
      n: 100,
    };

    // p=0.1 exactamente en el borde: pertenece a la caja 0.1-0.2 (tasa 0.5)
    expect(confianzaCalibrada(cal, 0.1)).toBeCloseTo(0.5, 1);
    // p=0.0 exactamente: caja 0.0-0.1 (tasa 0.1)
    expect(confianzaCalibrada(cal, 0.0)).toBeCloseTo(0.1, 1);
    // p=1.0 exactamente: caja 0.9-1.0 (tasa 0.9)
    expect(confianzaCalibrada(cal, 1.0)).toBeCloseTo(0.9, 1);
  });

  it("con caja vacía (total=0) usa tasa 0 y no rompe", () => {
    const cal: CalibracionLaya = {
      cajas: [
        { inicio: 0.0, fin: 0.1, total: 0, aciertos: 0, tasa: 0 },
        { inicio: 0.1, fin: 0.2, total: 10, aciertos: 5, tasa: 0.5 },
        { inicio: 0.2, fin: 0.3, total: 10, aciertos: 8, tasa: 0.8 },
        { inicio: 0.3, fin: 0.4, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.4, fin: 0.5, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.5, fin: 0.6, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.6, fin: 0.7, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.7, fin: 0.8, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.8, fin: 0.9, total: 10, aciertos: 9, tasa: 0.9 },
        { inicio: 0.9, fin: 1.0, total: 10, aciertos: 9, tasa: 0.9 },
      ],
      umbralSugerido: 0.2,
      n: 90,
    };

    // p=0.05 cae en caja vacía
    expect(confianzaCalibrada(cal, 0.05)).toBe(0);
  });
});