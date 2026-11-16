import { describe, it, expect } from "vitest";
import {
  calibrar, confianzaCalibrada, esResultadoFaltanCasos,
  type CasoLaya, type RegistroAprendizaje
} from "@/lib/astraura/laya/calibracion-laya";

// Test de calibracion-laya.ts
// Contrato: architecture/jev-entrena-laya.md
// - calibrar(casos, punto, ambito): devuelve {n, motivo: "faltan casos"} con < 30 casos,
//   o {cajas, umbralSugerido, n} con ≥ 30 casos
// - confianzaCalibrada(cal, p): interpola y nunca sube la confianza por encima de la tasa observada

const caso = (extra: Partial<CasoLaya> = {}): CasoLaya => ({
  punto: "respuesta.basta", ambito: "a1", p: 0.9, donde: "a1", ms: 2000,
  resultado: "aceptada", estado: "Respuesta de ejemplo", privado: false, ...extra,
});

describe("calibrar", () => {
  it("devuelve 'faltan casos' con menos de 30 casos", () => {
    const reg: RegistroAprendizaje = [caso()];
    const resultado = calibrar(reg, "respuesta.basta", "a1");
    expect(esResultadoFaltanCasos(resultado)).toBe(true);
    if (esResultadoFaltanCasos(resultado)) {
      expect(resultado.n).toBe(1);
      expect(resultado.motivo).toBe("faltan casos");
    }
  });

  it("con ≥ 30 casos devuelve cajas, umbralSugerido y n", () => {
    const reg: RegistroAprendizaje = Array.from({ length: 35 }, () => caso({ p: 0.85, resultado: "aceptada" }));
    const resultado = calibrar(reg, "respuesta.basta", "a1");
    expect(esResultadoFaltanCasos(resultado)).toBe(false);
    if (!esResultadoFaltanCasos(resultado)) {
      expect(resultado.cajas).toHaveLength(10);
      expect(typeof resultado.umbralSugerido).toBe("number");
      expect(resultado.n).toBe(35);
    }
  });

  it("filtra casos por punto y ámbito", () => {
    const reg: RegistroAprendizaje = [
      ...Array.from({ length: 30 }, () => caso({ punto: "respuesta.basta", ambito: "a1", p: 0.9 })),
      ...Array.from({ length: 10 }, () => caso({ punto: "respuesta.basta", ambito: "mac", p: 0.8 })),
      ...Array.from({ length: 15 }, () => caso({ punto: "voz.tono", ambito: "a1", p: 0.7 })),
    ];
    const resultado = calibrar(reg, "respuesta.basta", "a1");
    expect(esResultadoFaltanCasos(resultado)).toBe(false);
    if (!esResultadoFaltanCasos(resultado)) {
      expect(resultado.n).toBe(30);
    }
  });
});

describe("confianzaCalibrada", () => {
  const crearCalibrajeExitoso = () => {
    const reg: RegistroAprendizaje = Array.from({ length: 35 }, () =>
      caso({ p: 0.7, resultado: "aceptada" })
    );
    const r = calibrar(reg, "respuesta.basta", "a1");
    if (esResultadoFaltanCasos(r)) throw new Error("debe ser exitoso");
    return r;
  };

  it("nunca sube la confianza por encima de la tasa observada", () => {
    const cal = crearCalibrajeExitoso();
    const conf = confianzaCalibrada(cal, 0.95);
    expect(conf).toBeLessThanOrEqual(1);
  });

  it("Laya sobreconfiada (dice 0,9 y acierta 0,6) baja la confianza a 0,6", () => {
    const reg: RegistroAprendizaje = Array.from({ length: 35 }, (_, i) =>
      caso({ p: 0.9, resultado: i < 21 ? "aceptada" : "corregida" })
    );
    const r = calibrar(reg, "respuesta.basta", "a1");
    if (!esResultadoFaltanCasos(r)) {
      expect(r.cajas[9].tasa).toBeCloseTo(0.6, 5);
      const conf = confianzaCalibrada(r, 0.9);
      expect(conf).toBe(0.6);
    }
  });
});

describe("esResultadoFaltanCasos", () => {
  it("identifica resultados con 'faltan casos'", () => {
    const reg: RegistroAprendizaje = [caso()];
    const resultado = calibrar(reg, "punto.test", "a1");
    expect(esResultadoFaltanCasos(resultado)).toBe(true);
  });
});