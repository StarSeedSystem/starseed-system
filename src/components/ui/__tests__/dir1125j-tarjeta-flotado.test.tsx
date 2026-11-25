// @vitest-environment jsdom
/**
 * DIR1125J · el flotado en bucle de las tarjetas obedece al modo de rendimiento.
 * Medido el 25-11 en la Maggabox: el flotado mantenía despierto el bucle de cuadros de framer-motion 60 veces por segundo
 * (él solo, 26 % del hilo principal) aunque el modo fuera «eficiente».
 */
import { act } from "react";
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const controles = vi.hoisted(() => ({
  start: vi.fn((_definicion?: unknown) => Promise.resolve()),
  stop: vi.fn(),
  set: vi.fn((_definicion?: unknown) => undefined),
  subscribe: vi.fn(() => () => {}),
  mount: vi.fn(() => () => {}),
}));
vi.mock("framer-motion", async (importOriginal) => {
  const real = await importOriginal<typeof import("framer-motion")>();
  return { ...real, useAnimation: () => controles };
});
vi.mock("@/context/appearance-context", () => ({ useAppearance: () => ({ config: { themeStore: { activeMode: "primary" } } }) }));
vi.mock("@/components/ui/LiquidGlassWrapper", () => ({ LiquidGlassWrapper: (p: { children?: ReactNode }) => p.children }));

import { Card } from "@/components/ui/card";
import { setPerfMode } from "@/lib/perf/device-tier";
import { MODO_KEY } from "@/lib/perf/modo-rendimiento";

describe("DIR1125J · el flotado de las tarjetas y el modo de rendimiento", () => {
  beforeEach(() => {
    if (typeof window.matchMedia !== "function") {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
      });
    }
    controles.start.mockClear();
    controles.stop.mockClear();
    controles.set.mockClear();
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    for (const a of ["data-perf", "data-rendimiento", "data-rendimiento-efectivo", "data-rendimiento-motivo", "data-rendimiento-fases"]) document.documentElement.removeAttribute(a);
  });

  it("en «alto» la tarjeta flota en bucle, como siempre", () => {
    window.localStorage.setItem(MODO_KEY, "alto");
    render(<Card>hola</Card>);
    expect(controles.start).toHaveBeenCalledTimes(1);
    const definicion = controles.start.mock.calls[0][0] as { y: number[]; transition: { repeat: number } };
    expect(definicion.y).toEqual([0, -3, 0]);
    expect(definicion.transition.repeat).toBe(Infinity);
  });

  it.each(["eficiente", "eco"])("en «%s» el flotado no arranca y la tarjeta queda en su sitio", (modo) => {
    window.localStorage.setItem(MODO_KEY, modo);
    const { getByText } = render(<Card>hola</Card>);
    expect(controles.start).not.toHaveBeenCalled();
    expect(controles.stop).toHaveBeenCalled();
    expect(controles.set).toHaveBeenCalledWith({ y: 0 });
    expect(getByText("hola")).toBeTruthy(); // el contenido se pinta igual
  });

  it("al cambiar de modo con la tarjeta montada, el flotado se para y vuelve", () => {
    window.localStorage.setItem(MODO_KEY, "alto");
    render(<Card>hola</Card>);
    expect(controles.start).toHaveBeenCalledTimes(1);
    act(() => setPerfMode("eficiente"));
    expect(controles.stop).toHaveBeenCalled();
    expect(controles.set).toHaveBeenLastCalledWith({ y: 0 });
    act(() => setPerfMode("alto"));
    expect(controles.start).toHaveBeenCalledTimes(2);
  });
});
