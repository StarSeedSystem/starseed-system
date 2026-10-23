import { describe, it, expect } from "vitest";
import {
  ArbolRelevo,
  NodoRelevo,
  armarArbol,
  capacidadRelevo,
  compararRelevo,
  profundidades,
  recolocar
} from "../arbol-relevo";

function rec(n: number, subidaKbps?: number): NodoRelevo {
  return { nodoId: `nodo-${n}`, subidaKbps };
}

/** 3 receptores medidos (8000, 4000 y 2000 kbps) y 7 sin medir. */
function diez(): NodoRelevo[] {
  return [rec(1, 8000), rec(2, 4000), rec(3, 2000)].concat(Array.from({ length: 7 }, (_, i) => rec(4 + i)));
}
/** Comprueba que todo receptor llega al origen sin ciclos ni huecos. */
function enraizado(a: ArbolRelevo): boolean {
  for (const id of a.nodos.keys()) {
    const vistas = new Set<string>();
    let actual: string | undefined = id;
    while (actual !== undefined && actual !== a.origen) {
      if (vistas.has(actual) || !a.nodos.has(actual)) return false;
      vistas.add(actual);
      actual = a.padreDe.get(actual);
    }
  }
  return true;
}

function canon(a: ArbolRelevo): string {
  return [...a.padreDe.entries()].map(([h, p]) => `${h}>${p}`).sort().join(",");
}

function hijosDe(a: ArbolRelevo, padre: string): string[] {
  return [...a.padreDe.entries()].filter(([, p]) => p === padre).map(([h]) => h);
}

describe("arbol-relevo.ts", () => {
  it("capacidad: sin medida 1 hijo; con medida floor(subida/flujo) y mínimo 1", () => {
    expect(capacidadRelevo(undefined, 2000)).toBe(1);
    expect(capacidadRelevo({ nodoId: "x" }, 2000)).toBe(1);
    expect(capacidadRelevo({ nodoId: "x", subidaKbps: 8000 }, 2000)).toBe(4);
    expect(capacidadRelevo({ nodoId: "x", subidaKbps: 1500 }, 2000)).toBe(1);
  });

  it("compararRelevo: más subida, después menos latencia, después id (determinista)", () => {
    const lista = [{ nodoId: "b", subidaKbps: 1000 }, { nodoId: "c", subidaKbps: 3000, latenciaMs: 200 }, { nodoId: "a", subidaKbps: 3000, latenciaMs: 50 }];
    expect([...lista].sort(compararRelevo).map((n) => n.nodoId)).toEqual(["a", "c", "b"]);
  });

  it("con 1 receptor lo cuelga directo del origen", () => {
    const arbol = armarArbol("origen", [rec(1)], 2000);
    expect(arbol.padreDe.get("nodo-1")).toBe("origen");
    expect(enraizado(arbol)).toBe(true);
  });

  it("con 10 respeta capacidades y deja la mayor subida cerca del origen", () => {
    const receptores = diez();
    const arbol = armarArbol("origen", receptores, 2000);
    expect(arbol.padreDe.size).toBe(10);
    expect(arbol.padreDe.get("nodo-1")).toBe("origen"); // el origen (sin medida) admite 1 hijo
    // el origen (sin medida) admite 1; nodo-1 sostiene 4 (8000/2000). Orden por id lex: «nodo-10» va primero que «nodo-4»
    expect(hijosDe(arbol, "nodo-1")).toEqual(["nodo-2", "nodo-3", "nodo-10", "nodo-4"]);
    for (const [padre] of arbol.padreDe) {
      const cap = capacidadRelevo(padre === arbol.origen ? undefined : arbol.nodos.get(padre), 2000);
      expect(hijosDe(arbol, padre).length <= cap).toBe(true);
    }
    const d = profundidades(arbol);
    const ord = [...receptores].sort(compararRelevo);
    for (let i = 1; i < ord.length; i += 1) expect((d.get(ord[i].nodoId) ?? 0) >= (d.get(ord[i - 1].nodoId) ?? 0)).toBe(true);
    expect(enraizado(arbol)).toBe(true);
  });

  it("es determinista aunque la lista llegue desordenada o con duplicados", () => {
    const receptores = diez();
    const a = armarArbol("origen", [...receptores].reverse(), 2000);
    const b = armarArbol("origen", [...receptores, rec(1, 9999)], 2000); // el duplicado se omite
    expect(canon(a)).toBe(canon(b));
  });

  it("con 200 todos tienen padre válido y el árbol llega al origen", () => {
    const receptores = Array.from({ length: 200 }, (_, i) => i % 3 === 0 ? rec(i + 1) : rec(i + 1, 1000 + (i % 7) * 250));
    const arbol = armarArbol("origen", receptores, 500);
    expect(arbol.padreDe.size).toBe(200);
    expect(arbol.nodos.size).toBe(200);
    expect(enraizado(arbol)).toBe(true);
  });

  it("al irse uno, solo su rama se recoloca", () => {
    const arbol = armarArbol("origen", diez(), 2000);
    const nuevo = recolocar(arbol, "nodo-1");
    expect(nuevo.nodos.has("nodo-1")).toBe(false);
    expect(nuevo.padreDe.get("nodo-2")).toBe("origen"); // el de más subida toma el hueco libre
    for (const h of ["nodo-5", "nodo-6", "nodo-7", "nodo-8", "nodo-9"]) {
      expect(nuevo.padreDe.get(h)).toBe(arbol.padreDe.get(h)); // fuera de la rama: sin cambios
    }
    for (const h of ["nodo-3", "nodo-10", "nodo-4"]) {
      expect(arbol.padreDe.get(h)).toBe("nodo-1"); // el árbol anterior queda intacto
      expect(nuevo.padreDe.get(h)).not.toBe("nodo-1"); // su rama se recoloca
    }
    for (const [padre] of nuevo.padreDe) {
      const cap = capacidadRelevo(padre === nuevo.origen ? undefined : nuevo.nodos.get(padre), 2000);
      expect(hijosDe(nuevo, padre).length <= cap).toBe(true);
    }
    expect(enraizado(nuevo)).toBe(true);
  });

  it("si se va una hoja, el resto del árbol no cambia", () => {
    const arbol = armarArbol("origen", diez(), 2000);
    const sinHoja = recolocar(arbol, "nodo-8"); // nodo-8 no tiene hijos
    const esperado = [...arbol.padreDe.entries()].filter(([h]) => h !== "nodo-8").map(([h, p]) => `${h}>${p}`).sort().join(",");
    expect(canon(sinHoja)).toBe(esperado);
    expect(enraizado(sinHoja)).toBe(true);
  });
});
