import { describe, it, expect } from "vitest";
import { coordinacionTitanio } from "../titanio";
import { cristalizar } from "../cristalizacion";
import type { NeuronaReticula, Reticula, SenalMedida, Tesela } from "../tipos";

// Titanio portátil (contrato §8.1): coordina 6 enchufado o con batería
// ≥ 50 %, 4 entre 20 y 50 %, 3 por debajo del 20 %.

const titanioDe = (bateriaPct: number | null, cargando: boolean): NeuronaReticula => ({
  id: "r",
  cuenta: "c1",
  esRouter: true,
  capacidad: { ramGb: 4, bateriaPct, cargando },
  medios: [],
});

describe("coordinacionTitanio", () => {
  it("cargando devuelve 6", () => {
    expect(coordinacionTitanio(titanioDe(5, true))).toBe(6);
  });

  it("batería desconocida devuelve 6", () => {
    expect(coordinacionTitanio(titanioDe(null, false))).toBe(6);
  });

  it("con 50 % o más devuelve 6", () => {
    expect(coordinacionTitanio(titanioDe(50, false))).toBe(6);
    expect(coordinacionTitanio(titanioDe(80, false))).toBe(6);
  });

  it("entre 20 y 50 devuelve 4", () => {
    expect(coordinacionTitanio(titanioDe(49, false))).toBe(4);
    expect(coordinacionTitanio(titanioDe(20, false))).toBe(4);
  });

  it("por debajo de 20 devuelve 3", () => {
    expect(coordinacionTitanio(titanioDe(19, false))).toBe(3);
    expect(coordinacionTitanio(titanioDe(0, false))).toBe(3);
  });
});

// Escenario determinista en el que el tope de coordinación del titanio decide:
// la cadena m1..m6 cuesta menos (−40 dBm → 0,40) que los brazos r−mi (−50 → 0,50),
// así Kruskal enlaza la cadena y solo r-m1; los demás brazos entran como triángulos,
// hasta el tope del cristal.
const movilDe = (id: string): NeuronaReticula => ({
  id,
  cuenta: "c1",
  capacidad: { ramGb: 4, bateriaPct: 80, cargando: false },
  medios: [],
});

const senalEntre = (de: string, a: string, rssiDbm: number): SenalMedida => ({
  de,
  a,
  medio: "wifi-mesh",
  rssiDbm,
  vistaEn: 1,
});

const reticulaConTitanio = (t: NeuronaReticula): Reticula => {
  const ids = ["m1", "m2", "m3", "m4", "m5", "m6"];
  const teselas: Record<string, Tesela> = {
    r: { origen: "r", reloj: 1, neurona: t, senales: ids.map(m => senalEntre("r", m, -50)) },
  };
  for (let i = 0; i < ids.length; i++) {
    const senales = i < ids.length - 1 ? [senalEntre(ids[i], ids[i + 1], -40)] : [];
    teselas[ids[i]] = { origen: ids[i], reloj: 1, neurona: movilDe(ids[i]), senales };
  }
  return { teselas };
};

describe("cristalizar respeta la batería del titanio", () => {
  it("un titanio al 30 % sin cargar no pasa de 4 puentes", () => {
    const c = cristalizar(reticulaConTitanio(titanioDe(30, false)));
    expect(c.coordinacion.r).toBeLessThanOrEqual(4);
  });

  it("enchufado vuelve a 6", () => {
    const c = cristalizar(reticulaConTitanio(titanioDe(30, true)));
    expect(c.coordinacion.r).toBe(6);
  });

  it("con batería null (desconocida) el titanio sigue llegando a 6", () => {
    const c = cristalizar(reticulaConTitanio(titanioDe(null, false)));
    expect(c.coordinacion.r).toBe(6);
  });

  it("con batería ≥ 50 % el titanio llega a 6 sin cargar", () => {
    const c = cristalizar(reticulaConTitanio(titanioDe(60, false)));
    expect(c.coordinacion.r).toBe(6);
  });
});
