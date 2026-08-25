/**
 * mundo-linaje.test.ts — "El linaje es un árbol, no una nube": prueba que
 * `construirArbolLinaje`/`calcularDisposicionLinaje` de verdad resuelvan un
 * árbol (generación real, sin ciclos, orden estable) y no solo posiciones
 * que parecen razonables a ojo.
 */
import { describe, it, expect } from "vitest";
import { construirArbolLinaje, calcularDisposicionLinaje } from "../mundo-linaje";
import type { NodoLinaje } from "@/lib/astraura/genesis-types";

function nodo(parcial: Partial<NodoLinaje> & { id: string }): NodoLinaje {
  return { nombre: parcial.id, progenitorId: null, generacion: 0, ...parcial };
}

describe("construirArbolLinaje", () => {
  it("con lista vacía no lanza", () => {
    const arbol = construirArbolLinaje([]);
    expect(arbol.raices).toEqual([]);
  });

  it("un progenitorId que no existe entre los nodos se trata como raíz", () => {
    const arbol = construirArbolLinaje([nodo({ id: "a", progenitorId: "no-existe" })]);
    expect(arbol.raices).toEqual(["a"]);
    expect(arbol.padrePorId.get("a")).toBeNull();
  });

  it("resuelve una cadena de tres generaciones", () => {
    const nodos = [
      nodo({ id: "abuela" }),
      nodo({ id: "madre", progenitorId: "abuela" }),
      nodo({ id: "hija", progenitorId: "madre" }),
    ];
    const arbol = construirArbolLinaje(nodos);
    expect(arbol.raices).toEqual(["abuela"]);
    expect(arbol.hijosPorId.get("abuela")).toEqual(["madre"]);
    expect(arbol.hijosPorId.get("madre")).toEqual(["hija"]);
  });

  it("corta un ciclo A↔B en un punto determinista (por orden de id, no de llegada) y no cuelga", () => {
    const cicloOrdenAB: NodoLinaje[] = [nodo({ id: "a", progenitorId: "b" }), nodo({ id: "b", progenitorId: "a" })];
    const cicloOrdenBA: NodoLinaje[] = [nodo({ id: "b", progenitorId: "a" }), nodo({ id: "a", progenitorId: "b" })];

    const arbol1 = construirArbolLinaje(cicloOrdenAB);
    const arbol2 = construirArbolLinaje(cicloOrdenBA); // mismos nodos, distinto orden de array

    // Ambos nodos siguen existiendo, ninguno desaparece por el dato circular.
    expect(new Set(arbol1.padrePorId.keys())).toEqual(new Set(["a", "b"]));
    // El punto de corte es el mismo tanto si el array llega en orden [a,b]
    // como [b,a] — depende de los ids ordenados, no del orden de entrada.
    expect(arbol1.raices).toEqual(arbol2.raices);
    expect(arbol1.raices).toEqual(["a"]);
  });

  it("ordena hermanos por nombre de forma estable", () => {
    const nodos = [
      nodo({ id: "1", nombre: "Zeta", progenitorId: "raiz" }),
      nodo({ id: "2", nombre: "Alfa", progenitorId: "raiz" }),
      nodo({ id: "raiz", nombre: "Raiz" }),
    ];
    const arbol = construirArbolLinaje(nodos);
    expect(arbol.hijosPorId.get("raiz")).toEqual(["2", "1"]); // Alfa antes que Zeta
  });
});

describe("calcularDisposicionLinaje", () => {
  it("con lista vacía devuelve una disposición vacía, no lanza", () => {
    const disposicion = calcularDisposicionLinaje([]);
    expect(disposicion.posiciones.size).toBe(0);
    expect(disposicion.generacionMaxima).toBe(0);
  });

  it("la fila (y) crece con la generación REAL, no con el campo `generacion` del dato", () => {
    // `generacion` llega deliberadamente mal puesta (invertida / arbitraria)
    // — el layout debe ignorarla y usar la profundidad real del árbol.
    const nodos = [
      nodo({ id: "abuela", generacion: 99 }),
      nodo({ id: "madre", progenitorId: "abuela", generacion: 0 }),
      nodo({ id: "hija", progenitorId: "madre", generacion: -5 }),
    ];
    const disposicion = calcularDisposicionLinaje(nodos);
    const yAbuela = disposicion.posiciones.get("abuela")!.y;
    const yMadre = disposicion.posiciones.get("madre")!.y;
    const yHija = disposicion.posiciones.get("hija")!.y;
    expect(yAbuela).toBeLessThan(yMadre);
    expect(yMadre).toBeLessThan(yHija);
    expect(disposicion.generacionMaxima).toBe(2);
  });

  it("no solapa las columnas de dos árboles distintos (varias raíces)", () => {
    const nodos = [
      nodo({ id: "raizA" }),
      nodo({ id: "hijaA1", progenitorId: "raizA" }),
      nodo({ id: "hijaA2", progenitorId: "raizA" }),
      nodo({ id: "raizB" }),
      nodo({ id: "hijaB1", progenitorId: "raizB" }),
    ];
    const disposicion = calcularDisposicionLinaje(nodos);
    const xs = ["hijaA1", "hijaA2", "hijaB1"].map((id) => disposicion.posiciones.get(id)!.x);
    expect(new Set(xs).size).toBe(3); // tres hojas, tres columnas distintas
  });

  it("las aristas conectan progenitor→hijo del árbol ya resuelto", () => {
    const nodos = [nodo({ id: "a" }), nodo({ id: "b", progenitorId: "a" })];
    const disposicion = calcularDisposicionLinaje(nodos);
    expect(disposicion.aristas).toHaveLength(1);
    expect(disposicion.aristas[0]).toMatchObject({ origenId: "a", destinoId: "b" });
  });

  it("es determinista frente al orden de llegada del array de entrada", () => {
    const nodos: NodoLinaje[] = [
      nodo({ id: "c", progenitorId: "a" }),
      nodo({ id: "b", progenitorId: "a" }),
      nodo({ id: "a" }),
    ];
    const reordenados = [nodos[2], nodos[0], nodos[1]];

    const d1 = calcularDisposicionLinaje(nodos);
    const d2 = calcularDisposicionLinaje(reordenados);

    for (const id of ["a", "b", "c"]) {
      expect(d1.posiciones.get(id)).toEqual(d2.posiciones.get(id));
    }
  });
});
