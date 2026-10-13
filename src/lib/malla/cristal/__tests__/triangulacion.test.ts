import { describe, it, expect } from "vitest";
import { delaunay, proyectar, type Punto } from "../triangulacion";

function mezclar<T>(v: T[]): T[] {
  return [...v].reverse();
}

describe("delaunay", () => {
  it("cuadrado de 4 puntos da 5 aristas", () => {
    const pts: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 10, y: 10 },
      { id: "d", x: 0, y: 10 },
    ];
    const aristas = delaunay(pts);
    expect(aristas).toHaveLength(5);
    expect(aristas).toContainEqual(["a", "b"]);
    expect(aristas).toContainEqual(["c", "d"]);
  });

  it("triángulo da 3 aristas", () => {
    const pts: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 5, y: 9 },
    ];
    expect(delaunay(pts)).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });

  it("menos de 2 puntos devuelve []", () => {
    expect(delaunay([])).toEqual([]);
    expect(delaunay([{ id: "a", x: 0, y: 0 }])).toEqual([]);
  });

  it("2 puntos dan su arista", () => {
    expect(delaunay([{ id: "b", x: 1, y: 1 }, { id: "a", x: 0, y: 0 }])).toEqual([["a", "b"]]);
  });

  it("puntos colineales forman la cadena en orden", () => {
    const pts: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "c", x: 20, y: 20 },
      { id: "b", x: 10, y: 10 },
    ];
    expect(delaunay(pts)).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
  });

  it("puntos repetidos (misma x,y) se tratan como uno y el otro se une a él", () => {
    const pts: Punto[] = [
      { id: "z", x: 5, y: 5 },
      { id: "a", x: 5, y: 5 },
      { id: "b", x: 0, y: 0 },
      { id: "c", x: 10, y: 0 },
    ];
    const aristas = delaunay(pts);
    expect(aristas).toContainEqual(["a", "z"]);
    expect(aristas).not.toContainEqual(["b", "z"]);
    expect(aristas).not.toContainEqual(["c", "z"]);
  });

  it("el orden de entrada no cambia la salida", () => {
    const pts: Punto[] = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 10, y: 0 },
      { id: "c", x: 10, y: 10 },
      { id: "d", x: 0, y: 10 },
      { id: "e", x: 5, y: 5 },
    ];
    expect(delaunay(mezclar(pts))).toEqual(delaunay(pts));
  });
});

describe("proyectar", () => {
  it("el origen proyecta a (0, 0)", () => {
    expect(proyectar(0, 0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(proyectar(40.4, -3.7, 40.4, -3.7)).toEqual({ x: 0, y: 0 });
  });

  it("1 grado de latitud son aproximadamente 111 km", () => {
    const { y } = proyectar(1, 0, 0, 0);
    expect(y).toBeGreaterThan(110000);
    expect(y).toBeLessThan(112000);
  });
});
