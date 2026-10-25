import { describe, it, expect } from "vitest";
import { armarArbol, capacidadHijos, recolocar } from "../arbol-relevo";
import type { ArbolRelevo, ReceptorRelevo } from "../arbol-relevo";

function receptores(n: number, subida = (i: number) => 5000 - i, latencia = (i: number) => i): ReceptorRelevo[] {
  return Array.from({ length: n }, (_, i) => ({
    nodoId: `n${String(i).padStart(3, "0")}`, subidaKbps: subida(i), latenciaMs: latencia(i),
  }));
}

function foto(arbol: ArbolRelevo): string {
  const filas = [...arbol.nodos.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, n]) => [id, n.padre, n.nivel, n.hijos]);
  return JSON.stringify(filas);
}

function comprobar(arbol: ArbolRelevo): void {
  for (const [id, n] of arbol.nodos) {
    expect(n.nodoId).toBe(id);
    expect(n.hijos.length).toBeLessThanOrEqual(n.capacidadHijos);
    if (id === arbol.origen) { expect(n.padre).toBeNull(); expect(n.nivel).toBe(0); continue; }
    expect(n.padre).not.toBeNull();
    const padre = arbol.nodos.get(n.padre!)!;
    expect(padre.hijos).toContain(id);
    expect(n.nivel).toBe(padre.nivel + 1);
  }
  for (const id of arbol.nodos.keys()) {
    let actual = id;
    let pasos = 0;
    while (arbol.nodos.get(actual)!.padre !== null && pasos <= arbol.nodos.size) {
      actual = arbol.nodos.get(actual)!.padre!;
      pasos++;
    }
    expect(actual).toBe(arbol.origen);
  }
}

describe("arbol-relevo", () => {
  describe("capacidadHijos", () => {
    it("calcula floor y usa 1 cuando no hay medida fiable", () => {
      expect(capacidadHijos(3000, 1000)).toBe(3);
      expect(capacidadHijos(2999, 1000)).toBe(2);
      expect(capacidadHijos(undefined, 1000)).toBe(1);
      expect(capacidadHijos(0, 1000)).toBe(0);
      expect(capacidadHijos(1000, 0)).toBe(1);
      expect(capacidadHijos(Number.NaN, 1000)).toBe(1);
    });
  });
  describe("armarArbol", () => {
    it("un solo receptor cuelga del origen", () => {
      const arbol = armarArbol({ nodoId: "origen", subidaKbps: 1000 }, receptores(1), 1000);
      expect(arbol.nodos.size).toBe(2);
      expect(arbol.nodos.get("n000")!.padre).toBe("origen");
      comprobar(arbol);
    });

    it("diez receptores: los de más subida, más cerca del origen", () => {
      const arbol = armarArbol(
        { nodoId: "origen", subidaKbps: 4000 },
        receptores(10, (i) => 5000 - i * 100),
        1000
      );
      comprobar(arbol);
      const orden = [...arbol.nodos.values()]
        .filter((n) => n.nodoId !== "origen")
        .sort((a, b) => b.subidaKbps! - a.subidaKbps!);
      for (let i = 1; i < orden.length; i++) {
        expect(orden[i].nivel).toBeGreaterThanOrEqual(orden[i - 1].nivel);
      }
      expect(arbol.nodos.get("origen")!.hijos).toEqual(orden.slice(0, 4).map((n) => n.nodoId));
    });

    it("doscientos receptores: conexo, determinista y sin excesos", () => {
      const arbol = armarArbol({ nodoId: "origen", subidaKbps: 8000 }, receptores(200), 1000);
      expect(arbol.nodos.size).toBe(201);
      comprobar(arbol);
      expect([...arbol.nodos.values()].some((n) => n.excedeTope)).toBe(false);
      const otro = armarArbol({ nodoId: "origen", subidaKbps: 8000 }, receptores(200).reverse(), 1000);
      expect(foto(otro)).toBe(foto(arbol));
    });

    it("sin medida: cada nodo sostiene un solo hijo", () => {
      const arbol = armarArbol("origen", [{ nodoId: "a" }, { nodoId: "b" }, { nodoId: "c" }], 1000);
      comprobar(arbol);
      expect(arbol.nodos.get("a")!.capacidadHijos).toBe(1);
      expect(arbol.nodos.get("b")!.padre).toBe("a");
      expect(arbol.nodos.get("c")!.padre).toBe("b");
    });
  });
  describe("recolocar", () => {
    it("al irse un relevo solo se mueve su rama", () => {
      const arbol = armarArbol({ nodoId: "origen", subidaKbps: 4000 }, receptores(10, (i) => 5000 - i * 100), 1000);
      const seVa = [...arbol.nodos.values()].find((n) => n.nodoId !== "origen" && n.hijos.length > 0)!;
      const ramas = [...seVa.hijos];
      const antes = new Map([...arbol.nodos].map(([id, n]) => [id, n.padre]));
      const despues = recolocar(arbol, seVa.nodoId);
      expect(despues.nodos.has(seVa.nodoId)).toBe(false);
      expect(arbol.nodos.has(seVa.nodoId)).toBe(true);
      for (const [id, n] of despues.nodos) {
        if (!ramas.includes(id)) expect(n.padre).toBe(antes.get(id)!);
      }
      for (const rama of ramas) expect(despues.nodos.get(rama)!.padre).not.toBeNull();
      comprobar(despues);
    });

    it("cierra la cadena al irse un nodo sin medida", () => {
      const arbol = armarArbol("origen", [{ nodoId: "a" }, { nodoId: "b" }, { nodoId: "c" }], 1000);
      const despues = recolocar(arbol, "b");
      expect(despues.nodos.get("c")!.padre).toBe("a");
      comprobar(despues);
    });

    it("el origen y un desconocido no cambian nada", () => {
      const arbol = armarArbol({ nodoId: "origen", subidaKbps: 4000 }, receptores(10), 1000);
      const copia = foto(arbol);
      expect(foto(recolocar(arbol, "origen"))).toBe(copia);
      expect(foto(recolocar(arbol, "fantasma"))).toBe(copia);
    });
  });
});
