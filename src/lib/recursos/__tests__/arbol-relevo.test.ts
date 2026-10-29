import { describe, it, expect } from "vitest";
import { armarArbol, capacidadHijos, recolocar, type ArbolRelevo } from "../arbol-relevo";

function revisar(arbol: ArbolRelevo): void {
  expect(arbol.orden[0]).toBe(arbol.raiz);
  expect(arbol.padres[arbol.raiz]).toBeUndefined();
  for (const id of arbol.orden) {
    const hijos = arbol.hijos[id] ?? [];
    expect(hijos.length).toBeLessThanOrEqual(capacidadHijos(arbol.nodos[id], arbol.kbpsFlujo));
    for (const hijo of hijos) {
      expect(arbol.padres[hijo]).toBe(id);
      expect(hijos.filter(otro => otro === hijo)).toHaveLength(1);
    }
  }
}

function profundidades(arbol: ArbolRelevo): Record<string, number> {
  const salida: Record<string, number> = { [arbol.raiz]: 0 };
  for (const id of arbol.orden) {
    const padre = arbol.padres[id];
    if (padre !== undefined) salida[id] = (salida[padre] ?? 0) + 1;
  }
  return salida;
}

describe("árbol de relevo", () => {
  it("cuelga el único receptor del origen", () => {
    const arbol = armarArbol("origen", [{ nodoId: "b", subidaKbps: 100 }], 100);
    expect(arbol.padres).toEqual({ b: "origen" });
    expect(arbol.sinColocar).toEqual([]);
    revisar(arbol);
  });

  it("reparte 10 receptores y acerca los de más subida al origen", () => {
    const receptores = Array.from({ length: 10 }, (_, i) => ({ nodoId: `n${i}`, subidaKbps: (i + 1) * 100 }));
    const primero = armarArbol("raiz", receptores, 100);
    const segundo = armarArbol("raiz", receptores, 100);
    expect(primero).toEqual(segundo);
    expect(Object.keys(primero.padres)).toHaveLength(10);
    revisar(primero);
    const prof = profundidades(primero);
    for (let i = 0; i < 9; i++) expect(prof[`n${i + 1}`]).toBeLessThanOrEqual(prof[`n${i}`]);
  });

  it("coloca 200 receptores sin superar el tope de cada nodo", () => {
    const receptores = Array.from({ length: 200 }, (_, i) => ({
      nodoId: `r${i.toString().padStart(3, "0")}`,
      subidaKbps: 100 + (i % 4) * 100,
    }));
    const arbol = armarArbol({ nodoId: "centro", subidaKbps: 500 }, receptores, 100);
    expect(arbol.sinColocar).toEqual([]);
    expect(Object.keys(arbol.padres)).toHaveLength(200);
    revisar(arbol);
  });

  it("sin medida solo sostiene un hijo y una subida de cero no sostiene ninguno", () => {
    expect(capacidadHijos({ nodoId: "x" }, 100)).toBe(1);
    expect(capacidadHijos({ nodoId: "x", subidaKbps: 0 }, 100)).toBe(0);
    const arbol = armarArbol("origen", [{ nodoId: "a" }, { nodoId: "b" }], 100);
    expect(arbol.padres.a).toBe("origen");
    expect(arbol.padres.b).toBe("a");
  });

  it("al irse uno mueve solo su rama y no toca a los demás", () => {
    const receptores = Array.from({ length: 10 }, (_, i) => ({ nodoId: `n${i}`, subidaKbps: (i + 1) * 100 }));
    const antes = armarArbol({ nodoId: "raiz", subidaKbps: 500 }, receptores, 100);
    const copia = JSON.parse(JSON.stringify(antes)) as ArbolRelevo;
    const despues = recolocar(antes, "n9");
    expect(antes).toEqual(copia);
    expect(despues.nodos.n9).toBeUndefined();
    for (const id of ["n8", "n7", "n6", "n5"]) expect(despues.padres[id]).toBe(antes.padres[id]);
    for (const id of ["n4", "n3", "n2", "n1", "n0"]) expect(despues.nodos[id]).toBeDefined();
    revisar(despues);
  });

  it("si se va la raíz asciende la rama con más subida", () => {
    const receptores = Array.from({ length: 10 }, (_, i) => ({ nodoId: `n${i}`, subidaKbps: (i + 1) * 100 }));
    const antes = armarArbol({ nodoId: "raiz", subidaKbps: 500 }, receptores, 100);
    const despues = recolocar(antes, "raiz");
    expect(despues.raiz).toBe("n9");
    expect(despues.padres[despues.raiz]).toBeUndefined();
    expect(Object.keys(despues.nodos)).toHaveLength(10);
    revisar(despues);
  });

  it("si el que se va no está, devuelve el árbol entero sin cambios", () => {
    const antes = armarArbol("raiz", [{ nodoId: "a" }], 100);
    expect(recolocar(antes, "fantasma")).toEqual(antes);
  });
});
