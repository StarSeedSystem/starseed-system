/**
 * CAMR · métrica híbrida — funciones puras, sin red ni disco.
 */
import { describe, expect, it } from "vitest";

import {
  ALFA_RESILIENCIA,
  PESOS_POR_CLASE,
  actualizaResiliencia,
  observacionResiliencia,
  puntuacionHibrida,
  puntuaAnchoBanda,
  puntuaLatencia,
  puntuaTiempoAire,
} from "../metrica";
import type { Medicion } from "../tipos";

const med = (parcial: Partial<Medicion>): Medicion => ({
  rssiDbm: null,
  snrDb: null,
  ber: null,
  ruidoDbm: null,
  latenciaMs: null,
  perdida: null,
  tiempoAireUsado: null,
  vecinos: 0,
  anchoBandaKbps: null,
  at: 0,
  ...parcial,
});

describe("puntuadores parciales", () => {
  it("latencia: 1 en ≤20 ms, 0 en ≥2000 ms, monótona", () => {
    expect(puntuaLatencia(10)).toBe(1);
    expect(puntuaLatencia(2000)).toBe(0);
    expect(puntuaLatencia(3000)).toBe(0);
    expect(puntuaLatencia(1000)).toBeCloseTo((2000 - 1000) / (2000 - 20), 5);
    expect(puntuaLatencia(null)).toBe(0.5);
  });

  it("ancho de banda: lineal respecto a la capacidad, recortado 0..1", () => {
    expect(puntuaAnchoBanda(50, 100)).toBe(0.5);
    expect(puntuaAnchoBanda(200, 100)).toBe(1);
    expect(puntuaAnchoBanda(0, 100)).toBe(0);
    expect(puntuaAnchoBanda(null, 100)).toBe(0.5);
    expect(puntuaAnchoBanda(10, 0)).toBe(0);
  });

  it("tiempo de aire: 1 = aire libre, 0 = saturado", () => {
    expect(puntuaTiempoAire(0)).toBe(1);
    expect(puntuaTiempoAire(1)).toBe(0);
    expect(puntuaTiempoAire(0.5)).toBe(0.5);
    expect(puntuaTiempoAire(null)).toBe(0.5);
  });
});

describe("PESOS_POR_CLASE", () => {
  it("cada clase suma 1 y control-critico pondera resiliencia", () => {
    for (const w of Object.values(PESOS_POR_CLASE)) {
      expect(w.latencia + w.anchoBanda + w.resiliencia + w.tiempoAire).toBeCloseTo(1, 10);
    }
    expect(PESOS_POR_CLASE["control-critico"].resiliencia).toBeGreaterThan(
      PESOS_POR_CLASE["tiempo-real"].resiliencia,
    );
    expect(PESOS_POR_CLASE["masivo"].anchoBanda).toBeGreaterThan(
      PESOS_POR_CLASE["mensajes"].anchoBanda,
    );
  });
});

describe("resiliencia (EMA)", () => {
  it("observación: pérdida 0 y SNR alto → cerca de 1; pérdida 1 y SNR −20 → 0", () => {
    expect(observacionResiliencia(med({ perdida: 0, snrDb: 10 }))).toBeCloseTo(1, 5);
    expect(observacionResiliencia(med({ perdida: 1, snrDb: -20 }))).toBe(0);
  });

  it("la primera medida fija la EMA y luego converge con alfa", () => {
    let e = actualizaResiliencia({ ema: 0, n: 0 }, med({ perdida: 0, snrDb: 10 }));
    expect(e.n).toBe(1);
    expect(e.ema).toBeCloseTo(1, 5);
    e = actualizaResiliencia(e, med({ perdida: 1, snrDb: -20 }));
    expect(e.ema).toBeCloseTo(1 - ALFA_RESILIENCIA, 5);
    expect(e.n).toBe(2);
    for (let i = 0; i < 30; i++) e = actualizaResiliencia(e, med({ perdida: 1, snrDb: -20 }));
    expect(e.ema).toBeLessThan(0.01);
  });
});

describe("puntuacionHibrida", () => {
  const buena = med({ latenciaMs: 30, anchoBandaKbps: 900, tiempoAireUsado: 0.05, perdida: 0, snrDb: 8 });
  const mala = med({ latenciaMs: 1800, anchoBandaKbps: 5, tiempoAireUsado: 0.95, perdida: 0.8, snrDb: -15 });

  it("queda en 0..1 y ordena bien un enlace bueno y uno malo", () => {
    for (const clase of ["control-critico", "mensajes", "tiempo-real", "masivo"] as const) {
      const pb = puntuacionHibrida(buena, 1000, clase, { ema: 0, n: 0 });
      const pm = puntuacionHibrida(mala, 1000, clase, { ema: 0, n: 0 });
      expect(pb).toBeGreaterThanOrEqual(0);
      expect(pb).toBeLessThanOrEqual(1);
      expect(pb).toBeGreaterThan(pm);
    }
  });

  it("tiempo-real penaliza más la latencia que masivo", () => {
    const lenta = med({ latenciaMs: 1500, anchoBandaKbps: 800, tiempoAireUsado: 0.1 });
    const tr = puntuacionHibrida(lenta, 1000, "tiempo-real", { ema: 0, n: 0 });
    const ma = puntuacionHibrida(lenta, 1000, "masivo", { ema: 0, n: 0 });
    expect(ma).toBeGreaterThan(tr);
  });

  it("usa la EMA cuando hay histórico y la observación si no", () => {
    const conHist = puntuacionHibrida(buena, 1000, "control-critico", { ema: 0.1, n: 5 });
    const sinHist = puntuacionHibrida(buena, 1000, "control-critico", { ema: 0, n: 0 });
    expect(conHist).toBeLessThan(sinHist);
  });
});
