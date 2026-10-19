import { describe, test, expect } from "vitest";
import { getDestino, getOrigen, easeOut } from "../cristal-3d";

describe("getDestino", () => {
  test("returns correct position for index 0, lado=2, paso=1", () => {
    const result = getDestino(0, 2, 1);
    expect(result).toEqual([-0.5, -0.5, -0.5]);
  });

  test("returns correct position for index 1, lado=2, paso=1", () => {
    const result = getDestino(1, 2, 1);
    expect(result).toEqual([-0.5, -0.5, 0.5]);
  });

  test("returns correct position for index 2, lado=2, paso=1", () => {
    const result = getDestino(2, 2, 1);
    expect(result).toEqual([-0.5, 0.5, -0.5]);
  });

  test("returns correct position for index 3, lado=2, paso=1", () => {
    const result = getDestino(3, 2, 1);
    expect(result).toEqual([-0.5, 0.5, 0.5]);
  });
});

describe("getOrigen", () => {
  test("returns deterministic values for same index", () => {
    const result1 = getOrigen(0, 2, 1);
    const result2 = getOrigen(0, 2, 1);
    expect(result1).toEqual(result2);
  });

  test("returns different values for different indices", () => {
    const result1 = getOrigen(0, 2, 1);
    const result2 = getOrigen(1, 2, 1);
    expect(result1).not.toEqual(result2);
  });
});

describe("easeOut", () => {
  test("returns 0 for t=0", () => {
    expect(easeOut(0)).toBe(0);
  });

  test("returns 1 for t>=3", () => {
    expect(easeOut(3)).toBeCloseTo(1);
    expect(easeOut(6)).toBeCloseTo(1);
  });

  test("returns correct value for t=1.5", () => {
    // t=1.5 -> k = 0.5 -> easeOutCubic = 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    expect(easeOut(1.5)).toBeCloseTo(0.875);
  });
});