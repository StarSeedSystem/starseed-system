/**
 * Tests de privacidad y honestidad del adaptador Wi-Fi (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorWifi, type EntradaAdaptadorWifi, type EscaneoWifi } from "../wifi";

describe("adaptadorWifi · privacidad y honestidad", () => {
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

  it("nunca incluye SSID en las señales", () => {
    const escaneo: ReadonlyArray<EscaneoWifi> = [
      { canal: 1, frecuenciaMhz: 2412, ssid: "RedSecreta", rssi: -50 },
    ];
    const entrada = { ...entradaBase, escaneoNativo: escaneo };
    const { senales } = adaptadorWifi(entrada);

    for (const s of senales) {
      expect(JSON.stringify(s)).not.toContain("RedSecreta");
    }
  });

  it("nunca incluye BSSID en las señales", () => {
    const escaneo: ReadonlyArray<EscaneoWifi> = [
      { canal: 1, frecuenciaMhz: 2412, bssid: "aa:bb:cc:dd:ee:ff", rssi: -50 },
    ];
    const entrada = { ...entradaBase, escaneoNativo: escaneo };
    const { senales } = adaptadorWifi(entrada);

    for (const s of senales) {
      expect(JSON.stringify(s)).not.toContain("aa:bb:cc:dd:ee:ff");
    }
  });

  it("sinFuente siempre presente con motivo honesto", () => {
    const { sinFuente } = adaptadorWifi(entradaBase);
    expect(sinFuente).toHaveLength(1);
    expect(sinFuente[0].motivo).toBe("este aparato no deja escanear redes Wi-Fi desde la app");
  });

  it("señal de conexión no tiene frecuencia inventada", () => {
    const { senales } = adaptadorWifi(entradaBase);
    const conexion = senales.find((s) => s.medio === "internet");
    expect(conexion).toBeDefined();
    expect(conexion?.frecuenciaKhz).toBeNull();
    expect(conexion?.anchoKhz).toBeNull();
  });
});