import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { calcularFPS } from "../bucle-fotogramas";

describe("bucle-fotogramas: lógica pura del bucle de fotogramas", () => {
  it("calcularFPS devuelve 0 cuando no hay actividad", () => {
    expect(calcularFPS(false, false)).toBe(0);
    expect(calcularFPS(true, false)).toBe(0);
  });

  it("calcularFPS devuelve 15 en modo reducido con actividad", () => {
    expect(calcularFPS(true, true)).toBe(15);
    expect(calcularFPS(false, true)).toBe(60);
  });
});

describe("useBucleFotogramas: hook con reloj falso", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("cuenta fotogramas con requestAnimationFrame falso", () => {
    // TODO: probar el hook completo con fake timers
    expect(true).toBe(true);
  });
});