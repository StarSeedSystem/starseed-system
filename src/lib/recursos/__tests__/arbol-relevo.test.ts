import { describe, it, expect } from "vitest";
import { armarArbol, recolocar, capacidadHijos } from "../arbol-relevo";

describe("capacidadHijos", () => {
  it("sin medida admite un hijo y con medida reparte por el flujo", () => {
    expect(capacidadHijos(undefined, 100)).toBe(1);
    expect(capacidadHijos(1000, 100)).toBe(10);
    expect(capacidadHijos(150, 100)).toBe(1);
    expect(capacidadHijos(50, 100)).toBe(0);
    expect(capacidadHijos(1000, 0)).toBe(1);
  });
});

describe("armarArbol", () => {
  it("con un solo receptor lo cuelga del origen", () => {
    const arbol = armarArbol("raiz", [{ nodoId: "a", subidaKbps: 1000 }], 100);
    expect(arbol.origen).toBe("raiz");
    expect(arbol.padres).toEqual({ a: "raiz" });
    expect(arbol.capacidades.raiz).toBe(1);
  });

  it("con 10 receptores deja al más fuerte en el centro", () => {
    const receptores = Array.from({ length: 10 }, (_, i) => ({
      nodoId: `n${i}`,
      subidaKbps: 1000 - i * 10,
    }));
    const arbol = armarArbol("raiz", receptores, 100);
    expect(arbol.orden).toEqual(receptores.map((r) => r.nodoId));
    expect(arbol.padres.n0).toBe("raiz");
    for (let i = 1; i < 10; i++) expect(arbol.padres[`n${i}`]).toBe("n0");
  });

  it("sin medidas hace cadena y es determinista", () => {
    const receptores = ["c", "a", "b"].map((nodoId) => ({ nodoId }));
    const primero = armarArbol("raiz", receptores, 100);
    const segundo = armarArbol("raiz", [...receptores].reverse(), 100);
    expect(primero).toEqual(segundo);
    expect(primero.orden).toEqual(["a", "b", "c"]);
    expect(primero.padres).toEqual({ a: "raiz", b: "a", c: "b" });
  });

  it("con 200 receptores respeta huecos y deja todos alcanzables", () => {
    const receptores = Array.from({ length: 200 }, (_, i) => ({
      nodoId: `n${String(i).padStart(3, "0")}`,
      subidaKbps: 20000 - i,
    }));
    const arbol = armarArbol("raiz", receptores, 100);
    expect(Object.keys(arbol.padres)).toHaveLength(200);
    expect(armarArbol("raiz", receptores, 100)).toEqual(arbol);
    const usados: Record<string, number> = {};
    for (const [hijo, padre] of Object.entries(arbol.padres)) {
      expect(padre).not.toBe(hijo);
      usados[padre] = (usados[padre] ?? 0) + 1;
      let saltos = 0;
      let actual: string | undefined = hijo;
      while (actual !== undefined && actual !== "raiz") {
        actual = arbol.padres[actual];
        saltos += 1;
        expect(saltos).toBeLessThanOrEqual(200);
      }
      expect(actual).toBe("raiz");
    }
    for (const [padre, cuantos] of Object.entries(usados)) {
      expect(cuantos).toBeLessThanOrEqual(arbol.capacidades[padre]);
    }
  });
});

describe("recolocar", () => {
  const arbol = () =>
    armarArbol(
      { nodoId: "raiz", subidaKbps: 200 },
      [
        { nodoId: "a", subidaKbps: 1000 },
        { nodoId: "b", subidaKbps: 900 },
        { nodoId: "c", subidaKbps: 800 },
        { nodoId: "d", subidaKbps: 700 },
      ],
      100,
    );

  it("mueve solo la rama del que se va", () => {
    const original = arbol();
    expect(original.padres).toEqual({ a: "raiz", b: "raiz", c: "a", d: "a" });
    const nuevo = recolocar(original, "a");
    expect(nuevo.padres).toEqual({ b: "raiz", c: "raiz", d: "b" });
    expect(recolocar(original, "a")).toEqual(nuevo);
  });

  it("si se va el origen o un nodo que no está, no toca nada", () => {
    const original = arbol();
    expect(recolocar(original, "raiz")).toEqual(original);
    expect(recolocar(original, "fantasma")).toEqual(original);
  });
});
