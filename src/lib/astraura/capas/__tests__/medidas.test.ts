import { describe, it, expect } from "vitest";
import {
  registrarMedida,
  mediaMedidas,
  ordenarPorMedidas,
  almacenamientoEnMemoriaMedidas,
  type MedidaNeurona,
} from "../medidas";

const capa = "palabra" as const;

describe("medidas por neurona", () => {
  it("registrarMedida guarda como mucho las últimas 20 muestras", async () => {
    const almacen = almacenamientoEnMemoriaMedidas();
    const medida = { neurona: "n1", modelo: "m1", capa, latenciaMs: 100, tokPorS: 20, acierto: 0.8 };
    for (let i = 0; i < 25; i++) {
      await registrarMedida(almacen, { ...medida, latenciaMs: 100 + i });
    }
    const guardadas = await almacen.leer("medidas-neuronas-v1/n1");
    expect(guardadas?.length).toBe(20);
    expect(guardadas?.[0].latenciaMs).toBe(105);
    expect(guardadas?.[19].latenciaMs).toBe(124);
  });

  it("mediaMedidas calcula latencia, tok/s y acierto, y tolera los que faltan", () => {
    const parciales: MedidaNeurona[] = [
      { neurona: "n1", modelo: "m1", capa, latenciaMs: 100, tokPorS: 20, timestamp: 1 },
      { neurona: "n1", modelo: "m1", capa, latenciaMs: 200, acierto: 0.9, timestamp: 2 },
    ];
    expect(mediaMedidas(parciales)).toEqual({ latenciaMs: 150, tokPorS: 20, acierto: 0.9, muestras: 2 });
    expect(mediaMedidas([])).toEqual({ latenciaMs: 0, muestras: 0 });
    const completas: MedidaNeurona[] = [
      { neurona: "n1", modelo: "m1", capa, latenciaMs: 100, tokPorS: 20, acierto: 0.8, timestamp: 1 },
      { neurona: "n1", modelo: "m1", capa, latenciaMs: 200, tokPorS: 30, acierto: 0.9, timestamp: 2 },
    ];
    const media = mediaMedidas(completas);
    expect(media.latenciaMs).toBe(150);
    expect(media.tokPorS).toBe(25);
    expect(media.acierto).toBe(0.85);
  });

  it("ordenarPorMedidas pone primero el más rápido y más acertado", () => {
    const medidas: MedidaNeurona[] = [
      { neurona: "n1", modelo: "lento", capa, latenciaMs: 500, acierto: 0.8, timestamp: 1 },
      { neurona: "n1", modelo: "rapido", capa, latenciaMs: 100, acierto: 0.9, timestamp: 2 },
    ];
    const candidatos = [
      { modelo: "lento", donde: "local" as const, puntos: 10 },
      { modelo: "rapido", donde: "local" as const, puntos: 10 },
    ];
    const orden = ordenarPorMedidas(candidatos, medidas, "n1");
    expect(orden[0].modelo).toBe("rapido");
    expect(orden[1].modelo).toBe("lento");
    expect(orden[0]).toEqual(candidatos[1]);
  });

  it("sin medida para la neurona, mantiene el orden del catálogo", () => {
    const candidatos = [
      { modelo: "m2", donde: "local" as const, puntos: 30 },
      { modelo: "m1", donde: "local" as const, puntos: 10 },
    ];
    const sinNada = ordenarPorMedidas(candidatos, [], "n1");
    expect(sinNada.map((c) => c.modelo)).toEqual(["m2", "m1"]);
    const deOtraNeurona: MedidaNeurona[] = [
      { neurona: "n2", modelo: "m1", capa, latenciaMs: 1, timestamp: 1 },
    ];
    const ajenas = ordenarPorMedidas(candidatos, deOtraNeurona, "n1");
    expect(ajenas.map((c) => c.modelo)).toEqual(["m2", "m1"]);
  });
});
