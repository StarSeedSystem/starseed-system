import { describe, it, expect } from "vitest";
import {
  reclamar,
  traspasar,
  aceptarEscritura,
  explicar,
  fusionarPropiedades,
  puedeEscribir,
  forzarTraspaso,
  type Propiedades,
} from "../salas/propiedad-sala";
import type { Sala } from "../salas/sala";

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crearSala(miembros: Record<string, "dueno" | "editor" | "comentarista" | "observador">): Sala {
  return {
    id: "s1",
    tipo: "pizarra",
    titulo: "Sala",
    visibilidad: "privada",
    transporte: "local",
    miembros,
    creadaEn: 1,
  };
}

function generarPropiedadesAleatorias(seed: number, count: number): { a: Propiedades; b: Propiedades } {
  const rng = mulberry32(seed);
  const a: Propiedades = {};
  const b: Propiedades = {};
  const ids = ["e1", "e2", "e3", "e4", "e5"];
  const duenos = ["ana", "bea", "carl", "dani"];
  for (let i = 0; i < count; i++) {
    const id = ids[Math.floor(rng() * ids.length)];
    const dueno = duenos[Math.floor(rng() * duenos.length)];
    const epoca = Math.floor(rng() * 5) + 1;
    if (i % 2 === 0) {
      a[id] = { dueno, epoca };
    } else {
      b[id] = { dueno, epoca };
    }
  }
  return { a, b };
}

describe("propiedad-sala", () => {
  it("reclamar pone dueño con época 1", () => {
    const p: Propiedades = {};
    const p2 = reclamar(p, "e1", "ana");
    expect(p2).toEqual({ e1: { dueno: "ana", epoca: 1 } });
    expect(p).toEqual({});
  });

  it("traspasar solo si es dueño y sube época", () => {
    const p = reclamar({}, "e1", "ana");
    const p2 = traspasar(p, "e1", "ana", "bea");
    expect(p2).toEqual({ e1: { dueno: "bea", epoca: 2 } });
    expect(traspasar(p, "e1", "carl", "bea")).toEqual(p);
  });

  it("época vieja rechazada", () => {
    const p = traspasar(reclamar({}, "e1", "ana"), "e1", "ana", "bea");
    expect(aceptarEscritura(p, "e1", "bea", 1)).toEqual({ ok: false, motivo: "epoca-vieja" });
    expect(aceptarEscritura(p, "e1", "bea", 2)).toEqual({ ok: true });
    expect(aceptarEscritura(p, "e1", "carl", 2)).toEqual({ ok: false, motivo: "no-es-dueno" });
    expect(aceptarEscritura({}, "e1", "ana", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
  });

  it("explicar en español sin tecnicismos", () => {
    expect(explicar("sin-dueno")).toContain("reclama");
    expect(explicar("no-es-dueno", "Ana")).toContain("Ana");
    expect(explicar("epoca-vieja", "Ana")).toContain("Ana");
  });

  it("fusionarPropiedades conmutativa e idempotente con 200 casos", () => {
    for (let seed = 0; seed < 200; seed++) {
      const { a, b } = generarPropiedadesAleatorias(seed, 50);
      const f1 = fusionarPropiedades(a, b);
      const f2 = fusionarPropiedades(b, a);
      expect(f1.propiedades).toEqual(f2.propiedades);
      const f3 = fusionarPropiedades(a, a);
      expect(f3.propiedades).toEqual(a);
      expect(f3.conflictos).toEqual([]);
    }
  });

  it("empate de época resuelto igual en ambos órdenes", () => {
    const a: Propiedades = { e1: { dueno: "bea", epoca: 2 } };
    const b: Propiedades = { e1: { dueno: "ana", epoca: 2 } };
    const f1 = fusionarPropiedades(a, b);
    const f2 = fusionarPropiedades(b, a);
    expect(f1.propiedades).toEqual(f2.propiedades);
    expect(f1.propiedades.e1.dueno).toBe("ana");
  });

  it("forzarTraspaso solo del dueño de la sala", () => {
    const sala = crearSala({ ana: "dueno", bea: "editor" });
    const p = reclamar({}, "e1", "bea");
    expect(forzarTraspaso(sala, "bea", p, "e1", "carl")).toBeNull();
    const res = forzarTraspaso(sala, "ana", p, "e1", "carl");
    expect(res?.propiedades.e1.dueno).toBe("carl");
    expect(res?.registro.forzadoPor).toBe("ana");
    expect(res?.registro.dadoA).toBe("carl");
    expect(res?.registro.elementoId).toBe("e1");
  });

  it("puedeEscribir: editor escribe lo suyo o lo que nadie reclamó", () => {
    const sala = crearSala({ ana: "editor", bea: "editor" });
    expect(puedeEscribir(sala, "ana", {}, "e1")).toBe(true);
    const p = reclamar({}, "e1", "ana");
    expect(puedeEscribir(sala, "bea", p, "e1")).toBe(false);
    expect(puedeEscribir(sala, "ana", p, "e1")).toBe(true);
  });
});
