// @vitest-environment jsdom
/** DIR1125J · el interruptor «animaciones en ahorro» es el mismo que usa el CSS (`data-perf="eco"`): eco, eficiente y «auto» cuando decide uno de los dos. */
import { act } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setPerfMode } from "@/lib/perf/device-tier";
import { MODO_KEY } from "@/lib/perf/modo-rendimiento";
import { animacionesEnAhorro, useAnimacionesEnAhorro } from "@/lib/perf/use-animaciones-en-ahorro";

function Sonda() {
  const ahorro = useAnimacionesEnAhorro();
  return <span data-testid="sonda">{ahorro ? "ahorro" : "normal"}</span>;
}

describe("DIR1125J · animaciones en ahorro", () => {
  beforeEach(() => {
    if (typeof window.matchMedia !== "function") {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
      });
    }
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    for (const a of ["data-perf", "data-rendimiento", "data-rendimiento-efectivo", "data-rendimiento-motivo", "data-rendimiento-fases"]) document.documentElement.removeAttribute(a);
  });

  it("con «eco» y con «eficiente», sí; con «alto», no", () => {
    for (const [modo, esperado] of [["eficiente", true], ["eco", true], ["alto", false]] as const) {
      window.localStorage.setItem(MODO_KEY, modo);
      expect(animacionesEnAhorro()).toBe(esperado);
    }
  });

  it("el gancho arranca con el modo guardado y cambia en cuanto cambia el modo", () => {
    window.localStorage.setItem(MODO_KEY, "eficiente");
    const { getByTestId } = render(<Sonda />);
    expect(getByTestId("sonda").textContent).toBe("ahorro");
    act(() => setPerfMode("alto"));
    expect(getByTestId("sonda").textContent).toBe("normal");
    act(() => setPerfMode("eco"));
    expect(getByTestId("sonda").textContent).toBe("ahorro");
  });

  it("no cambia el ajuste guardado", () => {
    window.localStorage.setItem(MODO_KEY, "eficiente");
    render(<Sonda />);
    expect(window.localStorage.getItem(MODO_KEY)).toBe("eficiente");
  });
});
