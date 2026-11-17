import { describe, it, expect } from "vitest";
import { calibrar, confianzaCalibrada } from "../calibracion-laya";
import { MIN_CASOS_UMBRAL, type CasoLaya, type RegistroAprendizaje } from "../aprendizaje-laya";

function caso(
  p: number,
  resultado: "aceptada" | "corregida" | "escalada",
  punto = "respuesta.basta",
  ambito = "a1",
): CasoLaya {
  return { punto, ambito, p, donde: "mac", ms: 100, resultado, estado: "e", privado: false };
}

describe("calibración de la confianza de Laya", () => {
  it("con menos de 30 casos devuelve el motivo «faltan casos»", () => {
    const registro: RegistroAprendizaje = Array.from({ length: MIN_CASOS_UMBRAL - 1 }, () =>
      caso(0.9, "aceptada"),
    );
    const cal = calibrar(registro, "respuesta.basta", "a1");
    expect(cal).toEqual({ n: MIN_CASOS_UMBRAL - 1, motivo: "faltan casos" });
  });

  it("Laya sobreconfiada (dice 0,9 y acierta 0,6) baja la confianza", () => {
    const registro: RegistroAprendizaje = Array.from({ length: 30 }, (_, i) =>
      caso(0.9, i < 18 ? "aceptada" : "corregida"),
    );
    const cal = calibrar(registro, "respuesta.basta", "a1");
    if ("motivo" in cal) throw new Error("se esperaba calibración");
    expect(cal.n).toBe(30);
    expect(cal.cajas).toHaveLength(10);
    const cajaAlta = cal.cajas[9];
    expect(cajaAlta.tasaAc).toBeCloseTo(0.6);
    expect(confianzaCalibrada(cal, 0.9)).toBeCloseTo(0.6);
    expect(confianzaCalibrada(cal, 0.9)).toBeLessThanOrEqual(0.6);
  });

  it("las cajas vacías no rompen y la confianza no sube la tasa observada", () => {
    const registro: RegistroAprendizaje = Array.from({ length: 30 }, (_, i) =>
      caso(0.9, i < 18 ? "aceptada" : "corregida"),
    );
    const cal = calibrar(registro, "respuesta.basta", "a1");
    if ("motivo" in cal) throw new Error("se esperaba calibración");
    expect(cal.cajas[0].tasaAc).toBe(0);
    expect(confianzaCalibrada(cal, 0.05)).toBe(0);
    expect(confianzaCalibrada(cal, 0.95)).toBeLessThanOrEqual(cal.cajas[9].tasaAc);
  });
});
