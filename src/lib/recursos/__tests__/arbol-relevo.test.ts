import { describe, it, expect } from "vitest";
import { armarArbol, capacidadDe, recolocar, type NodoArbol, type Receptor } from "../arbol-relevo";

function capacidadRespetada(nodos: Map<string, NodoArbol>): boolean {
  for (const n of nodos.values()) if (n.hijos.length > n.capacidadHijos) return false;
  return true;
}

function conectado(nodos: Map<string, NodoArbol>, padres: Map<string, string>, origen: string): boolean {
  const vistos = new Set<string>([origen]);
  const cola = [...nodos.get(origen)!.hijos];
  while (cola.length > 0) {
    const id = cola.shift()!;
    if (vistos.has(id)) return false;
    vistos.add(id);
    const nodo = nodos.get(id);
    if (!nodo) return false;
    cola.push(...nodo.hijos);
  }
  return vistos.size === nodos.size && [...padres.keys()].every((id) => vistos.has(id));
}

describe("arbol-relevo", () => {
  describe("capacidadDe", () => {
    it("sin medida sostiene 1; medida, floor; cero o menos, ninguna", () => {
      expect(capacidadDe(undefined, 1000)).toBe(1);
      expect(capacidadDe(Number.NaN, 1000)).toBe(1);
      expect(capacidadDe(2500, 1000)).toBe(2);
      expect(capacidadDe(999, 1000)).toBe(0);
      expect(capacidadDe(0, 1000)).toBe(0);
    });
  });

  it("un solo receptor cuelga del origen", () => {
    const a = armarArbol("origen", [{ nodoId: "r1" }], 1000);
    expect(a.padres).toEqual(new Map([["r1", "origen"]]));
    expect(a.nodos.get("r1")!.profundidad).toBe(1);
    expect(a.nodos.get("origen")!.hijos).toEqual(["r1"]);
  });

  it("diez receptores: los de más subida, más cerca; mismo resultado con otro orden", () => {
    const receptores: Receptor[] = Array.from({ length: 10 }, (_, i) => ({ nodoId: `n${i}`, subidaKbps: 9000 - i * 800 }));
    const a = armarArbol({ nodoId: "origen", subidaKbps: 3000 }, receptores, 1000);
    const b = armarArbol({ nodoId: "origen", subidaKbps: 3000 }, [...receptores].reverse(), 1000);
    expect(b.padres).toEqual(a.padres);
    expect(a.padres.size).toBe(10);
    expect(a.padres.get("n0")).toBe("origen");
    expect(a.nodos.get("n0")!.profundidad).toBe(1);
    for (let i = 1; i < 10; i++) {
      expect(a.nodos.get(`n${i}`)!.profundidad).toBeGreaterThanOrEqual(a.nodos.get(`n${i - 1}`)!.profundidad);
    }
    expect(capacidadRespetada(a.nodos)).toBe(true);
    expect(conectado(a.nodos, a.padres, "origen")).toBe(true);
  });

  it("doscientos receptores: árbol entero, sin ciclos y con los topes", () => {
    const receptores: Receptor[] = Array.from({ length: 200 }, (_, i) => ({ nodoId: `n${i}`, subidaKbps: 2000 + (i % 7) * 1000 }));
    const a = armarArbol({ nodoId: "origen", subidaKbps: 5000 }, receptores, 1000);
    expect(a.padres.size).toBe(200);
    expect(capacidadRespetada(a.nodos)).toBe(true);
    expect(conectado(a.nodos, a.padres, "origen")).toBe(true);
    for (const [hijo, padre] of a.padres) {
      const p = a.nodos.get(padre)!;
      expect(a.nodos.get(hijo)!.profundidad).toBe(p.profundidad + 1);
      expect(p.hijos).toContain(hijo);
    }
  });

  it("al irse uno, solo se mueve su rama y el árbol original no cambia", () => {
    const receptores: Receptor[] = [
      { nodoId: "a", subidaKbps: 9000 }, { nodoId: "b", subidaKbps: 8000 }, { nodoId: "c", subidaKbps: 7000 },
      { nodoId: "d", subidaKbps: 6000 }, { nodoId: "e", subidaKbps: 5000 },
    ];
    const antes = armarArbol({ nodoId: "origen", subidaKbps: 3000 }, receptores, 1000);
    expect(antes.nodos.get("a")!.hijos).toEqual(["d", "e"]);
    const despues = recolocar(antes, "a");
    expect(despues.padres.has("a")).toBe(false);
    expect(despues.nodos.has("a")).toBe(false);
    expect(despues.padres.get("b")).toBe("origen");
    expect(despues.padres.get("c")).toBe("origen");
    expect(despues.padres.get("d")).not.toBe("a");
    expect(despues.padres.get("e")).not.toBe("a");
    expect(capacidadRespetada(despues.nodos)).toBe(true);
    expect(conectado(despues.nodos, despues.padres, "origen")).toBe(true);
    expect(antes.padres.get("d")).toBe("a");
  });

  it("quitar una hoja no toca a nadie; quitar el origen deja el árbol sin receptores", () => {
    const a = armarArbol({ nodoId: "origen", subidaKbps: 3000 }, [{ nodoId: "x" }, { nodoId: "y" }], 1000);
    const b = recolocar(a, "y");
    expect(b.padres.get("x")).toBe("origen");
    expect(b.padres.size).toBe(1);
    expect(recolocar(a, "origen").padres.size).toBe(0);
  });
});
