import { describe, it, expect } from "vitest";
import { adaptarWifi, EntradaWifi } from "../wifi";
import { BANDAS_CONOCIDAS } from "../../bandas";

describe("adaptadorWifi", () => {
  it("devuelve sinFuente cuando no hay escaneo nativo", () => {
    const entrada: EntradaWifi = {
      internet: { enLinea: true, tipo: "wifi", efectivo: "full", mbps: 100 },
      enlacesMedidos: [],
      escaneoWifi: [],
    };
    const { senales, sinFuente } = adaptarWifi(entrada);
    expect(sinFuente).toHaveLength(1);
    expect(sinFuente[0]).toMatchObject({ medio: "wifi", motivo: /escanear/ });
    expect(senales).toHaveLength(1);
    expect(senales[0].id).toBe("wifi:actual");
  });

  it("incluye un enlace medido", () => {
    const t = Date.now();
    const entrada: EntradaWifi = {
      internet: { enLinea: true, tipo: "wifi", efectivo: "full", mbps: 100 },
      enlacesMedidos: [
        {
          id: "link1",
          medio: "wifi",
          neurona: "neuronaA",
          rttMs: 120,
          kbps: 4000,
          t,
        },
      ],
      escaneoWifi: [],
    };
    const { senales, sinFuente } = adaptarWifi(entrada);
    expect(sinFuente).toHaveLength(1);
    expect(senales).toHaveLength(2);
    const enlaceSin = senales.find((s) => s.id.includes("link1"));
    expect(enlaceSin).toBeDefined();
    expect(enlaceSin?.calidad).toBeGreaterThan(0); // qualityFromRtt computed
  });

  it("convierte escaneos nativos a señales wifi", () => {
    const entrada: EntradaWifi = {
      internet: { enLinea: true, tipo: "wifi", efectivo: "full", mbps: 100 },
      enlacesMedidos: [],
      escaneoWifi: [
        { frecuenciaMhz: 2412, anchoMhz: 20, rssi: -50 },
        { frecuenciaMhz: 5180, anchoMhz: 40, rssi: -70 },
      ],
    };
    const { senales, sinFuente } = adaptarWifi(entrada);
    expect(sinFuente).toHaveLength(0);
    expect(senales).toHaveLength(3); // actual + 2 scans
    const scan1 = senales.find((s) => s.id.includes("scan:0"));
    expect(scan1).toBeDefined();
    expect(scan1?.frecuenciaKhz).toBe(2412000);
    expect(scan1?.anchoKhz).toBe(20000);
    expect(scan1?.banda).toBe(BANDAS_CONOCIDAS["wifi-2.4"].etiqueta);
  });
});
