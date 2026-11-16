import { describe, expect, it } from "vitest";
import { proyectarForma, type IdForma } from "../proyeccion-ligera";

const FORMAS: IdForma[] = ["semilla", "merkaba", "jitterbug", "teseracto", "dodecaedro", "matriz", "icosaedro", "modelo"];

describe("proyección 2D ligera de la Protomolécula", () => {
  it("cada IdForma devuelve algo dibujable (líneas o puntos)", () => {
    for (const id of FORMAS) {
      const r = proyectarForma(id, 0);
      const total = r.lineas.length + r.puntos.length;
      expect(total).toBeGreaterThan(0);
    }
  });

  it("los números de la marca: merkaba 24 líneas, icosaedro 30, dodecaedro 30, teseracto 32", () => {
    expect(proyectarForma("merkaba", 0).lineas).toHaveLength(24);
    expect(proyectarForma("icosaedro", 0).lineas).toHaveLength(30);
    expect(proyectarForma("dodecaedro", 0).lineas).toHaveLength(30);
    expect(proyectarForma("teseracto", 0).lineas).toHaveLength(32);
  });

  it("jitterbug con r = 0.5 tiene 24 líneas", () => {
    expect(proyectarForma("jitterbug", 0).lineas).toHaveLength(24);
  });

  it("semilla: 55 puntos en espiral áurea, sin líneas", () => {
    const r = proyectarForma("semilla", 0);
    expect(r.puntos).toHaveLength(55);
    expect(r.lineas).toHaveLength(0);
  });

  it("matriz y modelo devuelven la semilla (no se dibujan aquí)", () => {
    expect(proyectarForma("matriz", 0)).toEqual(proyectarForma("semilla", 0));
    expect(proyectarForma("modelo", 0)).toEqual(proyectarForma("semilla", 0));
  });

  it("todo punto cae dentro del cuadro lado × lado centrado en (0,0)", () => {
    for (const id of FORMAS) {
      const r = proyectarForma(id, 0, 100);
      const radio = 100 * 0.42;
      for (const [x, y] of r.puntos) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(radio + 1e-6);
      }
      for (const [x1, y1, x2, y2] of r.lineas) {
        expect(Math.hypot(x1, y1)).toBeLessThanOrEqual(radio + 1e-6);
        expect(Math.hypot(x2, y2)).toBeLessThanOrEqual(radio + 1e-6);
      }
    }
  });

  it("giro 0 y 2π dan lo mismo (tolerancia 1e-6)", () => {
    for (const id of FORMAS) {
      const a = proyectarForma(id, 0, 100);
      const b = proyectarForma(id, Math.PI * 2, 100);
      expect(a.lineas).toHaveLength(b.lineas.length);
      expect(a.puntos).toHaveLength(b.puntos.length);
      for (let i = 0; i < a.lineas.length; i++) {
        expect(a.lineas[i][0]).toBeCloseTo(b.lineas[i][0], 5);
        expect(a.lineas[i][1]).toBeCloseTo(b.lineas[i][1], 5);
        expect(a.lineas[i][2]).toBeCloseTo(b.lineas[i][2], 5);
        expect(a.lineas[i][3]).toBeCloseTo(b.lineas[i][3], 5);
      }
      for (let i = 0; i < a.puntos.length; i++) {
        expect(a.puntos[i][0]).toBeCloseTo(b.puntos[i][0], 5);
        expect(a.puntos[i][1]).toBeCloseTo(b.puntos[i][1], 5);
      }
    }
  });

  it("límite de 120 líneas y 60 puntos por forma", () => {
    for (const id of FORMAS) {
      const r = proyectarForma(id, 0, 100);
      expect(r.lineas.length).toBeLessThanOrEqual(120);
      expect(r.puntos.length).toBeLessThanOrEqual(60);
    }
  });

  it("determinista: misma entrada, misma salida", () => {
    for (const id of FORMAS) {
      const a = proyectarForma(id, 0.7, 200);
      const b = proyectarForma(id, 0.7, 200);
      expect(a).toEqual(b);
    }
  });

  it("números con 2 decimales", () => {
    const r = proyectarForma("merkaba", 0.5, 100);
    for (const linea of r.lineas) {
      for (const n of linea) {
        expect(Math.round(n * 100) / 100).toBe(n);
      }
    }
    for (const punto of r.puntos) {
      for (const n of punto) {
        expect(Math.round(n * 100) / 100).toBe(n);
      }
    }
  });

  it("lado personalizado escala la proyección", () => {
    const r100 = proyectarForma("merkaba", 0, 100);
    const r200 = proyectarForma("merkaba", 0, 200);
    for (let i = 0; i < r100.lineas.length; i++) {
      expect(r200.lineas[i][0]).toBeCloseTo(r100.lineas[i][0] * 2, 5);
      expect(r200.lineas[i][1]).toBeCloseTo(r100.lineas[i][1] * 2, 5);
    }
  });
});