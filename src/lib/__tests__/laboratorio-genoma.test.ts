import { describe, it, expect, beforeEach } from "vitest";
import {
  CAPAS,
  genomaBase,
  guardarGenoma,
  cargarGenomas,
  duplicarGenoma,
  borrarGenoma,
  nodosDeCapa,
  enlacesDe,
  validarGenoma,
  type CapaId,
  type Genoma,
} from "../laboratorio/genoma";

// Mock mínimo de localStorage (vitest corre en entorno node).
class LocalStorageFalso {
  private datos = new Map<string, string>();
  getItem(k: string): string | null { return this.datos.get(k) ?? null; }
  setItem(k: string, v: string): void { this.datos.set(k, v); }
  removeItem(k: string): void { this.datos.delete(k); }
  clear(): void { this.datos.clear(); }
}
(globalThis as unknown as { localStorage: LocalStorageFalso }).localStorage =
  new LocalStorageFalso();

const ALMACEN = "starseed.laboratorio.genomas.v1";

beforeEach(() => {
  localStorage.clear();
});

describe("genoma base", () => {
  it("valida sin errores", () => {
    const g = genomaBase();
    const resultado = validarGenoma(g);
    expect(resultado.valido).toBe(true);
    expect(resultado.errores).toHaveLength(0);
  });

  it("puebla las nueve capas y tiene al menos 30 nodos", () => {
    const g = genomaBase();
    expect(g.nodos.length).toBeGreaterThanOrEqual(30);
    const capas = Object.keys(CAPAS) as CapaId[];
    expect(capas).toHaveLength(9);
    for (const capa of capas) {
      expect(nodosDeCapa(g, capa).length).toBeGreaterThan(0);
    }
  });

  it("todos los enlaces apuntan a nodos existentes", () => {
    const g = genomaBase();
    const ids = new Set(g.nodos.map((n) => n.id));
    for (const n of g.nodos) {
      for (const destino of n.enlaces) {
        expect(ids.has(destino)).toBe(true);
      }
    }
  });
});

describe("utilidades", () => {
  it("enlacesDe resuelve los nodos enlazados", () => {
    const g = genomaBase();
    const enlazados = enlacesDe(g, "ins-no-agotar");
    expect(enlazados.map((n) => n.id)).toContain("int-relevo-429");
  });

  it("duplicar crea un id nuevo sin tocar el original", () => {
    const g = genomaBase();
    guardarGenoma(g);
    const copia = duplicarGenoma(g.id, "Copia de prueba");
    expect(copia).not.toBeNull();
    expect(copia!.id).not.toBe(g.id);
    expect(copia!.nombre).toBe("Copia de prueba");
    const cargados = cargarGenomas();
    const original = cargados.find((x) => x.id === g.id);
    expect(original?.nombre).toBe(g.nombre);
  });

  it("borrar elimina el genoma", () => {
    const g: Genoma = { ...genomaBase(), id: "genoma-efimero", nombre: "Efímero" };
    guardarGenoma(g);
    expect(borrarGenoma(g.id)).toBe(true);
    expect(cargarGenomas().find((x) => x.id === g.id)).toBeUndefined();
  });

  it("tolera JSON roto en localStorage", () => {
    localStorage.setItem(ALMACEN, "{roto");
    const cargados = cargarGenomas();
    expect(cargados.length).toBe(1);
    expect(cargados[0].id).toBe("genoma-base");
  });
});

describe("validarGenoma", () => {
  function clon(): Genoma {
    return JSON.parse(JSON.stringify(genomaBase())) as Genoma;
  }

  it("detecta un enlace roto", () => {
    const g = clon();
    g.nodos[0].enlaces = ["no-existe"];
    const r = validarGenoma(g);
    expect(r.valido).toBe(false);
    expect(r.errores.some((e) => e.includes("no-existe"))).toBe(true);
  });

  it("detecta un id repetido", () => {
    const g = clon();
    g.nodos.push({ ...g.nodos[0] });
    const r = validarGenoma(g);
    expect(r.valido).toBe(false);
    expect(r.errores.some((e) => e.includes("Id repetido"))).toBe(true);
  });

  it("avisa al tocar una capa casi inmutable", () => {
    const g = clon();
    g.nodos.find((n) => n.id === "nuc-cuantizacion")!.origen = "usuario";
    const r = validarGenoma(g);
    expect(r.avisos.some((a) => a.includes("nuc-cuantizacion"))).toBe(true);
  });
});
