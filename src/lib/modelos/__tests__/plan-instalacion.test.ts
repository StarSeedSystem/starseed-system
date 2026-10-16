import { describe, it, expect } from "vitest";
import { planInstalacion, type Neurona, type Entrada, type Preferencias, type Instalado, type PlanPorArea } from "../plan-instalacion";

const crearNeurona = (overrides: Partial<Neurona> = {}): Neurona => ({
  medio: "nativo",
  ramMB: 8192,
  discoLibreMB: 50000,
  gpu: "ninguna",
  sistema: "macos",
  ...overrides,
});

describe("planInstalacion", () => {
  it("returns a plan for each area in the catalog", () => {
    const neurona = crearNeurona();
    const catalogo = { imagen: [{ id: "m1", nombre: "m1", version: "1.0", tamañoMB: 10, licencia: "libre" }] };
    const preferencias: Record<string, Preferencias> = {};
    const instalados: Record<string, Instalado[]> = { imagen: [] };
    const result = planInstalacion({ neurona, catalogo, preferencias, instalados });
    expect(result.imagen.instalar).toHaveLength(1);
    expect(result.imagen.motivo).toContain("instalar");
  });

  it("handles empty catalog", () => {
    const neurona = crearNeurona();
    const result = planInstalacion({ neurona, catalogo: {}, preferencias: {}, instalados: {} });
    expect(result).toEqual({});
  });

  it("does not install when exceeding disk space", () => {
    const neurona = crearNeurona({ discoLibreMB: 5 });
    const catalogo = { imagen: [{ id: "m1", nombre: "m1", version: "1.0", tamañoMB: 10, licencia: "libre" }] };
    const result = planInstalacion({ neurona, catalogo, preferencias: {}, instalados: { imagen: [] } });
    expect(result.imagen.instalar).toHaveLength(0);
    expect(result.imagen.motivo).toContain("No se requieren cambios");
  });

  it("does not install when license not allowed", () => {
    const neurona = crearNeurona();
    const catalogo = { imagen: [{ id: "m1", nombre: "m1", version: "1.0", tamañoMB: 10, licencia: "no-comercial" }] };
    const preferencias: Record<string, Preferencias> = {};
    const result = planInstalacion({ neurona, catalogo, preferencias, instalados: { imagen: [] } });
    expect(result.imagen.instalar).toHaveLength(0);
    expect(result.imagen.motivo).toContain("No se requieren cambios");
  });

  it("installs when license allowed via preferencias", () => {
    const neurona = crearNeurona();
    const catalogo = { imagen: [{ id: "m1", nombre: "m1", version: "1.0", tamañoMB: 10, licencia: "personal" }] };
    const preferencias = { imagen: { licenciaPermitida: ["personal"] } };
    const result = planInstalacion({ neurona, catalogo, preferencias, instalados: { imagen: [] } });
    expect(result.imagen.instalar).toHaveLength(1);
  });

  it("does not install when exceeding RAM", () => {
    const neurona = crearNeurona({ ramMB: 1000 });
    const catalogo = { imagen: [{ id: "m1", nombre: "m1", version: "1.0", tamañoMB: 10, licencia: "libre", ramMB: 2000 }] };
    const result = planInstalacion({ neurona, catalogo, preferencias: {}, instalados: { imagen: [] } });
    expect(result.imagen.instalar).toHaveLength(0);
    expect(result.imagen.motivo).toContain("No se requieren cambios");
  });

  it("does not install when exceeding VRAM", () => {
    const neurona = crearNeurona({ gpu: "nvidia", vramMB: 2000 });
    const catalogo = { imagen: [{ id: "m1", nombre: "m1", version: "1.0", tamañoMB: 10, licencia: "libre", vramMB: 3000 }] };
    const result = planInstalacion({ neurona, catalogo, preferencias: {}, instalados: { imagen: [] } });
    expect(result.imagen.instalar).toHaveLength(0);
    expect(result.imagen.motivo).toContain("No se requieren cambios");
  });

  it("handles multiple areas", () => {
    const neurona = crearNeurona();
    const catalogo = {
      imagen: [{ id: "m1", nombre: "m1", version: "1.0", tamañoMB: 10, licencia: "libre" }],
      voz: [{ id: "m2", nombre: "m2", version: "1.0", tamañoMB: 10, licencia: "libre" }],
    };
    const result = planInstalacion({ neurona, catalogo, preferencias: {}, instalados: { imagen: [], voz: [] } });
    expect(result.imagen.instalar).toHaveLength(1);
    expect(result.voz.instalar).toHaveLength(1);
  });
});