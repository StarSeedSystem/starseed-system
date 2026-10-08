/**
 * CAMR · radio cognitiva — §2 por escenarios:
 * ruido creciente, vecino que se aleja, interferencia en un canal, oscilación.
 */
import { describe, expect, it } from "vitest";

import {
  ESCALERA_LORA,
  MEJORAS_SUBIDA,
  acimutRecomendado,
  canalMasLimpio,
  mcsDeseado,
  nivelLoraDeseado,
  pireDe,
  potenciaComunitaria,
  recomendar,
  vigilarCambio,
} from "../radio-cognitiva";
import { dentroDeLey } from "../regulacion";
import type { PerfilCognitivo, VecinoCognitivo } from "../radio-cognitiva";
import type { Medicion, ParametrosRadio } from "../tipos";

const T0 = 1_700_000_000_000;

function med(parcial: Partial<Medicion>, at: number): Medicion {
  return {
    rssiDbm: null, snrDb: null, ber: null, ruidoDbm: null, latenciaMs: null,
    perdida: null, tiempoAireUsado: null, vecinos: 0, anchoBandaKbps: null,
    ...parcial, at,
  };
}

const perfilEu = (parcial: Partial<PerfilCognitivo> = {}): PerfilCognitivo => ({
  legal: { regionLora: "EU_868", regionWifi: null, indicativo: null },
  banda: "EU_868",
  esWifi: false,
  orientable: false,
  gananciaAntenaDbi: 2,
  perdidasDb: 1,
  objetivoSnrDb: -10,
  potenciaMaxEquipoDbm: 27,
  ...parcial,
});

const actualBase: ParametrosRadio = {
  frecuenciaMhz: 869.5,
  potenciaDbm: 14,
  spreadFactor: 11,
  anchoBandaMhz: 0.25,
  codingRate: "4/8",
};

const vecino = (v: Partial<VecinoCognitivo>): VecinoCognitivo => ({
  id: "v1", snrDb: null, rssiDbm: null, esPuenteUnico: false, ...v,
});

describe("modulación LoRa por SNR/BER", () => {
  it("SNR alto pide el nivel más rápido; ruido creciente pide más alcance", () => {
    expect(nivelLoraDeseado(0, null)).toBe(0);
    expect(nivelLoraDeseado(-16, null)).toBeGreaterThan(4);
    expect(nivelLoraDeseado(-25, null)).toBe(ESCALERA_LORA.length - 1);
  });
  it("BER alto fuerza un nivel más robusto", () => {
    const base = nivelLoraDeseado(0, null);
    expect(nivelLoraDeseado(0, 0.2)).toBe(base + 1);
  });
});

describe("histéresis (oscilación)", () => {
  const histBueno = Array.from({ length: MEJORAS_SUBIDA }, (_, i) =>
    med({ snrDb: 0, ber: 0 }, T0 + i * 1000),
  );
  it("subir exige mejora sostenida; con historial corto no cambia", () => {
    const r = recomendar([med({ snrDb: 5, ber: 0 }, T0)], [], perfilEu(), actualBase);
    expect(r.params.spreadFactor).toBe(actualBase.spreadFactor);
    expect(r.porque.join(" ")).toContain("histéresis");
  });
  it("con una medida buena menos de las exigidas todavía no sube", () => {
    const casi = histBueno.slice(0, MEJORAS_SUBIDA - 1);
    const r = recomendar(casi, [], perfilEu(), actualBase);
    expect(r.params.spreadFactor).toBe(actualBase.spreadFactor);
    expect(r.cambio).toBe(false);
  });
  it("con mejora sostenida sube de velocidad", () => {
    const r = recomendar(histBueno, [], perfilEu(), actualBase);
    expect(r.params.spreadFactor).toBe(7);
    expect(r.cambio).toBe(true);
  });
  it("bajar es inmediato si el enlace se degrada", () => {
    const rapido: ParametrosRadio = { ...actualBase, spreadFactor: 7, anchoBandaMhz: 0.5, codingRate: "4/5" };
    const r = recomendar([med({ snrDb: -18, ber: 0.2 }, T0)], [], perfilEu(), rapido);
    expect(r.params.spreadFactor).toBe(12);
    expect(r.cambio).toBe(true);
  });
  it("alternando bueno/malo no oscila: se queda en el peldaño (histéresis)", () => {
    const oscilante = [0, -18, 2, -18, 2].map((snrDb, i) =>
      med({ snrDb, ber: 0 }, T0 + i * 1000),
    );
    const r = recomendar(oscilante, [], perfilEu(), actualBase);
    expect(r.params.spreadFactor).toBe(actualBase.spreadFactor);
    expect(r.cambio).toBe(false);
    expect(r.porque.join(" ")).toContain("histéresis");
  });
  it("la escalera LoRa crece en robustez y baja su SNR mínimo de forma monótona", () => {
    for (let i = 1; i < ESCALERA_LORA.length; i++) {
      expect(ESCALERA_LORA[i].snrMinDb).toBeLessThanOrEqual(ESCALERA_LORA[i - 1].snrMinDb);
      expect(ESCALERA_LORA[i].spreadFactor).toBeGreaterThanOrEqual(ESCALERA_LORA[i - 1].spreadFactor);
    }
  });
});

describe("TPC comunitario (vecino que se aleja)", () => {
  it("sube solo lo necesario si hay puente único", () => {
    const v = [vecino({ snrDb: -14, esPuenteUnico: true })];
    const r = potenciaComunitaria(14, v, perfilEu(), 869.5);
    expect(r.potenciaDbm).toBeGreaterThan(14);
  });
  it("sin puente único y falta grande de margen, no ahoga la malla", () => {
    const v = [vecino({ snrDb: -20, esPuenteUnico: false })];
    const r = potenciaComunitaria(14, v, perfilEu(), 869.5);
    expect(r.potenciaDbm).toBe(14);
  });
  it("baja 1 dB cuando sobra señal", () => {
    const r = potenciaComunitaria(14, [vecino({ snrDb: -3 })], perfilEu(), 869.5);
    expect(r.potenciaDbm).toBe(13);
  });
  it("mantiene la potencia cuando ya está equilibrada al margen objetivo", () => {
    const r = potenciaComunitaria(14, [vecino({ snrDb: -10 })], perfilEu(), 869.5);
    expect(r.potenciaDbm).toBe(14);
    expect(r.nota).toContain("equilibrada");
  });
  it("nunca supera el tope legal (EU_868: 27 dBm)", () => {
    const v = [vecino({ snrDb: -40, esPuenteUnico: true })];
    const r = potenciaComunitaria(30, v, perfilEu(), 869.5);
    expect(r.potenciaDbm).toBeLessThanOrEqual(27);
  });
});

describe("espectro limpio (interferencia en un canal)", () => {
  const canales = [
    { frecMhz: 869.5, ruidoDbm: -80, ocupacion: 0.9 }, // interferido
    { frecMhz: 869.55, ruidoDbm: -110, ocupacion: 0.1 },
  ];
  it("propone el canal limpio solo si la mejora supera el umbral", () => {
    const r = canalMasLimpio(canales, 869.5, perfilEu());
    expect(r.cambio).toBe(true);
    expect(r.frecMhz).toBe(869.55);
  });
  it("no cambia si la mejora queda por debajo del umbral", () => {
    const casi = [
      { frecMhz: 869.5, ruidoDbm: -100, ocupacion: 0 },
      { frecMhz: 869.55, ruidoDbm: -99, ocupacion: 0 },
    ];
    expect(canalMasLimpio(casi, 869.5, perfilEu()).cambio).toBe(false);
  });
  it("recomendar marca anuncio previo al cambiar de canal", () => {
    const r = recomendar([med({ snrDb: -6, ber: 0.01 }, T0)], [], perfilEu(), actualBase, canales);
    expect(r.anuncioPrevio).toBe(true);
    expect(r.params.frecuenciaMhz).toBe(869.55);
    expect(r.cambio).toBe(true);
  });
  it("ninguna recomendación sale de la ley: recorta la potencia al tope", () => {
    const r = recomendar([med({ snrDb: -6, ber: 0 }, T0)], [], perfilEu(), {
      ...actualBase,
      potenciaDbm: 30,
    });
    expect(r.params.potenciaDbm).toBeLessThanOrEqual(27);
    expect(
      dentroDeLey({ banda: "EU_868", radio: r.params }, perfilEu().legal).ok,
    ).toBe(true);
  });
  it("con la métrica ya en el nivel actual no propone cambio", () => {
    const estable = [0, 1, 2].map((i) => med({ snrDb: -14, ber: 0 }, T0 + i * 1000));
    const r = recomendar(estable, [], perfilEu(), actualBase);
    expect(r.cambio).toBe(false);
    expect(r.params).toMatchObject({
      frecuenciaMhz: actualBase.frecuenciaMhz,
      potenciaDbm: actualBase.potenciaDbm,
      spreadFactor: actualBase.spreadFactor,
    });
  });
});

describe("PIRE direccional y acimut", () => {
  it("PIRE = potencia + ganancia − pérdidas", () => {
    expect(pireDe({ ...actualBase, potenciaDbm: 14 }, perfilEu())).toBe(15);
  });
  it("recomienda el acimut del vecino con mejor SNR si la antena es orientable", () => {
    const vs = [vecino({ snrDb: -5, acimutDeg: 90 }), vecino({ snrDb: 2, acimutDeg: 210 })];
    expect(acimutRecomendado(vs)).toBe(210);
    const r = recomendar(
      [med({ snrDb: -6 }, T0)], vs, perfilEu({ orientable: true }), actualBase,
    );
    expect(r.acimutDeg).toBe(210);
    expect(r.porque.join(" ")).toContain("acimut");
  });
});

describe("Wi-Fi (MCS) y vigilarCambio (reversión)", () => {
  it("mcsDeseado sube con el SNR y baja con BER alta", () => {
    expect(mcsDeseado(35, null)).toBe(11);
    expect(mcsDeseado(2, null)).toBe(0);
    expect(mcsDeseado(10, 0.3)).toBeLessThan(mcsDeseado(10, null));
  });
  it("reversión si la métrica empeora durante T", () => {
    const antes = med({ snrDb: -5, perdida: 0.01 }, T0);
    const posteriores = [1, 2, 3, 4].map((i) =>
      med({ snrDb: -18, perdida: 0.3 }, T0 + i * 5000),
    );
    const v = vigilarCambio(antes, posteriores, actualBase, 10_000);
    expect(v.revertir).toBe(true);
    expect(v.paramsAnteriores).toBe(actualBase);
  });
  it("no revierte si el empeoramiento no dura T", () => {
    const antes = med({ snrDb: -5, perdida: 0.01 }, T0);
    const posteriores = [1, 2].map((i) =>
      med({ snrDb: -18, perdida: 0.3 }, T0 + i * 1000),
    );
    expect(vigilarCambio(antes, posteriores, actualBase, 10_000).revertir).toBe(false);
  });
  it("no revierte si la métrica aguanta", () => {
    const antes = med({ snrDb: -5, perdida: 0.01 }, T0);
    const posteriores = [1, 2, 3].map((i) =>
      med({ snrDb: -4, perdida: 0.01 }, T0 + i * 10_000),
    );
    expect(vigilarCambio(antes, posteriores, actualBase, 10_000).revertir).toBe(false);
  });
});
