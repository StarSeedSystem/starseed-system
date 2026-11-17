import { describe, it, expect } from "vitest";
import { calibrar, confianzaCalibrada } from "../calibracion-laya";
import { MIN_CASOS_UMBRAL, type CasoLaya, type RegistroAprendizaje } from "../aprendizaje-laya";

// Calibración de la confianza de Laya por punto y ámbito (JLA1116A §3.2): 10 cajas de confianza,
// tasa de acierto por caja, y `confianzaCalibrada` que nunca supera la tasa observada.

// Crea un caso sintético de Laya para el punto y ámbito dados.
function crearCaso(p: number, resultado: CasoLaya["resultado"], ambito = "global", punto = "punto1"): CasoLaya {
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
    // Sin calibración no hay confianza que valer: 0, nunca inventada.
    expect(confianzaCalibrada(res, 0.9)).toBe(0);
  });

  it("calibra correctamente con 30 casos y todas p=0.9", () => {
    const casos: CasoLaya[] = [];
    for (let i = 0; i < 30; i++) {
      casos.push(crearCaso(0.9, i < 18 ? "aceptada" : "corregida"));
    }
    const res = calibrar(casos, "punto1", "global");
    if (!("cajas" in res)) throw new Error("con 30 casos debía calibrar");
    expect(res.n).toBe(30);
    expect(res.umbralSugerido).toBe(0.9);
    expect(res.cajas).toHaveLength(10);
    // Solo la caja (0,9–1] tiene casos: 18 aceptadas de 30 = tasa 0,6; las otras quedan a 0.
    expect(res.cajas[9].tasaAc).toBeCloseTo(0.6);
    for (let i = 0; i < 9; i++) {
      expect(res.cajas[i].tasaAc).toBe(0);
    }
    // Sobreconfiada: Laya decía 0,9 y acertaba 0,6 → la confianza calibrada baja a 0,6, nunca más.
    expect(confianzaCalibrada(res, 0.9)).toBeCloseTo(0.6);
    expect(confianzaCalibrada(res, 0.9)).toBeLessThan(0.9);
    expect(confianzaCalibrada(res, 0.8)).toBe(0);
  });

  it("las cajas vacías no rompen: tasa 0 y confianza 0, sin lanzar", () => {
    // Todos los casos caen en la última caja (0,9–1]: las otras nueve quedan vacías.
    const casos: RegistroAprendizaje = Array.from({ length: MIN_CASOS_UMBRAL }, () => crearCaso(0.95, "aceptada"));
    const res = calibrar(casos, "punto1", "global");
    if (!("cajas" in res)) throw new Error("con 30 casos debía calibrar");
    for (let i = 0; i < 9; i++) {
      expect(res.cajas[i].pMin).toBeCloseTo(i / 10);
      expect(res.cajas[i].tasaAc).toBe(0);
    }
    expect(res.cajas[9].tasaAc).toBe(1);
    expect(confianzaCalibrada(res, 0.05)).toBe(0);
    expect(confianzaCalibrada(res, 1)).toBe(1);
  });

  it("cajas con casos distribuidos en todos los intervalos", () => {
    const casos: CasoLaya[] = [];
    // 4 casos por caja, en p = 0,0 … 0,9: 3 aceptadas y 1 corregida → tasa 0,75 en las diez.
    for (let i = 0; i < 10; i++) {
      const p = i * 0.1;
      for (let j = 0; j < 4; j++) {
        casos.push(crearCaso(p, j < 3 ? "aceptada" : "corregida"));
      }
    }
    const res = calibrar(casos, "punto1", "global");
    if (!("cajas" in res)) throw new Error("con 40 casos debía calibrar");
    for (const caja of res.cajas) {
      expect(caja.tasaAc).toBeCloseTo(0.75);
    }
    expect(confianzaCalibrada(res, 0.35)).toBeCloseTo(0.75);
  });
});
