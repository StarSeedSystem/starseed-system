import { describe, it, expect } from "vitest";
import { armarArbol, recolocar } from "../arbol-relevo";

describe("arbol-relevo", () => {
  describe("armarArbol", () => {
    it("con 1 receptor", () => {
      const origen = "origen";
      const receptores = [{ nodoId: "n1", subidaKbps: 1000 }];
      const arbol = armarArbol(origen, receptores, 500);

      expect(arbol.origen).toBe(origen);
      expect(arbol.nodos.get(origen)?.hijos).toContain("n1");
    });

    it("con 10 receptores ordenados por subida", () => {
      const origen = "origen";
      const receptores = Array.from({ length: 10 }, (_, i) => ({
        nodoId: `n${i}`,
        subidaKbps: (10 - i) * 1000
      }));

      const arbol = armarArbol(origen, receptores, 1000);

      const hijosOrigen = arbol.nodos.get(origen)?.hijos || [];
      expect(hijosOrigen.length).toBeGreaterThan(0);

      const primerosHijos = hijosOrigen.slice(0, 3);
      const subidas = primerosHijos.map((id) => arbol.nodos.get(id)?.subidaKbps ?? 0);
      if (subidas.length >= 3) {
        expect(subidas[0]).toBeGreaterThanOrEqual(subidas[1]);
        expect(subidas[1]).toBeGreaterThanOrEqual(subidas[2]);
      }
    });

    it("respeta capacidad máxima por nodo", () => {
      const origen = "origen";
      const receptores = [
        { nodoId: "n1", subidaKbps: 5000 },
        { nodoId: "n2", subidaKbps: 1000 },
        { nodoId: "n3", subidaKbps: 1000 },
        { nodoId: "n4", subidaKbps: 1000 },
        { nodoId: "n5", subidaKbps: 1000 }
      ];

      const kbpsFlujo = 1000;
      const arbol = armarArbol(origen, receptores, kbpsFlujo);

      const nodo1 = arbol.nodos.get("n1");
      if (nodo1) {
        const capacidadMax = Math.floor(5000 / kbpsFlujo);
        expect(nodo1.hijos.length).toBeLessThanOrEqual(capacidadMax);
      }
    });

    it("con subida sin medir usa capacidad mínima", () => {
      const origen = "origen";
      const receptores = [
        { nodoId: "n1" },
        { nodoId: "n2" },
        { nodoId: "n3" }
      ];

      const arbol = armarArbol(origen, receptores, 1000);

      const n1 = arbol.nodos.get("n1");
      expect(n1?.subidaKbps).toBe(0);
      expect(arbol.nodos.get(origen)?.hijos.length).toBeGreaterThan(0);
    });

    it("200 receptores", () => {
      const origen = "origen";
      const receptores = Array.from({ length: 200 }, (_, i) => ({
        nodoId: `n${i}`,
        subidaKbps: (200 - i) * 500
      }));

      const arbol = armarArbol(origen, receptores, 1000);

      let totalReceptores = 0;
      for (const [id, nodo] of arbol.nodos) {
        if (id !== origen) totalReceptores++;
      }

      expect(totalReceptores).toBe(200);

      for (const [id, nodo] of arbol.nodos) {
        const subida = nodo.subidaKbps ?? 0;
        const capMax = subida > 0 ? Math.floor(subida / 1000) : 9999;
        expect(nodo.hijos.length).toBeLessThanOrEqual(capMax);
      }
    });

    it("mueve la rama cuando un nodo se va", () => {
      const origen = "origen";
      const receptores = [
        { nodoId: "n1", subidaKbps: 5000 },
        { nodoId: "n2", subidaKbps: 3000 },
        { nodoId: "n3", subidaKbps: 2000 },
        { nodoId: "n4", subidaKbps: 1000 }
      ];

      const arbol = armarArbol(origen, receptores, 1000);
      const hijosAntes = arbol.nodos.get("n1")?.hijos.length || 0;

      const arbolRecolocado = recolocar(arbol, "n1");

      expect(arbolRecolocado.nodos.get("n1")?.hijos.length).toBe(0);
      expect(arbolRecolocado.nodos.get(origen)?.hijos).not.toContain("n1");

      const totalHijos = Array.from(arbolRecolocado.nodos.values())
        .reduce((sum, nodo) => sum + nodo.hijos.length, 0);
      expect(totalHijos).toBeGreaterThan(0);
    });

    it("si el que se va no está, devuelve el árbol entero sin cambios", () => {
      const antes = armarArbol("raiz", [{ nodoId: "a" }], 100);
      expect(recolocar(antes, "fantasma")).toEqual(antes);
    });

    it("al irse uno quita solo a ese nodo y no toca a los demás", () => {
      const arbol = armarArbol(
        "origen",
        [
          { nodoId: "n1", subidaKbps: 5000 },
          { nodoId: "n2", subidaKbps: 3000 },
          { nodoId: "n3", subidaKbps: 2000 },
        ],
        1000,
      );
      const recolocado = recolocar(arbol, "n1");
      const hijosOrigen = recolocado.nodos.get("origen")?.hijos ?? [];
      expect(hijosOrigen).not.toContain("n1");
      expect(hijosOrigen).toEqual(expect.arrayContaining(["n2", "n3"]));
      expect(recolocado.nodos.get("n2")?.subidaKbps).toBe(3000);
      expect(recolocado.nodos.get("n3")?.subidaKbps).toBe(2000);
    });

    it("mantiene determinismo", () => {
      const origen = "origen";
      const receptores = [
        { nodoId: "n1", subidaKbps: 5000 },
        { nodoId: "n2", subidaKbps: 3000 },
        { nodoId: "n3", subidaKbps: 2000 }
      ];

      const arbol1 = armarArbol(origen, receptores, 1000);
      const arbol2 = armarArbol(origen, receptores, 1000);

      for (const [id, nodo1] of arbol1.nodos) {
        const nodo2 = arbol2.nodos.get(id);
        expect(nodo2?.hijos).toEqual(nodo1.hijos);
      }
    });
  });
});