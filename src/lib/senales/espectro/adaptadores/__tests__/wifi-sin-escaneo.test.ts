/**
 * Tests del adaptador Wi-Fi sin escaneo nativo (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorWifi, type EntradaAdaptadorWifi } from "../wifi";

describe("adaptadorWifi · sin escaneo nativo", () => {
  const ahora = Date.now();
  const zona = "casa";
  const capa = "propia" as const;

  const entradaBase: EntradaAdaptadorWifi = {
    senalesMedio: {
      internet: { enLinea: true, tipo: "wifi", efectivo: "4g", mbps: 50 },
    },
    enlacesMedidos: [],
    escaneoNativo: undefined,
    zona,
    capa,
  };

  it("devuelve una señal de conexión actual y un sinFuente", () => {
    const { senales, sinFuente } = adaptadorWifi(entradaBase);

    expect(senales).toHaveLength(1);
    expect(sinFuente).toHaveLength(1);

    const senal = senales[0];
    expect(senal.medio).toBe("internet");
    expect(senal.banda).toBe("Wi-Fi");
    expect(senal.origen).toBe("medida");
    expect(senal.fuente).toBe("Network Information API");
    expect(senal.frecuenciaKhz).toBeNull();
    expect(senal.anchoKhz).toBeNull();
    expect(senal.zona).toBe(zona);
    expect(senal.capa).toBe(capa);
    expect(typeof senal.medidoEn).toBe("number");
    expect(senal.calidad).toBe(1);

    const sf = sinFuente[0];
    expect(sf.medio).toBe("wifi");
    expect(sf.motivo).toBe("este aparato no deja escanear redes Wi-Fi desde la app");
  });

  it("sin internet → solo sinFuente, sin señales", () => {
    const entrada = { ...entradaBase, senalesMedio: { internet: { enLinea: false } } };
    const { senales, sinFuente } = adaptadorWifi(entrada);

    expect(senales).toHaveLength(0);
    expect(sinFuente).toHaveLength(1);
  });

  it("internet sin mbps → calidad null", () => {
    const entrada = {
      ...entradaBase,
      senalesMedio: { internet: { enLinea: true, tipo: "wifi" } },
    };
    const { senales } = adaptadorWifi(entrada);
    expect(senales[0].calidad).toBeNull();
  });

  it("tipo cellular → banda 'Celular'", () => {
    const entrada = {
      ...entradaBase,
      senalesMedio: { internet: { enLinea: true, tipo: "cellular", mbps: 10 } },
    };
    const { senales } = adaptadorWifi(entrada);
    expect(senales[0].banda).toBe("Celular");
  });

  it("tipo ethernet → banda 'Ethernet'", () => {
    const entrada = {
      ...entradaBase,
      senalesMedio: { internet: { enLinea: true, tipo: "ethernet", mbps: 100 } },
    };
    const { senales } = adaptadorWifi(entrada);
    expect(senales[0].banda).toBe("Ethernet");
  });

  it("tipo desconocido → banda 'Internet'", () => {
    const entrada = {
      ...entradaBase,
      senalesMedio: { internet: { enLinea: true, tipo: "unknown", mbps: 10 } },
    };
    const { senales } = adaptadorWifi(entrada);
    expect(senales[0].banda).toBe("Internet");
  });
});