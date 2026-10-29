import { describe, it, expect } from "vitest";
import { armarArbol, recolocar, ArbolRelevo, ReceptorRelevo } from "../arbol-relevo";

function ids(arbol: ArbolRelevo): Record<string, { padre?: string; hijos: string[] }> {
  const res: Record<string, { padre?: string; hijos: string[] }> = {};
  for (const [id, n] of arbol.nodos) res[id] = { padre: n.padre, hijos: [...n.hijos] };
  return res;
}

describe("armarArbol", () => {
  it("1 receptor: hijo directo del origen", () => {
    const arbol = armarArbol("o", [{ nodoId: "r1", subidaKbps: 50 }], 10);
    expect(arbol.raiz).toBe("o");
    expect(arbol.nodos.get("r1")!.padre).toBe("o");
  });

  it("10 receptores con subida alta se distribuyen por capacidad", () => {
    const receptores: ReceptorRelevo[] = Array.from({ length: 10 }, (_, i) => ({
      nodoId: `r${i}`,
      subidaKbps: 100,
    }));
    const arbol = armarArbol("o", receptores, 20);
    expect(arbol.nodos.size).toBe(11);
    expect(arbol.nodos.get("o")!.hijos.length).toBeGreaterThan(0);
  });

  it("200 receptores determinista con misma entrada", () => {
    const receptores: ReceptorRelevo[] = Array.from({ length: 200 }, (_, i) => ({
      nodoId: `r${String(i).padStart(3, "0")}`,
      subidaKbps: i % 5 === 0 ? 100 : 10,
    }));
    const a1 = armarArbol("o", receptores, 5);
    const a2 = armarArbol("o", receptores, 5);
    expect(ids(a1)).toEqual(ids(a2));
  });

  it("receptores sin medida: max 1 hijo por nodo", () => {
    const receptores: ReceptorRelevo[] = Array.from({ length: 5 }, (_, i) => ({
      nodoId: `r${i}`,
    }));
    const arbol = armarArbol("o", receptores, 10);
    for (const [id, n] of arbol.nodos) {
      if (id !== "o") expect(n.hijos.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("recolocar", () => {
  it("mueve solo la rama del que se va", () => {
    const arbol = armarArbol("o", [
      { nodoId: "a", subidaKbps: 100 },
      { nodoId: "b", subidaKbps: 100 },
      { nodoId: "c", subidaKbps: 10 },
    ], 10);
    const nuevo = recolocar(arbol, "a");
    expect(nuevo.nodos.has("a")).toBe(false);
    // Los hijos de "a" deben reconectarse al padre de "a" (origen)
    const hijosA = arbol.nodos.get("a")!.hijos;
    for (const h of hijosA) {
      expect(nuevo.nodos.get(h)!.padre).toBe("o");
    }
  });

  it("el resto del árbol no cambia", () => {
    const arbol = armarArbol("o", [
      { nodoId: "a", subidaKbps: 100 },
      { nodoId: "b", subidaKbps: 50 },
    ], 10);
    const antes = ids(arbol);
    const nuevo = recolocar(arbol, "b");
    expect(nuevo.nodos.get("a")!.padre).toBe(antes["a"].padre);
    expect(nuevo.nodos.get("a")!.hijos).toEqual(antes["a"].hijos.filter(h => h !== "b"));
  });
});
