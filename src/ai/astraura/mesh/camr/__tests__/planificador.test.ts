/**
 * CAMR · planificador multitrayecto — funciones puras, sin red ni disco
 * (enlaces y mediciones fabricados en memoria, adaptadores falsos).
 */
import { describe, expect, it } from "vitest";

import {
  admisible,
  consumeCuota,
  estimaAireMs,
  fragmentosPorMtu,
  planificar,
} from "../planificador";
import type { EstadoResiliencia } from "../metrica";
import type {
  ClaseTrafico,
  EnlaceFisico,
  Medicion,
  Tecnologia,
} from "../tipos";

/* ── Fábricas de prueba ───────────────────────────────────────────────────── */

const medicion = (parcial: Partial<Medicion>): Medicion => ({
  rssiDbm: null,
  snrDb: 10,
  ber: null,
  ruidoDbm: null,
  latenciaMs: 100,
  perdida: 0,
  tiempoAireUsado: 0.2,
  vecinos: 3,
  anchoBandaKbps: null,
  at: 0,
  ...parcial,
});

const enlace = (
  id: string,
  tecnologia: Tecnologia,
  parcial: Partial<{
    banda: string;
    capacidadKbps: number;
    mtu: number;
    cifradoPermitido: boolean;
    estado: EnlaceFisico["estado"];
  }> = {},
): EnlaceFisico => ({
  id,
  tecnologia,
  banda: parcial.banda ?? "EU_868",
  frecuenciaMhz: 868.1,
  capacidadKbps: parcial.capacidadKbps ?? 10,
  mtu: parcial.mtu ?? 250,
  cifradoPermitido: parcial.cifradoPermitido ?? true,
  estado: parcial.estado ?? "activo",
  medir: () => medicion({}),
  aplicar: async () => ({ ok: true }),
  enviar: async () => ({ ok: true }),
});

const res: EstadoResiliencia = { ema: 0.9, n: 8 };

const metricasDe = (
  entradas: Array<[string, Medicion]>,
): Record<string, { medicion: Medicion; resiliencia: EstadoResiliencia }> =>
  Object.fromEntries(entradas.map(([id, m]) => [id, { medicion: m, resiliencia: res }]));

const paquete = { bytes: 200, cifrado: true };

/* ── Utilidades ───────────────────────────────────────────────────────────── */

describe("fragmentosPorMtu / estimaAireMs", () => {
  it("fragmenta por MTU entre tecnologías", () => {
    expect(fragmentosPorMtu(0, 250)).toBe(0);
    expect(fragmentosPorMtu(100, 250)).toBe(1);
    expect(fragmentosPorMtu(501, 250)).toBe(3);
    expect(fragmentosPorMtu(10, 0)).toBe(1);
  });

  it("estima tiempo de aire con margen del 10 %", () => {
    expect(estimaAireMs(0, 10)).toBe(0);
    expect(estimaAireMs(100, 0)).toBe(0);
    expect(estimaAireMs(125, 10)).toBeCloseTo(110, 5);
  });

  it("consumeCuota es inmutable y nunca baja de cero", () => {
    const antes = { a: 100 };
    const despues = consumeCuota(antes, "a", 40);
    expect(despues.a).toBe(60);
    expect(antes.a).toBe(100);
    expect(consumeCuota(antes, "a", 500).a).toBe(0);
    expect(consumeCuota(antes, "b", 10)).toBe(antes);
  });
});

/* ── Admisión (estado, cifrado, LoRa, equidad) ────────────────────────────── */

describe("admisible", () => {
  it("veta enlaces caídos o desconectados", () => {
    const caido = enlace("l1", "rns", { estado: "caido" });
    expect(admisible(caido, paquete, "mensajes", {})).toBe(false);
  });

  it("nunca manda tráfico cifrado por bandas de radioaficionado (§5)", () => {
    const ham = enlace("ham", "rns", { banda: "ham-2m", cifradoPermitido: false });
    expect(admisible(ham, paquete, "mensajes", {})).toBe(false);
    expect(admisible(ham, { ...paquete, cifrado: false }, "mensajes", {})).toBe(true);
  });

  it("masivo nunca va por LoRa salvo petición expresa", () => {
    const lora = enlace("lora", "rns");
    expect(admisible(lora, paquete, "masivo", {})).toBe(false);
    expect(admisible(lora, { ...paquete, forzar: true }, "masivo", {})).toBe(true);
  });

  it("sin cupo de aire no entra… salvo control-critico (prioridad de emergencia)", () => {
    const wifi = enlace("w", "80211s", { capacidadKbps: 100_000 });
    expect(admisible(wifi, paquete, "masivo", { w: 0 })).toBe(false);
    expect(admisible(wifi, paquete, "control-critico", { w: 0 })).toBe(true);
  });
});

/* ── planificar por clase ─────────────────────────────────────────────────── */

describe("planificar", () => {
  const lora = enlace("lora", "rns", { capacidadKbps: 5, mtu: 220 });
  const wifiLento = enlace("wifi-lento", "80211s", { capacidadKbps: 20_000, mtu: 1500 });
  const wifiRapido = enlace("wifi-rapido", "batman", { capacidadKbps: 80_000, mtu: 1500 });

  const metricas = metricasDe([
    ["lora", medicion({ latenciaMs: 400, snrDb: 12, perdida: 0.01, anchoBandaKbps: 4 })],
    ["wifi-lento", medicion({ latenciaMs: 30, perdida: 0.3, anchoBandaKbps: 10_000, tiempoAireUsado: 0.9 })],
    ["wifi-rapido", medicion({ latenciaMs: 12, perdida: 0, anchoBandaKbps: 60_000 })],
  ]);
  const enlaces = [lora, wifiLento, wifiRapido];

  it("control-critico elige la mayor resiliencia y añade un segundo camino", () => {
    const rutas = planificar(paquete, "control-critico", enlaces, metricas, {});
    expect(rutas).toHaveLength(2);
    expect(rutas[0].enlaceId).toBe("lora"); // resiliencia domina (peso 0,55)
    expect(rutas[0].redundante).toBe(false);
    expect(rutas[1].redundante).toBe(true);
    expect(rutas[1].enlaceId).not.toBe(rutas[0].enlaceId);
    expect(rutas[0].fragmentos).toBe(1); // 200 B caben en la MTU de 220
  });

  it("control-critico con un solo enlace vivo no inventa redundancia", () => {
    const rutas = planificar(paquete, "control-critico", [lora], metricas, {});
    expect(rutas).toHaveLength(1);
  });

  it("masivo va por la mayor capacidad y trocea por MTU", () => {
    const grande = { bytes: 40_000, cifrado: true };
    const rutas = planificar(grande, "masivo", enlaces, metricas, {});
    expect(rutas[0].enlaceId).toBe("wifi-rapido");
    expect(rutas[0].fragmentos).toBe(Math.ceil(40_000 / 1500));
  });

  it("masivo solo con LoRa devuelve vacío salvo forzar", () => {
    expect(planificar(paquete, "masivo", [lora], metricas, {})).toEqual([]);
    const forzado = planificar({ ...paquete, forzar: true }, "masivo", [lora], metricas, {});
    expect(forzado[0].enlaceId).toBe("lora");
  });

  it("tiempo-real prefiere la menor latencia estable", () => {
    const estables: EstadoResiliencia = { ema: 0.95, n: 20 };
    const m = metricasDe([
      ["lora", medicion({ latenciaMs: 400 })],
      ["wifi-lento", medicion({ latenciaMs: 60, perdida: 0.4 })],
      ["wifi-rapido", medicion({ latenciaMs: 8 })],
    ]);
    for (const id of Object.keys(m)) m[id].resiliencia = estables;
    const rutas = planificar(paquete, "tiempo-real", enlaces, m, {});
    expect(rutas[0].enlaceId).toBe("wifi-rapido");
  });

  it("mensajes equilibra y esquiva el canal saturado", () => {
    const rutas = planificar(paquete, "mensajes", enlaces, metricas, {});
    expect(rutas[0].enlaceId).toBe("wifi-rapido");
    expect(rutas[0].motivo).toContain("equilibrio");
  });

  it("caída del enlace favorito: re-planifica por el siguiente", () => {
    const caido = enlace("wifi-rapido", "batman", {
      capacidadKbps: 80_000,
      mtu: 1500,
      estado: "caido",
    });
    // Con wifi-lento sano (el fixture de arriba lo tiene saturado a propósito).
    const m = metricasDe([
      ["lora", medicion({ latenciaMs: 400, anchoBandaKbps: 4 })],
      ["wifi-lento", medicion({ latenciaMs: 25, perdida: 0, anchoBandaKbps: 15_000 })],
    ]);
    const rutas = planificar(paquete, "tiempo-real", [lora, wifiLento, caido], m, {});
    expect(rutas[0].enlaceId).toBe("wifi-lento");
  });

  it("todo caído o sin métricas devuelve vacío, nunca lanza", () => {
    const caidos = enlaces.map((e) => ({ ...e, estado: "caido" as const }));
    expect(planificar(paquete, "mensajes" satisfies ClaseTrafico, caidos, metricas, {})).toEqual([]);
    expect(planificar(paquete, "mensajes", enlaces, {}, {})).toEqual([]);
  });

  it("equidad: el cupo agotado descarta el enlace aunque sea el mejor", () => {
    const cuotas = { "wifi-rapido": 1 }; // 1 ms no da para 200 B a 80 Mbps… sí da; usa 0
    cuotas["wifi-rapido"] = 0;
    const rutas = planificar(paquete, "masivo", enlaces, metricas, cuotas);
    expect(rutas[0].enlaceId).toBe("wifi-lento");
  });

  it("paquete cifrado jamás sale por banda sin cifradoPermitido", () => {
    const ham = enlace("ham", "rns", { banda: "ham-2m", cifradoPermitido: false });
    const m = metricasDe([["ham", medicion({})]]);
    expect(planificar(paquete, "control-critico", [ham], m, {})).toEqual([]);
    const claro = planificar({ ...paquete, cifrado: false }, "control-critico", [ham], m, {});
    expect(claro).toHaveLength(1);
  });
});
