import { describe, it, expect } from "vitest";
import {
  MAX_MUESTRAS,
  registrarMedida,
  mediaMedidas,
  ordenarPorMedidas,
  almacenamientoEnMemoriaMedidas,
  type MedidaNeurona,
} from "../medidas";

type Base = Omit<MedidaNeurona, "timestamp">;
const base = (parcial: Partial<Base>): Base => ({
  neurona: "n1", modelo: "m1", capa: "palabra", latenciaMs: 100, ...parcial,
});

describe("medidas", () => {
  it("registrarMedida guarda solo las últimas 20 muestras por neurona", async () => {
    const almacen = almacenamientoEnMemoriaMedidas();
    for (let i = 0; i < 25; i++) {
      await registrarMedida(almacen, base({ latenciaMs: 100 + i }));
    }
    const guardadas = await almacen.leer("medidas-neuronas-v1/n1");
    expect(guardadas?.length).toBe(MAX_MUESTRAS);
    expect(guardadas?.[0].latenciaMs).toBe(105);
    expect(guardadas?.at(-1)?.latenciaMs).toBe(124);
  });

  it("guarda las medidas de cada neurona por separado", async () => {
    const almacen = almacenamientoEnMemoriaMedidas();
    await registrarMedida(almacen, base({ neurona: "n1", latenciaMs: 100 }));
    await registrarMedida(almacen, base({ neurona: "n2", latenciaMs: 900 }));
    const deN1 = await almacen.leer("medidas-neuronas-v1/n1");
    const deN2 = await almacen.leer("medidas-neuronas-v1/n2");
    expect(deN1?.map((m) => m.latenciaMs)).toEqual([100]);
    expect(deN2?.map((m) => m.latenciaMs)).toEqual([900]);
  });

  it("mediaMedidas promedia latencia, tokens/s y acierto", () => {
    const media = mediaMedidas([
      { ...base({ latenciaMs: 100, tokPorS: 20, acierto: 0.8 }), timestamp: 1 },
      { ...base({ latenciaMs: 200, tokPorS: 30, acierto: 0.9 }), timestamp: 2 },
      { ...base({ latenciaMs: 300 }), timestamp: 3 },
    ]);
    expect(media.latenciaMs).toBe(200);
    expect(media.tokPorS).toBe(25);
    expect(media.acierto).toBe(0.85);
    expect(media.muestras).toBe(3);
    const vacia = mediaMedidas([]);
    expect(vacia.muestras).toBe(0);
    expect(vacia.latenciaMs).toBe(0);
    expect(vacia.tokPorS).toBeUndefined();
    expect(vacia.acierto).toBeUndefined();
  });

  it("ordenarPorMedidas pone primero al más rápido y más acertado", () => {
    const almacen = almacenamientoEnMemoriaMedidas();
    const candidatos = [
      { modelo: "modelo-lento", donde: "local" as const, puntos: 100 },
      { modelo: "modelo-rapido", donde: "local" as const, puntos: 100 },
    ];
    return (async () => {
      await registrarMedida(almacen, base({ modelo: "modelo-lento", latenciaMs: 500, acierto: 0.8 }));
      await registrarMedida(almacen, base({ modelo: "modelo-rapido", latenciaMs: 100, acierto: 0.9 }));
      const medidasGuardadas = (await almacen.leer("medidas-neuronas-v1/n1")) ?? [];
      const ordenados = ordenarPorMedidas(candidatos, medidasGuardadas, "n1");
      expect(ordenados[0].modelo).toBe("modelo-rapido");
      expect(ordenados[1].modelo).toBe("modelo-lento");
    })();
  });

  it("con la misma latencia, gana el que más acierta", () => {
    const medidas: MedidaNeurona[] = [
      { neurona: "n1", modelo: "acierta-poco", capa: "palabra", latenciaMs: 200, acierto: 0.3, timestamp: 1 },
      { neurona: "n1", modelo: "acierta-mucho", capa: "palabra", latenciaMs: 200, acierto: 0.95, timestamp: 1 },
    ];
    const candidatos = [
      { modelo: "acierta-poco", donde: "local" as const, puntos: 50 },
      { modelo: "acierta-mucho", donde: "local" as const, puntos: 50 },
    ];
    const ordenados = ordenarPorMedidas(candidatos, medidas, "n1");
    expect(ordenados.map((c) => c.modelo)).toEqual(["acierta-mucho", "acierta-poco"]);
  });

  it("usa la media de las muestras del modelo, no solo la última", () => {
    const medidas: MedidaNeurona[] = [
      { neurona: "n1", modelo: "variable", capa: "palabra", latenciaMs: 100, timestamp: 1 },
      { neurona: "n1", modelo: "variable", capa: "palabra", latenciaMs: 900, timestamp: 2 },
      { neurona: "n1", modelo: "estable", capa: "palabra", latenciaMs: 560, timestamp: 1 },
      { neurona: "n1", modelo: "estable", capa: "palabra", latenciaMs: 560, timestamp: 2 },
    ];
    const candidatos = [
      { modelo: "estable", donde: "local" as const, puntos: 50 },
      { modelo: "variable", donde: "local" as const, puntos: 50 },
    ];
    // Con la media gana "variable" (500 ms < 560 ms); mirando solo la última muestra perdería (900 ms).
    expect(ordenarPorMedidas(candidatos, medidas, "n1")[0].modelo).toBe("variable");
  });

  it("sin medidas de la neurona conserva el orden del catálogo y no muta la entrada", () => {
    const candidatos = [
      { modelo: "m2", donde: "local" as const, puntos: 100 },
      { modelo: "m1", donde: "local" as const, puntos: 50 },
      { modelo: "m3", donde: "local" as const, puntos: 75 },
    ];
    const ordenados = ordenarPorMedidas(candidatos, [], "n1");
    expect(ordenados).toEqual(candidatos);
    expect(ordenados).not.toBe(candidatos);
    // Medidas de otra neurona o de modelos ajenos al catálogo tampoco altera el orden.
    const ajenas: MedidaNeurona[] = [
      { neurona: "otra", modelo: "m2", capa: "palabra", latenciaMs: 10, acierto: 1, timestamp: 1 },
      { neurona: "n1", modelo: "m4", capa: "palabra", latenciaMs: 10, acierto: 1, timestamp: 1 },
    ];
    expect(ordenarPorMedidas(candidatos, ajenas, "n1")).toEqual(candidatos);
  });

  it("ordena solo con las medidas de la neurona pedida", () => {
    const medidas: MedidaNeurona[] = [
      { neurona: "n1", modelo: "a", capa: "palabra", latenciaMs: 100, timestamp: 1 },
      { neurona: "n1", modelo: "b", capa: "palabra", latenciaMs: 900, timestamp: 1 },
      { neurona: "n2", modelo: "b", capa: "palabra", latenciaMs: 10, timestamp: 1 },
    ];
    const candidatos = [
      { modelo: "b", donde: "local" as const, puntos: 50 },
      { modelo: "a", donde: "local" as const, puntos: 50 },
    ];
    const ordenados = ordenarPorMedidas(candidatos, medidas, "n1");
    expect(ordenados[0].modelo).toBe("a");
  });
});


