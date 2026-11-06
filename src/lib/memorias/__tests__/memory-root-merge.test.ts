import { describe, it, expect } from "vitest";
import { mergeMemoryRoots } from "../memory-root-merge";
import type { MemoryBranch, MemoryManifest } from "../../memory-sync/manifest";

function manifiesto(branches: MemoryBranch[]): MemoryManifest {
  return {
    name: "prueba",
    kind: "memory_root",
    structure: "root+branches",
    accountConnected: false,
    linkTargets: [],
    sync: {},
    branches,
  };
}

function rama(archivo: string, hash?: string, scope?: string): MemoryBranch {
  return {
    rama: "memoria",
    tipo: "memory",
    archivo,
    ...(hash ? { hash } : {}),
    ...(scope ? { scope } : {}),
  };
}

describe("mergeMemoryRoots", () => {
  it("sube lo que solo está en local y baja lo que solo está en destino", () => {
    const resultado = mergeMemoryRoots(
      manifiesto([rama("mem/solo-local.md", "h1")]),
      manifiesto([rama("mem/solo-destino.md", "h2")]),
    );
    expect(resultado.subir.map((e) => e.archivo)).toEqual(["mem/solo-local.md"]);
    expect(resultado.bajar.map((e) => e.archivo)).toEqual(["mem/solo-destino.md"]);
    expect(resultado.entradas.map((e) => e.accion)).toEqual(["bajar", "subir"]);
  });

  it("no toca lo que tiene el mismo hash y marca conflicto si el hash difiere", () => {
    const iguales = mergeMemoryRoots(
      manifiesto([rama("a.md", "igual")]),
      manifiesto([rama("a.md", "igual")]),
    );
    expect(iguales.sinCambios).toHaveLength(1);
    expect(iguales.resumen).toEqual({ subir: 0, bajar: 0, conflictos: 0, sinCambios: 1, omitidos: 0 });

    const distintos = mergeMemoryRoots(
      manifiesto([rama("a.md", "uno")]),
      manifiesto([rama("a.md", "dos")]),
    );
    expect(distintos.conflictos).toHaveLength(1);
    expect(distintos.conflictos[0]).toMatchObject({
      archivo: "a.md",
      hashLocal: "uno",
      hashDestino: "dos",
      accion: "conflicto",
    });
  });

  it("no toca por scope: mismo archivo con scopes distintos no es conflicto", () => {
    const resultado = mergeMemoryRoots(
      manifiesto([rama("a.md", "uno", "global")]),
      manifiesto([rama("a.md", "dos", "local")]),
    );
    expect(resultado.omitidos).toHaveLength(1);
    expect(resultado.conflictos).toHaveLength(0);
    expect(resultado.omitidos[0].motivo).toContain("scopes distintos");
  });

  it("respeta scopesOmitidos sin distinguir mayúsculas y no los sube ni los baja", () => {
    const resultado = mergeMemoryRoots(
      manifiesto([rama("privado.md", "x", "Privado")]),
      manifiesto([rama("publico.md", "y", "global")]),
      { scopesOmitidos: ["privado"] },
    );
    expect(resultado.omitidos.map((e) => e.archivo)).toEqual(["privado.md"]);
    expect(resultado.subir).toHaveLength(0);
    expect(resultado.bajar.map((e) => e.archivo)).toEqual(["publico.md"]);
  });

  it("normaliza un scope ausente a global y no inventa conflictos sin hash", () => {
    const resultado = mergeMemoryRoots(
      manifiesto([rama("a.md", "hash")]),
      manifiesto([{ rama: "memoria", tipo: "memory", archivo: "a.md", scope: "global" }]),
    );
    expect(resultado.sinCambios).toHaveLength(1);
    expect(resultado.entradas[0].scope).toBe("global");
    expect(resultado.conflictos).toHaveLength(0);
  });

  it("es determinista: mismo resultado con las ramas en otro orden", () => {
    const uno = mergeMemoryRoots(
      manifiesto([rama("b.md", "b"), rama("a.md", "a")]),
      manifiesto([rama("c.md", "c")]),
    );
    const dos = mergeMemoryRoots(
      manifiesto([rama("a.md", "a"), rama("b.md", "b")]),
      manifiesto([rama("c.md", "c")]),
    );
    expect(dos.entradas).toEqual(uno.entradas);
    expect(uno.entradas.map((e) => e.archivo)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("devuelve un resultado vacío con dos manifiestos sin ramas", () => {
    const resultado = mergeMemoryRoots(manifiesto([]), manifiesto([]));
    expect(resultado.entradas).toEqual([]);
    expect(resultado.resumen).toEqual({ subir: 0, bajar: 0, conflictos: 0, sinCambios: 0, omitidos: 0 });
  });
});
