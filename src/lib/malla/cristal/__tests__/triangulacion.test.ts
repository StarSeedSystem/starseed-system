import { describe, it, expect } from "vitest";
import { delaunay, proyectar } from "../triangulacion";

describe("triangulacion", () => {
  it("should return empty array for less than 2 points", () => {
    expect(delaunay([])).toEqual([]);
    expect(delaunay([{id: "1", x: 0, y: 0}])).toEqual([]);
  });

  it("should return the single edge for 2 points", () => {
    const puntos = [
      {id: "1", x: 0, y: 0},
      {id: "2", x: 1, y: 1}
    ];
    expect(delaunay(puntos)).toEqual([["1", "2"]]);
  });

  it("should handle colinear points", () => {
    const puntos = [
      {id: "1", x: 0, y: 0},
      {id: "2", x: 1, y: 0},
      {id: "3", x: 2, y: 0}
    ];
    // Should return the chain: 1-2 and 2-3
    expect(delaunay(puntos)).toEqual([
      ["1", "2"],
      ["2", "3"]
    ]);
  });

  it("should handle duplicate points (same x,y)", () => {
    const puntos = [
      {id: "1", x: 0, y: 0},
      {id: "2", x: 0, y: 0}, // duplicate
      {id: "3", x: 1, y: 1}
    ];
    // Should treat duplicates as one (keep id "1") and connect to "3"
    expect(delaunay(puntos)).toEqual([
      ["1", "3"]
    ]);
  });

  it("should be deterministic (order of input doesn't matter)", () => {
    const puntos1 = [
      {id: "3", x: 1, y: 1},
      {id: "1", x: 0, y: 0},
      {id: "2", x: 1, y: 0}
    ];
    const puntos2 = [
      {id: "1", x: 0, y: 0},
      {id: "2", x: 1, y: 0},
      {id: "3", x: 1, y: 1}
    ];
    expect(delaunay(puntos1)).toEqual(delaunay(puntos2));
  });

  it("should return 5 edges for a square of 4 points", () => {
    const puntos = [
      {id: "1", x: 0, y: 0},
      {id: "2", x: 0, y: 1},
      {id: "3", x: 1, y: 1},
      {id: "4", x: 1, y: 0}
    ];
    // A square should have 4 sides + 1 diagonal = 5 edges
    const result = delaunay(puntos);
    expect(result.length).toBe(5);
    // Check that we have all sides
    const sides = [
      ["1", "2"], // left
      ["2", "3"], // top
      ["3", "4"], // right
      ["4", "1"]  // bottom
    ].map(s => s.sort()).join(",");
    // The diagonal could be either 1-3 or 2-4
    expect(sides).toContain("1,2");
    expect(sides).toContain("2,3");
    expect(sides).toContain("3,4");
    expect(sides).toContain("4,1");
  });

  it("should return 3 edges for a triangle", () => {
    const puntos = [
      {id: "1", x: 0, y: 0},
      {id: "2", x: 1, y: 0},
      {id: "3", x: 0, y: 1}
    ];
    expect(delaunay(puntos)).toEqual([
      ["1", "2"],
      ["2", "3"],
      ["1", "3"]
    ].sort());
  });

  it("should project 0,0 to 0,0", () => {
    expect(proyectar(0, 0, 0, 0)).toEqual({x: 0, y: 0});
  });

  it("should project 1 degree latitude to approximately 111 km", () => {
    // Proyectar desde (0,0) a (1,0) con origen (0,0)
    const result = proyectar(1, 0, 0, 0);
    // Should be approximately 111000 meters in y direction
    expect(Math.abs(result.y - 111000)).toBeLessThan(1000); // within 1 km
    expect(result.x).toBeCloseTo(0, -10); // should be 0 (or very close)
  });
});