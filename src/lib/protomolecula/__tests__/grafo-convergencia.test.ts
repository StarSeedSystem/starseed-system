import { describe, it, expect } from "vitest";
import { analizarConvergencia, type Arista } from "../grafo-convergencia";
import type { DefinicionAtomo } from "../registro-atomos";

function def(id: string): DefinicionAtomo {
  return {
    herramientaId: id,
    nombre: id,
    categoria: "audio",
    integracion: "libreria-js",
    control: "total",
    parametros: [{ id: "v", nombre: "Volumen", tipo: "numero" }],
    entradas: ["wav"],
    salidas: ["mp3"],
  };
}

function defCompatible(id: string): DefinicionAtomo {
  return {
    herramientaId: id,
    nombre: id,
    categoria: "audio",
    integracion: "libreria-js",
    control: "total",
    parametros: [{ id: "v", nombre: "Volumen", tipo: "numero" }],
    entradas: ["mp3"],
    salidas: ["mp3"],
  };
}

describe("grafo-convergencia", () => {
  it("cadena lineal simple", () => {
    const res = analizarConvergencia(
      [{ id: "a1", herramientaId: "t" }, { id: "a2", herramientaId: "t" }],
      [{ de: "a1", a: "a2" }],
      () => defCompatible("t"),
      () => null,
    );
    expect(res.ok).toBe(true);
    expect(res.orden).toEqual(["a1", "a2"]);
    expect(res.ciclos).toEqual([]);
  });

  it("diamante", () => {
    const res = analizarConvergencia(
      [
        { id: "a", herramientaId: "t" },
        { id: "b", herramientaId: "t" },
        { id: "c", herramientaId: "t" },
        { id: "d", herramientaId: "t" },
      ],
      [
        { de: "a", a: "b" },
        { de: "a", a: "c" },
        { de: "b", a: "d" },
        { de: "c", a: "d" },
      ],
      () => defCompatible("t"),
      () => null,
    );
    expect(res.ok).toBe(true);
    expect(res.orden).toEqual(["a", "b", "c", "d"]);
  });

  it("ciclo simple", () => {
    const res = analizarConvergencia(
      [{ id: "a", herramientaId: "t" }],
      [{ de: "a", a: "a" }],
      () => def("t"),
      () => null,
    );
    expect(res.ok).toBe(false);
    expect(res.ciclos.length).toBeGreaterThan(0);
    expect(res.orden).toEqual([]);
  });

  it("ciclo con cola", () => {
    const res = analizarConvergencia(
      [
        { id: "a", herramientaId: "t" },
        { id: "b", herramientaId: "t" },
      ],
      [
        { de: "a", a: "b" },
        { de: "b", a: "a" },
      ],
      () => def("t"),
      () => null,
    );
    expect(res.ok).toBe(false);
    expect(res.ciclos.length).toBeGreaterThan(0);
    expect(res.orden).toEqual([]);
  });

  it("formato directo compatible", () => {
    const defDirecta = (id: string): DefinicionAtomo => ({
      ...def(id),
      salidas: ["png"],
      entradas: ["png"],
    });
    const res = analizarConvergencia(
      [{ id: "a", herramientaId: "t" }],
      [{ de: "a", a: "a" }],
      (id) => defDirecta(id),
      () => null,
    );
    expect(res.incompatibles.length).toBe(0);
    expect(res.conversiones.length).toBe(0);
  });

  it("formato por conversión de dos pasos", () => {
    const res = analizarConvergencia(
      [{ id: "a", herramientaId: "t1" }, { id: "b", herramientaId: "t2" }],
      [{ de: "a", a: "b" }],
      (id) => {
        const base = def(id);
        return id === "t1"
          ? { ...base, salidas: ["obj"] }
          : { ...base, entradas: ["glb"] };
      },
      (de, a) => {
        // Conversión de un paso: obj -> glb
        if (de === "obj" && a === "glb") return ["inter"];
        return null;
      },
    );
    expect(res.conversiones.length).toBe(1);
    expect(res.conversiones[0].ruta).toContain("inter");
  });

  it("incompatible sin conversión", () => {
    const res = analizarConvergencia(
      [{ id: "a", herramientaId: "t1" }, { id: "b", herramientaId: "t2" }],
      [{ de: "a", a: "b" }],
      (id) => {
        const base = def(id);
        return id === "t1"
          ? { ...base, salidas: ["audio"] }
          : { ...base, entradas: ["video"] };
      },
      () => null,
    );
    expect(res.incompatibles.length).toBe(1);
  });

  it("átomo desconocido genera aviso", () => {
    const res = analizarConvergencia(
      [{ id: "x", herramientaId: "desconocida" }],
      [],
      () => undefined,
      () => null,
    );
    expect(res.avisos.length).toBeGreaterThan(0);
    expect(res.avisos[0]).toContain("desconocida");
  });

  it("destino sin entradas genera aviso", () => {
    const sinEntradas = (id: string): DefinicionAtomo => ({
      ...def(id),
      entradas: [],
    });
    const res = analizarConvergencia(
      [{ id: "a", herramientaId: "t" }],
      [{ de: "a", a: "a" }],
      (id) => sinEntradas(id),
      () => null,
    );
    expect(res.avisos.some((a) => a.includes("no recibe archivos"))).toBe(true);
  });

  it("orden estable respeta orden de entrada", () => {
    const res = analizarConvergencia(
      [
        { id: "c", herramientaId: "t" },
        { id: "a", herramientaId: "t" },
        { id: "b", herramientaId: "t" },
      ],
      [
        { de: "a", a: "b" },
        { de: "b", a: "c" },
      ],
      () => defCompatible("t"),
      () => null,
    );
    expect(res.orden).toEqual(["a", "b", "c"]);
  });

  it("aristas a átomos que no están son incompatibles", () => {
    const res = analizarConvergencia(
      [{ id: "a", herramientaId: "t" }],
      [{ de: "a", a: "inexistente" }],
      () => def("t"),
      () => null,
    );
    expect(res.incompatibles.length).toBe(1);
  });

  it("conversiones con ruta válida", () => {
    const res = analizarConvergencia(
      [{ id: "a", herramientaId: "t1" }, { id: "b", herramientaId: "t2" }],
      [{ de: "a", a: "b" }],
      (id) => {
        const base = def(id);
        return id === "t1"
          ? { ...base, salidas: ["obj"] }
          : { ...base, entradas: ["glb"] };
      },
      (de, a) => {
        if (de === "obj" && a === "glb") return ["intermedio"];
        return null;
      },
    );
    expect(res.conversiones.length).toBe(1);
    expect(res.conversiones[0].ruta).toEqual(["intermedio"]);
  });
});
