/**
 * Pruebas de los adaptadores de fuente real del espectrómetro (MAP1116B).
 * Puro: sin red, sin disco, sin `node:*`; la fuente SDR es un objeto falso local.
 */
import { describe, it, expect } from "vitest";

import {
  SIN_SDR,
  adaptadorCelular,
  adaptadorSdr,
  idBandaCelular,
} from "../celular-sdr";
import type { FuenteEspectroReal } from "../celular-sdr";

const AHORA = 1_700_000_000_000;

describe("idBandaCelular", () => {
  it("resuelve formas habituales de banda", () => {
    expect(idBandaCelular("B1")).toBe("celular-b1");
    expect(idBandaCelular("n78")).toBe("celular-n78");
    expect(idBandaCelular(" b28 ")).toBe("celular-b28");
  });

  it("devuelve null si no es una banda conocida", () => {
    expect(idBandaCelular("b99")).toBeNull();
    expect(idBandaCelular("")).toBeNull();
  });
});

describe("adaptadorCelular", () => {
  it("sin lectura → sinFuente con el motivo honesto", () => {
    const r = adaptadorCelular(null, AHORA);
    expect(r).toEqual({
      estado: "sinFuente",
      medio: "celular",
      motivo: "este aparato no entrega la celda ni la banda móvil a la app",
    });
  });

  it("lectura sin celda → sinFuente con el mismo motivo", () => {
    const r = adaptadorCelular({}, AHORA);
    expect(r.estado).toBe("sinFuente");
    if (r.estado === "sinFuente") expect(r.motivo).toBe("este aparato no entrega la celda ni la banda móvil a la app");
  });

  it("con lectura falsa de B1 → banda correcta y origen medida", () => {
    const r = adaptadorCelular(
      { celda: { banda: "B1", frecuenciaKhz: 2140000, fuerzaDbm: -95 } },
      AHORA,
    );
    expect(r.estado).toBe("senales");
    if (r.estado !== "senales") return;
    expect(r.senales).toHaveLength(1);
    const s = r.senales[0];
    expect(s.medio).toBe("celular");
    expect(s.banda).toBe("Banda 1 (2100 MHz) — FDD");
    expect(s.frecuenciaKhz).toBe(2140000);
    expect(s.fuerzaDbm).toBe(-95);
    expect(s.origen).toBe("medida");
    expect(s.capa).toBe("propia");
    expect(s.fuente).toBe("informe de celda del aparato");
    expect(s.medidoEn).toBe(AHORA);
  });

  it("banda desconocida y sin frecuencia → banda honesta, no número inventado", () => {
    const r = adaptadorCelular({ celda: { banda: "B99", fuerzaDbm: -80 } }, AHORA);
    expect(r.estado).toBe("senales");
    if (r.estado !== "senales") return;
    expect(r.senales[0].banda).toBe("B99");
    expect(r.senales[0].frecuenciaKhz).toBeNull();
  });
});

describe("adaptadorSdr", () => {
  it("SIN_SDR no está disponible y da sinFuente", async () => {
    expect(await SIN_SDR.disponible()).toBe(false);
    const r = await adaptadorSdr(SIN_SDR, { desdeKhz: 88_000, hastaKhz: 108_000 }, AHORA);
    expect(r).toEqual({
      estado: "sinFuente",
      medio: "sdr",
      motivo: "no hay un receptor SDR conectado",
    });
  });

  it("con SDR falso disponible → señales medidas con la fuente nombrada", async () => {
    const fuente: FuenteEspectroReal = {
      nombre: "RTL-SDR v4",
      disponible: async () => true,
      barrer: async () => [
        { frecuenciaKhz: 98_000, fuerzaDbm: -60 },
        { frecuenciaKhz: 100_000, fuerzaDbm: -70 },
      ],
    };
    const r = await adaptadorSdr(fuente, { desdeKhz: 88_000, hastaKhz: 108_000 }, AHORA);
    expect(r.estado).toBe("senales");
    if (r.estado !== "senales") return;
    expect(r.senales).toHaveLength(2);
    expect(r.senales[0].medio).toBe("sdr");
    expect(r.senales[0].origen).toBe("medida");
    expect(r.senales[0].fuente).toBe("SDR conectado: RTL-SDR v4");
    expect(r.senales[0].frecuenciaKhz).toBe(98_000);
    expect(r.senales[0].fuerzaDbm).toBe(-60);
    expect(r.senales[0].banda).toBe("desconocida");
    expect(r.senales[0].medidoEn).toBe(AHORA);
  });

  it("SDR que no está disponible → sinFuente", async () => {
    const fuente: FuenteEspectroReal = {
      nombre: "HackRF",
      disponible: async () => false,
      barrer: async () => [{ frecuenciaKhz: 100_000, fuerzaDbm: -50 }],
    };
    const r = await adaptadorSdr(fuente, { desdeKhz: 88_000, hastaKhz: 108_000 }, AHORA);
    expect(r).toEqual({
      estado: "sinFuente",
      medio: "sdr",
      motivo: "no hay un receptor SDR conectado",
    });
  });

  it("puntos de barrido inválidos se descartan sin inventar", async () => {
    const fuente: FuenteEspectroReal = {
      nombre: "Ruido",
      disponible: async () => true,
      barrer: async () => [
        { frecuenciaKhz: 0, fuerzaDbm: -40 },
        { frecuenciaKhz: Number.NaN, fuerzaDbm: -40 },
        { frecuenciaKhz: 101_500, fuerzaDbm: -55 },
      ],
    };
    const r = await adaptadorSdr(fuente, { desdeKhz: 88_000, hastaKhz: 108_000 }, AHORA);
    if (r.estado !== "senales") return expect.unreachable("esperaba señales");
    expect(r.senales).toHaveLength(1);
    expect(r.senales[0].frecuenciaKhz).toBe(101_500);
  });
});
