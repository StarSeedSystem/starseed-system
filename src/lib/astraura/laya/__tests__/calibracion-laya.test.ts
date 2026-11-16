import { describe, it, expect } from "vitest";
import { calibrar, confianzaCalibrada } from "../calibracion-laya";
import type { CasoLaya } from "../aprendizaje-laya";

describe("calibracion-laya", () => {
  it("debe reportar 'faltan casos' con menos de 30 casos", () => {
    const casos: CasoLaya[] = Array.from({ length: 29 }, (_, i) => ({
      punto: "test",
      ambito: "A",
      p: 0.9,
      donde: "astraura-158-local",
      ms: 10,
      resultado: "aceptada",
      estado: "ok",
      privado: false,
    }));
    const res = calibrar(casos, "test", "A");
    expect(res).toEqual({ n: 29, motivo: "faltan casos" });
  });

  it("debe recalibrar Laya sobreconfiada", () => {
    // 30 casos, dice 0.9, acierta solo 0.6 (aceptada 60%)
    const casos: CasoLaya[] = Array.from({ length: 30 }, (_, i) => ({
      punto: "test",
      ambito: "A",
      p: 0.95, // bin 9
      donde: "astraura-158-local",
      ms: 10,
      resultado: i < 18 ? "aceptada" : "corregida", // 18/30 = 0.6
      estado: "ok",
      privado: false,
    }));
    const cal = calibrar(casos, "test", "A");
    
    if ("motivo" in cal) throw new Error("Debería estar calibrado");
    
    // Confianza 0.95 debería bajar a 0.95 * 0.6 = 0.57
    const conf = confianzaCalibrada(cal, 0.95);
    expect(conf).toBeCloseTo(0.57);
  });

  it("no rompe con cajas vacías", () => {
    // Casos concentrados en 0.5 (bin 5)
    const casos: CasoLaya[] = Array.from({ length: 30 }, (_, i) => ({
      punto: "test",
      ambito: "A",
      p: 0.55, 
      donde: "astraura-158-local",
      ms: 10,
      resultado: "aceptada",
      estado: "ok",
      privado: false,
    }));
    const cal = calibrar(casos, "test", "A");
    
    if ("motivo" in cal) throw new Error("Debería estar calibrado");
    
    // Bin 0 (p=0.05) está vacío, debería tener tasa 0
    expect(cal.cajas[0].n).toBe(0);
    expect(cal.cajas[0].tasa).toBe(0);
    
    const conf = confianzaCalibrada(cal, 0.05);
    expect(conf).toBe(0);
  });
});
