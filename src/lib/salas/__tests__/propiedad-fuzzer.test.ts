/**
 * Fuzzer determinista para `fusionarPropiedades` — invariantes de época y dueño.
 * Patrón del skill `coop-sync-testing` (actor-ownership.md, fuzzing-coop-sync.md).
 * Módulo PURO: sin red, sin disco, sin reloj real.
 */
import { describe, it, expect } from "vitest";
import { mulberry32, entero, elegir, SEMILLA_ENJAMBRE } from "@/lib/test-utils/seeded-rng";
import {
  fusionarPropiedades,
  reclamar,
  traspasar,
  aceptarEscritura,
  puedeEscribir,
  forzarTraspaso,
  type Propiedades,
  type Propiedad,
  type TraspasoForzado,
} from "../propiedad-sala";
import { type Sala } from "../sala";

const PERSONAS = ["u-ana", "u-bruno", "u-carla", "u-dani", "u-eva"] as const;
const IDS = "abcdefghijklmnopqrstuvwxyz".split("");
const SEMILLA = SEMILLA_ENJAMBRE;
const CASOS = 500;

function propiedadAleatoria(rnd: () => number): Propiedad {
  return { dueno: elegir(rnd, PERSONAS), epoca: entero(rnd, 1, 10) };
}

function propiedadesAleatorias(rnd: () => number): Propiedades {
  const p: Propiedades = {};
  const n = entero(rnd, 1, 15);
  for (let i = 0; i < n; i += 1) {
    const id = elegir(rnd, IDS);
    p[id] = propiedadAleatoria(rnd);
  }
  return p;
}

function salaTest(): Sala {
  return {
    id: "sala-1",
    tipo: "escena3d",
    titulo: "Test",
    visibilidad: "privada",
    transporte: "local",
    miembros: { "u-dueno": "dueno", "u-editor": "editor", "u-comenta": "comentarista" },
    creadaEn: 1_757_000_000_000,
  };
}

const canon = (p: Propiedades) => JSON.stringify(Object.keys(p).sort().map((k) => p[k]));

describe("fusionarPropiedades · fuzzer determinista (semilla 1025, 500 casos)", () => {
  it("conmutativa e idempotente en 500 casos", () => {
    const rnd = mulberry32(SEMILLA);
    for (let i = 0; i < CASOS; i += 1) {
      const a = propiedadesAleatorias(rnd);
      const b = propiedadesAleatorias(rnd);
      const ab = fusionarPropiedades(a, b);
      const ba = fusionarPropiedades(b, a);
      expect(canon(ab.resultado), `caso ${i}: conmutativa`).toBe(canon(ba.resultado));
      expect(ab.conflictos.sort(), `caso ${i}: conflictos iguales`).toEqual(ba.conflictos.sort());
      const soloA = fusionarPropiedades(a, a);
      expect(canon(soloA.resultado), `caso ${i}: idempotente`).toBe(canon(a));
      expect(soloA.conflictos, `caso ${i}: sin conflicto consigo misma`).toEqual([]);
    }
  });

  it("oráculo: gana época mayor sin importar orden", () => {
    const mia: Propiedades = { "av-1": { dueno: "u-carla", epoca: 7 } };
    const entra: Propiedades = { "av-1": { dueno: "u-ana", epoca: 3 } };
    expect(fusionarPropiedades(mia, entra).resultado["av-1"].dueno).toBe("u-carla");
    expect(fusionarPropiedades(entra, mia).resultado["av-1"].dueno).toBe("u-carla");
    expect(entra["av-1"]).toEqual({ dueno: "u-ana", epoca: 3 }); // entrada no mutada
  });

  it("oráculo: a igual época, dueño menor alfabético gana; igual en ambos órdenes", () => {
    const deAna: Propiedades = { "av-1": { dueno: "ana", epoca: 2 } };
    const deZoe: Propiedades = { "av-1": { dueno: "zoe", epoca: 2 } };
    const ab = fusionarPropiedades(deAna, deZoe);
    const ba = fusionarPropiedades(deZoe, deAna);
    expect(ab.resultado["av-1"].dueno).toBe("ana");
    expect(ba.resultado["av-1"].dueno).toBe("ana");
    expect(ab.conflictos).toEqual(["av-1"]);
    expect(ba.conflictos).toEqual(["av-1"]);
  });

  it("oráculo: dos dueños distintos = conflicto; mismo dueño épocas distintas = no conflicto", () => {
    const a: Propiedades = { "av-1": { dueno: "ana", epoca: 2 }, "av-2": { dueno: "bruno", epoca: 5 } };
    const b: Propiedades = { "av-1": { dueno: "zoe", epoca: 3 }, "av-2": { dueno: "bruno", epoca: 1 } };
    const f = fusionarPropiedades(a, b);
    expect(f.conflictos).toEqual(["av-1"]);
    expect(f.resultado["av-1"]).toEqual({ dueno: "zoe", epoca: 3 });
    expect(f.resultado["av-2"]).toEqual({ dueno: "bruno", epoca: 5 });
  });

  it("oráculo: reclamar elemento sin dueño → época 1", () => {
    const r = reclamar({}, "avatar-1", "u-ana");
    expect(r["avatar-1"]).toEqual({ dueno: "u-ana", epoca: 1 });
  });

  it("oráculo: reclamar no roba lo que ya tiene dueño", () => {
    const p: Propiedades = { "avatar-1": { dueno: "u-bruno", epoca: 3 } };
    const r = reclamar(p, "avatar-1", "u-ana");
    expect(r["avatar-1"]).toEqual({ dueno: "u-bruno", epoca: 3 });
  });

  it("oráculo: traspasar sube época en 1 y cambia dueño; solo dueño actual", () => {
    const p: Propiedades = { "ficha-2": { dueno: "u-ana", epoca: 2 } };
    const r = traspasar(p, "ficha-2", "u-ana", "u-bruno");
    expect(r["ficha-2"]).toEqual({ dueno: "u-bruno", epoca: 3 });
    expect(traspasar(p, "ficha-2", "u-bruno", "u-carla")["ficha-2"]).toEqual({ dueno: "u-ana", epoca: 2 });
    expect(r).not.toBe(p);
    expect(p["ficha-2"]).toEqual({ dueno: "u-ana", epoca: 2 });
  });

  it("oráculo: aceptarEscritura — sin dueño escribe libre (época 0), época vieja rechazada", () => {
    expect(aceptarEscritura({}, "av-1", "u-ana", 0)).toEqual({ ok: true });
    expect(aceptarEscritura({}, "av-1", "u-ana", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
  });

  it("oráculo: solo dueño escribe con época corriente; época vieja rechazada", () => {
    const p: Propiedades = { "av-1": { dueno: "u-ana", epoca: 4 } };
    expect(aceptarEscritura(p, "av-1", "u-ana", 4)).toEqual({ ok: true });
    expect(aceptarEscritura(p, "av-1", "u-ana", 3)).toEqual({ ok: false, motivo: "epoca-vieja" });
    expect(aceptarEscritura(p, "av-1", "u-bruno", 4)).toEqual({ ok: false, motivo: "no-es-dueno" });
  });

  it("oráculo: puedeEscribir combina rol + propiedad", () => {
    const s = salaTest();
    const p: Propiedades = { "av-1": { dueno: "u-editor", epoca: 1 }, "av-3": { dueno: "u-dueno", epoca: 1 } };
    expect(puedeEscribir(s, "u-editor", {}, "av-2")).toBe(true); // sin dueño
    expect(puedeEscribir(s, "u-editor", p, "av-1")).toBe(true); // suyo
    expect(puedeEscribir(s, "u-editor", p, "av-2")).toBe(true); // sin dueño
    expect(puedeEscribir(s, "u-editor", p, "av-3")).toBe(false); // ajeno
  });

  it("oráculo: rol manda primero — comentarista nunca escribe", () => {
    const s = salaTest();
    expect(puedeEscribir(s, "u-comenta", {}, "av-1")).toBe(false);
    expect(puedeEscribir(s, "u-comenta", { "av-1": { dueno: "u-comenta", epoca: 1 } }, "av-1")).toBe(false);
    expect(puedeEscribir(s, "u-fuera", {}, "av-1")).toBe(false);
  });

  it("oráculo: forzarTraspaso solo dueño de sala, registra quién y a quién", () => {
    const s = salaTest();
    const p: Propiedades = { "av-1": { dueno: "u-editor", epoca: 3 } };
    const no = forzarTraspaso(s, "u-editor", p, "av-1", "u-comenta");
    expect(no.ok).toBe(false);
    if (!no.ok) expect(no.propiedades["av-1"]).toEqual({ dueno: "u-editor", epoca: 3 });

    const si = forzarTraspaso(s, "u-dueno", p, "av-1", "u-comenta");
    expect(si.ok).toBe(true);
    if (si.ok) {
      expect(si.propiedades["av-1"]).toEqual({ dueno: "u-comenta", epoca: 4 });
      expect(si.porQuien).toBe("u-dueno");
      expect(si.aQuien).toBe("u-comenta");
    }
    expect(p["av-1"]).toEqual({ dueno: "u-editor", epoca: 3 }); // original no mutado
  });

  it("oráculo: explicar da frases claras sin tecnicismos", () => {
    const prohibidas = ["época", "epóca", "id", "mapa", "registro", "propiedades", "record", "undefined", "null"];
    for (const motivo of ["sin-dueno", "no-es-dueno", "epoca-vieja"] as const) {
      const frase = explicar(motivo, "Ana");
      const min = frase.toLowerCase();
      for (const w of prohibidas) expect(min.includes(w)).toBe(false);
    }
    expect(explicar("no-es-dueno", "Ana")).toContain("Esa pieza la tiene Ana; pídesela");
    expect(explicar("epoca-vieja")).toContain("versión antigua");
    expect(explicar("sin-dueno")).toContain("reclámala");
  });
});

function explicar(motivo: "sin-dueno" | "no-es-dueno" | "epoca-vieja", nombreDueno?: string): string {
  if (motivo === "no-es-dueno") {
    const dueño = nombreDueno ? `la tiene ${nombreDueno}` : "ya tiene dueño";
    return `Esa pieza ${dueño}; pídesela y, si te la cede, escribe tú el cambio siguiente.`;
  }
  if (motivo === "epoca-vieja") {
    return "Estás viendo una versión antigua de esa pieza; mírala tal y como está ahora y escribe sobre eso.";
  }
  return "La pieza no figura con dueño en esta copia de la sala; reclámala de nuevo antes de tocarla.";
}

describe("fusionarPropiedades · cobertura de tipos de conflicto", () => {
  it("elemento nuevo en B se añade sin conflicto", () => {
    const a: Propiedades = { "x": { dueno: "a", epoca: 1 } };
    const b: Propiedades = { "y": { dueno: "b", epoca: 1 } };
    const f = fusionarPropiedades(a, b);
    expect(f.resultado["y"]).toEqual({ dueno: "b", epoca: 1 });
    expect(f.conflictos).not.toContain("y");
  });

  it("elemento en A y B con mismo dueño, épocas distintas → gana mayor, sin conflicto", () => {
    const a: Propiedades = { "x": { dueno: "a", epoca: 1 } };
    const b: Propiedades = { "x": { dueno: "a", epoca: 5 } };
    const f = fusionarPropiedades(a, b);
    expect(f.resultado["x"]).toEqual({ dueno: "a", epoca: 5 });
    expect(f.conflictos).not.toContain("x");
  });

  it("muchos elementos: conflictos solo donde dueños difieren", () => {
    const a: Propiedades = {
      "a1": { dueno: "u1", epoca: 1 }, "a2": { dueno: "u2", epoca: 2 }, "a3": { dueno: "u3", epoca: 3 }
    };
    const b: Propiedades = {
      "a1": { dueno: "u1", epoca: 2 }, "a2": { dueno: "uX", epoca: 5 }, "a4": { dueno: "u4", epoca: 1 }
    };
    const f = fusionarPropiedades(a, b);
    expect(f.conflictos.sort()).toEqual(["a2"]);
    expect(f.resultado["a1"]).toEqual({ dueno: "u1", epoca: 2 });
    expect(f.resultado["a2"]).toEqual({ dueno: "uX", epoca: 5 });
    expect(f.resultado["a3"]).toEqual({ dueno: "u3", epoca: 3 });
    expect(f.resultado["a4"]).toEqual({ dueno: "u4", epoca: 1 });
  });
});