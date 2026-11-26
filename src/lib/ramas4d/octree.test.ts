import { describe, it, expect } from "vitest";
import {
  calcularFuerzaBarnesHut,
  crearArbol,
  calcularEnergia,
} from "./octree";

const SEMILLA = 42;

describe("octree · Barnes-Hut", () => {
  it("la fuerza entre dos nodos es atractiva y decrece con la distancia", () => {
    const posiciones = new Float32Array([0, 0, 0, 10, 0, 0]);
    const arbol = crearArbol(posiciones, 2);
    const f1 = calcularFuerzaBarnesHut(arbol, 0, posiciones);
    const f2 = calcularFuerzaBarnesHut(arbol, 1, posiciones);
    // La fuerza en el nodo 0 apunta hacia el nodo 1 (+x)
    expect(f1[0]).toBeGreaterThan(0);
    expect(f1[1]).toBeCloseTo(0, 5);
    // La fuerza en el nodo 1 apunta hacia el nodo 0 (-x)
    expect(f2[0]).toBeLessThan(0);
  });
});