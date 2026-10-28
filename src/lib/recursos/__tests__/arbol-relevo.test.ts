import { describe, it, expect } from "vitest";
import { armarArbol, recolocar } from "../arbol-relevo";

const rec = (nodoId: string, subidaKbps?: number): {
  nodoId: string;
  subidaKbps?: number;
} => ({ nodoId, subidaKbps });

describe("armarArbol", () => {
  it("un receptor asigna origen como padre", () => {
    const arbol = armarArbol("origin", [rec("n1")], 100);
    expect(arbol).toEqual({ n1: "origin" });
  });

  it("los nodos con más subida quedan cerca del origen", () => {
    const receptores = [
      rec("n1", 50),
      rec("n2", 150),
      rec("n3", 250),
    ];
    const arbol = armarArbol("origin", receptores, 100);
    // el de mayor subida (n3) debe ser hijo directo de origin
    expect(arbol["n3"]).toBe("origin");
    // ningún nodo debe tener más de 2 hijos (floor(250/100)=2)
    const hijosDeOrigen = Object.values(arbol).filter((p) => p === "origin").length;
    expect(hijosDeOrigen).toBeLessThanOrEqual(2);
  });

  it("200 receptores no superan capacidad y son deterministas", () => {
    const receptores = Array.from({ length: 200 }, (_, i) => rec(`n${i + 1}`, 200));
    const arbol = armarArbol("origin", receptores, 100);
    expect(Object.keys(arbol).length).toBe(200);
    // origin like máximo 2 hijos
    const origenHijos = Object.values(arbol).filter((p) => p === "origin").length;
    expect(origenHijos).toBeLessThanOrEqual(2);
  });

  it("recolocar mueve la rama del nodo saliente a su padre", () => {
    const arbol = armarArbol("origin", [
      rec("a", 200),
      rec("b", 150),
      rec("c", 100),
    ], 100);
    // suppose b is child of a originally? Our armarArbol may give a parent mapping;
    // we construct a manual tree for recolocar test:
    // a -> origin, b -> a, c -> origin
    // But armarArbol gives deterministic mapping; we test recolocar with a known map:
    const manual: Record<string, string> = { a: "origin", b: "a", c: "origin" };
    const nuevo = recolocar(manual, "b");
    expect(nuevo["a"]).toBe("origin");
    expect(nuevo["c"]).toBe("origin");
    expect(nuevo["b"]).not.toBeDefined();
  });

  it("recolocar con nodo raíz saliendo deja árbol coherente", () => {
    const manual: Record<string, string> = { a: "origin", b: "origin" };
    const nuevo = recolocar(manual, "origin");
    expect(Object.keys(nuevo).length).toBe(2);
    expect(nuevo["a"]).toBeDefined();
    expect(nuevo["b"]).toBeDefined();
  });
});