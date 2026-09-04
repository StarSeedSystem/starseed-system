import { describe, it, expect, beforeEach } from "vitest";
import { genomaBase, type Genoma } from "../laboratorio/genoma";
import {
  crearVersion,
  versionesDe,
  ramificar,
  compararVersiones,
  historia,
  promoverAlOS,
} from "../laboratorio/versiones";

// Mock mínimo de localStorage (vitest corre en entorno node).
class LocalStorageFalso {
  private datos = new Map<string, string>();
  getItem(k: string): string | null { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string): void { this.datos.set(k, v); }
  removeItem(k: string): void { this.datos.delete(k); }
  clear(): void { this.datos.clear(); }
}

beforeEach(() => {
  (globalThis as Record<string, unknown>).localStorage = new LocalStorageFalso();
});

function genomaConCambio(): Genoma {
  const base = genomaBase();
  return {
    ...base,
    nodos: base.nodos.map((n) =>
      n.id === "cre-temperatura" ? { ...n, parametros: { ...n.parametros, valor: 1.2 } } : n,
    ),
  };
}

describe("versiones del laboratorio", () => {
  it("crearVersion guarda una instantánea independiente del genoma", () => {
    const g = genomaBase();
    const v = crearVersion(g, "base", "primera fotografía");
    expect(versionesDe(g.id)).toHaveLength(1);
    expect(v.instantanea.nodos).toHaveLength(g.nodos.length);
    const semilla = g.nodos.find((n) => n.id === "nuc-semilla")!;
    semilla.parametros.semilla = 999;
    const capturada = v.instantanea.nodos.find((n) => n.id === "nuc-semilla")!;
    expect(capturada.parametros.semilla).toBe(158);
  });

  it("ramificar crea una hija con padre y mantiene la historia", () => {
    const g = genomaBase();
    const raiz = crearVersion(g, "raíz", "");
    const hija = ramificar(raiz.id, "rama A");
    const nieta = ramificar(hija!.id, "rama A.1");
    expect(hija!.padre).toBe(raiz.id);
    const cadena = historia(nieta!.id).map((v) => v.nombre);
    expect(cadena).toEqual(["rama A.1", "rama A", "raíz"]);
  });

  it("historia se detiene sin bucles aunque haya ciclos", () => {
    expect(historia("no-existe")).toEqual([]);
  });

  it("comparar detecta añadidos, quitados y cambios de parámetro", () => {
    const g = genomaBase();
    const a = crearVersion(g, "a", "");
    const modificada = genomaConCambio();
    const sinUno = modificada.nodos.filter((n) => n.id !== "cap-avatar");
    const genomaB: Genoma = {
      ...modificada,
      nodos: [
        ...sinUno,
        {
          id: "cap-holograma",
          capa: "capacidad",
          nombre: "Holograma",
          descripcion: "Proyección volumétrica.",
          parametros: { resolucion: 1024 },
          enlaces: [],
          medio: "imagen",
          origen: "usuario",
        },
      ],
    };
    const b = crearVersion(genomaB, "b", "");
    const diff = compararVersiones(a, b);
    expect(diff.añadidos.map((n) => n.id)).toEqual(["cap-holograma"]);
    expect(diff.quitados.map((n) => n.id)).toEqual(["cap-avatar"]);
    const cambio = diff.cambiados.find(
      (c) => c.nodo === "cre-temperatura" && c.campo === "valor",
    );
    expect(cambio).toBeDefined();
    expect(cambio!.antes).toBe(0.8);
    expect(cambio!.despues).toBe(1.2);
  });

  it("promoverAlOS no lanza si la versión no existe", () => {
    expect(promoverAlOS("no-existe")).toBeNull();
  });

  it("promoverAlOS devuelve un plan y avisa al tocar el núcleo", () => {
    const g = genomaBase();
    const v = crearVersion(g, "núcleo tocado", "");
    const plan = promoverAlOS(v.id)!;
    expect(plan.cambios.length).toBeGreaterThan(0);
    const tocaNucleo = plan.cambios.some((c) => c.sistema === "laboratorio.nucleo");
    expect(tocaNucleo).toBe(true);
    expect(plan.avisos.length).toBeGreaterThan(0);
    expect(plan.avisos.some((a) => a.includes("Núcleo"))).toBe(true);
  });
});
