/**
 * Pruebas de la propiedad de elementos por épocas (Ola 1025R · INF1025J).
 * Módulo PURO: nada de red, disco ni relojes. El azar del fuzzer sale de
 * mulberry32 con semilla fija: ni un solo Math.random, siempre el mismo
 * resultado en cualquier máquina.
 */
import { describe, it, expect } from "vitest";
import {
  aceptarEscritura,
  explicar,
  forzarTraspaso,
  fusionarPropiedades,
  puedeEscribir,
  reclamar,
  traspasar,
  type Propiedades,
} from "../salas/propiedad-sala";
import type { Sala } from "../salas/sala";

/** PRNG determinista (semilla fija): el mismo tren de números siempre. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDS = ["av-1", "ficha-2", "widget-3", "avatar-4", "pieza-5", "nota-6", "sello-7", "reloj-8"];
const GENTE = ["ana", "bruno", "caro", "dina", "eva"];

/** Mapa de propiedad al azar (determinista con la semilla). */
function mapaAlAzar(azar: () => number): Propiedades {
  const m: Propiedades = {};
  for (const id of IDS) {
    if (azar() < 0.25) continue;
    m[id] = { dueno: GENTE[Math.floor(azar() * GENTE.length)], epoca: 1 + Math.floor(azar() * 4) };
  }
  return m;
}

function salaDe(miembros: Sala["miembros"]): Sala {
  return {
    id: "sala-prueba",
    tipo: "escena3d",
    titulo: "Sala de pruebas",
    visibilidad: "privada",
    transporte: "servidor-privado",
    miembros,
    creadaEn: 1_757_000_000_000,
  };
}

describe("fusionarPropiedades · fuzzer con semilla fija", () => {
  it("es conmutativa e idempotente en 200 casos", () => {
    const azar = mulberry32(1025);
    for (let i = 0; i < 200; i++) {
      const a = mapaAlAzar(azar);
      const b = mapaAlAzar(azar);
      const ab = fusionarPropiedades(a, b);
      const ba = fusionarPropiedades(b, a);
      expect(ab.resultado).toEqual(ba.resultado);
      expect(ab.conflictos).toEqual(ba.conflictos);
      // Idempotencia: fusionar el resultado consigo mismo no cambia nada.
      const ida = fusionarPropiedades(ab.resultado, ab.resultado);
      expect(ida.resultado).toEqual(ab.resultado);
      expect(ida.conflictos).toEqual([]);
      // Fusionar con un mapa vacío tampoco cambia nada, en ningún orden.
      expect(fusionarPropiedades(a, {}).resultado).toEqual(a);
      expect(fusionarPropiedades({}, a).resultado).toEqual(a);
    }
  });

  it("a igual época gana el dueño menor alfabéticamente, en ambos órdenes", () => {
    const a: Propiedades = { pieza: { dueno: "bruno", epoca: 2 } };
    const b: Propiedades = { pieza: { dueno: "ana", epoca: 2 } };
    const ab = fusionarPropiedades(a, b);
    const ba = fusionarPropiedades(b, a);
    expect(ab.resultado.pieza.dueno).toBe("ana");
    expect(ba.resultado.pieza).toEqual(ab.resultado.pieza);
    expect(ab.conflictos).toEqual(ba.conflictos);
    expect(ab.conflictos.map((c) => c.id)).toEqual(["pieza"]);
    expect(ab.conflictos[0].duenos).toEqual(["ana", "bruno"]);
    expect(ab.conflictos[0].ganador).toBe("ana");
  });

  it("gana la época mayor, venga del mapa que venga", () => {
    const viejo: Propiedades = { ficha: { dueno: "ana", epoca: 1 } };
    const nuevo: Propiedades = { ficha: { dueno: "bruno", epoca: 3 } };
    const ab = fusionarPropiedades(viejo, nuevo);
    const ba = fusionarPropiedades(nuevo, viejo);
    expect(ab.resultado.ficha).toEqual({ dueno: "bruno", epoca: 3 });
    expect(ba.resultado.ficha).toEqual({ dueno: "bruno", epoca: 3 });
  });
});

describe("reclamar y traspasar", () => {
  it("reclamar: sin dueño pasa a quien lo pide con época 1; con dueño no cambia", () => {
    const p = reclamar({}, "av-1", "ana");
    expect(p["av-1"]).toEqual({ dueno: "ana", epoca: 1 });
    const tras = reclamar(p, "av-1", "bruno");
    expect(tras["av-1"]).toEqual({ dueno: "ana", epoca: 1 });
    expect(p["av-1"].dueno).toBe("ana"); // el mapa original no se tocó
  });

  it("traspasar: sólo el dueño puede ceder, y ceder sube la época en 1", () => {
    const p: Propiedades = { ficha: { dueno: "ana", epoca: 2 } };
    expect(traspasar(p, "ficha", "bruno", "caro").ficha).toEqual({ dueno: "ana", epoca: 2 });
    expect(traspasar(p, "otra", "ana", "caro").otra).toBeUndefined();
    const dado = traspasar(p, "ficha", "ana", "caro");
    expect(dado.ficha).toEqual({ dueno: "caro", epoca: 3 });
    expect(p.ficha).toEqual({ dueno: "ana", epoca: 2 }); // inmutable
  });
});

describe("aceptarEscritura", () => {
  const p: Propiedades = { ficha: { dueno: "ana", epoca: 3 } };
  it("acepta al dueño con la época al día", () => {
    expect(aceptarEscritura(p, "ficha", "ana", 3)).toEqual({ ok: true });
  });
  it("rechaza a quien no es dueño", () => {
    expect(aceptarEscritura(p, "ficha", "bruno", 3)).toEqual({ ok: false, motivo: "no-es-dueno" });
  });
  it("rechaza una época vieja aunque sea el dueño", () => {
    expect(aceptarEscritura(p, "ficha", "ana", 2)).toEqual({ ok: false, motivo: "epoca-vieja" });
  });
  it("rechaza escribir una pieza que nadie reclamó: primero se reclama", () => {
    expect(aceptarEscritura(p, "avatar", "ana", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
  });
});

describe("explicar · mensajes en claro y sin tecnicismos", () => {
  const PROHIBIDOS = [
    "lock", "mutex", "epoch", "merge", "conflicto", "write", "owner", "claim",
    "sync", "token", "undefined", "null", "409", "error", "versión", "cashtag",
  ];
  it("cada motivo da una frase clara, y la del dueño lleva su nombre", () => {
    const frases = [explicar("sin-dueno"), explicar("no-es-dueno", "Ana"), explicar("epoca-vieja")];
    for (const frase of frases) {
      expect(frase.length).toBeGreaterThan(0);
      for (const t of PROHIBIDOS) expect(frase.toLowerCase()).not.toContain(t);
    }
    const ajeno = explicar("no-es-dueno", "Ana");
    expect(ajeno).toContain("Ana");
    expect(ajeno).toContain("pídesela");
  });
  it("sin nombre de dueño también se explica bien", () => {
    expect(explicar("no-es-dueno")).toContain("otra persona");
  });
});

describe("puedeEscribir · rol + propiedad", () => {
  const s = salaDe({ ana: "dueno", bruno: "editor", caro: "comentarista", eva: "observador" });
  const p: Propiedades = { ficha: { dueno: "bruno", epoca: 1 }, ajena: { dueno: "ana", epoca: 1 } };

  it("un editor escribe lo suyo o lo que nadie reclamó", () => {
    expect(puedeEscribir(s, "bruno", p, "ficha")).toBe(true); // suyo
    expect(puedeEscribir(s, "bruno", p, "avatar")).toBe(true); // libre
    expect(puedeEscribir(s, "bruno", p, "ajena")).toBe(false); // de ana
  });

  it("quien no edita no escribe nada, ni siquiera lo libre", () => {
    expect(puedeEscribir(s, "caro", p, "avatar")).toBe(false);
    expect(puedeEscribir(s, "eva", p, "ficha")).toBe(false);
    expect(puedeEscribir(s, "desconocida", p, "avatar")).toBe(false);
  });

  it("el dueño de la sala escribe lo libre, pero no lo de otro", () => {
    expect(puedeEscribir(s, "ana", p, "avatar")).toBe(true);
    expect(puedeEscribir(s, "ana", p, "ficha")).toBe(false);
  });
});

describe("forzarTraspaso · sólo el dueño de la sala", () => {
  const s = salaDe({ ana: "dueno", bruno: "editor", caro: "comentarista" });
  const p: Propiedades = { ficha: { dueno: "bruno", epoca: 1 } };

  it("el dueño de la sala lo hace y el resultado registra quién y a quién", () => {
    const hecho = forzarTraspaso(s, "ana", p, "ficha", "caro");
    expect(hecho.hecho).toBe(true);
    expect(hecho.forzadoPor).toBe("ana");
    expect(hecho.dadoA).toBe("caro");
    expect(hecho.propiedades.ficha).toEqual({ dueno: "caro", epoca: 2 });
    expect(p.ficha).toEqual({ dueno: "bruno", epoca: 1 }); // inmutable
  });

  it("un editor o un comentarista no pueden forzar", () => {
    for (const quien of ["bruno", "caro"]) {
      const r = forzarTraspaso(s, quien, p, "ficha", "caro");
      expect(r.hecho).toBe(false);
      expect(r.propiedades.ficha).toEqual({ dueno: "bruno", epoca: 1 });
    }
  });

  it("un elemento libre se asigna y nace con época 1", () => {
    const r = forzarTraspaso(s, "ana", p, "avatar", "bruno");
    expect(r.hecho).toBe(true);
    expect(r.propiedades.avatar).toEqual({ dueno: "bruno", epoca: 1 });
  });
});
