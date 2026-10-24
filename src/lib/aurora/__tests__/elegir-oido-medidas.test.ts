import { describe, expect, it } from "vitest";
import { medidasOido, OIDO_MEDIDAS_POR_MOTOR } from "../oido-medidas";
import { elegirOido } from "../stt-oss/motores-oido";
import type { MedidaVoz } from "../medidas-voz";

const medida = (
  motor: string,
  valor: number,
  timestamp: number,
  tipo: MedidaVoz["tipo"] = "tiempo-real-oido",
): MedidaVoz => ({ neurona: "n-yo", motor, tipo, valor, timestamp });

describe("medidasOido", () => {
  it("solo cuenta tiempo-real-oido y hace la mediana por motor", () => {
    const medidas = [
      medida("navegador", 90, 1),
      medida("navegador", 30, 2),
      medida("navegador", 50, 3),
      medida("phonon-2", 120, 4),
      medida("phonon-2", 999, 5, "primer-sonido"),
      medida("malla", -4, 6),
    ];
    expect(medidasOido(medidas)).toEqual({ navegador: 50, "phonon-2": 120 });
    expect(medidasOido([medida("navegador", 30, 1), medida("navegador", 50, 2)])).toEqual({ navegador: 40 });
  });

  it("usa las últimas 20 de cada motor (y respeta el tope pedido)", () => {
    expect(OIDO_MEDIDAS_POR_MOTOR).toBe(20);
    const medidas = Array.from({ length: 25 }, (_, i) => medida("navegador", i < 13 ? 900 : 20, i));
    expect(medidasOido(medidas).navegador).toBe(20);
    const tres = [medida("navegador", 10, 1), medida("navegador", 20, 2), medida("navegador", 30, 3)];
    expect(medidasOido(tres, { maxPorMotor: 2 }).navegador).toBe(25);
  });

  it("vacío, nulo o basura no lanzan: devuelven la tabla vacía", () => {
    expect(medidasOido([])).toEqual({});
    expect(medidasOido(null)).toEqual({});
    expect(medidasOido(undefined)).toEqual({});
    const basura = [medida("navegador", Number.NaN, 1), { ...medida("navegador", 10, 2), timestamp: Number.NaN }];
    expect(medidasOido(basura)).toEqual({});
  });
});

describe("elegirOido con medidas reales", () => {
  it("con medidas elige el más rápido; sin medidas, el orden de siempre", () => {
    const medidas = [
      medida("navegador", 40, 1),
      medida("navegador", 30, 2),
      medida("navegador", 50, 3),
      medida("phonon-2", 120, 4),
      medida("phonon-2", 130, 5),
    ];
    const conMedidas = elegirOido({
      idioma: "es",
      disponibles: ["phonon-2", "navegador"],
      fase: "parcial",
      medidas: medidasOido(medidas),
    });
    expect(conMedidas.motor).toBe("navegador");
    expect(conMedidas.motivo).toContain("menor latencia medida");

    const sinMedidas = elegirOido({
      idioma: "es",
      disponibles: ["navegador", "phonon-2"],
      fase: "parcial",
    });
    expect(sinMedidas.motor).toBe("phonon-2");
    expect(sinMedidas.motivo).toContain("parcial");
  });

  it("en fase final las medidas no cambian la precisión: manda el idioma", () => {
    const r = elegirOido({
      idioma: "es",
      disponibles: ["navegador", "parakeet-v3"],
      fase: "final",
      medidas: { navegador: 1 },
    });
    expect(r.motor).toBe("parakeet-v3");
  });
});
