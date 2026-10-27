/*
 * StarSeed OS · Salas · Propiedad de actor por épocas (Ola 1025R).
 */

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
} from "@/lib/salas/propiedad-sala";
import type { Sala } from "@/lib/salas/sala";

function sala(cambios: Partial<Sala> = {}): Sala {
  return {
    id: "sala-1",
    tipo: "pizarra",
    titulo: "Sala",
    visibilidad: "privada",
    transporte: "local",
    miembros: {
      "dueno-1": "dueno",
      "editor-1": "editor",
      "observa-1": "observador",
    },
    creadaEn: 1_757_000_000_000,
    ...cambios,
  };
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("propiedad-sala · reclamar/traspasar", () => {
  it("reclamar pasa a quien con época 1; traspaso solo del dueño sube época", () => {
    let p: Propiedades = {};
    p = reclamar(p, "ficha-1", "ana");
    expect(p["ficha-1"]).toEqual({ dueno: "ana", epoca: 1 });
    p = traspasar(p, "ficha-1", "ana", "bob");
    expect(p["ficha-1"]).toEqual({ dueno: "bob", epoca: 2 });
    p = traspasar(p, "ficha-1", "ana", "carlos");
    expect(p["ficha-1"]).toEqual({ dueno: "bob", epoca: 2 });
  });
});

describe("propiedad-sala · aceptarEscritura y explicar", () => {
  it("época vieja rechazada", () => {
    let p: Propiedades = {};
    p = reclamar(p, "pieza", "ana");
    p = traspasar(p, "pieza", "ana", "bob");
    const r = aceptarEscritura(p, "pieza", "bob", 1);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("epoca-vieja");
  });

  it("mensajes sin tecnicismos", () => {
    const m1 = explicar("sin-dueno");
    const m2 = explicar("no-es-dueno", "Ana");
    expect(m1).not.toMatch(/propiedad|época|epoch|owner/i);
    expect(m2).toContain("Ana");
    expect(m2).toMatch(/pídesela/i);
    expect(m2).not.toMatch(/propiedad|época|epoch|owner/i);
  });
});

describe("propiedad-sala · fusionarPropiedades", () => {
  it("conmutativa e idempotente con 200 casos de semilla fija", () => {
    const rnd = mulberry32(12345);
    for (let i = 0; i < 200; i++) {
      const ids = ["a", "b", "c", "d"];
      const owners = ["ana", "bob", "carlos", "dani"];
      const a: Propiedades = {};
      const b: Propiedades = {};
      for (const id of ids) {
        if (rnd() < 0.5) {
          a[id] = { dueno: owners[Math.floor(rnd() * owners.length)], epoca: Math.floor(rnd() * 5) + 1 };
        }
        if (rnd() < 0.5) {
          b[id] = { dueno: owners[Math.floor(rnd() * owners.length)], epoca: Math.floor(rnd() * 5) + 1 };
        }
      }
      const fa = fusionarPropiedades(a, b);
      const fb = fusionarPropiedades(b, a);
      expect(fa.propiedades).toEqual(fb.propiedades);
      const f2 = fusionarPropiedades(a, a);
      expect(f2.propiedades).toEqual(a);
    }
  });

  it("empate de época resuelto igual en ambos órdenes", () => {
    const a: Propiedades = { x: { dueno: "bob", epoca: 2 } };
    const b: Propiedades = { x: { dueno: "ana", epoca: 2 } };
    const fa = fusionarPropiedades(a, b);
    const fb = fusionarPropiedades(b, a);
    expect(fa.propiedades["x"].dueno).toBe("ana");
    expect(fb.propiedades["x"].dueno).toBe("ana");
  });
});

describe("propiedad-sala · puedeEscribir y forzarTraspaso", () => {
  it("un editor escribe lo suyo o lo que nadie reclamó", () => {
    const s = sala();
    let p: Propiedades = {};
    p = reclamar(p, "libre", "ana");
    expect(puedeEscribir(s, "editor-1", p, "libre")).toBe(false);
    expect(puedeEscribir(s, "editor-1", p, "sin-reclamar")).toBe(true);
  });

  it("forzarTraspaso solo del dueño de la sala y lleva registro", () => {
    const s = sala();
    let p: Propiedades = {};
    p = reclamar(p, "pieza", "editor-1");
    const res = forzarTraspaso(s, "editor-1", p, "pieza", "ana");
    expect(res).toBeNull();
    const res2 = forzarTraspaso(s, "dueno-1", p, "pieza", "ana");
    expect(res2).not.toBeNull();
    expect(res2!.registro.forzadoPor).toBe("dueno-1");
    expect(res2!.registro.dadoA).toBe("ana");
  });
});
