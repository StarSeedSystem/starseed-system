/**
 * Pruebas de la propiedad de elementos por épocas (Ola 1025R · INF1025J).
 * Sólo funciones puras: nada de red, disco ni relojes; en este repositorio
 * vitest corre con `globals: false`, así que se importa todo de "vitest".
 * La semilla del fuzz es fija (mulberry32): prohibido `Math.random`.
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

/** PRNG mulberry32 con semilla fija: determinista en cualquier máquina. */
function mulberry32(semilla: number): () => number {
  let t = semilla >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function salaDe(roles: Record<string, Sala["miembros"][string]>): Sala {
  return {
    id: "sala-agora",
    tipo: "pizarra",
    titulo: "Agora",
    visibilidad: "grupo",
    transporte: "servidor-privado",
    miembros: roles,
    creadaEn: 1_757_000_000_000,
  };
}

/* ── Cuerpo de los tests: se completa a continuación ── */

describe("reclamar y traspasar", () => {
  const sala = salaDe({ ana: "dueno", bruno: "editor" });

  it("un elemento libre pasa al que lo reclama, con época 1", () => {
    const p = reclamar({}, "avatar-1", "ana");
    expect(p["avatar-1"]).toEqual({ dueno: "ana", epoca: 1 });
  });

  it("reclamar lo que ya es de otra persona no cambia nada", () => {
    const p: Propiedades = { "avatar-1": { dueno: "bruno", epoca: 3 } };
    const tras = reclamar(p, "avatar-1", "ana");
    expect(tras["avatar-1"]).toEqual({ dueno: "bruno", epoca: 3 });
  });

  it("traspasar cambia el dueño y SUBE la época en 1", () => {
    const p: Propiedades = { "ficha-juego": { dueno: "bruno", epoca: 2 } };
    const tras = traspasar(p, "ficha-juego", "bruno", "ana");
    expect(tras["ficha-juego"]).toEqual({ dueno: "ana", epoca: 3 });
  });

  it("sólo el dueño actual puede traspasar: si no lo es, no pasa nada", () => {
    const p: Propiedades = { "ficha-juego": { dueno: "bruno", epoca: 2 } };
    expect(traspasar(p, "ficha-juego", "ana", "bruno")["ficha-juego"].dueno).toBe("bruno");
    expect(traspasar(p, "ficha-juego", "ana", "bruno")["ficha-juego"].epoca).toBe(2);
    expect(traspasar({}, "ficha-juego", "ana", "bruno")["ficha-juego"]).toBeUndefined();
  });

  it("los mapas recibidos quedan intactos (inmutabilidad)", () => {
    const original: Propiedades = { "avatar-1": { dueno: "bruno", epoca: 2 } };
    const copia = JSON.parse(JSON.stringify(original)) as Propiedades;
    reclamar(original, "avatar-1", "ana");
    traspasar(original, "avatar-1", "bruno", "ana");
    expect(original).toEqual(copia);
  });
});

describe("aceptarEscritura · épocas", () => {
  const p: Propiedades = { "ficha-juego": { dueno: "bruno", epoca: 4 } };

  it("el dueño con la época que él vio escribe sin problema", () => {
    expect(aceptarEscritura(p, "ficha-juego", "bruno", 4)).toEqual({ ok: true });
  });

  it("una época vieja se rechaza: quien la mandó miraba atrás", () => {
    expect(aceptarEscritura(p, "ficha-juego", "bruno", 3)).toEqual({
      ok: false,
      motivo: "epoca-vieja",
    });
  });

  it("sin dueño no hay escritura: primero se reclama la pieza", () => {
    expect(aceptarEscritura({}, "nueva", "ana", 1)).toEqual({
      ok: false,
      motivo: "sin-dueno",
    });
  });

  it("escribir lo que otra persona reclamó no entra: pídesela", () => {
    expect(aceptarEscritura(p, "ficha-juego", "ana", 4)).toEqual({
      ok: false,
      motivo: "no-es-dueno",
    });
  });

  it("adelantarse a la época conocida no se castiga: no mira atrás", () => {
    expect(aceptarEscritura(p, "ficha-juego", "bruno", 9)).toEqual({ ok: true });
  });
});

describe("explicar · español sin tecnicismos", () => {
  it("dice quién tiene la pieza y pide pedírsela con su nombre", () => {
    const frase = explicar("no-es-dueno", "Ana");
    expect(frase).toBe("Esa pieza la tiene Ana; pídesela.");
  });

  it("sin nombre dice igual que la pieza es de otra persona", () => {
    const frase = explicar("no-es-dueno");
    expect(frase).toContain("otra persona");
    expect(frase).toContain("pídesela");
  });

  it("los tres avisos hablan de piezas, nunca de épocas ni mapas", () => {
    for (const frase of [explicar("sin-dueno"), explicar("no-es-dueno"), explicar("epoca-vieja", "Ana")]) {
      expect(frase).not.toContain("época");
      expect(frase).not.toContain("epoca");
      expect(frase).not.toContain("mapa");
      expect(frase).not.toContain("propiedad");
      expect(frase).not.toContain("sincron");
    }
  });
});

describe("fusionarPropiedades · determinismo", () => {
  it("gana la época mayor, venga del mapa que venga", () => {
    const a: Propiedades = { w: { dueno: "Bruno", epoca: 2 } };
    const b: Propiedades = { w: { dueno: "ana", epoca: 7 } };
    expect(fusionarPropiedades(a, b).resultado.w.dueno).toBe("ana");
    expect(fusionarPropiedades(b, a).resultado.w.dueno).toBe("ana");
  });

  it("empate de época y distinto dueño: gana el dueño menor, en ambos órdenes", () => {
    const a: Propiedades = { w: { dueno: "Bruno", epoca: 5 } };
    const b: Propiedades = { w: { dueno: "ana", epoca: 5 } };
    expect(fusionarPropiedades(a, b).resultado.w.dueno).toBe("Bruno");
    expect(fusionarPropiedades(b, a).resultado.w.dueno).toBe("Bruno");
  });

  it("lo idéntico no es conflicto; lo distinto sí, y ordenado", () => {
    const a: Propiedades = { w: { dueno: "ana", epoca: 1 }, x: { dueno: "ana", epoca: 1 } };
    const b: Propiedades = { w: { dueno: "ana", epoca: 1 }, x: { dueno: "bruno", epoca: 2 } };
    const { conflictos } = fusionarPropiedades(a, b);
    expect(conflictos).toEqual(["x"]);
  });
});

describe("fusionarPropiedades · fuzz con semilla fija (mulberry32)", () => {
  const AZAR = mulberry32(10251_2026 >>> 0);
  const DUEÑOS = ["Bruno", "Cleo", "ana", "zoraida"];
  const IDS = ["a1", "a2", "b1", "nuevo-x", "nuevo-y"];

  function mapaAlAzar(): Propiedades {
    const mapa: Propiedades = {};
    const vivos = Math.floor(AZAR() * IDS.length) + 1;
    for (let i = 0; i < vivos; i += 1) {
      const id = IDS[Math.floor(AZAR() * IDS.length)];
      mapa[id] = { dueno: DUEÑOS[Math.floor(AZAR() * DUEÑOS.length)], epoca: Math.floor(AZAR() * 6) };
    }
    return mapa;
  }

  it("200 casos: conmutativa, idempotente y con el mismo veredicto en sus dos órdenes", () => {
    for (let caso = 0; caso < 200; caso += 1) {
      const a = mapaAlAzar();
      const b = mapaAlAzar();

      const ab = fusionarPropiedades(a, b);
      const ba = fusionarPropiedades(b, a);

      expect(ab.resultado).toEqual(ba.resultado);
      expect(ab.conflictos).toEqual(ba.conflictos);

      // Idempotencia: fusionar otra vez con lo ya fusionado no mueve nada.
      const yIdempotente = fusionarPropiedades(b, ab.resultado);
      expect(yIdempotente.resultado).toEqual(ab.resultado);
    }
  });
});

describe("puedeEscribir · rol + propiedad", () => {
  const sala = salaDe({ ana: "dueno", bruno: "editor", cleo: "comentarista" });
  const p: Propiedades = {
    "avatar-ana": { dueno: "bruno", epoca: 2 },
    "avatar-nadie": { dueno: "cleo", epoca: 1 },
  };

  it("sin rol de editor no hay escritura, tenga o no dueño la pieza", () => {
    expect(puedeEscribir(sala, "cleo", {}, "libre")).toBe(false);
    expect(puedeEscribir(sala, "dania", {}, "libre")).toBe(false);
  });

  it("un editor escribe lo que nadie reclamó", () => {
    expect(puedeEscribir(sala, "bruno", {}, "libre")).toBe(true);
  });

  it("un editor escribe lo suyo, pero lo ajeno reclamado no lo toca", () => {
    expect(puedeEscribir(sala, "bruno", p, "avatar-ana")).toBe(true);
    expect(puedeEscribir(sala, "ana", p, "avatar-ana")).toBe(false);
  });

  it("el dueño de la sala no escribe encima de lo reclamado por otro", () => {
    expect(puedeEscribir(sala, "ana", p, "avatar-nadie")).toBe(false);
    expect(puedeEscribir(sala, "cleo", {}, "avatar-nadie")).toBe(false);
  });
});

describe("forzarTraspaso · sólo dueño de la sala", () => {
  const sala = salaDe({ ana: "dueno", bruno: "editor", cleo: "editor" });

  it("un editor no fuerza cesiones, aunque sea dueño de la pieza", () => {
    const p: Propiedades = { w: { dueno: "bruno", epoca: 3 } };
    const r = forzarTraspaso(sala, "bruno", p, "w", "cleo");
    expect(r.ok).toBe(false);
    expect(r.propiedades["w"]).toEqual({ dueno: "bruno", epoca: 3 });
    expect(r.registro).toBeUndefined();
  });

  it("el dueño de la sala forza la cesión: sube la época y deja registro", () => {
    const p: Propiedades = { w: { dueno: "bruno", epoca: 3 } };
    const r = forzarTraspaso(sala, "ana", p, "w", "cleo");
    expect(r.ok).toBe(true);
    expect(r.propiedades["w"]).toEqual({ dueno: "cleo", epoca: 4 });
    expect(r.registro).toEqual({ porQuien: "ana", a: "cleo", epocaNueva: 4 });
  });

  it("forzar sobre una pieza libre se la asigna con época 1", () => {
    const r = forzarTraspaso(sala, "ana", {}, "w", "cleo");
    expect(r.ok).toBe(true);
    expect(r.propiedades["w"]).toEqual({ dueno: "cleo", epoca: 1 });
    expect(r.registro).toEqual({ porQuien: "ana", a: "cleo", epocaNueva: 1 });
  });

  it("el mapa original queda intacto siempre", () => {
    const original: Propiedades = { w: { dueno: "bruno", epoca: 3 } };
    forzarTraspaso(sala, "ana", original, "w", "cleo");
    expect(original["w"]).toEqual({ dueno: "bruno", epoca: 3 });
  });
});
