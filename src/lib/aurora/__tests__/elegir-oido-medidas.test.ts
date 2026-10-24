import { describe, it, expect } from "vitest";
import {
  CLAVE_MEDIDAS_VOZ,
  medidasOido,
  medidasOidoActuales,
  type DepsMedidas,
  type MedidaVoz,
} from "@/lib/aurora/medidas-voz";
import { elegirOido } from "@/lib/aurora/stt-oss/motores-oido";

const NEURONA = "n-oido-1024";
const AHORA = 1_000_000;
const DIA = 24 * 60 * 60 * 1000;

function medida(
  motor: string,
  valor: number,
  timestamp = AHORA - 10,
  neurona = NEURONA,
): MedidaVoz {
  return { neurona, motor, tipo: "tiempo-real-oido", valor, timestamp };
}

function banco(inicial: MedidaVoz[] = []): DepsMedidas {
  const datos = new Map<string, string>();
  if (inicial.length) datos.set(CLAVE_MEDIDAS_VOZ, JSON.stringify(inicial));
  return {
    leer: (k) => datos.get(k) ?? null,
    escribir: (k, v) => {
      datos.set(k, v);
      return true;
    },
    borrar: (k) => {
      datos.delete(k);
    },
    ahora: () => AHORA,
    neurona: () => NEURONA,
  };
}

describe("elegirOido · medidas reales del oído (SGO1024A)", () => {
  it("sin medidas no inventa nada y el elector usa su orden de siempre", () => {
    const medidas = medidasOido([], { neurona: NEURONA, ahora: AHORA });
    expect(medidas).toEqual({});
    const r = elegirOido({
      idioma: "es",
      disponibles: ["phonon-2", "navegador"],
      fase: "parcial",
      medidas,
    });
    expect(r.motor).toBe("phonon-2");
    expect(r.motivo).toContain("parcial");
  });

  it("con medidas elige el motor más rápido", () => {
    const medidas = medidasOido(
      [medida("phonon-2", 900), medida("navegador", 220)],
      { neurona: NEURONA, ahora: AHORA },
    );
    expect(medidas).toEqual({ "phonon-2": 900, navegador: 220 });
    const r = elegirOido({
      idioma: "es",
      disponibles: ["phonon-2", "navegador"],
      fase: "parcial",
      medidas,
    });
    expect(r.motor).toBe("navegador");
  });

  it("usa la mediana de las últimas, no la media ni la última medida", () => {
    const medidas = medidasOido(
      [
        medida("phonon-2", 100, AHORA - 40),
        medida("phonon-2", 100, AHORA - 30),
        medida("phonon-2", 1000, AHORA - 20),
        medida("navegador", 300, AHORA - 10),
      ],
      { neurona: NEURONA, ahora: AHORA },
    );
    expect(medidas["phonon-2"]).toBe(100);
    const r = elegirOido({
      idioma: "es",
      disponibles: ["phonon-2", "navegador"],
      fase: "parcial",
      medidas,
    });
    expect(r.motor).toBe("phonon-2");
  });

  it("solo cuenta lo medido en esta neurona, de este tipo y dentro de la vigencia", () => {
    const medidas = medidasOido(
      [
        medida("phonon-2", 100, AHORA - 10, "otra-neurona"),
        medida("phonon-2", 100, AHORA - 8 * DIA),
        { ...medida("phonon-2", 100), tipo: "primer-sonido" },
        medida("navegador", 400, AHORA + 1),
      ],
      { neurona: NEURONA, ahora: AHORA },
    );
    expect(medidas).toEqual({});
  });

  it("nunca lanza con medidas ausentes o basura", () => {
    expect(medidasOido(null, { neurona: NEURONA, ahora: AHORA })).toEqual({});
    expect(medidasOido(undefined, { neurona: NEURONA, ahora: AHORA })).toEqual({});
    expect(
      medidasOido(
        [
          { neurona: NEURONA, motor: "", tipo: "tiempo-real-oido", valor: 10, timestamp: AHORA },
          medida("navegador", Number.NaN),
          medida("navegador", -5),
        ],
        { neurona: NEURONA, ahora: AHORA },
      ),
    ).toEqual({});
  });

  it("medidasOidoActuales lee solo las medidas de ESTA neurona y no bloquea", () => {
    const deps = banco([
      medida("phonon-2", 900),
      medida("navegador", 200),
      medida("navegador", 999, AHORA - 10, "otra-neurona"),
    ]);
    expect(medidasOidoActuales(deps)).toEqual({ "phonon-2": 900, navegador: 200 });
  });

  it("medidasOidoActuales sin almacén devuelve un mapa vacío", () => {
    expect(medidasOidoActuales(banco())).toEqual({});
  });
});
