import { describe, it, expect } from "vitest";
import { puedeLeer, puedeSalir, soloPublicoParaAdaptador } from "../ambito-libreta";

describe("AmbitoLibreta", () => {
  it("puedeLeer: personal solo propio", () => {
    expect(puedeLeer("personal", "alice")).toBe(true);
    expect(puedeLeer("personal", "")).toBe(false);
  });
  it("puedeLeer: public scopes readable by anyone", () => {
    expect(puedeLeer("pagina", "anyone")).toBe(true);
    expect(puedeLeer("grupo", "anyone")).toBe(true);
    expect(puedeLeer("colectivo", "anyone")).toBe(true);
    expect(puedeLeer("fabrica", "anyone")).toBe(true);
  });

  it("puedeSalir: personal requires explicit choice", () => {
    expect(puedeSalir("personal", {}, true)).toBe(true);
    expect(puedeSalir("personal", {}, false)).toBe(false);
  });

  it("puedeSalir: pagina/grupo requires approval and choice", () => {
    const ex = { aprobadoPorEntidad: true };
    expect(puedeSalir("pagina", ex, true)).toBe(true);
    expect(puedeSalir("pagina", ex, false)).toBe(false);
    expect(puedeSalir("grupo", { aprobadoPorEntidad: false }, true)).toBe(false);
  });

  it("puedeSalir: colectivo allows only public (eleccion flag)", () => {
    expect(puedeSalir("colectivo", {}, true)).toBe(true);
    expect(puedeSalir("colectivo", {}, false)).toBe(false);
  });

  it("puedeSalir: fabrica never", () => {
    expect(puedeSalir("fabrica", {}, true)).toBe(false);
  });

  it("soloPublicoParaAdaptador: only non-personal scopes enforce approval", () => {
    const good = [{ aprobadoPorEntidad: true }, { aprobadoPorEntidad: true }];
    const bad = [{ aprobadoPorEntidad: true }, { aprobadoPorEntidad: false }];
    expect(soloPublicoParaAdaptador(good, "pagina")).toBe(true);
    expect(soloPublicoParaAdaptador(bad, "pagina")).toBe(false);
    expect(soloPublicoParaAdaptador(good, "personal")).toBe(true);
  });
});
