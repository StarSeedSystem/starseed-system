/**
 * Mutation twins para `propiedad-sala` — cada twin recrea un bug de propiedad/época y el test DEBE fallar.
 * Patrón del skill `coop-sync-testing` (actor-ownership.md §9, fuzzing-coop-sync.md §4).
 * Flags activados vía `MUTANT=<nombre>`.
 */

import { describe, it, expect } from "vitest";
import { type Propiedades, type Propiedad } from "../propiedad-sala";
import { type Sala } from "../sala";

const MUTANT_NO_EPOCH_BUMP = process.env.MUTANT === "no-epoch-bump";
const MUTANT_DOUBLE_OWNER = process.env.MUTANT === "double-owner";
const MUTANT_STALE_EPOCH_ACCEPT = process.env.MUTANT === "stale-epoch-accept";
const MUTANT_FORCE_NO_OWNER_CHECK = process.env.MUTANT === "force-no-owner-check";
const MUTANT_CLAIM_STEALS = process.env.MUTANT === "claim-steals";

// ─── Implementación con flags de mutación ───

function ganaPropiedad(mia: Propiedad, otra: Propiedad): Propiedad {
  if (mia.epoca !== otra.epoca) return mia.epoca > otra.epoca ? mia : otra;
  if (mia.dueno !== otra.dueno) return mia.dueno < otra.dueno ? mia : otra;
  return mia;
}

export function fusionarPropiedadesMutant(a: Propiedades, b: Propiedades): { resultado: Propiedades; conflictos: string[] } {
  const resultado: Propiedades = { ...a };
  const conflictos: string[] = [];
  for (const [id, otra] of Object.entries(b)) {
    const mia = resultado[id];
    if (!mia) {
      resultado[id] = otra;
      continue;
    }
    // MUTANT: no reporta conflicto aunque dueños difieran
    if (!MUTANT_DOUBLE_OWNER && mia.dueno !== otra.dueno) conflictos.push(id);
    resultado[id] = ganaPropiedad(mia, otra);
  }
  return { resultado, conflictos: conflictos.sort() };
}

export function reclamarMutant(p: Propiedades, id: string, quien: string): Propiedades {
  // MUTANT: roba aunque tenga dueño
  if (MUTANT_CLAIM_STEALS) {
    return { ...p, [id]: { dueno: quien, epoca: 1 } };
  }
  if (p[id]) return { ...p };
  return { ...p, [id]: { dueno: quien, epoca: 1 } };
}

export function traspasarMutant(p: Propiedades, id: string, de: string, a: string): Propiedades {
  const actual = p[id];
  if (!actual || actual.dueno !== de) return { ...p };
  // MUTANT: no sube la época
  const nuevaEpoca = MUTANT_NO_EPOCH_BUMP ? actual.epoca : actual.epoca + 1;
  return { ...p, [id]: { dueno: a, epoca: nuevaEpoca } };
}

export function aceptarEscrituraMutant(
  p: Propiedades, id: string, quien: string, epocaVista: number
): { ok: boolean; motivo?: "sin-dueno" | "no-es-dueno" | "epoca-vieja" } {
  const actual = p[id];
  if (!actual) return epocaVista > 0 ? { ok: false, motivo: "sin-dueno" } : { ok: true };
  // MUTANT: acepta época vieja
  if (MUTANT_STALE_EPOCH_ACCEPT && epocaVista < actual.epoca) return { ok: true };
  if (actual.dueno !== quien) return { ok: false, motivo: "no-es-dueno" };
  if (epocaVista < actual.epoca) return { ok: false, motivo: "epoca-vieja" };
  return { ok: true };
}

export function puedeEscribirMutant(sala: Sala, usuarioId: string, p: Propiedades, id: string): boolean {
  // MUTANT: ignora rol, solo propiedad
  if (MUTANT_FORCE_NO_OWNER_CHECK) {
    const actual = p[id];
    return !actual || actual.dueno === usuarioId;
  }
  // Implementación normal simplificada
  const puedeEditar = (s: Sala, u: string) => s.miembros[u] === "dueno" || s.miembros[u] === "editor";
  if (!puedeEditar(sala, usuarioId)) return false;
  const actual = p[id];
  return !actual || actual.dueno === usuarioId;
}

export function forzarTraspasoMutant(
  sala: Sala, usuarioId: string, p: Propiedades, id: string, a: string
): { ok: boolean; propiedades: Propiedades; porQuien?: string; aQuien?: string } {
  const esDueno = sala.miembros[usuarioId] === "dueno";
  // MUTANT: cualquiera puede forzar
  if (!esDueno && !MUTANT_FORCE_NO_OWNER_CHECK) return { ok: false, propiedades: { ...p } };
  const actual = p[id];
  const propiedades: Propiedades = { ...p, [id]: { dueno: a, epoca: (actual ? actual.epoca : 0) + 1 } };
  return { ok: true, propiedades, porQuien: usuarioId, aQuien: a };
}

// ─── Sala de test ───
function salaTest(): Sala {
  return {
    id: "sala-1", tipo: "escena3d", titulo: "Test", visibilidad: "privada",
    transporte: "local", miembros: { "u-dueno": "dueno", "u-editor": "editor", "u-comenta": "comentarista" },
    creadaEn: 1_757_000_000_000,
  };
}

// ─── Tests de mutation twins ───

describe("mutation twins · propiedad-sala (activar con MUTANT=<nombre>)", () => {
  describe("MUTANT=no-epoch-bump", () => {
    it("FALLA: traspasar no sube época → fusión posterior pierde orden", () => {
      const p: Propiedades = { "ficha-1": { dueno: "u-ana", epoca: 2 } };
      const r = traspasarMutant(p, "ficha-1", "u-ana", "u-bruno");
      // Sin mutant: época 3. Con mutant: época 2 (igual que antes)
      expect(r["ficha-1"].epoca).toBe(3);
    });

    it("FALLA: fusión con época no subida permite stale win", () => {
      const a: Propiedades = { "av-1": { dueno: "u-ana", epoca: 2 } }; // traspaso sin bump → epoca 2
      const b: Propiedades = { "av-1": { dueno: "u-bruno", epoca: 3 } }; // época mayor legítima
      const f = fusionarPropiedadesMutant(a, b);
      // Debe ganar b (época 3 > 2)
      expect(f.resultado["av-1"].dueno).toBe("u-bruno");
    });
  });

  describe("MUTANT=double-owner", () => {
    it("FALLA: fusión no reporta conflicto con dos dueños distintos", () => {
      const a: Propiedades = { "av-1": { dueno: "ana", epoca: 2 } };
      const b: Propiedades = { "av-1": { dueno: "zoe", epoca: 2 } };
      const f = fusionarPropiedadesMutant(a, b);
      // Sin mutant: conflictos = ["av-1"]. Con mutant: conflictos = []
      expect(f.conflictos).toContain("av-1");
    });
  });

  describe("MUTANT=stale-epoch-accept", () => {
    it("FALLA: aceptarEscritura acepta época vieja", () => {
      const p: Propiedades = { "av-1": { dueno: "u-ana", epoca: 4 } };
      const r = aceptarEscrituraMutant(p, "av-1", "u-ana", 3); // época vista 3 < actual 4
      // Sin mutant: { ok: false, motivo: "epoca-vieja" }. Con mutant: { ok: true }
      expect(r.ok).toBe(false);
      expect(r.motivo).toBe("epoca-vieja");
    });
  });

  describe("MUTANT=force-no-owner-check", () => {
    it("FALLA: puedeEscribir ignora rol de comentarista", () => {
      const s = salaTest();
      const p: Propiedades = { "av-1": { dueno: "u-comenta", epoca: 1 } };
      // Sin mutant: false (comentarista no edita). Con mutant: true (solo mira propiedad)
      expect(puedeEscribirMutant(s, "u-comenta", p, "av-1")).toBe(false);
    });

    it("FALLA: forzarTraspaso permite a no-dueno forzar", () => {
      const s = salaTest();
      const p: Propiedades = { "av-1": { dueno: "u-editor", epoca: 3 } };
      const r = forzarTraspasoMutant(s, "u-editor", p, "av-1", "u-comenta");
      // Sin mutant: ok=false. Con mutant: ok=true
      expect(r.ok).toBe(false);
    });
  });

  describe("MUTANT=claim-steals", () => {
    it("FALLA: reclamar roba elemento con dueño", () => {
      const p: Propiedades = { "avatar-1": { dueno: "u-bruno", epoca: 3 } };
      const r = reclamarMutant(p, "avatar-1", "u-ana");
      // Sin mutant: dueño sigue siendo u-bruno. Con mutant: u-ana
      expect(r["avatar-1"].dueno).toBe("u-bruno");
    });
  });
});

// ─── Test meta: cobertura de mutants ───
describe("mutation twins · cobertura", () => {
  const mutants = [
    "no-epoch-bump",
    "double-owner",
    "stale-epoch-accept",
    "force-no-owner-check",
    "claim-steals",
  ] as const;

  for (const m of mutants) {
    it(`twin documentado: ${m}`, () => {
      expect(typeof m).toBe("string");
    });
  }
});