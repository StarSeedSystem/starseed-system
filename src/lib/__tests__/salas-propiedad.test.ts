/**
 * Pruebas de la propiedad de elementos por épocas (Ola 1025R · INF1025J).
 * Fuzzer con SEMILLA FIJA (mulberry32, sin `Math.random`), como enseñan las
 * páginas de Co-op Anything: conmutatividad e idempotencia de la fusión +
 * casos puntuales de cada regla. Todo sobre el módulo PURO, sin red, disco ni
 * reloj (aquí vitest corre con `globals: false`).
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
  type RegistroTraspaso,
} from "../salas/propiedad-sala";
import type { RolSala, Sala } from "../salas/sala";

/** Generador determinista de Co-op Anything (mismo método, misma semilla). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DUEÑOS = ["ana", "bruno", "carla", "dina"] as const;
const IDS = ["e1", "e2", "e3", "e4"] as const;

/** Mapa de propiedades aleatorio y determinista (epóca entre 1 y 5). */
function mapaAleatorio(rand: () => number): Propiedades {
  const mapa: Propiedades = {};
  const cuantos = Math.floor(rand() * IDS.length) + 1;
  const usados = new Set<string>();
  while (usados.size < cuantos) {
    const id = IDS[Math.floor(rand() * IDS.length)];
    if (usados.has(id)) continue;
    usados.add(id);
    mapa[id] = {
      dueno: DUEÑOS[Math.floor(rand() * DUEÑOS.length)],
      epoca: Math.floor(rand() * 5) + 1,
    };
  }
  return mapa;
}

function salaDe(miembros: Record<string, RolSala>): Sala {
  return {
    id: "sala-prueba",
    tipo: "escena3d",
    titulo: "Escena de prueba",
    visibilidad: "grupo",
    transporte: "local",
    miembros,
    creadaEn: 0,
  };
}

describe("fusionarPropiedades · fuzzer (200 casos, semilla fija)", () => {
  it("es conmutativa e idempotente en 200 casos de semilla fija", () => {
    const rand = mulberry32(1025);
    for (let caso = 0; caso < 200; caso++) {
      const a = mapaAleatorio(rand);
      const b = mapaAleatorio(rand);
      const ab = fusionarPropiedades(a, b);
      const ba = fusionarPropiedades(b, a);
      expect(ab.resultado).toEqual(ba.resultado);
      expect(ab.conflictos).toEqual(ba.conflictos);
      // Idempotencia: fusionar el resultado consigo mismo no cambia nada.
      const otraVez = fusionarPropiedades(ab.resultado, ab.resultado);
      expect(otraVez.resultado).toEqual(ab.resultado);
      expect(otraVez.conflictos).toEqual([]);
    }
  });

  it("el empate de época se resuelve igual en los dos órdenes (gana el dueño menor alfabéticamente)", () => {
    const zoePrimero = fusionarPropiedades(
      { e1: { dueno: "zoe", epoca: 3 } },
      { e1: { dueno: "ana", epoca: 3 } },
    );
    expect(zoePrimero.resultado.e1.dueno).toBe("ana");
    expect(zoePrimero.conflictos).toEqual(["e1"]);
    const anaPrimero = fusionarPropiedades(
      { e1: { dueno: "ana", epoca: 3 } },
      { e1: { dueno: "zoe", epoca: 3 } },
    );
    expect(anaPrimero.resultado).toEqual(zoePrimero.resultado);
    expect(anaPrimero.conflictos).toEqual(zoePrimero.conflictos);
  });
});

describe("aceptarEscritura y traspasar", () => {
  it("reclamar da a quien reclamó la época 1; sobre lo ya reclamado no toca nada", () => {
    const vacio: Propiedades = {};
    const reclamado = reclamar(vacio, "avatar-1", "ana");
    expect(reclamado["avatar-1"]).toEqual({ dueno: "ana", epoca: 1 });
    expect(vacio["avatar-1"]).toBeUndefined();
    // Ana ya lo tiene; su nuevo intento no crea ni cambia (inmutabilidad).
    const otraVez = reclamar(reclamado, "avatar-1", "bruno");
    expect(otraVez).toEqual(reclamado);
    expect(otraVez["avatar-1"]).toEqual({ dueno: "ana", epoca: 1 });
  });

  it("una escritura con época vieja se rechaza y descendida no vale tampoco", () => {
    const p = reclamar({}, "ficha-7", "ana");
    // Ana está en su época: pasa.
    expect(aceptarEscritura(p, "ficha-7", "ana", 1)).toEqual({ ok: true });
    // Bruno la recibe con época 2: su vista de la época 1 ya quedó vieja, y una
    // época que aún no existe tampoco vale.
    const cedido = traspasar(p, "ficha-7", "ana", "bruno");
    expect(aceptarEscritura(cedido, "ficha-7", "bruno", 1)).toEqual({
      ok: false,
      motivo: "epoca-vieja",
    });
    expect(aceptarEscritura(cedido, "ficha-7", "bruno", 2)).toEqual({ ok: true });
    expect(aceptarEscritura(cedido, "ficha-7", "bruno", 3)).toEqual({
      ok: false,
      motivo: "epoca-vieja",
    });
  });

  it("traspasar sólo del dueño; la otra persona no puede ceder lo que no es suyo", () => {
    const p: Propiedades = { "asiento-3": { dueno: "carla", epoca: 4 } };
    // Bruno no es el dueño de «asiento-3»: no hay cambios.
    expect(traspasar(p, "asiento-3", "bruno", "ana")).toEqual(p);
    // Carla cede a Ana: cambia de dueño y sube a la época 5.
    const cedido = traspasar(p, "asiento-3", "carla", "ana");
    expect(cedido["asiento-3"]).toEqual({ dueno: "ana", epoca: 5 });
    expect(p["asiento-3"]).toEqual({ dueno: "carla", epoca: 4 });
  });

  it("sin dueño, la escritura no entra: primero se reclama", () => {
    expect(aceptarEscritura({}, "perilla", "ana", 1)).toEqual({
      ok: false,
      motivo: "sin-dueno",
    });
    const reclamado = reclamar({}, "perilla", "ana");
    expect(aceptarEscritura(reclamado, "perilla", "ana", 1)).toEqual({ ok: true });
  });
});

describe("combo con el rol de la sala", () => {
  it("puedeEscribir: un editor escribe lo suyo o lo suelto; lo de otra persona no", () => {
    const sala = salaDe({ ana: "editor", bruno: "editor", lia: "comentarista" });
    const p: Propiedades = {
      "mesa-1": { dueno: "bruno", epoca: 2 },
      "tablero-2": { dueno: "ana", epoca: 1 },
    };
    // Lo suyo.
    expect(puedeEscribir(sala, "ana", p, "tablero-2")).toBe(true);
    // Lo que nadie reclamó (un editor tiene rango para tomarlo).
    expect(puedeEscribir(sala, "ana", p, "lampara-9")).toBe(true);
    // Lo reclamado por otra persona: no.
    expect(puedeEscribir(sala, "ana", p, "mesa-1")).toBe(false);
    // Un comentarista no escribe nada, ni siquiera lo que nadie reclamó.
    expect(puedeEscribir(sala, "lia", p, "lampara-9")).toBe(false);
  });

  it("forzarTraspaso sólo lo puede quien es dueño DE LA SALA", () => {
    const sala = salaDe({ ana: "dueno", bruno: "dueno", zoe: "editor" });
    const p: Propiedades = { "tarta-1": { dueno: "bruno", epoca: 2 } };
    // Ana y Bruno son dueños de la sala: cada uno puede librarse lo de los demás.
    const suyo = forzarTraspaso(sala, "ana", p, "tarta-1", "ana");
    expect(suyo).not.toBeNull();
    const registro = (suyo as { registro: RegistroTraspaso }).registro;
    expect(registro).toEqual({ forzadoPor: "ana", de: "bruno", a: "ana", epocaNueva: 3 });
    // Un editor de la sala no: aunque participe, no es el dueño.
    expect(forzarTraspaso(sala, "zoe", p, "tarta-1", "zoe")).toBeNull();
    // Ya forzado y recibido por Ana, volverse a lo ya suyo no cambia nada.
    const yaSuya = (suyo as { resultado: Propiedades }).resultado;
    expect(forzarTraspaso(sala, "ana", yaSuya, "tarta-1", "ana")).toBeNull();
  });

  it("forzarTraspaso sobre una pieza sin dueño la deja reclamada en la época 1, con registro", () => {
    const sala = salaDe({ ana: "dueno" });
    const suyo = forzarTraspaso(sala, "ana", {}, "avion-2", "zoe");
    expect(suyo).toEqual({
      resultado: { "avion-2": { dueno: "zoe", epoca: 1 } },
      registro: { forzadoPor: "ana", de: "", a: "zoe", epocaNueva: 1 },
    });
  });
});

describe("explicar", () => {
  const PROHIBIDAS = ["época", "epoca", "propiedad", "dueno", "dueño", "versión", "sync", "mapa"];

  it("cada rechazo tiene su frase, sin tecnicismos", () => {
    expect(explicar("sin-dueno")).toContain("nadie");
    expect(explicar("no-es-dueno", "Ana")).toBe("Esa pieza la tiene Ana; pídesela.");
    expect(explicar("no-es-dueno", "Ana")).toContain("pídesela");
    expect(explicar("no-es-dueno")).toContain("otra persona");
    expect(explicar("epoca-vieja")).toContain("cambió de manos");
  });

  it("ningún mensaje deja ver el interior técnico", () => {
    for (const motivo of ["sin-dueno", "no-es-dueno", "epoca-vieja"] as const) {
      const frase = explicar(motivo, "Ana");
      for (const prohibida of PROHIBIDAS) {
        expect(frase.toLowerCase()).not.toContain(prohibida.toLowerCase());
      }
    }
  });
});
