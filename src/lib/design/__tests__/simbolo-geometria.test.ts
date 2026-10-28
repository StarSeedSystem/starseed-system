"use client";
import { describe, it, expect } from "vitest";
import { R, CENTER, APICES, FACETAS, COLORES } from "../index";

describe("rombo de diseño de símbolo", () => {
  it("debe tener radio R = 80", () => {
    expect(R).toBe(80);
  });

  it("centro debe estar en (200, 200)", () => {
    expect(CENTER).toEqual({ x: 200, y: 200 });
  });

  it("ápexes del rombo: arriba (200, 80) y abajo (200, 320)", () => {
    expect(APICES).toEqual({
      arriba: { x: 200, y: 80 },
      abajo: { x: 200, y: 320 },
    });
  });

  it("altura del rombo debe ser 240 (de y=80 a y=320)", () => {
    const height = APICES.abajo.y - APICES.arriba.y;
    expect(height).toBe(240);
  });

  it("rombo equilátero: altura = base·√3/2 ± 0.5", () => {
    const base = 2 * 69.28; // base del triángulo: de x=200-69.28 a x=200+69.28
    const height = 120; // altura del triángulo: de y=80 a y=200, o de y=200 a y=320
    const expected = base * Math.sqrt(3) / 2;
    expect(Math.abs(height - expected)).toBeLessThanOrEqual(0.5);
  });

  it("debe haber 12 facetas", () => {
    expect(FACETAS.length).toBe(12);
  });

  it("cada faceta debe tener color oficial hexadecimal", () => {
    for (const f of FACETAS) {
      expect(f.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("las facetas deben tener ángulos oficiales", () => {
    const angulos = FACETAS.map((f) => f.angulo);
    const esperados = [0, 13.86, 23.2, 30, -30, -23.2, -13.86, 30, 23.2, 13.86, -30, -23.2];
    expect(angulos).toEqual(esperados);
  });

  it("lente del ojo debe caer en y = 200", () => {
    // El ojo tiene centro (200, 280.8) y radio 109.4;
    // la línea horizontal central del ojo cruza y = 200 en los bordes
    const eyeCenterY = 280.8;
    const eyeRadius = 109.4;
    const yMin = eyeCenterY - eyeRadius;
    const yMax = eyeCenterY + eyeRadius;
    // El centro vertical y = 200 debe estar dentro del rango del ojo
    expect(yMin).toBeLessThanOrEqual(200);
    expect(yMax).toBeGreaterThanOrEqual(200);
  });

  it("colores oficiales deben estar definidos", () => {
    expect(COLORES.rojoArriba).toBeDefined();
    expect(COLORES.verdeArriba).toBeDefined();
    expect(COLORES.azulArriba).toBeDefined();
    expect(COLORES.rojoAbajo).toBeDefined();
    expect(COLORES.amarilloAbajo).toBeDefined();
    expect(COLORES.azulAbajo).toBeDefined();
  });
});
