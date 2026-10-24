import { describe, it, expect } from "vitest";
import { delaunay, proyectar, Punto } from "../triangulacion";

describe("triangulación y proyección", () => {
  it("proyectar 0,0 a 0,0 y 1 grado de latitud aproximadamente 111 km", () => {
    const p0 = proyectar(0, 0, 0, 0);
    expect(p0.x).toBe(0);
    expect(p0.y).toBe(0);

    const p1 = proyectar(1, 0, 0, 0);
    expect(p1.x).toBe(0);
    expect(Math.round(p1.y / 1000)).toBe(111);
  });

  it("delaunay con menos de 2 puntos devuelve vacío", () => {
    expect(delaunay([])).toEqual([]);
    expect(delaunay([{ id: "a", x: 0, y: 0 }])).toEqual([]);
  });

  it("delaunay con 2 puntos devuelve una arista", () => {
    const puntos: Punto[] = [
      { id: "b", x: 1, y: 0 },
      { id: "a", x: 0, y: 0 },
    ];
    const aristas = delaunay(puntos);
    expect(aristas).toEqual([["a", "b"]]);
  });

  it("delaunay con triángulo da 3 aristas", () => {
    const puntos: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
      { id: "c", x: 0.5, y: 1 },
    ];
    const aristas = delaunay(puntos);
    expect(aristas.length).toBe(3);
    expect(aristas).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });

  it("cuadrado de 4 puntos da 5 aristas", () => {
    const puntos: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
      { id: "c", x: 1, y: 1 },
      { id: "d", x: 0, y: 1 },
    ];
    const aristas = delaunay(puntos);
    expect(aristas.length).toBe(5);
  });

  it("puntos colineales devuelve la cadena en orden", () => {
    const puntos: Punto[] = [
      { id: "c", x: 2, y: 0 },
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
    ];
    const aristas = delaunay(puntos);
    expect(aristas).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
  });

  it("puntos duplicados cuentan una vez y se quedan con el id menor", () => {
    const puntos: Punto[] = [
      { id: "b", x: 0, y: 0 },
      { id: "a", x: 0, y: 0 },
      { id: "c", x: 1, y: 0 },
    ];
    expect(delaunay(puntos)).toEqual([["a", "c"]]);
  });

  it("pentágono convexo da 7 aristas (5 de contorno y 2 diagonales)", () => {
    const puntos: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
      { id: "c", x: 2, y: 1 },
      { id: "d", x: 1, y: 2 },
      { id: "e", x: 0, y: 1 },
    ];
    expect(delaunay(puntos)).toHaveLength(7);
  });

  it("orden de entrada no cambia la salida", () => {
    const p1: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
      { id: "c", x: 0.5, y: 1 },
    ];
    const p2: Punto[] = [
      { id: "c", x: 0.5, y: 1 },
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
    ];
    expect(delaunay(p1)).toEqual(delaunay(p2));
  });

  it("colineales con ids fuera del orden de la recta: une vecinos a lo largo de ella, no por id", () => {
    // a ─ c ─ b sobre el eje x: la arista a–b atravesaría a c.
    const puntos: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 2, y: 0 },
      { id: "c", x: 1, y: 0 },
    ];
    expect(delaunay(puntos)).toEqual([
      ["a", "c"],
      ["b", "c"],
    ]);
  });

  it("nube alargada (metros): conserva la arista del contorno convexo que un supertriángulo finito perdía", () => {
    // Contorno a–d–e con b y c dentro: triangulación de 3n − 3 − h = 15 − 3 − 3 = 9 aristas.
    const puntos: Punto[] = [
      { id: "a", x: 34863, y: 410 },
      { id: "b", x: 32694, y: 108 },
      { id: "c", x: 24075, y: 115 },
      { id: "d", x: 38698, y: 8 },
      { id: "e", x: 13482, y: 156 },
    ];
    expect(delaunay(puntos)).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["a", "d"],
      ["a", "e"],
      ["b", "c"],
      ["b", "d"],
      ["c", "d"],
      ["c", "e"],
      ["d", "e"],
    ]);
  });

  it("un id que empieza por «supra» es un punto más, no se descarta", () => {
    const puntos: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 1, y: 0 },
      { id: "supra1", x: 0.5, y: 1 },
    ];
    expect(delaunay(puntos)).toEqual([
      ["a", "b"],
      ["a", "supra1"],
      ["b", "supra1"],
    ]);
  });

  it("proyectar a través del antimeridiano da la distancia corta (≈ 22 km), no casi una vuelta", () => {
    const oeste = proyectar(0, 179.9, 0, -179.9);
    expect(oeste.x).toBeLessThan(0);
    expect(Math.round(Math.abs(oeste.x) / 1000)).toBe(22);
    const este = proyectar(0, -179.9, 0, 179.9);
    expect(este.x).toBeGreaterThan(0);
    expect(Math.round(este.x / 1000)).toBe(22);
  });
});
