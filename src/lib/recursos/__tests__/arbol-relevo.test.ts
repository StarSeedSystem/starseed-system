import { describe, it, expect } from "vitest";
import { armarArbol, recolocar, capacidadRelevo, type ArbolRelevo } from "../arbol-relevo";

const lista = (n: number, subida?: (i: number) => number | undefined) =>
  Array.from({ length: n }, (_, i) => ({
    nodoId: `n${String(i).padStart(3, "0")}`,
    subidaKbps: subida?.(i),
  }));

function respetaCapacidad(arbol: ArbolRelevo): boolean {
  for (const [nodo, hijos] of arbol.hijos) {
    if (hijos.length > (arbol.capacidad.get(nodo) ?? 0)) return false;
  }
  return true;
}

function profundidad(arbol: ArbolRelevo, nodo: string): number {
  let saltos = 0;
  let actual = arbol.padre.get(nodo) ?? null;
  while (actual !== null) {
    saltos++;
    actual = arbol.padre.get(actual) ?? null;
  }
  return saltos;
}

describe("arbol-relevo.ts", () => {
  it("capacidad: sin medida uno, y floor(subida / caudal) con medida", () => {
    expect(capacidadRelevo(undefined, 100)).toBe(1);
    expect(capacidadRelevo(0, 100)).toBe(0);
    expect(capacidadRelevo(250, 100)).toBe(2);
    expect(capacidadRelevo(99, 100)).toBe(0);
  });

  it("un solo receptor cuelga del origen", () => {
    const arbol = armarArbol("origen", [{ nodoId: "n1" }], 100);
    expect(arbol.padre.get("n1")).toBe("origen");
    expect(arbol.hijos.get("origen")).toEqual(["n1"]);
  });

  it("diez receptores: más subida más cerca y sin pasar el tope", () => {
    const arbol = armarArbol("origen", lista(10, (i) => (i + 1) * 100), 300);
    expect(arbol.padre.size).toBe(11);
    expect(respetaCapacidad(arbol)).toBe(true);
    expect(profundidad(arbol, "n009")).toBe(1);
    expect(profundidad(arbol, "n009")).toBeLessThanOrEqual(profundidad(arbol, "n000"));
  });

  it("doscientos receptores: todos colocados y deterministas", () => {
    const uno = armarArbol("origen", lista(200), 100);
    const dos = armarArbol("origen", lista(200).reverse(), 100);
    expect(uno.padre.size).toBe(201);
    expect(new Set(uno.padre.keys()).size).toBe(201);
    expect(respetaCapacidad(uno)).toBe(true);
    expect(dos).toEqual(uno);
  });

  it("al irse uno, solo se mueve su rama y no se muta el original", () => {
    const origen = { nodoId: "origen", subidaKbps: 300 };
    const arbol = armarArbol("origen", [origen, ...lista(8, (i) => (8 - i) * 100)], 100);
    expect(arbol.hijos.get("origen")).toEqual(["n000", "n001", "n002"]);
    expect(arbol.hijos.get("n000")).toEqual(["n003", "n004", "n005", "n006", "n007"]);
    const rama = [...(arbol.hijos.get("n000") ?? [])];
    const nuevo = recolocar(arbol, "n000");
    expect(arbol.padre.get("n000")).toBe("origen");
    expect(nuevo.padre.has("n000")).toBe(false);
    expect(nuevo.padre.get("n001")).toBe("origen");
    expect(nuevo.padre.get("n002")).toBe("origen");
    for (const hijo of rama) {
      expect(nuevo.padre.get(hijo)).toBeDefined();
      expect(nuevo.padre.get(hijo)).not.toBe("n000");
      expect(nuevo.hijos.get(hijo)).toEqual(arbol.hijos.get(hijo));
    }
    for (const nodo of arbol.padre.keys()) {
      if (nodo !== "n000") expect(nuevo.padre.has(nodo)).toBe(true);
    }
    expect(respetaCapacidad(nuevo)).toBe(true);
  });

  it("el origen no se recoloca y una salida desconocida no cambia nada", () => {
    const arbol = armarArbol("origen", lista(3), 100);
    expect(recolocar(arbol, "origen").padre).toEqual(arbol.padre);
    expect(recolocar(arbol, "fantasma").padre).toEqual(arbol.padre);
  });
});
