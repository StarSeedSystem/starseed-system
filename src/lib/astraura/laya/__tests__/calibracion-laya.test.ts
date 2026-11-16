import { describe, it, expect } from "vitest";
import { calibrar, confianzaCalibrada, type CalibracionLaya, type CajaConfianza } from "@/lib/astraura/laya/calibracion-laya";
import { MIN_CASOS_UMBRAL, type CasoLaya } from "@/lib/astraura/laya/aprendizaje-laya";

const caso = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "respuesta.basta", ambito: "a1", p: 0.9, donde: "a1", ms: 2000,
  resultado: "aceptada", estado: "ejemplo", privado: false, ...extra,
});

describe("calibrar", () => {
  it("devuelve motivo 'faltan casos' con menos de MIN_CASOS_UMBRAL casos", () => {
    const pocos = Array.from({ length: MIN_CASOS_UMBRAL - 1 }, () => caso());
    const res = calibrar(pocos, "respuesta.basta", "a1");
    expect(res).toEqual({ n: MIN_CASOS_UMBRAL - 1, motivo: "faltan casos" });
  });

  it("devuelve motivo 'faltan casos' con 0 casos", () => {
    const res = calibrar([], "respuesta.basta", "a1");
    expect(res).toEqual({ n: 0, motivo: "faltan casos" });
  });

  it("con ≥ 30 casos devuelve cajas, umbralSugerido y n", () => {
    const reg = Array.from({ length: 30 }, (_, i) => caso({ p: 0.1 + (i % 10) * 0.1 }));
    const res = calibrar(reg, "respuesta.basta", "a1");
    expect("cajas" in res).toBe(true);
    expect("umbralSugerido" in res).toBe(true);
    expect(res.n).toBe(30);
    expect(res.cajas).toHaveLength(10);
  });

  it("cada caja tiene rango, total, aciertos y tasa", () => {
    const reg = Array.from({ length: 30 }, (_, i) => caso({ p: 0.05 + (i % 10) * 0.1 }));
    const res = calibrar(reg, "respuesta.basta", "a1");
    if ("cajas" in res) {
      for (const caja of res.cajas) {
        expect(caja).toHaveProperty("rango");
        expect(caja).toHaveProperty("total");
        expect(caja).toHaveProperty("aciertos");
        expect(caja).toHaveProperty("tasa");
        expect(caja.tasa).toBeGreaterThanOrEqual(0);
        expect(caja.tasa).toBeLessThanOrEqual(1);
      }
    }
  });

  it("Laya sobreconfiada (dice 0,9 y acierta 0,6) baja la confianza en esa caja", () => {
    const reg: CasoLaya[] = [
      ...Array.from({ length: 18 }, () => caso({ p: 0.9, resultado: "aceptada" })),
      ...Array.from({ length: 12 }, () => caso({ p: 0.9, resultado: "corregida" })),
    ];
    const res = calibrar(reg, "respuesta.basta", "a1");
    if ("cajas" in res) {
      const caja90 = res.cajas.find((c) => c.rango[0] === 0.9 && c.rango[1] === 1.0);
      expect(caja90).toBeDefined();
      expect(caja90!.tasa).toBeCloseTo(0.6, 1);
      expect(caja90!.tasa).toBeLessThan(0.9);
    }
  });

  it("cajas vacías no rompen y tienen tasa 0", () => {
    const reg = Array.from({ length: 30 }, (_, i) => caso({ p: 0.05 + (i % 5) * 0.1 }));
    const res = calibrar(reg, "respuesta.basta", "a1");
    if ("cajas" in res) {
      const vacias = res.cajas.filter((c) => c.total === 0);
      for (const c of vacias) {
        expect(c.tasa).toBe(0);
      }
    }
  });

  it("umbralSugerido está entre 0 y 1", () => {
    const reg = Array.from({ length: 30 }, (_, i) => caso({ p: 0.1 + (i % 10) * 0.1, resultado: i % 3 === 0 ? "corregida" : "aceptada" }));
    const res = calibrar(reg, "respuesta.basta", "a1");
    if ("umbralSugerido" in res) {
      expect(res.umbralSugerido).toBeGreaterThanOrEqual(0);
      expect(res.umbralSugerido).toBeLessThanOrEqual(1);
    }
  });
});

describe("confianzaCalibrada", () => {
  const cajas: readonly CajaConfianza[] = [
    { rango: [0.0, 0.1], total: 5, aciertos: 5, tasa: 1.0 },
    { rango: [0.1, 0.2], total: 5, aciertos: 4, tasa: 0.8 },
    { rango: [0.2, 0.3], total: 5, aciertos: 3, tasa: 0.6 },
    { rango: [0.3, 0.4], total: 5, aciertos: 2, tasa: 0.4 },
    { rango: [0.4, 0.5], total: 5, aciertos: 1, tasa: 0.2 },
    { rango: [0.5, 0.6], total: 0, aciertos: 0, tasa: 0.0 },
    { rango: [0.6, 0.7], total: 5, aciertos: 3, tasa: 0.6 },
    { rango: [0.7, 0.8], total: 5, aciertos: 4, tasa: 0.8 },
    { rango: [0.8, 0.9], total: 5, aciertos: 4, tasa: 0.8 },
    { rango: [0.9, 1.0], total: 5, aciertos: 3, tasa: 0.6 },
  ];
  const cal: CalibracionLaya = { cajas, umbralSugerido: 0.5, n: 45 };

  it("interpola entre cajas adyacentes", () => {
    expect(confianzaCalibrada(cal, 0.15)).toBeCloseTo(0.7, 1);
    expect(confianzaCalibrada(cal, 0.25)).toBeCloseTo(0.5, 1);
  });

  it("en el borde inferior de una caja usa la tasa de esa caja", () => {
    expect(confianzaCalibrada(cal, 0.2)).toBeCloseTo(0.6, 1);
    expect(confianzaCalibrada(cal, 0.5)).toBeCloseTo(0.0, 1);
  });

  it("nunca sube la confianza por encima de la tasa observada de su caja", () => {
    // p=0.55 está en caja [0.5, 0.6] con tasa 0.0
    expect(confianzaCalibrada(cal, 0.55)).toBeLessThanOrEqual(0.0);
    // p=0.95 está en caja [0.9, 1.0] con tasa 0.6
    expect(confianzaCalibrada(cal, 0.95)).toBeLessThanOrEqual(0.6);
  });

  it("p=1.0 cae en la última caja", () => {
    expect(confianzaCalibrada(cal, 1.0)).toBeLessThanOrEqual(0.6);
  });

  it("p=0.0 cae en la primera caja", () => {
    expect(confianzaCalibrada(cal, 0.0)).toBe(1.0);
  });
});