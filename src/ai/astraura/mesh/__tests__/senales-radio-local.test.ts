import { describe, expect, it } from "vitest";
import { metrosPorRssi, senalesRadioLocal } from "../senales-radio-local";
import type { RadioLocal } from "@/lib/mando/radio-local-tipos";

const RADIO: RadioLocal = {
  v: 1,
  at: 1000,
  wifi: {
    interfaz: "en0",
    estado: "conectado",
    tarjeta: null,
    actual: {
      ssid: "Casa", canal: 149, banda: "5 GHz", anchoMHz: 80, phy: "802.11ac", seguridad: "WPA2 Personal",
      rssiDbm: -46, ruidoDbm: -97, velocidadMbps: 867, mcs: 9, pais: "MX",
    },
    cercanas: [
      { ssid: null, canal: 6, banda: "2,4 GHz", anchoMHz: 20, phy: null, seguridad: "abierta", rssiDbm: -78, ruidoDbm: null },
    ],
  },
  bluetooth: {
    encendido: true,
    chipset: null,
    transporte: null,
    dispositivos: [
      { nombre: "AirPods", tipo: "Headphones", conectado: true, rssiDbm: -52, bateriaPct: 80, fabricante: "Apple" },
      { nombre: "Teclado", tipo: "Keyboard", conectado: false, rssiDbm: null, bateriaPct: null, fabricante: null },
    ],
  },
};

describe("metrosPorRssi", () => {
  it("usa el modelo log-distancia y lo acota a 1–200 m", () => {
    expect(metrosPorRssi(-40, "wifi")).toBe(1);
    expect(metrosPorRssi(-67, "wifi")).toBe(10);
    expect(metrosPorRssi(-200, "bt")).toBe(200);
    expect(metrosPorRssi(-10, "bt")).toBe(1);
  });
});

describe("senalesRadioLocal", () => {
  it("sin radio no inventa nada", () => {
    expect(senalesRadioLocal(null, 0)).toEqual([]);
  });

  it("la red actual es compatible y trae sus métricas reales, con SNR calculada", () => {
    const [actual] = senalesRadioLocal(RADIO, 0);
    expect(actual.id).toBe("wifi-actual");
    expect(actual.antenna).toBe("ip");
    expect(actual.compatible).toBe(true);
    expect(actual.metrics).toContainEqual({ label: "Relación señal/ruido", value: "51 dB" });
    expect(actual.placement.mode).toBe("rf");
    expect(actual.placement.detail).toMatch(/ESTIMADA por RSSI/);
  });

  it("las redes y los Bluetooth ajenos se ven pero no se usan", () => {
    const s = senalesRadioLocal(RADIO, 0);
    const cercana = s.find((x) => x.signalType === "Wi-Fi · red cercana");
    expect(cercana).toMatchObject({ label: "Red Wi-Fi oculta", compatible: false });
    const bt = s.filter((x) => x.antenna === "ble");
    expect(bt.map((x) => x.signalType)).toEqual([
      "Bluetooth · conectado",
      "Bluetooth · emparejado (fuera de alcance o apagado)",
    ]);
    expect(bt[0].metrics).toContainEqual({ label: "Batería", value: "80 %" });
    expect(bt[1].placement.mode).toBe("sector");
    expect(s.every((x) => !x.simulated && x.lastHeard === 1000)).toBe(true);
  });

  it("los ids son estables entre lecturas", () => {
    const a = senalesRadioLocal(RADIO, 0).map((x) => x.id);
    const b = senalesRadioLocal({ ...RADIO, at: 5000 }, 0).map((x) => x.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});
