/**
 * Tests del adaptador celular/SDR (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import {
  adaptadorCelular,
  adaptadorSdr,
  SIN_SDR,
  MOTIVO_SIN_CELDA,
  MOTIVO_SIN_SDR,
  type FuenteEspectroReal,
  type RangoEspectro,
} from "../celular-sdr";

const RANGO: RangoEspectro = { desdeKhz: 2400000, hastaKhz: 2500000 };

function fuenteFalsa(
  nombre: string,
  puntos: readonly { frecuenciaKhz: number; fuerzaDbm: number }[],
): FuenteEspectroReal {
  return {
    nombre,
    disponible: async () => true,
    barrer: async () => [...puntos],
  };
}

describe("adaptadorCelular", () => {
  it("sin lectura devuelve solo sinFuente con el motivo honesto", () => {
    const resultado = adaptadorCelular(null);
    expect(resultado.senales).toHaveLength(0);
    expect(resultado.sinFuente).toEqual([{ medio: "celular", motivo: MOTIVO_SIN_CELDA }]);
  });

  it("una lectura vacía tampoco inventa una señal", () => {
    const resultado = adaptadorCelular({});
    expect(resultado.senales).toHaveLength(0);
    expect(resultado.sinFuente[0].motivo).toBe(MOTIVO_SIN_CELDA);
  });

  it("con lectura convierte la banda por su id y conserva la medida", () => {
    const resultado = adaptadorCelular({
      celda: { banda: "celular-b7", frecuenciaKhz: 2655000, fuerzaDbm: -90 },
    });
    expect(resultado.sinFuente).toHaveLength(0);
    expect(resultado.senales).toHaveLength(1);
    const senal = resultado.senales[0];
    expect(senal.medio).toBe("celular");
    expect(senal.banda).toBe("Banda 7 (2600 MHz) — FDD");
    expect(senal.frecuenciaKhz).toBe(2655000);
    expect(senal.fuerzaDbm).toBe(-90);
    expect(senal.origen).toBe("medida");
    expect(senal.zona).toBeNull();
  });

  it("acepta el nombre corto de banda escrito por la plataforma", () => {
    const resultado = adaptadorCelular({ celda: { banda: "B1", frecuenciaKhz: 2140000 } });
    expect(resultado.senales[0].banda).toBe("Banda 1 (2100 MHz) — FDD");
  });

  it("deduce la banda por la frecuencia cuando no llega el nombre", () => {
    const resultado = adaptadorCelular({ celda: { frecuenciaKhz: 758000 } });
    expect(resultado.senales[0].banda).toContain("Banda 28");
  });

  it("si solo hay banda declarada, no inventa frecuencia ni fuerza", () => {
    const resultado = adaptadorCelular({ celda: { banda: "celular-b3" } });
    const senal = resultado.senales[0];
    expect(senal.frecuenciaKhz).toBeNull();
    expect(senal.fuerzaDbm).toBeNull();
    expect(senal.origen).toBe("declarada");
  });
});

describe("adaptadorSdr", () => {
  it("sin SDR devuelve solo sinFuente con el motivo honesto", async () => {
    const resultado = await adaptadorSdr(SIN_SDR, RANGO);
    expect(resultado.senales).toHaveLength(0);
    expect(resultado.sinFuente).toEqual([{ medio: "sdr", motivo: MOTIVO_SIN_SDR }]);
  });

  it("con un SDR disponible barre y devuelve señales medidas con la fuente nombrada", async () => {
    const fuente = fuenteFalsa("RTL-SDR", [
      { frecuenciaKhz: 2437000, fuerzaDbm: -60 },
      { frecuenciaKhz: 2450000, fuerzaDbm: -70 },
    ]);
    const resultado = await adaptadorSdr(fuente, RANGO);
    expect(resultado.sinFuente).toHaveLength(0);
    expect(resultado.senales).toHaveLength(2);
    for (const senal of resultado.senales) {
      expect(senal.medio).toBe("sdr");
      expect(senal.origen).toBe("medida");
      expect(senal.fuente).toBe("SDR conectado: RTL-SDR");
      expect(senal.medidoEn).not.toBeNull();
    }
    expect(resultado.senales[0].fuerzaDbm).toBe(-60);
  });

  it("pasa el rango pedido al barrido y no inventa muestras inválidas", async () => {
    const llamadas: number[] = [];
    const fuente: FuenteEspectroReal = {
      nombre: "SDR de prueba",
      disponible: async () => true,
      barrer: async (desdeKhz, hastaKhz) => {
        llamadas.push(desdeKhz, hastaKhz);
        return [
          { frecuenciaKhz: Number.NaN, fuerzaDbm: -50 },
          { frecuenciaKhz: 2400000, fuerzaDbm: -80 },
        ];
      },
    };
    const resultado = await adaptadorSdr(fuente, RANGO);
    expect(llamadas).toEqual([2400000, 2500000]);
    expect(resultado.senales).toHaveLength(1);
    expect(resultado.senales[0].frecuenciaKhz).toBe(2400000);
  });
});
