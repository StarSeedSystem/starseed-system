/**
 * Tests del adaptador Wi-Fi con escaneo nativo inyectado (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorWifi, type EntradaAdaptadorWifi, type EscaneoWifi } from "../wifi";

describe("adaptadorWifi · con escaneo nativo inyectado", () => {
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

  const escaneo: ReadonlyArray<EscaneoWifi> = [
    { canal: 6, frecuenciaMhz: 2437, anchoMhz: 20, rssi: -45, bssid: "aa:bb:cc:dd:ee:ff", ssid: "MiRed" },
    { canal: 36, frecuenciaMhz: 5180, anchoMhz: 40, rssi: -55, bssid: "11:22:33:44:55:66", ssid: "MiRed5G" },
    { canal: 1, frecuenciaMhz: 2412, anchoMhz: 20, rssi: -70, bssid: "77:88:99:aa:bb:cc", ssid: "OtraRed" },
  ];

  it("convierte escaneos a señales con banda y frecuencia correctas", () => {
    const entrada = { ...entradaBase, escaneoNativo: escaneo };
    const { senales, sinFuente } = adaptadorWifi(entrada);

    expect(senales).toHaveLength(4);
    expect(sinFuente).toHaveLength(1);

    for (const s of senales) {
      expect(JSON.stringify(s)).not.toContain("MiRed");
      expect(JSON.stringify(s)).not.toContain("aa:bb:cc:dd:ee:ff");
    }

    const s1 = senales.find((s) => s.frecuenciaKhz === 2437000);
    expect(s1).toBeDefined();
    expect(s1?.banda).toBe("Wi-Fi 2,4 GHz");
    expect(s1?.anchoKhz).toBe(20000);
    expect(s1?.fuerzaDbm).toBe(-45);
    expect(s1?.calidad).toBeCloseTo(0.75, 1);

    const s2 = senales.find((s) => s.frecuenciaKhz === 5180000);
    expect(s2).toBeDefined();
    expect(s2?.banda).toBe("Wi-Fi 5 GHz");
    expect(s2?.anchoKhz).toBe(40000);
    expect(s2?.fuerzaDbm).toBe(-55);
    expect(s2?.calidad).toBeCloseTo(0.58, 1);

    const s3 = senales.find((s) => s.frecuenciaKhz === 2412000);
    expect(s3).toBeDefined();
    expect(s3?.banda).toBe("Wi-Fi 2,4 GHz");
    expect(s3?.anchoKhz).toBe(20000);
    expect(s3?.fuerzaDbm).toBe(-70);
    expect(s3?.calidad).toBeCloseTo(0.33, 1);
  });

  it("escaneo solo con canal (sin frecuenciaMhz) deduce frecuencia", () => {
    const escaneoSoloCanal: ReadonlyArray<EscaneoWifi> = [{ canal: 11, anchoMhz: 20, rssi: -60 }];
    const entrada = { ...entradaBase, escaneoNativo: escaneoSoloCanal };
    const { senales } = adaptadorWifi(entrada);
    const s = senales.find((x) => x.frecuenciaKhz === 2462000);
    expect(s).toBeDefined();
    expect(s?.banda).toBe("Wi-Fi 2,4 GHz");
  });

  it("escaneo solo con frecuenciaMhz (sin canal) usa esa frecuencia", () => {
    const escaneoSoloFreq: ReadonlyArray<EscaneoWifi> = [{ frecuenciaMhz: 5745, anchoMhz: 80, rssi: -50 }];
    const entrada = { ...entradaBase, escaneoNativo: escaneoSoloFreq };
    const { senales } = adaptadorWifi(entrada);
    const s = senales.find((x) => x.frecuenciaKhz === 5745000);
    expect(s).toBeDefined();
    expect(s?.banda).toBe("Wi-Fi 5 GHz");
    expect(s?.anchoKhz).toBe(80000);
  });

  it("escaneo sin frecuencia ni canal → se omite (no inventa)", () => {
    const escaneoSinFreq: ReadonlyArray<EscaneoWifi> = [{ rssi: -50, ssid: "Fantasma" }];
    const entrada = { ...entradaBase, escaneoNativo: escaneoSinFreq };
    const { senales } = adaptadorWifi(entrada);
    expect(senales).toHaveLength(1);
    expect(senales[0].medio).toBe("internet");
  });

  it("escaneo con frecuencia fuera de bandas conocidas → banda genérica", () => {
    const escaneoRaro: ReadonlyArray<EscaneoWifi> = [{ frecuenciaMhz: 1234, anchoMhz: 20, rssi: -50 }];
    const entrada = { ...entradaBase, escaneoNativo: escaneoRaro };
    const { senales } = adaptadorWifi(entrada);
    const s = senales.find((x) => x.frecuenciaKhz === 1234000);
    expect(s).toBeDefined();
    expect(s?.banda).toBe("1,234 GHz");
  });

  it("canal 14 (Japón) → 2484 MHz", () => {
    const escaneoJapon: ReadonlyArray<EscaneoWifi> = [{ canal: 14, anchoMhz: 20, rssi: -55 }];
    const entrada = { ...entradaBase, escaneoNativo: escaneoJapon };
    const { senales } = adaptadorWifi(entrada);
    const s = senales.find((x) => x.frecuenciaKhz === 2484000);
    expect(s).toBeDefined();
    expect(s?.banda).toBe("Wi-Fi 2,4 GHz");
  });
});