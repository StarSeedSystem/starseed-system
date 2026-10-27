import { describe, it, expect } from "vitest";
import { armarArbol, recolocar } from "../arbol-relevo";
import type { ArbolRelevo } from "../arbol-relevo";

function malConectados(a: ArbolRelevo): string[] {
  const malos: string[] = [];
  for (const inicio of a.padres.keys()) {
    let actual: string | undefined = inicio;
    let pasos = 0;
    while (actual !== undefined && actual !== a.origen && pasos <= a.padres.size) {
      actual = a.padres.get(actual);
      pasos++;
    }
    if (actual !== a.origen) malos.push(inicio);
  }
  return malos;
}

function capsOk(a: ArbolRelevo): boolean {
  for (const [id, lista] of a.hijos) if (lista.length > (a.capacidades.get(id) ?? 0)) return false;
  return true;
}

describe("arbol-relevo.ts", () => {
  it("un solo receptor cuelga del origen", () => {
    const arbol = armarArbol({ nodoId: "origen", subidaKbps: 5000 }, [{ nodoId: "a", subidaKbps: 1000 }], 1000);
    expect(arbol.padres.get("a")).toBe("origen");
    expect(arbol.hijos.get("origen")).toEqual(["a"]);
    expect(capsOk(arbol)).toBe(true);
  });

  it("diez receptores: los de más subida, más cerca y dentro del tope", () => {
    const subidas = [200, 900, 1500, 300, 2500, 1200, 3000, 600, 800, 400];
    const receptores = subidas.map((s, i) => ({ nodoId: `n${i}`, subidaKbps: s }));
    const arbol = armarArbol({ nodoId: "origen", subidaKbps: 4000 }, receptores, 1000);
    expect(arbol.hijos.get("origen")).toEqual(["n6", "n4", "n2", "n5"]);
    expect(arbol.padres.size).toBe(10);
    expect(capsOk(arbol)).toBe(true);
    expect(malConectados(arbol)).toEqual([]);
  });

  it("doscientos receptores: determinista, conectado y con topes", () => {
    const receptores = Array.from({ length: 200 }, (_, i) => ({
      nodoId: `n${String(i).padStart(3, "0")}`,
      subidaKbps: 100 + ((i * 37) % 1900),
      latenciaMs: (i * 13) % 200,
    }));
    const uno = armarArbol({ nodoId: "origen", subidaKbps: 5000 }, receptores, 500);
    const dos = armarArbol({ nodoId: "origen", subidaKbps: 5000 }, [...receptores].reverse(), 500);
    expect(uno.padres.size).toBe(200);
    expect(dos.padres).toEqual(uno.padres);
    expect(malConectados(uno)).toEqual([]);
    expect(capsOk(uno)).toBe(true);
  });

  it("sin medida solo sostiene un hijo", () => {
    const arbol = armarArbol("origen", [{ nodoId: "a" }, { nodoId: "b" }, { nodoId: "c" }], 1000);
    expect(arbol.capacidades.get("origen")).toBe(1);
    expect(arbol.padres.get("b")).toBe("a");
    expect(arbol.padres.get("c")).toBe("b");
  });

  it("si se va una rama, solo se recoloca esa rama", () => {
    const subidas = [3000, 2500, 2000, 1500, 1000, 900, 800, 700, 600, 500];
    const receptores = subidas.map((s, i) => ({ nodoId: "abcdefghij"[i], subidaKbps: s }));
    const arbol = armarArbol({ nodoId: "origen", subidaKbps: 4000 }, receptores, 1000);
    expect(arbol.padres.get("e")).toBe("a");
    const fuera = ["b", "c", "d", "h", "i", "j"].map((id) => [id, arbol.padres.get(id)] as const);
    const nuevo = recolocar(arbol, "a");
    expect(nuevo.padres.has("a")).toBe(false);
    for (const [id, padre] of fuera) expect(nuevo.padres.get(id)).toBe(padre);
    for (const id of ["e", "f", "g"]) expect(nuevo.padres.get(id)).not.toBe("a");
    expect(nuevo.padres.size).toBe(9);
    expect(malConectados(nuevo)).toEqual([]);
    expect(capsOk(nuevo)).toBe(true);
  });
});
