/* Pruebas de la propiedad por épocas de las salas (Ola 1025R · INF1025J): todo
 * local, sin Math.random — el azar sale de mulberry32 con semilla fija. */
import { describe, it, expect } from "vitest";
import {
  aceptarEscritura, explicar, forzarTraspaso, fusionarPropiedades, puedeEscribir,
  reclamar, traspasar, type Propiedades,
} from "../salas/propiedad-sala";
import type { Sala } from "../salas/sala";

function mulberry32(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado += 0x6d2b79f5;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDS = ["avatar-1", "ficha-2", "widget-3", "objeto-4"];
const GENTE = ["ana", "bruno", "caro", "dana"];

/** Mapa al azar: cada elemento existe 3 de cada 4 veces, quien y con qué época. */
function mapaDeAzar(rng: () => number): Propiedades {
  const mapa: Propiedades = {};
  for (const id of IDS) {
    if (rng() < 0.25) continue;
    mapa[id] = { dueno: GENTE[Math.floor(rng() * GENTE.length)], epoca: 1 + Math.floor(rng() * 4) };
  }
  return mapa;
}
/** Sala de pruebas: Ana dueña, Bruno editor, Caro observador, Dana fuera. */function salaDePruebas(): Sala {
  return {
    id: "sala-acuerdo", tipo: "escena3d", titulo: "Sala de acuerdo", visibilidad: "privada",
    transporte: "servidor-privado", miembros: { ana: "dueno", bruno: "editor", caro: "observador" },
    creadaEn: 0,
  };
}

describe("fusionarPropiedades (fuzzing, 200 casos con semilla fija)", () => {
  it("conmutativa e idempotente en los 200 casos", () => {
    const tirada = mulberry32(1025);
    for (let i = 0; i < 200; i++) {
      const a = mapaDeAzar(tirada);
      const b = mapaDeAzar(tirada);
      expect(fusionarPropiedades(a, b)).toEqual(fusionarPropiedades(b, a));
      expect(fusionarPropiedades(a, a)).toEqual({ propiedades: a, conflictos: [] });
    }
  });

  it("empate de época con dueños distintos: menor alfabético, igual en ambos órdenes", () => {
    const a: Propiedades = { p: { dueno: "zoe", epoca: 3 } };
    const b: Propiedades = { p: { dueno: "adam", epoca: 3 } };
    expect(fusionarPropiedades(a, b).propiedades.p).toEqual({ dueno: "adam", epoca: 3 });
    expect(fusionarPropiedades(b, a).propiedades.p).toEqual({ dueno: "adam", epoca: 3 });
    expect(fusionarPropiedades(a, b).conflictos).toEqual(["p"]);
  });

  it("gana la época mayor, aunque la traiga cualquiera de las dos vistas", () => {
    const a: Propiedades = { p: { dueno: "bruno", epoca: 7 }, "solo-a": { dueno: "ana", epoca: 1 } };
    const b: Propiedades = { p: { dueno: "ana", epoca: 2 } };
    expect(fusionarPropiedades(b, a).propiedades.p.dueno).toBe("bruno");
    expect(Object.keys(fusionarPropiedades(a, b).propiedades).sort()).toEqual(["p", "solo-a"]);
  });
});

describe("reclamar, traspasar y escritura", () => {
  it("reclamar da época 1 a quien no tenía dueño; si ya lo tiene, no cambia", () => {
    expect(reclamar({}, "avatar-1", "bruno")["avatar-1"]).toEqual({ dueno: "bruno", epoca: 1 });
    const yaDeAna: Propiedades = { "avatar-1": { dueno: "ana", epoca: 2 } };
    expect(reclamar(yaDeAna, "avatar-1", "caro")).toEqual(yaDeAna);
  });

  it("traspasar sólo lo hace el dueño, y ceder sube la época en 1", () => {
    const inicio = reclamar({}, "avatar-1", "ana");
    expect(traspasar(inicio, "avatar-1", "bruno", "caro")["avatar-1"]).toEqual({ dueno: "ana", epoca: 1 });
    expect(traspasar(inicio, "avatar-1", "ana", "caro")["avatar-1"]).toEqual({ dueno: "caro", epoca: 2 });
    expect(inicio["avatar-1"]).toEqual({ dueno: "ana", epoca: 1 });
  });

  it("sin dueño, dueño ajeno o época vieja se rechaza; el dueño al día pasa", () => {
    const deBruno: Propiedades = { "ficha-2": { dueno: "bruno", epoca: 2 } };
    expect(aceptarEscritura({}, "ficha-2", "ana", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
    expect(aceptarEscritura(deBruno, "ficha-2", "ana", 2)).toEqual({ ok: false, motivo: "no-es-dueno" });
    expect(aceptarEscritura(deBruno, "ficha-2", "bruno", 1)).toEqual({ ok: false, motivo: "epoca-vieja" });
    expect(aceptarEscritura(deBruno, "ficha-2", "bruno", 2)).toEqual({ ok: true });
  });

  it("los rechazos se explican en español, con nombres y sin tecnicismos", () => {
    const textos = [explicar("sin-dueno"), explicar("no-es-dueno", "Ana"), explicar("no-es-dueno"), explicar("epoca-vieja")];
    expect(explicar("no-es-dueno", "Ana")).toContain("pídesela");
    for (const texto of textos) {
      for (const prohibida of ["propiedad", "época", "epoch", "mapa", "hash"]) {
        expect(texto.toLowerCase()).not.toContain(prohibida);
      }
    }
  });
});
describe("puedeEscribir y forzarTraspaso", () => {
  const sala = salaDePruebas();

  it("un editor escribe lo suyo o lo sin reclamar; observador y ajeno no", () => {
    expect(puedeEscribir(sala, "bruno", reclamar({}, "avatar-1", "bruno"), "avatar-1")).toBe(true);
    expect(puedeEscribir(sala, "bruno", {}, "ficha-2")).toBe(true);
    expect(puedeEscribir(sala, "bruno", { "ficha-2": { dueno: "ana", epoca: 1 } }, "ficha-2")).toBe(false);
    expect(puedeEscribir(sala, "caro", {}, "ficha-2")).toBe(false);
    expect(puedeEscribir(sala, "dana", {}, "ficha-2")).toBe(false);
  });

  it("sólo el dueño de la sala fuerza el traspaso, con registro de quién y a quién", () => {
    const deBruno: Propiedades = { "avatar-1": { dueno: "bruno", epoca: 1 } };
    expect(forzarTraspaso(sala, "bruno", deBruno, "avatar-1", "caro")).toEqual({ propiedades: deBruno, registro: null });
    expect(forzarTraspaso(sala, "ana", deBruno, "avatar-1", "caro")).toEqual({
      propiedades: { "avatar-1": { dueno: "caro", epoca: 2 } },
      registro: { elementoId: "avatar-1", forzadoPor: "ana", dadoA: "caro", epoca: 2 },
    });
    expect(forzarTraspaso(sala, "ana", {}, "widget-3", "bruno").propiedades["widget-3"]).toEqual({ dueno: "bruno", epoca: 1 });
  });
});
