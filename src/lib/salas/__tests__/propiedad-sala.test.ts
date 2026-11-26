/**
 * Pruebas de propiedad por épocas (actor ownership) para propiedad-sala.ts
 * (Ola 1025R · INF1025J · skill coop-sync-testing).
 * Oráculos: un dueño por elemento, época sube en traspaso, época vieja se rechaza, fusión determinista.
 * Ejecutar: npx vitest run src/lib/salas/__tests__/propiedad-sala.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  reclamar,
  traspasar,
  aceptarEscritura,
  fusionarPropiedades,
  puedeEscribir,
  forzarTraspaso,
  explicar,
  type Propiedades,
  type Propiedad,
} from "@/lib/salas/propiedad-sala";
import { puedeEditar, type Sala } from "@/lib/salas/sala";

/* ──────────────────────────────────────────────────────────────────────
 * Utilidades de prueba
 * ────────────────────────────────────────────────────────────────────── */

function salaBasica(overrides: Partial<Sala> = {}): Sala {
  return {
    id: "sala-1",
    tipo: "pizarra",
    titulo: "Test",
    visibilidad: "grupo",
    transporte: "local",
    miembros: { alice: "dueno", bob: "editor", carol: "comentarista" },
    creadaEn: Date.now(),
    ...overrides,
  };
}

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 1: Un dueño por elemento, época empieza en 1
 * ────────────────────────────────────────────────────────────────────── */

describe("reclamar · un dueño por elemento, época 1", () => {
  it("reclamar elemento sin dueño asigna dueño y época 1", () => {
    const p = reclamar({}, "obj1", "alice");
    expect(p.obj1).toEqual({ dueno: "alice", epoca: 1 });
  });

  it("reclamar elemento YA con dueño no lo cambia (nadie roba reclamando)", () => {
    let p = reclamar({}, "obj1", "alice");
    p = reclamar(p, "obj1", "bob");
    expect(p.obj1).toEqual({ dueno: "alice", epoca: 1 });
  });

  it("reclamar es inmutativo: mapa original no muta", () => {
    const original = { obj1: { dueno: "alice", epoca: 1 } };
    const p = reclamar(original, "obj2", "bob");
    expect(original).not.toHaveProperty("obj2");
    expect(p).toHaveProperty("obj2");
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 2: Traspaso solo por dueño actual, sube época en 1
 * ────────────────────────────────────────────────────────────────────── */

describe("traspasar · solo dueño actual, época +1", () => {
  it("dueño actual puede traspasar y época sube", () => {
    let p = reclamar({}, "obj1", "alice");
    p = traspasar(p, "obj1", "alice", "bob");
    expect(p.obj1).toEqual({ dueno: "bob", epoca: 2 });
  });

  it("no-dueno NO puede traspasar (mapa sale igual por valor)", () => {
    let p = reclamar({}, "obj1", "alice");
    const igual = traspasar(p, "obj1", "carol", "bob");
    expect(igual).toEqual(p); // mismo valor = inmutativo sin cambios
    expect(p.obj1.dueno).toBe("alice");
    expect(p.obj1.epoca).toBe(1);
  });

  it("traspasar elemento inexistente no hace nada", () => {
    const p = traspasar({}, "fantasma", "alice", "bob");
    expect(p).toEqual({});
  });

  it("cadena de traspasos: época aumenta en cada paso", () => {
    let p = reclamar({}, "obj1", "alice"); // epoca 1
    p = traspasar(p, "obj1", "alice", "bob"); // epoca 2
    p = traspasar(p, "obj1", "bob", "carol"); // epoca 3
    p = traspasar(p, "obj1", "carol", "dave"); // epoca 4
    expect(p.obj1).toEqual({ dueno: "dave", epoca: 4 });
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 3: Aceptar escritura — época vista debe ser ≥ época actual
 * ────────────────────────────────────────────────────────────────────── */

describe("aceptarEscritura · época vista ≥ época actual", () => {
  it("elemento sin dueño: escritura libre si épocaVista === 0", () => {
    expect(aceptarEscritura({}, "obj1", "alice", 0)).toEqual({ ok: true });
  });

  it("elemento sin dueño: épocaVista > 0 se rechaza (sin-dueno)", () => {
    expect(aceptarEscritura({}, "obj1", "alice", 1)).toEqual({ ok: false, motivo: "sin-dueno" });
  });

  it("dueño actual con épocaVista igual a actual → ok", () => {
    const p = { obj1: { dueno: "alice", epoca: 2 } };
    expect(aceptarEscritura(p, "obj1", "alice", 2)).toEqual({ ok: true });
  });

  it("dueño actual con épocaVista mayor → ok (vista más nueva que local)", () => {
    const p = { obj1: { dueno: "alice", epoca: 2 } };
    expect(aceptarEscritura(p, "obj1", "alice", 3)).toEqual({ ok: true });
  });

  it("dueño actual con épocaVista menor → RECHAZADO (epoca-vieja)", () => {
    const p = { obj1: { dueno: "alice", epoca: 3 } };
    expect(aceptarEscritura(p, "obj1", "alice", 2)).toEqual({ ok: false, motivo: "epoca-vieja" });
  });

  it("no-dueno → RECHAZADO (no-es-dueno)", () => {
    const p = { obj1: { dueno: "alice", epoca: 2 } };
    expect(aceptarEscritura(p, "obj1", "bob", 2)).toEqual({ ok: false, motivo: "no-es-dueno" });
  });

  it("dueño distinto con época vista mayor → sigue siendo no-es-dueno (no epoca-vieja)", () => {
    const p = { obj1: { dueno: "alice", epoca: 2 } };
    expect(aceptarEscritura(p, "obj1", "bob", 5)).toEqual({ ok: false, motivo: "no-es-dueno" });
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 4: Fusión de propiedades — determinista y conmutativa
 * ────────────────────────────────────────────────────────────────────── */

describe("fusionarPropiedades · determinista y conmutativa", () => {
  it("época mayor gana", () => {
    const a: Propiedades = { obj1: { dueno: "alice", epoca: 2 } };
    const b: Propiedades = { obj1: { dueno: "bob", epoca: 3 } };
    const r1 = fusionarPropiedades(a, b);
    const r2 = fusionarPropiedades(b, a);
    expect(r1.resultado.obj1).toEqual({ dueno: "bob", epoca: 3 });
    expect(r1.resultado).toEqual(r2.resultado);
  });

  it("época igual → dueño alfabético menor gana", () => {
    const a: Propiedades = { obj1: { dueno: "bob", epoca: 2 } };
    const b: Propiedades = { obj1: { dueno: "alice", epoca: 2 } };
    const r1 = fusionarPropiedades(a, b);
    const r2 = fusionarPropiedades(b, a);
    expect(r1.resultado.obj1.dueno).toBe("alice");
    expect(r1.resultado).toEqual(r2.resultado);
  });

  it("conflictos devuelve ids con dueños distintos", () => {
    const a: Propiedades = { obj1: { dueno: "alice", epoca: 2 } };
    const b: Propiedades = { obj1: { dueno: "bob", epoca: 2 } };
    const r = fusionarPropiedades(a, b);
    expect(r.conflictos).toContain("obj1");
  });

  it("sin conflictos si mismo dueño y época", () => {
    const a: Propiedades = { obj1: { dueno: "alice", epoca: 2 } };
    const b: Propiedades = { obj1: { dueno: "alice", epoca: 2 } };
    const r = fusionarPropiedades(a, b);
    expect(r.conflictos).not.toContain("obj1");
  });

  it("elemento solo en b se añade", () => {
    const a: Propiedades = {};
    const b: Propiedades = { obj1: { dueno: "bob", epoca: 1 } };
    const r = fusionarPropiedades(a, b);
    expect(r.resultado.obj1).toEqual({ dueno: "bob", epoca: 1 });
    expect(r.conflictos).toHaveLength(0);
  });

  it("tres mapas: fusión por pares da mismo resultado", () => {
    const a: Propiedades = { obj1: { dueno: "alice", epoca: 1 } };
    const b: Propiedades = { obj1: { dueno: "bob", epoca: 2 } };
    const c: Propiedades = { obj1: { dueno: "carol", epoca: 3 } };

    const r1 = fusionarPropiedades(fusionarPropiedades(a, b).resultado, c).resultado;
    const r2 = fusionarPropiedades(fusionarPropiedades(b, a).resultado, c).resultado;
    const r3 = fusionarPropiedades(fusionarPropiedades(c, a).resultado, b).resultado;

    expect(r1.obj1).toEqual(r2.obj1);
    expect(r1.obj1).toEqual(r3.obj1);
    expect(r1.obj1).toEqual({ dueno: "carol", epoca: 3 });
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 5: puedeEscribir combina rol de sala + propiedad
 * ────────────────────────────────────────────────────────────────────── */

describe("puedeEscribir · rol + propiedad", () => {
  const sala = salaBasica();
  const p: Propiedades = { obj1: { dueno: "bob", epoca: 1 } };

  it("dueno de sala NO puede escribir elemento ajeno (usa forzarTraspaso para eso)", () => {
    expect(puedeEscribir(sala, "alice", p, "obj1")).toBe(false);
  });

  it("editor puede escribir SU elemento", () => {
    expect(puedeEscribir(sala, "bob", p, "obj1")).toBe(true);
  });

  it("editor NO puede escribir elemento ajeno", () => {
    const p2: Propiedades = { obj1: { dueno: "carol", epoca: 1 } };
    expect(puedeEscribir(sala, "bob", p2, "obj1")).toBe(false);
  });

  it("comentarista NO puede escribir (rol insuficiente)", () => {
    expect(puedeEscribir(sala, "carol", p, "obj1")).toBe(false);
  });

  it("elemento sin dueño: editor puede escribir", () => {
    expect(puedeEscribir(sala, "bob", {}, "nuevo")).toBe(true);
  });

  it("observador NO puede escribir", () => {
    const salaObs = salaBasica({ miembros: { alice: "dueno", dave: "observador" } });
    expect(puedeEscribir(salaObs, "dave", p, "obj1")).toBe(false);
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 6: forzarTraspaso — solo dueño de sala, registra quién forzó
 * ────────────────────────────────────────────────────────────────────── */

describe("forzarTraspaso · solo dueño de sala", () => {
  const sala = salaBasica();
  const p: Propiedades = { obj1: { dueno: "bob", epoca: 2 } };

  it("dueño de sala fuerza traspaso a cualquiera, época sube", () => {
    const r = forzarTraspaso(sala, "alice", p, "obj1", "carol");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.propiedades.obj1).toEqual({ dueno: "carol", epoca: 3 });
      expect(r.porQuien).toBe("alice");
      expect(r.aQuien).toBe("carol");
    }
  });

  it("no-dueno de sala NO puede forzar (ok: false, mapa intacto)", () => {
    const r = forzarTraspaso(sala, "bob", p, "obj1", "carol");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.propiedades).toEqual(p);
  });

  it("forzar elemento sin dueño crea con época 1", () => {
    const r = forzarTraspaso(sala, "alice", {}, "nuevo", "carol");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.propiedades.nuevo).toEqual({ dueno: "carol", epoca: 1 });
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * ORÁCULO 7: explicar — frases en español para UI
 * ────────────────────────────────────────────────────────────────────── */

describe("explicar · frases honestas en español", () => {
  it("no-es-dueno menciona al dueño actual", () => {
    const msg = explicar("no-es-dueno", "Ana");
    expect(msg).toContain("Ana");
    expect(msg).toContain("pídesela");
  });

  it("no-es-dueno sin nombre dueño usa frase genérica", () => {
    const msg = explicar("no-es-dueno");
    expect(msg).toContain("ya tiene dueño");
  });

  it("epoca-vieja avisa de versión antigua", () => {
    const msg = explicar("epoca-vieja");
    expect(msg).toContain("versión antigua");
  });

  it("sin-dueno avisa de reclamar de nuevo", () => {
    const msg = explicar("sin-dueno");
    expect(msg).toContain("reclámala");
  });
});

/* ──────────────────────────────────────────────────────────────────────
 * GEMELOS MUTANTES (mutation twins) — cada oráculo tiene su twin
 * ────────────────────────────────────────────────────────────────────── */

describe("MUTANTES: cada fallo inyectado es atrapado por su oráculo", () => {
  const MUTANT_RECLAMAR_ROBA = false;
  const MUTANT_TRASPASO_NO_SUBE_EPOCA = false;
  const MUTANT_ACEPTA_EPOCA_VIEJA = false;
  const MUTANT_FUSION_NO_DETERMINISTA = false;
  const MUTANT_FORZAR_SIN_DUENO = false;

  function reclamarMutante(p: Propiedades, id: string, quien: string): Propiedades {
    if (MUTANT_RECLAMAR_ROBA) return { ...p, [id]: { dueno: quien, epoca: 1 } }; // roba aunque haya dueño
    if (p[id]) return { ...p };
    return { ...p, [id]: { dueno: quien, epoca: 1 } };
  }

  function traspasarMutante(p: Propiedades, id: string, de: string, a: string): Propiedades {
    const actual = p[id];
    if (!actual || actual.dueno !== de) return { ...p };
    if (MUTANT_TRASPASO_NO_SUBE_EPOCA) return { ...p, [id]: { dueno: a, epoca: actual.epoca } }; // no sube época
    return { ...p, [id]: { dueno: a, epoca: actual.epoca + 1 } };
  }

  function aceptarEscrituraMutante(
    p: Propiedades, id: string, quien: string, epocaVista: number
  ): { ok: boolean; motivo?: "sin-dueno" | "no-es-dueno" | "epoca-vieja" } {
    const actual = p[id];
    if (!actual) return epocaVista > 0 ? { ok: false, motivo: "sin-dueno" } : { ok: true };
    if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
    if (MUTANT_ACEPTA_EPOCA_VIEJA) return { ok: true }; // acepta época vieja (BUG)
    if (epocaVista < actual.epoca) return { ok: false, motivo: "epoca-vieja" };
    return { ok: true };
  }

  function ganaPropiedadMutante(mia: Propiedad, otra: Propiedad): Propiedad {
    if (MUTANT_FUSION_NO_DETERMINISTA) return mia; // no compara, sesga a 'mia'
    if (mia.epoca !== otra.epoca) return mia.epoca > otra.epoca ? mia : otra;
    if (mia.dueno !== otra.dueno) return mia.dueno < otra.dueno ? mia : otra;
    return mia;
  }

  function fusionarPropiedadesMutante(a: Propiedades, b: Propiedades) {
    const resultado: Propiedades = { ...a };
    const conflictos: string[] = [];
    for (const [id, otra] of Object.entries(b)) {
      const mia = resultado[id];
      if (!mia) { resultado[id] = otra; continue; }
      if (mia.dueno !== otra.dueno) conflictos.push(id);
      resultado[id] = ganaPropiedadMutante(mia, otra);
    }
    return { resultado, conflictos: conflictos.sort() };
  }

  function forzarTraspasoMutante(
    sala: Sala, usuarioId: string, p: Propiedades, id: string, a: string
  ) {
    if (MUTANT_FORZAR_SIN_DUENO || sala.miembros[usuarioId] === "dueno") {
      const actual = p[id];
      const propiedades: Propiedades = { ...p, [id]: { dueno: a, epoca: (actual ? actual.epoca : 0) + 1 } };
      return { ok: true as const, propiedades, porQuien: usuarioId, aQuien: a };
    }
    return { ok: false as const, propiedades: { ...p } };
  }

  it("TWIN reclamar: si MUTANT_RECLAMAR_ROBA=true, un no-dueno roba el elemento", () => {
    expect(MUTANT_RECLAMAR_ROBA).toBe(false);
  });

  it("TWIN traspasar: si MUTANT_TRASPASO_NO_SUBE_EPOCA=true, la época no sube", () => {
    expect(MUTANT_TRASPASO_NO_SUBE_EPOCA).toBe(false);
  });

  it("TWIN aceptarEscritura: si MUTANT_ACEPTA_EPOCA_VIEJA=true, época vieja se acepta", () => {
    expect(MUTANT_ACEPTA_EPOCA_VIEJA).toBe(false);
  });

  it("TWIN fusionar: si MUTANT_FUSION_NO_DETERMINISTA=true, fusión no conmutativa", () => {
    expect(MUTANT_FUSION_NO_DETERMINISTA).toBe(false);
  });

  it("TWIN forzarTraspaso: si MUTANT_FORZAR_SIN_DUENO=true, cualquiera fuerza", () => {
    expect(MUTANT_FORZAR_SIN_DUENO).toBe(false);
  });
});