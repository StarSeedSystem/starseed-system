import { describe, it, expect } from "vitest";
import { OIDO_VIGENCIA_MS, medidasOido } from "@/lib/aurora/stt-oss/medidas-oido";
import { elegirOido } from "@/lib/aurora/stt-oss/motores-oido";
import type { MedidaVoz } from "@/lib/aurora/medidas-voz";

const AHORA = 1_700_000_000_000;

function medida(parcial: Partial<MedidaVoz> = {}): MedidaVoz {
  return {
    neurona: "n-1",
    motor: "navegador",
    tipo: "tiempo-real-oido",
    valor: 100,
    timestamp: AHORA - 1_000,
    ...parcial,
  };
}

describe("medidasOido · de lo medido a la entrada del elector", () => {
  it("devuelve la mediana de tiempo-real-oido por motor", () => {
    const salida = medidasOido(
      [
        medida({ motor: "navegador", valor: 40, timestamp: AHORA - 3_000 }),
        medida({ motor: "navegador", valor: 20, timestamp: AHORA - 2_000 }),
        medida({ motor: "navegador", valor: 60, timestamp: AHORA - 1_000 }),
        medida({ motor: "phonon-2", valor: 120 }),
      ],
      { ahora: AHORA },
    );
    expect(salida).toEqual({ navegador: 40, "phonon-2": 120 });
  });

  it("usa solo las últimas medidas de cada motor para la mediana", () => {
    const salida = medidasOido(
      [
        medida({ motor: "navegador", valor: 300, timestamp: AHORA - 3_000 }),
        medida({ motor: "navegador", valor: 10, timestamp: AHORA - 2_000 }),
        medida({ motor: "navegador", valor: 30, timestamp: AHORA - 1_000 }),
      ],
      { ahora: AHORA, maxPorMotor: 2 },
    );
    expect(salida.navegador).toBe(20);
  });

  it("descarta medidas viejas, de otra neurona, de otro idioma y de otro tipo", () => {
    const vieja = medida({ motor: "phonon-2", timestamp: AHORA - OIDO_VIGENCIA_MS - 1 });
    const salida = medidasOido(
      [
        vieja,
        medida({ motor: "voicestudio", neurona: "otra" }),
        medida({ motor: "moonshine", idioma: "en" }),
        medida({ motor: "parakeet-v3", tipo: "primer-sonido" }),
        medida({ motor: "navegador", idioma: "es-MX", valor: 25 }),
        medida({ motor: "whisper-web", idioma: undefined, valor: 70 }),
      ],
      { ahora: AHORA, neurona: "n-1", idioma: "es" },
    );
    expect(salida).toEqual({ navegador: 25, "whisper-web": 70 });
  });

  it("no lanza y devuelve {} sin medidas o con basura", () => {
    expect(medidasOido(undefined)).toEqual({});
    expect(medidasOido(null)).toEqual({});
    expect(medidasOido([])).toEqual({});
    expect(medidasOido([medida({ valor: 0 }), medida({ valor: Number.NaN })])).toEqual({});
  });

  it("promedia las dos centrales cuando hay un número par de medidas", () => {
    const salida = medidasOido(
      [
        medida({ motor: "navegador", valor: 10, timestamp: AHORA - 3_000 }),
        medida({ motor: "navegador", valor: 20, timestamp: AHORA - 2_000 }),
        medida({ motor: "navegador", valor: 90, timestamp: AHORA - 1_000 }),
        medida({ motor: "navegador", valor: 100, timestamp: AHORA }),
      ],
      { ahora: AHORA },
    );
    expect(salida.navegador).toBe(55);
  });

  it("agrupa el motor sin espacios y descarta nombres vacíos y horas futuras", () => {
    const salida = medidasOido(
      [
        medida({ motor: "  navegador  ", valor: 30 }),
        medida({ motor: "navegador", valor: 50, timestamp: AHORA + 1 }),
        medida({ motor: "   ", valor: 10 }),
      ],
      { ahora: AHORA },
    );
    expect(salida).toEqual({ navegador: 30 });
  });

  it("compara idiomas por su base y respeta la vigencia que se le pase", () => {
    const salida = medidasOido(
      [
        medida({ motor: "navegador", idioma: "ES-mx", valor: 30 }),
        medida({ motor: "phonon-2", idioma: "en", valor: 10 }),
        medida({ motor: "moonshine", valor: 20, timestamp: AHORA - 5_000 }),
      ],
      { ahora: AHORA, idioma: "es-ES", vigenciaMs: 3_000 },
    );
    expect(salida).toEqual({ navegador: 30 });
  });

  it("por defecto solo entran las 20 medidas más recientes de cada motor", () => {
    const medidas = Array.from({ length: 30 }, (_, i) =>
      medida({ motor: "navegador", valor: i + 1, timestamp: AHORA - 30_000 + i * 1_000 }),
    );
    expect(medidasOido(medidas, { ahora: AHORA }).navegador).toBe(20.5);
  });
});

describe("elegirOido · aprende de lo medido (VOZ1024A)", () => {
  it("con medidas elige el oído más rápido de esta neurona", () => {
    const medidas = medidasOido(
      [
        medida({ motor: "phonon-2", valor: 120 }),
        medida({ motor: "navegador", valor: 30 }),
      ],
      { ahora: AHORA },
    );
    const eleccion = elegirOido({
      idioma: "es",
      disponibles: ["phonon-2", "navegador"],
      fase: "parcial",
      medidas,
    });
    expect(eleccion.motor).toBe("navegador");
    expect(eleccion.motivo).toContain("parcial");
  });

  it("con una sola medida, el motor medido gana al que no consta", () => {
    const medidas = medidasOido([medida({ motor: "navegador", valor: 45 })], { ahora: AHORA });
    const eleccion = elegirOido({
      idioma: "es",
      disponibles: ["phonon-2", "navegador"],
      fase: "parcial",
      medidas,
    });
    expect(eleccion.motor).toBe("navegador");
  });

  it("sin medidas mantiene el orden de siempre (phonon-2 primero)", () => {
    const eleccion = elegirOido({
      idioma: "es",
      disponibles: ["phonon-2", "navegador"],
      fase: "parcial",
      medidas: medidasOido([], { ahora: AHORA }),
    });
    expect(eleccion.motor).toBe("phonon-2");
  });
});
