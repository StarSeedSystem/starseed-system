/**
 * Pruebas de la propiedad de elementos por épocas (Ola 1025R · INF1025J).
 * Módulo PURO: nada de red, disco ni relojes (vitest corre con `globals: false`).
 * El caso fortuito de `fusionarPropiedades` usa mulberry32 con semilla fija,
 * nunca `Math.random`, para que la misma prueba dé lo mismo en todas las
 * máquinas (método Co-op Anything: caja de caos con semilla).
 */
import { describe, it, expect } from "vitest";
import {
  aceptarEscritura,
  explicar,
  fusionarPropiedades,
  forzarTraspaso,
  puedeEscribir,
  reclamar,
  traspasar,
  type Propiedades,
} from "../salas/propiedad-sala";
import type { Sala } from "../salas/sala";

/** PRNG mulberry32, sin `Math.random` ni reloj del sistema. */
function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Genera un mapa de propiedades determinista a partir de un entero. */
function mapaAzar(rng: () => number): Propiedades {
  const mapa: Propiedades = {};
  const cuantos = 1 + Math.floor(rng() * 5);
  const ids = ["p1", "p2", "p3", "p4", "p5", "p6"].slice(0, Math.max(2, cuantos));
  for (const id of ids) {
    if (rng() < 0.15) continue; // a veces la pieza está sin dueño
    mapa[id] = {
      dueno: ["ana", "bruno", "carla"][Math.floor(rng() * 3)],
      epoca: Math.floor(rng() * 4),
    };
  }
  return mapa;
}

/** Sala de prueba: público, con dueño y un editor. */
function sala(): Sala {
  return {
    id: "sala-inf1025j",
    tipo: "escena3d",
    titulo: "Sala de prueba",
    visibilidad: "publica",
    transporte: "local",
    miembros: { ana: "dueno", bruno: "editor", carla: "comentarista" },
    creadaEn: 1_761_400_000_000,
  };
}

describe("reclamar y traspasar", () => {
  it("sólo se reclama una pieza sin dueño, y arranca en época 1", () => {
    expect(reclamar({}, "p1", "ana")).toEqual({ p1: { dueno: "ana", epoca: 1 } });
    // Si ya la tiene alguien, no se cambia a escondidas: eso es forzarTraspaso.
    const conDueño = reclamar({}, "p1", "ana");
    expect(reclamar(conDueño, "p1", "bruno").p1.dueno).toBe("ana");
  });

  it("sólo el dueño cede, y ceder sube la época", () => {
    const p = reclamar({}, "p1", "ana");
    expect(traspasar(p, "p1", "bruno", "carla")).toEqual(p);
    const cedida = traspasar(p, "p1", "ana", "bruno");
    expect(cedida.p1).toEqual({ dueno: "bruno", epoca: 2 });
    expect(Object.is(cedida, p)).toBe(false); // mapa nuevo, nunca mutación
  });
});

describe("aceptarEscritura", () => {
  it("acepta al dueño con su época al día y rechaza lo demás con su motivo", () => {
    const p = traspasar(reclamar({}, "p1", "ana"), "p1", "ana", "bruno");
    expect(aceptarEscritura(p, "p1", "bruno", 2)).toEqual({ ok: true });
    expect(aceptarEscritura(p, "p2", "bruno", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
    expect(aceptarEscritura(p, "p1", "ana", 2)).toEqual({ ok: false, motivo: "no-es-dueno" });
    expect(aceptarEscritura(p, "p1", "bruno", 1)).toEqual({ ok: false, motivo: "epoca-vieja" });
  });

  it("los motivos se explican en español y sin tecnicismos", () => {
    expect(explicar("sin-dueno")).toBe(
      "Nadie lleva todavía esa pieza: primero reclámala y después escribe en ella.",
    );
    expect(explicar("no-es-dueno", "Ana")).toBe("Esa pieza la tiene Ana: pídesela.");
    expect(explicar("no-es-dueno")).toBe("Esa pieza la tiene otra persona: pídesela.");
    expect(explicar("epoca-vieja")).toMatch(/cambió desde que la viste/);
    for (const frase of [
      explicar("sin-dueno"),
      explicar("no-es-dueno"),
      explicar("no-es-dueno", "Ana"),
      explicar("epoca-vieja"),
    ]) {
      expect(frase).not.toMatch(/época|propiedades|epoch|\bmapa\b|undefined|null/i);
    }
  });
});

describe("fusionarPropiedades · conmutatividad e idempotencia (200 casos con semilla fija)", () => {
  it("f(a,b) = f(b,a) y ademas f(f(a,b),a) = f(a,b), siempre", () => {
    const rng = mulberry32(1025);
    for (let i = 0; i < 200; i++) {
      const a = mapaAzar(rng);
      const b = mapaAzar(rng);
      const ab = fusionarPropiedades(a, b);
      const ba = fusionarPropiedades(b, a);
      expect(ab.propiedades).toEqual(ba.propiedades); // conmutativa
      expect(ab.conflictos).toEqual(ba.conflictos);
      const conA = fusionarPropiedades(ab.propiedades, a);
      const conB = fusionarPropiedades(ab.propiedades, b);
      expect(conA.propiedades).toEqual(ab.propiedades); // idempotente
      expect(conB.propiedades).toEqual(ab.propiedades);
      expect(Object.keys(ab.propiedades).sort()).toEqual(
        [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(),
      );
    }
  });

  it("gana la época mayor y, con empate de épocas, el dueño menor alfabéticamente", () => {
    const a = { p1: { dueno: "carla", epoca: 5 } };
    const b = { p1: { dueno: "bruno", epoca: 3 } };
    expect(fusionarPropiedades(a, b).propiedades.p1).toEqual({ dueno: "carla", epoca: 5 });
    const conEmpateA = { p1: { dueno: "carla", epoca: 2 } };
    const conEmpateB = { p1: { dueno: "bruno", epoca: 2 } };
    const ida = fusionarPropiedades(conEmpateA, conEmpateB);
    const vuelta = fusionarPropiedades(conEmpateB, conEmpateA);
    expect(ida.propiedades.p1.dueno).toBe("bruno"); // «bruno» < «carla»
    expect(vuelta.propiedades.p1.dueno).toBe("bruno"); // el orden no manda
    expect(ida.conflictos).toEqual(["p1"]);
    expect(vuelta.conflictos).toEqual(["p1"]);
  });

  it("las piezas con un solo dueño en cada copia se conservan sin disputa", () => {
    const { propiedades, conflictos } = fusionarPropiedades(
      { p1: { dueno: "ana", epoca: 1 } },
      { p2: { dueno: "bruno", epoca: 4 } },
    );
    expect(propiedades).toEqual({
      p1: { dueno: "ana", epoca: 1 },
      p2: { dueno: "bruno", epoca: 4 },
    });
    expect(conflictos).toEqual([]);
  });
});

describe("puedeEscribir · rol × propiedad", () => {
  it("un editor escribe lo suyo y lo libre; lo ajeno con dueño se pide, no se toma", () => {
    const s = sala();
    const p: Propiedades = {
      p1: { dueno: "bruno", epoca: 2 }, // suya
      p2: { dueno: "ana", epoca: 1 }, // ajena
    };
    expect(puedeEscribir(s, "bruno", p, "p1")).toBe(true); // suyo con su época
    expect(puedeEscribir(s, "bruno", p, "p3")).toBe(true); // nadie lo reclamó
    expect(puedeEscribir(s, "bruno", p, "p2")).toBe(false); // de Ana: se pide
    expect(puedeEscribir(s, "carla", p, "p3")).toBe(false); // comentarista mira
    expect(puedeEscribir(s, "cualquiera", p, "p3")).toBe(false); // no es miembro
  });
});

describe("forzarTraspaso · sólo el dueño de la sala", () => {
  it("el dueño de la sala desatasca, y el registro dice quién y a quién", () => {
    const s = sala();
    const p = reclamar({}, "p1", "bruno");
    const desatascado = forzarTraspaso(s, "ana", p, "p1", "carla");
    expect(desatascado.ok).toBe(true);
    expect(desatascado.propiedades.p1).toEqual({ dueno: "carla", epoca: 2 });
    expect(desatascado.registro).toContain("ana");
    expect(desatascado.registro).toContain("bruno");
    expect(desatascado.registro).toContain("carla");
  });

  it("nadie más que el dueño de la sala fuerza nada", () => {
    const s = sala();
    const p = reclamar({}, "p1", "bruno");
    expect(forzarTraspaso(s, "bruno", p, "p1", "carla").ok).toBe(false);
    expect(forzarTraspaso(s, "carla", p, "p1", "ana").ok).toBe(false);
    // Y una pieza que nadie reclamó no se puede forzar: reclamar basta.
    expect(forzarTraspaso(s, "ana", {}, "p2", "carla").ok).toBe(false);
  });
});
