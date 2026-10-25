import { describe, it, expect } from "vitest";
import { armarArbol, recolocar, ArbolRelevo, ReceptorArbol } from "../arbol-relevo";

const FLUJO = 1000;

function nodos(cantidad: number, subida: (i: number) => number): ReceptorArbol[] {
  return Array.from({ length: cantidad }, (_, i) => ({ nodoId: "n" + String(i).padStart(3, "0"), subidaKbps: subida(i) }));
}

/** Comprueba que el árbol cuelga del origen, no tiene ciclos y respeta cada capacidad. */
function comprobar(arbol: ArbolRelevo): void {
  expect(arbol.sinUbicar).toEqual([]);
  const cola = [arbol.origen], vistos = new Set(cola);
  for (let i = 0; i < cola.length; i++) {
    const hijos = arbol.hijos[cola[i]] ?? [];
    expect(hijos.length).toBeLessThanOrEqual(arbol.capacidad[cola[i]] ?? 0);
    for (const hijo of hijos) {
      expect(vistos.has(hijo)).toBe(false);
      vistos.add(hijo);
      expect(arbol.padres[hijo]).toBe(cola[i]);
      cola.push(hijo);
    }
  }
  expect(vistos.size).toBe(1 + Object.keys(arbol.padres).length);
}

describe("armarArbol", () => {
  it("un solo receptor cuelga del origen", () => {
    const arbol = armarArbol("origen", [{ nodoId: "n000", subidaKbps: 5000 }], FLUJO);
    expect(arbol.padres).toEqual({ n000: "origen" });
    expect(arbol.hijos.origen).toEqual(["n000"]);
    expect(arbol.capacidad).toEqual({ origen: 1, n000: 5 });
  });

  it("es determinista y desempata por latencia y luego por id", () => {
    const base: ReceptorArbol[] = [
      { nodoId: "b", subidaKbps: 3000, latenciaMs: 40 }, { nodoId: "a", subidaKbps: 3000, latenciaMs: 40 },
      { nodoId: "c", subidaKbps: 3000, latenciaMs: 10 },
    ];
    const uno = armarArbol("origen", base, FLUJO);
    const dos = armarArbol("origen", [...base].reverse(), FLUJO);
    expect(dos).toEqual(uno);
    expect(uno.hijos.origen).toEqual(["c"]);
    expect(uno.hijos.c).toEqual(["a", "b"]);
  });

  it("sin medida son 1 hueco; una subida de 0 no sostiene hijos", () => {
    const arbol = armarArbol(
      "origen",
      [
        { nodoId: "medido", subidaKbps: 4000 },
        { nodoId: "cero", subidaKbps: 0 },
        { nodoId: "sin-medida" },
      ],
      FLUJO,
    );
    expect(arbol.capacidad["sin-medida"]).toBe(1);
    expect(arbol.capacidad.cero).toBe(0);
    expect(arbol.padres.cero).toBe("medido");
    expect(arbol.padres["sin-medida"]).toBe("medido");
  });

  it("rechaza un flujo no positivo", () => {
    expect(() => armarArbol("origen", [], 0)).toThrow(/positivo/);
    expect(() => armarArbol("origen", [], -1)).toThrow(/positivo/);
  });

  it("diez receptores: ramifica en orden y respeta los huecos", () => {
    const arbol = armarArbol("origen", nodos(10, () => 2500), FLUJO);
    comprobar(arbol);
    expect(arbol.padres).toEqual({
      n000: "origen", n001: "n000", n002: "n000", n003: "n001", n004: "n001",
      n005: "n002", n006: "n002", n007: "n003", n008: "n003", n009: "n004",
    });
  });

  it("200 receptores: todos colocados, sin ciclos y un padre nunca sube menos", () => {
    const receptores = nodos(200, (i) => 1000 + ((i * 37) % 4000));
    const arbol = armarArbol("origen", receptores, FLUJO);
    comprobar(arbol);
    const subidas = new Map(receptores.map((r) => [r.nodoId, r.subidaKbps ?? 0]));
    for (const [hijo, padre] of Object.entries(arbol.padres)) {
      if (padre !== arbol.origen) expect(subidas.get(padre) ?? -1).toBeGreaterThanOrEqual(subidas.get(hijo) ?? -1);
    }
  });
});

describe("recolocar", () => {
  const antes = () => armarArbol("origen", nodos(10, () => 2500), FLUJO);

  it("al irse una rama, solo sus hijos buscan hueco y el resto no se toca", () => {
    const original = antes();
    const despues = recolocar(original, "n001");
    comprobar(despues);
    expect(despues.padres.n001).toBeUndefined();
    expect(despues.hijos.n001).toBeUndefined();
    expect(despues.hijos.n000).toEqual(["n002", "n003"]);
    expect([despues.padres.n003, despues.padres.n004]).toEqual(["n000", "n005"]);
    expect([despues.padres.n007, despues.padres.n008, despues.padres.n009]).toEqual(["n003", "n003", "n004"]);
    expect([despues.padres.n005, despues.padres.n006]).toEqual(["n002", "n002"]);
    expect(recolocar(original, "n001")).toEqual(despues);
  });

  it("al irse una hoja no se recoloca ninguna otra rama", () => {
    const original = antes();
    const despues = recolocar(original, "n007");
    comprobar(despues);
    expect(despues.padres.n007).toBeUndefined();
    expect(despues.hijos.n003).toEqual(["n008"]);
    for (const nodo of ["n000", "n001", "n002", "n003", "n004", "n005", "n006", "n008", "n009"]) {
      expect(despues.padres[nodo]).toBe(original.padres[nodo]);
    }
  });

  it("un nodo que no estaba en el árbol deja el árbol intacto", () => {
    const original = antes();
    expect(recolocar(original, "no-existe")).toEqual(original);
  });
});
