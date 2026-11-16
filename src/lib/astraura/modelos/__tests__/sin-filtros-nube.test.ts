import { describe, it, expect } from "vitest";
import { proveedorEsSinFiltros, proveedorSinFiltrosPermitido } from "../sin-filtros-nube";

describe("proveedorEsSinFiltros", () => {
  it("detecta proveedores sin filtros", () => {
    expect(proveedorEsSinFiltros("abliteration")).toBe(true);
    expect(proveedorEsSinFiltros("otros")).toBe(false);
  });
});

describe("proveedorSinFiltrosPermitido", () => {
  const base = {
    activado: true,
    disponible: true,
    contexto: "privado-propio",
    caso: "conversacion" as const,
    claveDeLaCuenta: "propia",
  };

  it("permite si todo está correcto", () => {
    expect(proveedorSinFiltrosPermitido(base).permitido).toBe(true);
  });

  it("niega si el interruptor está apagado", () => {
    expect(proveedorSinFiltrosPermitido({ ...base, activado: false }).permitido).toBe(false);
  });

  it("niega si no está disponible", () => {
    expect(proveedorSinFiltrosPermitido({ ...base, disponible: false }).permitido).toBe(false);
  });

  it("niega si el contexto no es privado-propio", () => {
    expect(proveedorSinFiltrosPermitido({ ...base, contexto: "compartido" }).permitido).toBe(false);
  });

  it("niega si el caso no es permitido", () => {
    expect(proveedorSinFiltrosPermitido({ ...base, caso: "voz" as any }).permitido).toBe(false);
  });

  it("niega si la clave no es propia", () => {
    expect(proveedorSinFiltrosPermitido({ ...base, claveDeLaCuenta: "otra" }).permitido).toBe(false);
    expect(proveedorSinFiltrosPermitido({ ...base, claveDeLaCuenta: "fundacion" }).permitido).toBe(false);
  });
});
