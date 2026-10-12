import { describe, expect, it } from "vitest";
import { ANIMO_DESDE_VOZ, rasgosDesdePersonalidad } from "../personalidad-desde-aurora";
import type { Personalidad } from "../tipos";

const BASE: Personalidad = {
  calidez: 0.6, energia: 0.5, formalidad: 0.4, curiosidad: 0.6, humor: 0.5, concision: 0.5,
};

describe("rasgosDesdePersonalidad", () => {
  it("lee params 0..1", () => {
    const r = rasgosDesdePersonalidad({ params: { calidez: 0.9, energia: 0.1, curiosidad: 0.8 } }, BASE);
    expect(r.calidez).toBeCloseTo(0.9, 5);
    expect(r.energia).toBeCloseTo(0.1, 5);
    expect(r.curiosidad).toBeCloseTo(0.8, 5);
  });

  it("lee params 0..100", () => {
    const r = rasgosDesdePersonalidad({ params: { formalidad: 80, humor: 50, concision: 25 } }, BASE);
    expect(r.formalidad).toBeCloseTo(0.8, 5);
    expect(r.humor).toBeCloseTo(0.5, 5);
    expect(r.concision).toBeCloseTo(0.25, 5);
  });

  it("acepta alias en inglés (warmth, energy, formality, curiosity, brevity)", () => {
    const r = rasgosDesdePersonalidad(
      { params: { warmth: 30, energy: 70, formality: 10, curiosity: 90, brevity: 40 } },
      BASE,
    );
    expect(r.calidez).toBeCloseTo(0.3, 5);
    expect(r.energia).toBeCloseTo(0.7, 5);
    expect(r.formalidad).toBeCloseTo(0.1, 5);
    expect(r.curiosidad).toBeCloseTo(0.9, 5);
    expect(r.concision).toBeCloseTo(0.4, 5);
  });

  it("valores faltantes caen al base", () => {
    const r = rasgosDesdePersonalidad({ params: {} }, BASE);
    for (const k of ["calidez", "energia", "formalidad", "curiosidad", "humor", "concision"] as const) {
      expect(r[k]).toBe(BASE[k]);
    }
  });

  it("basura no lanza: valores no numéricos, undefined, null, cadenas extrañas", () => {
    const r = rasgosDesdePersonalidad(
      { params: { calidez: "no-un-numero", energia: null as unknown as number, formalidad: undefined, curiosidad: NaN, humor: Infinity, concision: -Infinity } },
      BASE,
    );
    // Todo debe caer al base sin lanzar; los valores inválidos se tratan como ausentes.
    expect(r.calidez).toBe(BASE.calidez);
    expect(r.energia).toBe(BASE.energia);
    expect(Number.isFinite(r.formalidad)).toBe(true);
    expect(Number.isFinite(r.curiosidad)).toBe(true);
  });

  it("emoción alegría (alegria/joy) sube energía y humor con pesos fijos", () => {
    const params = { energia: 0.2, humor: 0.1 };
    const r = rasgosDesdePersonalidad({ params, emotions: { alegria: 100, joy: 80 } }, BASE);
    expect(r.energia).toBeGreaterThan(params.energia);
    expect(r.humor).toBeGreaterThan(params.humor);
  });

  it("emoción calma (calma/calm) baja energía con peso fijo", () => {
    const r = rasgosDesdePersonalidad({ params: {}, emotions: { calma: 100, calm: 60 } }, BASE);
    expect(r.energia).toBeLessThan(BASE.energia);
  });

  it("emociones en escala 0..1 también pesan (alegría sube energía)", () => {
    const r = rasgosDesdePersonalidad({ params: {}, emotions: { alegria: 0.9 } }, BASE);
    expect(r.energia).toBeGreaterThan(BASE.energia);
    expect(r.humor).toBeGreaterThan(BASE.humor);
  });

  it("el resultado está acotado en [0, 1] incluso con combinaciones extremas", () => {
    const r = rasgosDesdePersonalidad(
      { params: { calidez: 150, humor: 150 }, emotions: { alegria: 200 } },
      BASE,
    );
    for (const k of ["calidez", "energia", "formalidad", "curiosidad", "humor", "concision"] as const) {
      expect(r[k]).toBeGreaterThanOrEqual(0);
      expect(r[k]).toBeLessThanOrEqual(1);
    }
  });
});

describe("ANIMO_DESDE_VOZ", () => {
  it("cada mood de UserVoiceMood tiene ánimo dentro de los rangos [-1,1] / [0,1]", () => {
    const moods = ["alegre", "sereno", "tenso", "triste", "energetico", "enérgico", "neutral"];
    for (const m of moods) {
      const a = ANIMO_DESDE_VOZ[m];
      expect(a, `falta ánimo para «${m}»`).toBeDefined();
      expect(a.valencia).toBeGreaterThanOrEqual(-1);
      expect(a.valencia).toBeLessThanOrEqual(1);
      expect(a.activacion).toBeGreaterThanOrEqual(0);
      expect(a.activacion).toBeLessThanOrEqual(1);
    }
  });

  it("should have all known moods", () => {
    const expectedMoods = ["alegre", "sereno", "tenso", "triste", "energetico", "enérgico", "neutral"];
    const actualMoods = Object.keys(ANIMO_DESDE_VOZ);
    expect(actualMoods.sort()).toEqual(expectedMoods.sort());
  });

  it("alegre tiene valencia alta y activación alta; triste baja ambas", () => {
    expect(ANIMO_DESDE_VOZ.alegre.valencia).toBeGreaterThan(0);
    expect(ANIMO_DESDE_VOZ.alegre.activacion).toBeGreaterThan(0.5);
    expect(ANIMO_DESDE_VOZ.triste.valencia).toBeLessThan(0);
    expect(ANIMO_DESDE_VOZ.triste.activacion).toBeLessThan(0.4);
  });

  it("sereno es calmo (activación baja) y tenso es activo con valencia moderada baja", () => {
    expect(ANIMO_DESDE_VOZ.sereno.activacion).toBeLessThan(0.4);
    expect(ANIMO_DESDE_VOZ.tenso.activacion).toBeGreaterThan(0.5);
    expect(ANIMO_DESDE_VOZ.tenso.valencia).toBeLessThan(0);
  });
});
