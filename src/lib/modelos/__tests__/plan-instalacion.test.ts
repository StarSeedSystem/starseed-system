// src/lib/modelos/__tests__/plan-instalacion.test.ts
import { describe, it, expect } from "vitest";
import { planInstalacion, type NeuronaVigia, type Entrada } from "../plan-instalacion";

describe("planInstalacion", () => {
  it("should return empty plan for empty inputs", () => {
    const neurona: NeuronaVigia = {
      medio: "pwa",
      ramMB: 4096,
      discoLibreMB: 10240,
      gpu: "ninguna",
      sistema: "linux",
    };
    const catalogo: Record<string, Entrada[]> = {};
    const preferencias = {};
    const instalados: string[] = [];
    const result = planInstalacion(neurona, catalogo, preferencias, instalados);
    expect(result).toEqual({});
  });

  it("Mac 8GB nativa: instala modelo pequeño, malla para grande", () => {
    const neurona: NeuronaVigia = { medio: "nativa", ramMB: 8192, discoLibreMB: 50000, gpu: "apple", apple: true, sistema: "macos" };
    const entries: Entrada[] = [
      { id: "peque", nombre: "Peque", licencia: "libre", tamañoMB: 500, ramRequeridaMB: 1024 },
      { id: "grande", nombre: "Grande", licencia: "libre", tamañoMB: 8000, ramRequeridaMB: 4096 },
    ];
    const catalogo = { imagen: entries };
    const res = planInstalacion(neurona, catalogo, {}, []);
    expect(res.imagen.instalar.map(e => e.id)).toContain("peque");
    expect(res.imagen.desdeLaMalla).toBe(false);
  });

  it("Móvil PWA: presupuesto 1GB, elige cuantización", () => {
    const neurona: NeuronaVigia = { medio: "pwa", ramMB: 2048, discoLibreMB: 0 };
    const entries: Entrada[] = [
      { id: "web", nombre: "Web", licencia: "libre", tamañoMB: 1200, ramRequeridaMB: 512, cuantizaciones: [{ tipo: "q4", tamañoMB: 900 }] },
    ];
    const catalogo = { imagen: entries };
    const res = planInstalacion(neurona, catalogo, {}, []);
    expect(res.imagen.instalar[0].id).toBe("web");
    expect(res.imagen.instalar[0].cuantizacion).toBe("q4");
  });

  it("PC GPU 24GB: instala modelo grande", () => {
    const neurona: NeuronaVigia = { medio: "nativa", ramMB: 32768, discoLibreMB: 200000, gpu: "nvidia", vramMB: 24576 };
    const entries: Entrada[] = [
      { id: "gigante", nombre: "Gigante", licencia: "libre", tamañoMB: 20000, ramRequeridaMB: 8192, vramRequeridaMB: 16384 },
    ];
    const catalogo = { imagen: entries };
    const res = planInstalacion(neurona, catalogo, {}, []);
    expect(res.imagen.instalar.map(e => e.id)).toContain("gigante");
  });

  it("A1: sin GPU, usa CPU y malla si no cabe", () => {
    const neurona: NeuronaVigia = { medio: "nativa", ramMB: 12288, discoLibreMB: 100000, gpu: "ninguna" };
    const entries: Entrada[] = [
      { id: "a1-model", nombre: "A1", licencia: "libre", tamañoMB: 6000, ramRequeridaMB: 4096 },
      { id: "too-big", nombre: "TooBig", licencia: "libre", tamañoMB: 20000, ramRequeridaMB: 16384 },
    ];
    const catalogo = { razonamiento: entries };
    const res = planInstalacion(neurona, catalogo, {}, []);
    expect(res.razonamiento.instalar.map(e => e.id)).toContain("a1-model");
    expect(res.razonamiento.instalar.map(e => e.id)).not.toContain("too-big");
  });
});