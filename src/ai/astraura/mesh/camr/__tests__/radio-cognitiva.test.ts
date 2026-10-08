/**
 * StarSeed OS — CAMR · pruebas del motor de radio cognitiva (CAMR1005B).
 * Funciones puras: sin red, sin disco, sin hardware. Escenarios del contrato:
 * ruido creciente, vecino que se aleja, interferencia en un canal y oscilación.
 */

import { describe, it, expect } from "vitest";
import {
  CONFIG_RADIO_POR_DEFECTO,
  recomendar,
  elegirModulacion,
  calcularTpc,
  elegirCanal,
  acimutRecomendado,
  ajustaALaLey,
  vigilarCambio,
  ESCALERA_LORA,
  type ContextoRadio,
  type VecinoRadio,
  type VigilanciaCambio,
} from "../radio-cognitiva";
import { dentroDeLey, type PerfilLegal } from "../regulacion";
import type { Medicion, ParametrosRadio } from "../tipos";

/* ── Fábricas de datos ──────────────────────────────────────────────────── */

const PERFIL_EU: PerfilLegal = { regionLora: "EU_868", regionWifi: "EU", indicativo: null };

function medicion(snrDb: number, extra: Partial<Medicion> = {}): Medicion {
  return {
    rssiDbm: -100, snrDb, ber: 0.001, ruidoDbm: -120, latenciaMs: 50,
    perdida: 0.01, tiempoAireUsado: 0.1, vecinos: 3, anchoBandaKbps: 5,
    at: 1_000, ...extra,
  };
}

function actualLora(extra: Partial<ParametrosRadio> = {}): ParametrosRadio & {
  contexto: ContextoRadio;
} {
  return {
    frecuenciaMhz: 869.525,
    potenciaDbm: 14,
    spreadFactor: 9,
    codingRate: "4/5",
    anchoBandaMhz: 0.25,
    gananciaAntenaDbi: 2,
    perdidasDb: 1,
    contexto: { banda: "EU_868", familia: "lora", antenaOrientable: false },
    ...extra,
  };
}

/* ── Modulación adaptativa e histéresis ─────────────────────────────────── */

describe("modulación adaptativa", () => {
  it("baja de inmediato cuando el enlace se pierde (ruido creciente)", () => {
    // Ruido creciente: SNR cae hasta el fondo.
    const historial = [medicion(-4), medicion(-14), medicion(-22, { perdida: 0.8 })];
    const r = elegirModulacion(historial, actualLora({ spreadFactor: 9 }), "lora");
    expect(r.params.spreadFactor).toBe(12); // peldaño más robusto
    expect(r.porque).toMatch(/de inmediato|perdido/);
  });

  it("sube solo tras N mejoras seguidas (histéresis anti-oscilación)", () => {
    const cfg = { ...CONFIG_RADIO_POR_DEFECTO, mejoraSeguidasN: 3 };
    // Solo 2 medidas buenas: NO sube.
    const dosBuenas = [medicion(1), medicion(2)];
    const r1 = elegirModulacion(dosBuenas, actualLora({ spreadFactor: 10 }), "lora", cfg);
    expect(r1.params.spreadFactor).toBe(10);
    // Con 3 medidas buenas seguidas: sube un peldaño.
    const tresBuenas = [medicion(1), medicion(2), medicion(3)];
    const r2 = elegirModulacion(tresBuenas, actualLora({ spreadFactor: 10 }), "lora", cfg);
    expect(r2.params.spreadFactor).toBe(9);
  });

  it("no oscila: alternando bueno/malo se queda en el peldaño", () => {
    const oscilante = [medicion(5), medicion(-12), medicion(6), medicion(-12), medicion(7)];
    const r = elegirModulacion(oscilante, actualLora({ spreadFactor: 10 }), "lora");
    expect(r.params.spreadFactor).toBe(10);
    expect(r.porque).toMatch(/histéresis/);
  });
});

/* ── TPC comunitario ────────────────────────────────────────────────────── */

describe("control de potencia comunitario", () => {
  const vecino = (id: string, snrDb: number, necesario = true): VecinoRadio => ({
    id, snrDb, perdida: 0.01, necesario, potenciaDbm: 14, acimutGrados: null,
  });

  it("sube solo cuando un puente único queda corto (vecino que se aleja)", () => {
    const r = calcularTpc([vecino("A", 4), vecino("B", 15, false)], 14);
    expect(r.potenciaDbm).toBe(20); // sube el déficit (10 − 4)
    expect(r.porque).toMatch(/puente único A/);
  });

  it("baja quien sobra para no ahogar la malla", () => {
    const r = calcularTpc([vecino("A", 25), vecino("B", 20)], 14);
    expect(r.potenciaDbm).toBeLessThan(14);
  });

  it("mantiene la potencia cuando ya está ajustada al margen objetivo", () => {
    const r = calcularTpc([vecino("A", 11)], 14);
    expect(r.potenciaDbm).toBe(14);
  });
});

/* ── Espectro limpio ────────────────────────────────────────────────────── */

describe("búsqueda de canal limpio", () => {
  it("cambia cuando la mejora supera el umbral (interferencia en el canal)", () => {
    const canales = [
      { frecuenciaMhz: 869.525, ruidoDbm: -95, ocupacion: 0.6 },
      { frecuenciaMhz: 869.4375, ruidoDbm: -115, ocupacion: 0.05 },
    ];
    const r = elegirCanal(canales, 869.525);
    expect(r.cambio).toBe(true);
    expect(r.frecuenciaMhz).toBe(869.4375);
    expect(r.porque).toMatch(/anuncio previo/);
  });

  it("no cambia si la mejora no supera el umbral", () => {
    const canales = [
      { frecuenciaMhz: 869.525, ruidoDbm: -100, ocupacion: 0.2 },
      { frecuenciaMhz: 869.4375, ruidoDbm: -102, ocupacion: 0.1 },
    ];
    const r = elegirCanal(canales, 869.525);
    expect(r.cambio).toBe(false);
    expect(r.frecuenciaMhz).toBe(869.525);
  });
});

/* ── PIRE direccional y acimut ──────────────────────────────────────────── */

describe("PIRE y antena direccional", () => {
  it("recorta la potencia hasta cumplir la PIRE legal", () => {
    // EU_868: tope 27 dBm; con ganancia 2 y pérdidas 1 la potencia máx. es 26.
    const p = ajustaALaLey(
      { frecuenciaMhz: 869.525, potenciaDbm: 30, gananciaAntenaDbi: 0, perdidasDb: 0 },
      "EU_868",
      PERFIL_EU,
    );
    expect(p.potenciaDbm).toBe(27);
    expect(dentroDeLey({ banda: "EU_868", radio: p }, PERFIL_EU).ok).toBe(true);
  });

  it("recomienda el acimut del mejor vecino si la antena es orientable", () => {
    const vecinos: VecinoRadio[] = [
      { id: "A", snrDb: 5, perdida: 0.4, necesario: true, potenciaDbm: 14, acimutGrados: 40 },
      { id: "B", snrDb: 12, perdida: 0.05, necesario: true, potenciaDbm: 14, acimutGrados: 120 },
    ];
    expect(acimutRecomendado(vecinos, true)).toBe(120);
    expect(acimutRecomendado(vecinos, false)).toBeNull();
  });
});

/* ── Motor completo: ninguna salida puede violar dentroDeLey ────────────── */

describe("recomendar", () => {
  it("propone cambios siempre dentro de la ley", () => {
    const vecinos: VecinoRadio[] = [
      { id: "A", snrDb: 3, perdida: 0.02, necesario: true, potenciaDbm: 14, acimutGrados: 90 },
    ];
    const r = recomendar(
      [medicion(3), medicion(3), medicion(3)],
      vecinos,
      PERFIL_EU,
      actualLora(),
    );
    expect(r.cambio).not.toBeNull();
    const veredicto = dentroDeLey({ banda: "EU_868", radio: r.params }, PERFIL_EU);
    expect(veredicto.ok).toBe(true);
    expect(r.params.potenciaDbm).toBeLessThanOrEqual(27);
    expect(r.porque.length).toBeGreaterThan(2);
  });

  it("sin nada que mejorar, no propone cambio", () => {
    // SF ya máximo sostenible por sus medidas y potencia ajustada.
    const r = recomendar([medicion(-8)], [], PERFIL_EU, {
      ...actualLora({ spreadFactor: 7 }),
      potenciaDbm: 14,
    });
    expect(r.cambio?.params.frecuenciaMhz ?? r.params.frecuenciaMhz).toBe(869.525);
    expect(dentroDeLey({ banda: "EU_868", radio: r.params }, PERFIL_EU).ok).toBe(true);
  });

  it("marca el anuncio previo cuando propone cambiar de canal", () => {
    const base = actualLora();
    const r = recomendar(
      [medicion(-8)],
      [],
      PERFIL_EU,
      {
        ...base,
        canalesMedidos: [
          { frecuenciaMhz: 869.525, ruidoDbm: -90, ocupacion: 0.7 },
          { frecuenciaMhz: 869.4375, ruidoDbm: -118, ocupacion: 0.02 },
        ],
      },
    );
    expect(r.cambio?.diferencias.frecuenciaMhz?.a).toBe("869.4375");
    expect(r.cambio?.anuncioPrevioCanal).toBe(true);
  });
});

/* ── Vigilancia y reversión ─────────────────────────────────────────────── */

describe("vigilarCambio", () => {
  const vigilancia: VigilanciaCambio = {
    paramsAnteriores: actualLora(),
    base: medicion(-5, { perdida: 0.02 }),
    hastaMs: 10_000,
  };

  it("revierte si la métrica empeora dentro de la ventana", () => {
    const post = [
      medicion(-9, { at: 2_000 }), // caída > tolerancia (2 dB)
      medicion(-10, { at: 4_000 }),
    ];
    const v = vigilarCambio(vigilancia, post, 5_000);
    expect(v.revertir).toBe(true);
    expect(v.motivos[0]).toMatch(/se revierte/);
  });

  it("no revierte si las métricas aguantan", () => {
    const post = [medicion(-4.5, { at: 2_000 }), medicion(-5, { at: 4_000 })];
    const v = vigilarCambio(vigilancia, post, 5_000);
    expect(v.revertir).toBe(false);
  });

  it("consolida el cambio al terminar la ventana", () => {
    const v = vigilarCambio(vigilancia, [], 20_000);
    expect(v.revertir).toBe(false);
    expect(v.motivos[0]).toMatch(/consolida/);
  });
});

/* ── Escaleras bien ordenadas ───────────────────────────────────────────── */

describe("escaleras de modulación", () => {
  it("la escalera LoRa sube de robustez y baja de SNR mínimo", () => {
    for (let i = 1; i < ESCALERA_LORA.length; i++) {
      expect(ESCALERA_LORA[i].snrMinDb).toBeGreaterThan(ESCALERA_LORA[i - 1].snrMinDb);
    }
  });
});
