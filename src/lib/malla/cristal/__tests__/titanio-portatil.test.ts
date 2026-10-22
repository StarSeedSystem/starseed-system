import { describe, it, expect } from "vitest";
import type { NeuronaReticula, Reticula, SenalMedida, Tesela } from "../tipos";
import { coordinacionTitanio } from "../titanio";
import { cristalizar } from "../cristalizacion";

const NORMALES = ["n1", "n2", "n3", "n4", "n5", "n6"];

const titanio = (bateriaPct: number | null, cargando: boolean): NeuronaReticula => ({
  id: "t",
  cuenta: "c1",
  esRouter: true,
  posicion: { x: 7, y: 0, precisionM: 5 },
  capacidad: { ramGb: 0.25, bateriaPct, cargando },
  medios: ["wifi-lan"],
});

const normal = (id: string): NeuronaReticula => ({
  id,
  cuenta: "c1",
  posicion: { x: NORMALES.indexOf(id) + 1, y: 0, precisionM: 5 },
  capacidad: { ramGb: 4, bateriaPct: 50, cargando: false },
  medios: ["wifi-lan"],
});

const senal = (de: string, a: string, rssiDbm: number): SenalMedida => ({
  de,
  a,
  medio: "wifi-lan",
  rssiDbm,
  vistaEn: 1000,
});

/**
 * Cadena de seis neuronas normales en línea con un titanio al final. Los enlaces
 * de la cadena son más baratos que los del titanio: así el árbol de Kruskal deja
 * al titanio con un solo puente y el resto los decide su coordinación.
 */
const reticula = (t: NeuronaReticula): Reticula => {
  const senales: SenalMedida[] = [];
  for (let i = 0; i + 1 < NORMALES.length; i++) {
    senales.push(senal(NORMALES[i], NORMALES[i + 1], -45));
  }
  for (const id of NORMALES) senales.push(senal("t", id, -60));
  const teselas: Tesela[] = [...NORMALES, "t"].map((id) => ({
    origen: id,
    reloj: 1,
    neurona: id === "t" ? t : normal(id),
    senales: senales.filter((s) => s.de === id),
  }));
  return { teselas: Object.fromEntries(teselas.map((x) => [x.origen, x])) };
};

const puentesDelTitanio = (r: Reticula): number =>
  cristalizar(r).puentes.filter((p) => p.a === "t" || p.b === "t").length;

describe("coordinacionTitanio", () => {
  it("con corriente coordina 6", () => {
    expect(coordinacionTitanio(titanio(30, true))).toBe(6);
    expect(coordinacionTitanio(titanio(0, true))).toBe(6);
  });
  it("con batería desconocida coordina 6", () => {
    expect(coordinacionTitanio(titanio(null, false))).toBe(6);
  });
  it("con 50 % o más coordina 6", () => {
    expect(coordinacionTitanio(titanio(50, false))).toBe(6);
    expect(coordinacionTitanio(titanio(100, false))).toBe(6);
  });
  it("entre 20 y 50 % coordina 4", () => {
    expect(coordinacionTitanio(titanio(49, false))).toBe(4);
    expect(coordinacionTitanio(titanio(30, false))).toBe(4);
    expect(coordinacionTitanio(titanio(20, false))).toBe(4);
  });
  it("por debajo del 20 % coordina 3", () => {
    expect(coordinacionTitanio(titanio(19, false))).toBe(3);
    expect(coordinacionTitanio(titanio(0, false))).toBe(3);
  });
});

describe("titanio con batería en la retícula amorfa", () => {
  it("al 30 % sin cargar no pasa de 4 puentes", () => {
    const resultado = cristalizar(reticula(titanio(30, false)));
    expect(resultado.coordinacion["t"]).toBeLessThanOrEqual(4);
    expect(puentesDelTitanio(reticula(titanio(30, false)))).toBeLessThanOrEqual(4);
  });
  it("enchufado vuelve a 6 puentes", () => {
    const resultado = cristalizar(reticula(titanio(30, true)));
    expect(resultado.coordinacion["t"]).toBe(6);
    expect(puentesDelTitanio(reticula(titanio(30, true)))).toBe(6);
  });
  it("las neuronas normales de la misma red no cambian", () => {
    const resultado = cristalizar(reticula(titanio(30, false)));
    for (const id of NORMALES) {
      expect(resultado.coordinacion[id]).toBeLessThanOrEqual(4);
    }
  });
});
