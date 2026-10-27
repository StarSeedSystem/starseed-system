import { describe, it, expect } from "vitest";
import { armarArbol, capacidadRelevo, recolocar } from "../arbol-relevo";
import type { ArbolRelevo, NodoRelevo } from "../arbol-relevo";

const FLUJO = 100;

function receptores(cantidad: number, subidaBase = 2000): NodoRelevo[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    nodoId: `n${String(i).padStart(3, "0")}`,
    subidaKbps: subidaBase - i,
    latenciaMs: 10 + i,
  }));
}

function contarHijos(arbol: ArbolRelevo): Record<string, number> {
  const hijos: Record<string, number> = {};
  for (const padre of Object.values(arbol.padres)) hijos[padre] = (hijos[padre] ?? 0) + 1;
  return hijos;
}

function profundidadDe(arbol: ArbolRelevo, id: string): number {
  let d = 0;
  for (let actual = id; actual !== arbol.origen; actual = arbol.padres[actual]) d++;
  return d;
}

function comprobarLimites(arbol: ArbolRelevo): void {
  const hijos = contarHijos(arbol);
  for (const [id, nodo] of Object.entries(arbol.nodos)) {
    expect(hijos[id] ?? 0).toBeLessThanOrEqual(capacidadRelevo(nodo, arbol.flujoKbps));
  }
}

describe("armarArbol", () => {
  it("capacidad: sin medida un hijo; con medida, el cociente entero", () => {
    expect(capacidadRelevo({ nodoId: "a" }, FLUJO)).toBe(1);
    expect(capacidadRelevo({ nodoId: "a", subidaKbps: 250 }, FLUJO)).toBe(2);
    expect(capacidadRelevo({ nodoId: "a", subidaKbps: 0 }, FLUJO)).toBe(0);
  });

  it("un solo receptor cuelga del origen", () => {
    const arbol = armarArbol({ nodoId: "origen", subidaKbps: 500 }, receptores(1), FLUJO);
    expect(arbol.padres).toEqual({ n000: "origen" });
    expect(arbol.sinSitio).toEqual([]);
  });

  it("sin capacidad no inventa padre", () => {
    const arbol = armarArbol({ nodoId: "origen", subidaKbps: 0 }, receptores(1), FLUJO);
    expect(arbol.padres).toEqual({});
    expect(arbol.sinSitio).toEqual(["n000"]);
  });

  it("diez receptores: todos colocados y los de más subida más cerca", () => {
    const arbol = armarArbol({ nodoId: "origen", subidaKbps: 300 }, receptores(10), FLUJO);
    expect(Object.keys(arbol.padres)).toHaveLength(10);
    expect(arbol.sinSitio).toEqual([]);
    comprobarLimites(arbol);
    const profundidades = receptores(10).map(n => profundidadDe(arbol, n.nodoId));
    expect(profundidades).toEqual([...profundidades].sort((a, b) => a - b));
  });

  it("doscientos receptores: conectados, sin ciclos y determinista", () => {
    const origen = { nodoId: "origen", subidaKbps: 500 };
    const arbol = armarArbol(origen, receptores(200, 2000), FLUJO);
    expect(Object.keys(arbol.padres)).toHaveLength(200);
    expect(arbol.sinSitio).toEqual([]);
    comprobarLimites(arbol);
    for (const id of Object.keys(arbol.padres)) {
      let actual = id;
      let pasos = 0;
      while (actual !== "origen" && pasos++ <= 200) actual = arbol.padres[actual];
      expect(actual).toBe("origen");
    }
    expect(armarArbol(origen, receptores(200, 2000), FLUJO)).toEqual(arbol);
  });
});

describe("recolocar", () => {
  it("solo mueve la rama del que se va", () => {
    const arbol: ArbolRelevo = {
      origen: "origen",
      padres: { a: "origen", b: "a", c: "a", d: "origen", e: "b" },
      sinSitio: [],
      nodos: {
        origen: { nodoId: "origen", subidaKbps: 400 },
        a: { nodoId: "a", subidaKbps: 300 },
        b: { nodoId: "b", subidaKbps: 200 },
        c: { nodoId: "c", subidaKbps: 100 },
        d: { nodoId: "d", subidaKbps: 50 },
        e: { nodoId: "e", subidaKbps: 40 },
      },
      flujoKbps: FLUJO,
    };
    const nuevo = recolocar(arbol, "a");
    expect(nuevo.padres.a).toBeUndefined();
    expect(nuevo.padres.b).toBe("origen");
    expect(nuevo.padres.c).toBe("origen");
    expect(nuevo.padres.d).toBe("origen");
    expect(nuevo.padres.e).toBe("b");
    expect(nuevo.sinSitio).toEqual([]);
    expect(arbol.padres.a).toBe("origen");
  });
});
