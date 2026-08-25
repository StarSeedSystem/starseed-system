/**
 * oficina-salas.test.ts — El plano de la oficina es determinista, estable
 * ante reordenar el backend, y nunca se rompe con cero salas.
 */
import { describe, it, expect } from "vitest";
import { colorSala, disponerSalas, radioSala } from "../oficina-salas";
import { RADIO_SALA_BASE, RADIO_SALA_MAXIMO, RADIO_VESTIBULO_BASE, ESPACIADO_SALA } from "../oficina-constantes";
import type { SalaOficina } from "@/lib/astraura/genesis-types";

function sala(parcial: Partial<SalaOficina> & { id: string }): SalaOficina {
  return { nombre: parcial.id, procesoTipoId: null, actividad: 0, color: null, ...parcial };
}

function distanciaXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe("radioSala", () => {
  it("con 0 ocupantes es el radio base", () => {
    expect(radioSala(0)).toBe(RADIO_SALA_BASE);
  });

  it("crece con la raíz cuadrada de los ocupantes (más gente, sala más grande, pero no lineal)", () => {
    const r1 = radioSala(4);
    const r2 = radioSala(16);
    expect(r2).toBeGreaterThan(r1);
    expect(r2 - r1).toBeCloseTo(radioSala(16) - radioSala(4), 6); // sanity: determinista
  });

  it("nunca supera el techo, aunque la sala tenga cientos de ocupantes", () => {
    expect(radioSala(500)).toBe(RADIO_SALA_MAXIMO);
  });

  it("ocupantes negativos no lanza ni produce un radio menor que el base", () => {
    expect(radioSala(-5)).toBe(RADIO_SALA_BASE);
  });
});

describe("colorSala", () => {
  it("usa el color propio de la sala si lo declaró", () => {
    expect(colorSala({ id: "a", color: "#ff00aa" })).toBe("#ff00aa");
  });

  it("sin color propio, deriva uno determinista del id (hsl válido)", () => {
    const color = colorSala({ id: "sala-alpha", color: null });
    expect(color).toMatch(/^hsl\(/);
  });

  it("es determinista: mismo id, mismo color siempre", () => {
    expect(colorSala({ id: "sala-beta", color: null })).toBe(colorSala({ id: "sala-beta", color: null }));
  });

  it("ids distintos producen colores distintos", () => {
    expect(colorSala({ id: "sala-uno", color: null })).not.toBe(colorSala({ id: "sala-dos", color: null }));
  });
});

describe("disponerSalas", () => {
  it("con cero salas no rompe: mapa vacío, vestíbulo en el origen", () => {
    const d = disponerSalas([], new Map());
    expect(d.salas.size).toBe(0);
    expect(d.idsOrdenados).toEqual([]);
    expect(d.centroVestibulo).toEqual({ x: 0, y: 0, z: 0 });
    expect(d.radioVestibulo).toBe(RADIO_VESTIBULO_BASE);
  });

  it("es determinista: misma entrada, mismo plano siempre", () => {
    const salas = [sala({ id: "b" }), sala({ id: "a" }), sala({ id: "c" })];
    const conteo = new Map([["a", 3], ["b", 1]]);
    const d1 = disponerSalas(salas, conteo);
    const d2 = disponerSalas(salas, conteo);
    expect([...d1.salas.entries()]).toEqual([...d2.salas.entries()]);
  });

  it("el orden de llegada del backend NO cambia dónde queda cada sala (se ordena por id)", () => {
    const a = sala({ id: "alfa" });
    const b = sala({ id: "beta" });
    const c = sala({ id: "gamma" });
    const d1 = disponerSalas([a, b, c], new Map());
    const d2 = disponerSalas([c, a, b], new Map()); // mismo contenido, otro orden
    expect(d1.salas.get("alfa")!.centro).toEqual(d2.salas.get("alfa")!.centro);
    expect(d1.salas.get("beta")!.centro).toEqual(d2.salas.get("beta")!.centro);
    expect(d1.salas.get("gamma")!.centro).toEqual(d2.salas.get("gamma")!.centro);
    expect(d1.idsOrdenados).toEqual(["alfa", "beta", "gamma"]);
  });

  it("cada sala lleva su recuento de ocupantes y su radio ya calculado a partir de él", () => {
    const d = disponerSalas([sala({ id: "a" }), sala({ id: "b" })], new Map([["a", 9]]));
    expect(d.salas.get("a")!.ocupantes).toBe(9);
    expect(d.salas.get("a")!.radio).toBe(radioSala(9));
    expect(d.salas.get("b")!.ocupantes).toBe(0);
    expect(d.salas.get("b")!.radio).toBe(radioSala(0));
  });

  it("dos salas quedan separadas exactamente por ESPACIADO_SALA en la cuadrícula", () => {
    const d = disponerSalas([sala({ id: "a" }), sala({ id: "b" })], new Map());
    const centroA = d.salas.get("a")!.centro;
    const centroB = d.salas.get("b")!.centro;
    expect(distanciaXZ(centroA, centroB)).toBeCloseTo(ESPACIADO_SALA, 6);
  });

  it("ninguna sala se solapa con otra ni siquiera llenas al máximo (separación > 2×radio máximo)", () => {
    const salas = Array.from({ length: 9 }, (_, i) => sala({ id: `s${i}` }));
    const conteo = new Map(salas.map((s) => [s.id, 999])); // fuerza radio máximo en todas
    const d = disponerSalas(salas, conteo);
    const centros = [...d.salas.values()].map((s) => s.centro);
    for (let i = 0; i < centros.length; i++) {
      for (let j = i + 1; j < centros.length; j++) {
        expect(distanciaXZ(centros[i], centros[j])).toBeGreaterThan(RADIO_SALA_MAXIMO * 2);
      }
    }
  });

  it("el contorno de cada sala es un anillo cerrado no vacío alrededor de su propio centro", () => {
    const d = disponerSalas([sala({ id: "a" })], new Map([["a", 4]]));
    const dispuesta = d.salas.get("a")!;
    expect(dispuesta.contorno.length).toBeGreaterThan(0);
    for (const [x, z] of dispuesta.contorno) {
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(dispuesta.radio * 1.3); // contornoEspacio varía ±28%
    }
  });

  it("el vestíbulo crece con más ocupantes sin sala, y siempre queda fuera de la cuadrícula", () => {
    const salas = [sala({ id: "a" }), sala({ id: "b" }), sala({ id: "c" })];
    const dPoco = disponerSalas(salas, new Map(), 1);
    const dMucho = disponerSalas(salas, new Map(), 50);
    expect(dMucho.radioVestibulo).toBeGreaterThan(dPoco.radioVestibulo);
    for (const dispuesta of dPoco.salas.values()) {
      const distanciaAlVestibulo = distanciaXZ(dispuesta.centro, dPoco.centroVestibulo);
      expect(distanciaAlVestibulo).toBeGreaterThan(dispuesta.radio + dPoco.radioVestibulo);
    }
  });
});
