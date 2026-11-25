// @vitest-environment jsdom
/**
 * DIR1125I · el modo de rendimiento elegido a mano se aplica al arrancar (decisión de Alex del 25-11).
 * Antes solo se ponía `data-perf` y, tras recargar, «eficiente» se quedaba en «eco» hasta volver a elegirlo en ajustes.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { PerfController } from "@/components/perf/perf-gate";
import { MODO_KEY } from "@/lib/perf/modo-rendimiento";

const html = () => document.documentElement;

describe("DIR1125I · el modo elegido a mano, al arrancar", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    for (const a of ["data-perf", "data-rendimiento", "data-rendimiento-efectivo", "data-rendimiento-motivo", "data-rendimiento-fases"]) html().removeAttribute(a);
  });

  it("con «eficiente» guardado quedan puestos los dos atributos", () => {
    window.localStorage.setItem(MODO_KEY, "eficiente");
    render(<PerfController />);
    expect(html().getAttribute("data-rendimiento")).toBe("eficiente");
    expect(html().getAttribute("data-perf")).toBe("eco");
  });

  it("con «eco» y con «alto» también", () => {
    window.localStorage.setItem(MODO_KEY, "eco");
    const uno = render(<PerfController />);
    expect(html().getAttribute("data-rendimiento")).toBe("eco");
    uno.unmount();
    window.localStorage.setItem(MODO_KEY, "alto");
    render(<PerfController />);
    expect(html().getAttribute("data-rendimiento")).toBe("alto");
  });

  it("en «auto» el arranque no pone nada por su cuenta: decide el modo automático cuando sabe de energía", () => {
    render(<PerfController />);
    expect(html().hasAttribute("data-rendimiento")).toBe(false);
  });

  it("no cambia el ajuste guardado", () => {
    window.localStorage.setItem(MODO_KEY, "eficiente");
    render(<PerfController />);
    expect(window.localStorage.getItem(MODO_KEY)).toBe("eficiente");
  });
});
