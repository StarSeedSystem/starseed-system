/**
 * Tests del adaptador Wi-Fi con enlaces medidos (MAP1116B).
 */

import { describe, it, expect } from "vitest";
import { adaptadorWifi, type EntradaAdaptadorWifi } from "../wifi";

describe("adaptadorWifi · enlaces medidos Wi-Fi", () => {
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

  it("crea señales a partir de enlaces con rttMs", () => {
    const enlaces = [
      { id: "enlace-1", medio: "wifi" as const, neurona: "neurona-1", rttMs: 20, kbps: null, t: ahora },
      { id: "enlace-2", medio: "wifi" as const, neurona: "neurona-2", rttMs: 100, kbps: null, t: ahora },
    ];
    const entrada = { ...entradaBase, enlacesMedidos: enlaces };
    const { senales } = adaptadorWifi(entrada);

    expect(senales).toHaveLength(3);

    const e1 = senales.find((s) => s.fuente === "enlace Wi-Fi local medido" && s.medidoEn === ahora && s.id.includes("enlace-1"));
    expect(e1).toBeDefined();
    expect(e1?.calidad).toBeCloseTo(1 - (20 - 10) / 490, 2);

    const e2 = senales.find((s) => s.fuente === "enlace Wi-Fi local medido" && s.id.includes("enlace-2"));
    expect(e2).toBeDefined();
    expect(e2?.calidad).toBeCloseTo(1 - (100 - 10) / 490, 2);
  });

  it("crea señales a partir de enlaces con kbps", () => {
    const enlaces = [
      { id: "enlace-kbps", medio: "wifi" as const, neurona: "neurona-3", rttMs: null, kbps: 10000, t: ahora },
    ];
    const entrada = { ...entradaBase, enlacesMedidos: enlaces };
    const { senales } = adaptadorWifi(entrada);

    const e = senales.find((s) => s.id.includes("enlace-kbps"));
    expect(e).toBeDefined();
    expect(e?.calidad).toBeCloseTo(10000 / 20000, 2);
  });

  it("ignora enlaces BLE", () => {
    const enlaces = [
      { id: "enlace-ble", medio: "ble" as const, neurona: "neurona-1", rttMs: 30, kbps: null, t: ahora },
    ];
    const entrada = { ...entradaBase, enlacesMedidos: enlaces };
    const { senales } = adaptadorWifi(entrada);

    expect(senales).toHaveLength(1);
  });

  it("ignora enlaces sin rttMs ni kbps", () => {
    const enlaces = [
      { id: "enlace-vacio", medio: "wifi" as const, neurona: "neurona-1", rttMs: null, kbps: null, t: ahora },
    ];
    const entrada = { ...entradaBase, enlacesMedidos: enlaces };
    const { senales } = adaptadorWifi(entrada);

    expect(senales).toHaveLength(1);
  });
});