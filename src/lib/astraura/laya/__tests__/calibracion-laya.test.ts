import { describe, it, expect } from "vitest";
import { calibrar, confianzaCalibrada } from "../calibracion-laya";
import { MIN_CASOS_UMBRAL, CasoLaya } from "../aprendizaje-laya";
import type { RegistroAprendizaje } from "../aprendizaje-laya";

// Helper to create a CasoLaya
function crearCaso(p: number, resultado: "aceptada" | "corregida" | "escalada", ambito = "global", punto = "punto1"): CasoLaya {
  return {
    punto,
    ambito,
    p,
    donde: "mac",
    ms: 100,
    resultado,
    estado: "estado",
    privado: false,
  };
}

describe("calibrar y confianzaCalibrada", () => {
  it("devuelve motivo si casos < MIN_CASOS_UMBRAL", () => {
    const casos: RegistroAprendizaje = Array.from({ length: MIN_CASOS_UMBRAL - 1 }, () => crearCaso(0.5, "aceptada"));
    const res = calibrar(casos, "punto1", "global");
    expect(res).toHaveProperty("motivo");
    expect(res).toMatchObject({ n: MIN_CASOS_UMBRAL - 1, motivo: "faltan casos" });
  });

  it("calibra correctamente con 30 casos y todas p=0.9", () => {
    const casos: CasoLaya[] = [];
    for (let i = 0; i < 30; i++) {
      casos.push(crearCaso(0.9, i < 18 ? "aceptada" : "corregida"));
    }
    const res = calibrar(casos, "punto1", "global");
    expect((res as any).cajas).toBeDefined();
    expect((res as any).umbralSugerido).toBeDefined();
    expect((res as any).n).toBe(30);
    expect((res as any).cajas).toHaveLength(10);
    const cajas = (res as any).cajas as Array<{ pMin: number; pMax: number; tasaAc: number }>;
    // only 9th bucket should have rate 0.6
    expect(cajas[9].tasaAc).toBeCloseTo(0.6);
    // other buckets should be 0
    for (let i = 0; i < 9; i++) {
      expect(cajas[i].tasaAc).toBeCloseTo(0);
    }
    // confianza calibrada
    expect(confianzaCalibrada(res, 0.9)).toBeCloseTo(0.6);
    expect(confianzaCalibrada(res, 0.8)).toBeCloseTo(0);
  });

  it("cajas con casos distribuidos en todos los intervalos", () => {
    const casos: CasoLaya[] = [];
    // 10 casos per bucket, 3 aceptada, 1 corregida
    for (let i = 0; i < 10; i++) {
      const p = i * 0.1;
      for (let j = 0; j < 4; j++) {
        casos.push(crearCaso(p, j < 3 ? "aceptada" : "corregida"));
      }
    }
    const res = calibrar(casos, "punto1", "global");
    const cajas = (res as any).cajas as Array<{ pMin: number; pMax: number; tasaAc: number }>;
    cajas.forEach((c) => {
      expect(c.tasaAc).toBeCloseTo(0.75);
    });
    expect(confianzaCalibrada(res, 0.35)).toBeCloseTo(0.75);
  });
});
