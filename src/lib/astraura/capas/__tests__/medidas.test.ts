import { describe, it, expect } from "vitest";
import {
  registrarMedida,
  mediaMedidas,
  ordenarPorMedidas,
  almacenamientoEnMemoriaMedidas,
  type MedidaNeurona,
} from "../medidas";

describe("medidas", () => {
  it("registra y mantiene media móvil de 20 muestras", async () => {
    const almacen = almacenamientoEnMemoriaMedidas();
    const neurona = "n1";
    const medidaBase = {
      neurona,
      modelo: "m1",
      capa: "palabra" as const,
      latenciaMs: 100,
      tokPorS: 20,
      acierto: 0.8,
    };

    for (let i = 0; i < 25; i++) {
      await registrarMedida(almacen, { ...medidaBase, latenciaMs: 100 + i });
    }

    const guardadas = await almacen.leer("medidas-neuronas-v1/n1");
    expect(guardadas).not.toBeNull();
    expect(guardadas!.length).toBe(20);

    const media = mediaMedidas(guardadas!);
    expect(media.muestras).toBe(20);
    expect(media.latenciaMs).toBeGreaterThan(100);
  });

  it("calcula media correcta", () => {
    const medidas: MedidaNeurona[] = [
      { neurona: "n1", modelo: "m1", capa: "palabra", latenciaMs: 100, tokPorS: 20, acierto: 0.8, timestamp: 1 },
      { neurona: "n1", modelo: "m1", capa: "palabra", latenciaMs: 200, tokPorS: 30, acierto: 0.9, timestamp: 2 },
    ];
    const media = mediaMedidas(medidas);
    expect(media.latenciaMs).toBe(150);
    expect(media.tokPorS).toBe(25);
    expect(media.acierto).toBe(0.85);
    expect(media.muestras).toBe(2);
  });

  it("ordenarPorMedidas prioriza más rápido", async () => {
    const almacen = almacenamientoEnMemoriaMedidas();
    const neurona = "n1";

    await registrarMedida(almacen, {
      neurona,
      modelo: "modelo-lento",
      capa: "palabra",
      latenciaMs: 500,
      acierto: 0.8,
    });
    await registrarMedida(almacen, {
      neurona,
      modelo: "modelo-rapido",
      capa: "palabra",
      latenciaMs: 100,
      acierto: 0.9,
    });

    const medidas = (await almacen.leer("medidas-neuronas-v1/n1")) ?? [];
    const candidatos = [
      { modelo: "modelo-lento", donde: "local" as const, puntos: 100 },
      { modelo: "modelo-rapido", donde: "local" as const, puntos: 100 },
    ];

    const ordenados = await ordenarPorMedidas(candidatos, medidas, neurona);
    expect(ordenados[0].modelo).toBe("modelo-rapido");
    expect(ordenados[1].modelo).toBe("modelo-lento");
  });

  it("ordenarPorMedidas respeta orden catálogo sin medidas", async () => {
    const candidatos = [
      { modelo: "m2", donde: "local" as const, puntos: 100 },
      { modelo: "m1", donde: "local" as const, puntos: 50 },
    ];

    const ordenados = ordenarPorMedidas(candidatos, [], "inexistente");
    // Sin medidas, debe mantener el orden original (no cambiar nada)
    expect(ordenados[0].modelo).toBe("m2");
    expect(ordenados[1].modelo).toBe("m1");
  });

  it("ordenarPorMedidas ignora las medidas de otra neurona", () => {
    const medidas: MedidaNeurona[] = [
      { neurona: "otra", modelo: "m1", capa: "palabra", latenciaMs: 900, acierto: 0.1, timestamp: 1 },
    ];
    const candidatos = [
      { modelo: "m1", donde: "local" as const, puntos: 100 },
      { modelo: "m2", donde: "local" as const, puntos: 50 },
    ];

    const ordenados = ordenarPorMedidas(candidatos, medidas, "n1");
    expect(ordenados[0].modelo).toBe("m1");
    expect(ordenados[1].modelo).toBe("m2");
  });
});