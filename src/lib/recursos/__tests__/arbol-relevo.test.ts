import { describe, it, expect } from "vitest";
import { armarArbol, capacidadRelevo, recolocar, type ArbolRelevo } from "../arbol-relevo";

function padres(arbol: ArbolRelevo): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const [id, nodo] of arbol.nodos) {
    for (const hijo of nodo.hijos) mapa.set(hijo, [...(mapa.get(hijo) ?? []), id]);
  }
  return mapa;
}

function profundidades(arbol: ArbolRelevo): Map<string, number> {
  const mapa = new Map<string, number>([[arbol.origen, 0]]);
  const cola = [arbol.origen];
  while (cola.length > 0) {
    const id = cola.shift()!;
    for (const hijo of arbol.nodos.get(id)?.hijos ?? []) {
      if (mapa.has(hijo)) continue;
      mapa.set(hijo, (mapa.get(id) ?? 0) + 1);
      cola.push(hijo);
    }
  }
  return mapa;
}

const receptor = (nodoId: string, subidaKbps?: number) => ({ nodoId, subidaKbps });
const tope = (id: string, subidaKbps: number | undefined) =>
  id === "origen" ? 1 : capacidadRelevo(subidaKbps, 1000);

describe("arbol-relevo", () => {
  it("con 1 receptor cuelga del origen", () => {
    const arbol = armarArbol("origen", [receptor("n1", 1000)], 500);
    expect(arbol.nodos.get("origen")?.hijos).toEqual(["n1"]);
    expect(arbol.nodos.get("n1")?.hijos).toEqual([]);
    expect(padres(arbol).get("n1")).toEqual(["origen"]);
  });

  it("con 10 receptores pone a los de más subida más cerca", () => {
    const receptores = Array.from({ length: 10 }, (_, i) => receptor(`n${i}`, (10 - i) * 1000));
    const arbol = armarArbol("origen", receptores, 1000);
    const hondo = profundidades(arbol);
    expect(hondo.size).toBe(11);
    expect(hondo.get("n0")).toBe(1);
    expect(hondo.get("n0")).toBeLessThan(hondo.get("n9")!);
    const p = padres(arbol);
    for (const { nodoId } of receptores) {
      expect(p.get(nodoId), nodoId).toHaveLength(1);
      expect(hondo.get(nodoId), nodoId).toBeGreaterThanOrEqual(hondo.get("n0")!);
    }
  });

  it("respeta la capacidad de cada nodo (sin medida: 1)", () => {
    const arbol = armarArbol(
      "origen",
      [receptor("a", 5000), receptor("b", 1000), receptor("c"), receptor("d", 0)],
      1000,
    );
    for (const [id, nodo] of arbol.nodos) {
      expect(nodo.hijos.length, id).toBeLessThanOrEqual(tope(id, nodo.subidaKbps));
    }
  });

  it("con 200 receptores forma un árbol completo y determinista", () => {
    const receptores = Array.from({ length: 200 }, (_, i) =>
      receptor(`n${i}`, (200 - i) * 500),
    );
    const uno = armarArbol("origen", receptores, 1000);
    const dos = armarArbol("origen", receptores, 1000);
    expect(uno).toEqual(dos);
    expect(uno.nodos.size).toBe(201);
    const p = padres(uno);
    const hondo = profundidades(uno);
    for (const { nodoId } of receptores) {
      expect(p.get(nodoId), nodoId).toHaveLength(1);
      expect(hondo.has(nodoId), nodoId).toBe(true);
    }
    for (const [id, nodo] of uno.nodos) {
      expect(nodo.hijos.length, id).toBeLessThanOrEqual(tope(id, nodo.subidaKbps));
    }
  });

  it("sin medida cada nodo sostiene como mucho un hijo", () => {
    const arbol = armarArbol("origen", [receptor("n1"), receptor("n2"), receptor("n3")], 1000);
    expect(arbol.nodos.get("origen")?.hijos).toEqual(["n1"]);
    expect(arbol.nodos.get("n1")?.hijos).toEqual(["n2"]);
    expect(arbol.nodos.get("n2")?.hijos).toEqual(["n3"]);
  });

  it("al irse uno mueve solo su rama y recoloca a sus hijos", () => {
    const arbol = armarArbol(
      "origen",
      [receptor("n0", 1500), receptor("n1", 1500), receptor("n2", 1500),
        receptor("n3", 1000), receptor("n4", 1000)],
      1000,
    );
    expect(arbol.nodos.get("origen")?.hijos).toEqual(["n0"]);
    expect(arbol.nodos.get("n1")?.hijos).toEqual(["n2"]);
    const despues = recolocar(arbol, "n1");
    const p = padres(despues);
    expect(despues.nodos.get("n1")?.hijos).toEqual([]);
    expect(p.get("n1")).toBeUndefined();
    expect(p.get("n0")).toEqual(["origen"]);
    expect(p.get("n2")).toEqual(["n0"]);
    expect(p.get("n3")).toEqual(["n2"]);
    expect(p.get("n4")).toEqual(["n3"]);
    expect(despues.nodos.get("n0")?.hijos).toEqual(["n2"]);
    expect(arbol.nodos.get("n1")?.hijos).toEqual(["n2"]);
    for (const [id, nodo] of despues.nodos) {
      expect(nodo.hijos.length, id).toBeLessThanOrEqual(tope(id, nodo.subidaKbps));
    }
  });

  it("si el que se va no está, devuelve el árbol igual", () => {
    const arbol = armarArbol("origen", [receptor("n1")], 100);
    expect(recolocar(arbol, "fantasma")).toEqual(arbol);
  });

  it("capacidadRelevo aplica floor y da 1 sin medida", () => {
    expect(capacidadRelevo(5000, 1000)).toBe(5);
    expect(capacidadRelevo(999, 1000)).toBe(0);
    expect(capacidadRelevo(0, 1000)).toBe(0);
    expect(capacidadRelevo(undefined, 1000)).toBe(1);
  });

  it("el orden de entrada no cambia el árbol", () => {
    const receptores = Array.from({ length: 10 }, (_, i) => receptor(`n${i}`, (10 - i) * 1000));
    const barajado = [receptores[7], ...receptores.slice(0, 7), receptores[9], receptores[8]];
    expect(armarArbol("origen", barajado, 1000)).toEqual(
      armarArbol("origen", receptores, 1000),
    );
  });
});
