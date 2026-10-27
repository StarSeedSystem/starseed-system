/**
 * oido-ambiental — cubre los cortes de la puerta del oído: decisiones de
 * `decidirEnvioOido` por cada caso del contrato §3 y la energía RMS de
 * `energiaDe`. Todo puro: sin red, sin disco, sin reloj del sistema.
 */

import { describe, expect, it } from "vitest";
import {
  INTERVALO_MINIMO_MS,
  UMBAJO_ENERGIA,
  decidirEnvioOido,
  energiaDe,
  type TramoOido,
} from "@/lib/aurora/sentidos/oido-ambiental";

const SENTIDOS_VIVOS = { encendidos: true, siempreEscuchando: true };

function tramoLimpio(marcaMs: number): TramoOido {
  return { energia: 0.4, tieneVoz: false, marcaMs };
}

describe("decidirEnvioOido", () => {
  it("sin tramo no envía nada", () => {
    expect(decidirEnvioOido(SENTIDOS_VIVOS, null, 0)).toEqual({
      enviar: false,
      motivo: "sin-tramo",
    });
    expect(decidirEnvioOido(SENTIDOS_VIVOS, null, 1_000_000)).toEqual({
      enviar: false,
      motivo: "sin-tramo",
    });
  });

  it("con los sentidos apagados nunca envía, aunque suene alto", () => {
    const t = tramoLimpio(10_000);
    expect(decidirEnvioOido({ encendidos: false, siempreEscuchando: true }, t, 0)).toEqual({
      enviar: false,
      motivo: "sentidos-apagados",
    });
    // Ambos ajustes apagados: el primer corte manda.
    expect(decidirEnvioOido({ encendidos: false, siempreEscuchando: false }, t, 0)).toEqual({
      enviar: false,
      motivo: "sentidos-apagados",
    });
  });

  it("sentidos encendidos sin «siempre escuchando» tampoco oye", () => {
    expect(decidirEnvioOido({ encendidos: true, siempreEscuchando: false }, tramoLimpio(10_000), 0)).toEqual({
      enviar: false,
      motivo: "sin-escucha",
    });
  });

  it("un fragmento con voz no va al oído: la lleva el reconocimiento de habla", () => {
    const t: TramoOido = { energia: 0.5, tieneVoz: true, marcaMs: 10_000 };
    expect(decidirEnvioOido(SENTIDOS_VIVOS, t, 0)).toEqual({ enviar: false, motivo: "con-voz" });
  });

  it("energía bajo el umbral es silencio y no se gasta CPU", () => {
    const t: TramoOido = { energia: UMBAJO_ENERGIA - 0.01, tieneVoz: false, marcaMs: 10_000 };
    expect(decidirEnvioOido(SENTIDOS_VIVOS, t, 0)).toEqual({ enviar: false, motivo: "silencio-bajo" });
    // Justo en el umbral también es silencio (cuando suena de verdad está encima).
    const justo: TramoOido = { energia: UMBAJO_ENERGIA, tieneVoz: false, marcaMs: 10_000 };
    expect(decidirEnvioOido(SENTIDOS_VIVOS, justo, 0)).toEqual({ enviar: false, motivo: "silencio-bajo" });
  });

  it("un tramo limpio con sentidos vivos y sin envío anterior pasa", () => {
    expect(decidirEnvioOido(SENTIDOS_VIVOS, tramoLimpio(10_000), 0)).toEqual({
      enviar: true,
      motivo: "tramo-limpio",
    });
  });

  it("no envía dos fragmentos del mismo golpe: uno cada N segundos", () => {
    const primero = decidirEnvioOido(SENTIDOS_VIVOS, tramoLimpio(1_000), 0);
    expect(primero.enviar).toBe(true);
    // A un milisegundo del anterior: demasiado pronto.
    expect(decidirEnvioOido(SENTIDOS_VIVOS, tramoLimpio(2_000), 1_000)).toEqual({
      enviar: false,
      motivo: "demasiado-pronto",
    });
    // Justo bajo el intervalo completo: también pronto.
    expect(decidirEnvioOido(SENTIDOS_VIVOS, tramoLimpio(1_000 + INTERVALO_MINIMO_MS - 1), 1_000)).toEqual({
      enviar: false,
      motivo: "demasiado-pronto",
    });
    // Ya pasado el intervalo: vuelve a pasar.
    expect(decidirEnvioOido(SENTIDOS_VIVOS, tramoLimpio(1_000 + INTERVALO_MINIMO_MS), 1_000)).toEqual({
      enviar: true,
      motivo: "tramo-limpio",
    });
  });
});

describe("energiaDe", () => {
  it("silencio exacto tiene energía 0", () => {
    expect(energiaDe(new Float32Array(64))).toBe(0);
    expect(energiaDe(new Float32Array(0))).toBe(0);
  });

  it("una onda de amplitud constante marca esa amplitud", () => {
    const onda = new Float32Array(32).fill(0.5);
    expect(energiaDe(onda)).toBeCloseTo(0.5, 10);
  });
});
