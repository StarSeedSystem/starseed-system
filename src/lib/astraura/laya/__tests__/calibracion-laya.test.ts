import { describe, it, expect } from "vitest";
import { calibrar, confianzaCalibrada, type CalibracionLaya } from "@/lib/astraura/laya/calibracion-laya";
import { MIN_CASOS_UMBRAL, type CasoLaya } from "@/lib/astraura/laya/aprendizaje-laya";

const caso = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "respuesta.basta", ambito: "a1", p: 0.9, donde: "a1", ms: 2000,
  resultado: "aceptada", estado: "ejemplo", privado: false, ...extra,
});

describe("calibrar", () => {
  it("con menos de 30 casos devuelve motivo 'faltan casos'", () => {
    const pocos = Array.from({ length: MIN_CASOS_UMBRAL - 1 }, () => caso());
    const res = calibrar(pocos, "respuesta.basta", "a1");
    expect("motivo" in res).toBe(true);
    if ("motivo" in res) {
      expect(res.motivo).toBe("faltan casos");
      expect(res.n).toBe(MIN_CASOS_UMBRAL - 1);
    }
  });

  it("con 30 casos exactos devuelve calibración completa", () => {
    const treinta = Array.from({ length: MIN_CASOS_UMBRAL }, () => caso({ p: 0.8, resultado: "aceptada" }));
    const res = calibrar(treinta, "respuesta.basta", "a1");
    expect("cajas" in res).toBe(true);
    if ("cajas" in res) {
      expect(res.cajas).toHaveLength(10);
      expect(res.n).toBe(MIN_CASOS_UMBRAL);
      expect(res.punto).toBe("respuesta.basta");
      expect(res.ambito).toBe("a1");
    }
  });

  it("Laya sobreconfiada (p=0.9, acierta 0.6) baja la confianza calibrada", () => {
    const casos: CasoLaya[] = [];
    for (let i = 0; i < 60; i++) {
      const acierta = i < 36; // 60% aciertos
      casos.push(caso({ p: 0.9, resultado: acierta ? "aceptada" : "corregida" }));
    }
    const res = calibrar(casos, "respuesta.basta", "a1");
    expect("cajas" in res).toBe(true);
    if ("cajas" in res) {
      const cal = res as CalibracionLaya;
      const caja9 = cal.cajas[9]; // rango [0.9, 1.0]
      expect(caja9.total).toBe(60);
      expect(caja9.tasa).toBeCloseTo(0.6, 1);
      const cal09 = confianzaCalibrada(cal, 0.9);
      expect(cal09).toBeLessThanOrEqual(0.6);
      expect(cal09).toBeLessThan(0.9);
    }
  });

  it("cajas vacías no rompen la interpolación", () => {
    const casos: CasoLaya[] = [];
    for (let i = 0; i < 30; i++) {
      casos.push(caso({ p: 0.3, resultado: "aceptada" })); // solo en caja 3
    }
    const res = calibrar(casos, "respuesta.basta", "a1");
    expect("cajas" in res).toBe(true);
    if ("cajas" in res) {
      const cal = res as CalibracionLaya;
      // cajas 0-2 y 4-9 están vacías
      expect(cal.cajas[0].total).toBe(0);
      expect(cal.cajas[5].total).toBe(0);
      // interpolar en caja vacía no debe subir por encima de p
      const c0 = confianzaCalibrada(cal, 0.05);
      expect(c0).toBeLessThanOrEqual(0.05);
      const c5 = confianzaCalibrada(cal, 0.55);
      expect(c5).toBeLessThanOrEqual(0.55);
      // en caja con datos, no sube por encima de la tasa observada
      const c3 = confianzaCalibrada(cal, 0.35);
      expect(c3).toBeLessThanOrEqual(cal.cajas[3].tasa);
    }
  });

  it("umbre sugerido es el centro de la caja con mejor tasa y ≥ 3 casos", () => {
    const casos: CasoLaya[] = [
      ...Array.from({ length: 10 }, () => caso({ p: 0.25, resultado: "aceptada" })), // caja 2, 100%
      ...Array.from({ length: 10 }, () => caso({ p: 0.75, resultado: "corregida" })), // caja 7, 0%
      ...Array.from({ length: 10 }, () => caso({ p: 0.55, resultado: "aceptada" })), // caja 5, 100%
    ];
    const res = calibrar(casos, "respuesta.basta", "a1");
    expect("cajas" in res).toBe(true);
    if ("cajas" in res) {
      expect(res.umbralSugerido).toBeGreaterThan(0.2);
      expect(res.umbralSugerido).toBeLessThan(0.8);
    }
  });
});

describe("confianzaCalibrada", () => {
  it("nunca sube la confianza por encima de la tasa observada", () => {
    const casos: CasoLaya[] = Array.from({ length: 40 }, (_, i) =>
      caso({ p: 0.8, resultado: i < 20 ? "aceptada" : "corregida" }) // 50% en caja 8
    );
    const res = calibrar(casos, "respuesta.basta", "a1");
    expect("cajas" in res).toBe(true);
    if ("cajas" in res) {
      const cal = res as CalibracionLaya;
      expect(confianzaCalibrada(cal, 0.85)).toBeLessThanOrEqual(0.5);
      expect(confianzaCalibrada(cal, 0.85)).toBeLessThan(0.85);
    }
  });

  it("en los bordes 0 y 1 devuelve 0 y 1", () => {
    const casos: CasoLaya[] = Array.from({ length: 30 }, () => caso({ p: 0.5, resultado: "aceptada" }));
    const res = calibrar(casos, "respuesta.basta", "a1");
    expect("cajas" in res).toBe(true);
    if ("cajas" in res) {
      expect(confianzaCalibrada(res, 0)).toBe(0);
      expect(confianzaCalibrada(res, 1)).toBe(1);
    }
  });
});