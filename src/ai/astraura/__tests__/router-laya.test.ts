// Pruebas del refinado de dificultad con Laya (Tarea F · Ola 1018L).
// SOLO funciones puras: respuestas de Laya de ejemplo dentro de la prueba,
// con la forma real del sistema uno (type/choice/score/noul, probabilities,
// answer_confidence). Sin red, sin disco, sin modelos cargados.
import { describe, it, expect } from "vitest";
import {
  refinarConLaya,
  valorNoul,
  UMBRAL_PLANIFICADOR,
  BASTA_PEQUENO_ARRIBA,
} from "../router-laya";
import type { RespuestaLaya, RespuestasLaya } from "../router-laya";
import type { TaskProfile as Perfil } from "../router";

const perfil = (difficulty: number, extras: Partial<Perfil> = {}): Perfil => ({
  kind: "chat",
  needsVision: false,
  chars: 120,
  difficulty,
  ...extras,
});

const respuestas = (
  dificultad: RespuestaLaya | null,
  basta: RespuestaLaya | null,
  extra?: RespuestaLaya | null
): RespuestasLaya => {
  const out: Record<string, RespuestaLaya> = {};
  if (dificultad) out.dificultad = { type: "score", probabilities: { baja: 0.1, media: 0.2, alta: 0.7 }, ...dificultad };
  if (basta) out.basta_pequeno = { type: "noul", probabilities: { "sí": 0.9, "no": 0.1 }, ...basta };
  if (extra) out.otra = extra;
  return out;
};

const scoreAlta: RespuestaLaya = { score: "alta", answer_confidence: 0.95 };
const noulBasta = (noul: number, answer_confidence = 0.9): RespuestaLaya => ({ noul, answer_confidence });

describe("refinarConLaya · sin Laya", () => {
  it("sin respuestas devuelve la clasificación TAL CUAL (misma instancia)", () => {
    const base = perfil(0.6);
    expect(refinarConLaya(base, null)).toBe(base);
    expect(refinarConLaya(base, undefined)).toBe(base);
    expect(refinarConLaya(base, {})).toBe(base);
  });
});

describe("refinarConLaya · score de dificultad", () => {
  it("con answer_confidence ≥ umbral FIJA la dificultad por nivel", () => {
    const nuevo = refinarConLaya(perfil(0.9), respuestas(scoreAlta, null));
    expect(nuevo.difficulty).toBeCloseTo(0.85);
  });

  it("nivel «baja» baja dificultad estimada alta hacia lo pequeño", () => {
    const nuevo = refinarConLaya(
      perfil(0.9),
      respuestas({ score: "baja", answer_confidence: 0.8 }, null),
    );
    expect(nuevo.difficulty).toBeCloseTo(0.2);
  });

  it("por encima del umbral NO: confianza baja → sin cambio (tal cual)", () => {
    const base = perfil(0.9);
    expect(refinarConLaya(base, respuestas({ score: "baja", answer_confidence: UMBRAL_PLANIFICADOR - 0.01 }, null)))
      .toBe(base);
  });

  it("usa la calibrada answer_confidence, nunca confidence", () => {
    const base = perfil(0.9);
    const r = respuestas({ score: "baja", confidence: 0.99 }, null);
    expect(refinarConLaya(base, r)).toBe(base);
  });
});

describe("refinarConLaya · noul basta_pequeno", () => {
  it("p ≥ 0,7 acota la dificultad hacia lo pequeño (techo)", () => {
    expect(BASTA_PEQUENO_ARRIBA).toBe(0.7);
    const nuevo = refinarConLaya(perfil(0.9), respuestas(null, noulBasta(0.95)));
    expect(nuevo.difficulty).toBeLessThanOrEqual(0.4);
  });

  it("p ≤ 0,3 empuja la dificultad hacia modelos fuertes (suelo)", () => {
    const nuevo = refinarConLaya(perfil(0.2), respuestas(null, noulBasta(0.1)));
    expect(nuevo.difficulty).toBeGreaterThanOrEqual(0.65);
  });

  it("noul con confianza bajo el umbral → sin cambio (tal cual)", () => {
    const base = perfil(0.55);
    expect(refinarConLaya(base, respuestas(null, noulBasta(0.95, 0.4)))).toBe(base);
  });

  it("noul intermedio (0,3–0,7) NO acota: sin cambio", () => {
    const base = perfil(0.55);
    expect(refinarConLaya(base, respuestas(null, noulBasta(0.6)))).toBe(base);
  });

  it("el valor del noul sale de `noul` o, por tolerancia, de probabilities «sí»", () => {
    expect(valorNoul({ noul: 0.42 })).toBe(0.42);
    expect(valorNoul({ probabilities: { "sí": 0.83, "no": 0.17 } })).toBe(0.83);
    expect(valorNoul({})).toBe(null);
  });
});

describe("refinarConLaya · inmutables y defensivas", () => {
  it("nunca cambia kind, needsVision (privacidad) ni chars (contexto)", () => {
    const base = perfil(0.9, { kind: "code", needsVision: true, chars: 72_000 });
    const nuevo = refinarConLaya(base, respuestas(scoreAlta, noulBasta(0.95)));
    expect(nuevo.kind).toBe("code");
    expect(nuevo.needsVision).toBe(true);
    expect(nuevo.chars).toBe(72_000);
  });

  it("soporta el sobre { answers: … } como lo envía el servidor de Laya", () => {
    const base = perfil(0.9);
    const sobre = { answers: respuestas(scoreAlta, null) } as unknown as RespuestasLaya;
    expect(refinarConLaya(base, sobre).difficulty).toBeCloseTo(0.85);
  });

  it("una extra tipo choice no molesta y las formas raras no lanzan", () => {
    const base = perfil(0.55);
    const extra: RespuestaLaya = {
      type: "choice",
      choice: "poema",
      probabilities: { poema: 0.8 },
      answer_confidence: 0.9,
    };
    expect(refinarConLaya(base, respuestas(null, null, extra))).toBe(base);
    const raro = { dificultad: "alta" } as unknown as RespuestasLaya;
    expect(() => refinarConLaya(base, raro)).not.toThrow();
    expect(refinarConLaya(base, raro)).toBe(base);
  });

  it("dificultad final queda acotada a 0..1", () => {
    const nuevo = refinarConLaya(perfil(1), respuestas(scoreAlta, noulBasta(0.95)));
    expect(nuevo.difficulty).toBeGreaterThanOrEqual(0);
    expect(nuevo.difficulty).toBeLessThanOrEqual(1);
  });
});


