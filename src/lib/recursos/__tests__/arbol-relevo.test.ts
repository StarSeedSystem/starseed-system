import { describe, it, expect } from "vitest";
import { armarArbol, recolocar, capacidadDeSubida } from "../arbol-relevo";
import type { ArbolRelevo, NodoRelevo } from "../arbol-relevo";

function profundidad(arbol: ArbolRelevo, nodoId: string): number {
  let saltos = 0;
  let actual: NodoRelevo | undefined = arbol.nodos.get(nodoId);
  while (actual && actual.padre !== null) {
    saltos += 1;
    if (saltos > arbol.nodos.size) return -1;
    actual = arbol.nodos.get(actual.padre);
  }
  return saltos;
}

function alcanzables(arbol: ArbolRelevo): number {
  const vistos = new Set<string>([arbol.origen]);
  const pila: string[] = [arbol.origen];
  while (pila.length > 0) {
    const id = pila.pop();
    if (id === undefined) continue;
    for (const hijo of arbol.nodos.get(id)?.hijos ?? []) {
      if (!vistos.has(hijo)) {
        vistos.add(hijo);
        pila.push(hijo);
      }
    }
  }
  return vistos.size;
}

function padres(arbol: ArbolRelevo): Record<string, string | null> {
  const salida: Record<string, string | null> = {};
  for (const [id, nodo] of arbol.nodos) salida[id] = nodo.padre;
  return salida;
}

describe("arbol-relevo", () => {
  describe("capacidadDeSubida", () => {
    it("usa floor de la subida y 1 cuando no hay medida", () => {
      expect(capacidadDeSubida(5000, 1000)).toBe(5);
      expect(capacidadDeSubida(999, 1000)).toBe(0);
      expect(capacidadDeSubida(undefined, 1000)).toBe(1);
      expect(capacidadDeSubida(1000, 0)).toBe(1);
    });
  });

  describe("armarArbol", () => {
    it("con 1 receptor cuelga del origen", () => {
      const arbol = armarArbol("o", [{ nodoId: "n1", subidaKbps: 2000 }], 1000);
      expect(arbol.nodos.get("n1")?.padre).toBe("o");
      expect(arbol.nodos.get("o")?.hijos).toEqual(["n1"]);
    });

    it("usa la subida del origen si viene entre los receptores", () => {
      const receptores = [{ nodoId: "o", subidaKbps: 3000 }, { nodoId: "n1" }, { nodoId: "n2" }, { nodoId: "n3" }];
      const arbol = armarArbol("o", receptores, 1000);
      expect(arbol.nodos.get("o")?.capacidad).toBe(3);
      expect(arbol.nodos.get("o")?.hijos.length).toBe(3);
    });

    it("con 10 receptores: capacidad, cercanía y determinismo", () => {
      const receptores = Array.from({ length: 10 }, (_, i) => ({
        nodoId: `n${i}`,
        subidaKbps: (10 - i) * 1000,
      }));
      const arbol = armarArbol("o", receptores, 1000);
      expect(arbol.nodos.size).toBe(11);
      expect(alcanzables(arbol)).toBe(11);
      for (const nodo of arbol.nodos.values()) {
        expect(nodo.hijos.length).toBeLessThanOrEqual(nodo.capacidad);
      }
      const ordenados = [...receptores].sort((a, b) => b.subidaKbps - a.subidaKbps);
      for (let i = 1; i < ordenados.length; i++) {
        expect(profundidad(arbol, ordenados[i].nodoId)).toBeGreaterThanOrEqual(
          profundidad(arbol, ordenados[i - 1].nodoId)
        );
      }
      const barajado = [receptores[7], ...receptores.slice(0, 7), receptores[9], receptores[8]];
      expect(padres(armarArbol("o", barajado, 1000))).toEqual(padres(arbol));
    });

    it("con 200 receptores todos cuelgan y respetan su capacidad", () => {
      const receptores = Array.from({ length: 200 }, (_, i) => ({
        nodoId: `n${i}`,
        subidaKbps: ((i % 7) + 1) * 500,
      }));
      const arbol = armarArbol("o", receptores, 1000);
      expect(arbol.nodos.size).toBe(201);
      expect(alcanzables(arbol)).toBe(201);
      for (const [id, nodo] of arbol.nodos) {
        expect(nodo.hijos.length).toBeLessThanOrEqual(nodo.capacidad);
        if (id !== "o") expect(arbol.nodos.has(nodo.padre ?? "")).toBe(true);
      }
    });
  });

  describe("recolocar", () => {
    it("mueve solo la rama del que se va", () => {
      const receptores = ["n1", "n2", "n3", "n4"].map((nodoId) => ({ nodoId, subidaKbps: 1000 }));
      const antes = armarArbol("o", receptores, 1000);
      expect(antes.nodos.get("n1")?.padre).toBe("o");
      expect(antes.nodos.get("n2")?.padre).toBe("n1");
      expect(antes.nodos.get("n3")?.padre).toBe("n2");
      expect(antes.nodos.get("n4")?.padre).toBe("n3");

      const despues = recolocar(antes, "n2");
      expect(despues.nodos.has("n2")).toBe(false);
      expect(despues.nodos.get("n1")?.hijos).not.toContain("n2");
      expect(despues.nodos.get("n1")?.padre).toBe("o");
      expect(despues.nodos.get("n3")?.padre).toBe("n1");
      expect(despues.nodos.get("n4")?.padre).toBe("n3");
      expect(despues.nodos.get("n3")?.hijos).toEqual(["n4"]);
      expect(antes.nodos.has("n2")).toBe(true);
      expect(recolocar(antes, "desconocido")).toBe(antes);
    });
  });
});
