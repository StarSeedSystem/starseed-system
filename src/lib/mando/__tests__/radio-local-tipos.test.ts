import { describe, expect, it } from "vitest";
import { parsearSystemProfiler } from "../radio-local-tipos";

// Forma real de `system_profiler SPAirPortDataType SPBluetoothDataType -json` (macOS 15/26),
// recortada. Las direcciones van a propósito: el parser NO debe copiarlas.
const SALIDA = {
  SPAirPortDataType: [
    {
      spairport_airport_interfaces: [
        {
          _name: "en0",
          spairport_status_information: "spairport_status_connected",
          spairport_wireless_card_type: "spairport_wireless_card_type_wifi (0x14E4, 0x4378)",
          spairport_wireless_mac_address: "aa:bb:cc:dd:ee:ff",
          spairport_current_network_information: {
            _name: "Casa StarSeed",
            spairport_network_channel: "149 (5GHz, 80MHz)",
            spairport_network_country_code: "MX",
            spairport_network_mcs: 9,
            spairport_network_phymode: "802.11ac",
            spairport_network_rate: 867,
            spairport_security_mode: "spairport_security_mode_wpa2_personal",
            spairport_signal_noise: "-46 dBm / -97 dBm",
          },
          spairport_other_local_wireless_networks: [
            {
              _name: "Vecino",
              spairport_network_channel: "6 (2GHz, 20MHz)",
              spairport_security_mode: "spairport_security_mode_wpa3_personal",
              spairport_signal_noise: "-78 dBm / -92 dBm",
            },
            {
              _name: "<redacted>",
              spairport_network_channel: "36 (5GHz, 40MHz)",
              spairport_security_mode: "spairport_security_mode_none",
              spairport_signal_noise: "-60 dBm / -95 dBm",
            },
          ],
        },
        { _name: "awdl0" },
      ],
    },
  ],
  SPBluetoothDataType: [
    {
      controller_properties: {
        controller_address: "11:22:33:44:55:66",
        controller_chipset: "BCM_4378",
        controller_state: "attrib_on",
        controller_transport: "PCIe",
      },
      device_connected: [
        {
          AirPods: {
            device_address: "77:88:99:AA:BB:CC",
            device_batteryLevelMain: "80%",
            device_minorType: "Headphones",
            device_rssi: "-52",
            device_vendorID: "0x004C",
          },
        },
      ],
      device_not_connected: [
        { "Teclado Magic": { device_minorType: "Keyboard", device_vendorID: 0x05ac } },
        { Reloj: { device_vendorID: "0x9999 (Fabricante raro)" } },
      ],
    },
  ],
};

describe("parsearSystemProfiler", () => {
  it("lee la red actual con canal, banda, señal, ruido y velocidad", () => {
    const r = parsearSystemProfiler(SALIDA, 1000);
    expect(r.v).toBe(1);
    expect(r.at).toBe(1000);
    expect(r.wifi?.interfaz).toBe("en0");
    expect(r.wifi?.estado).toBe("conectado");
    expect(r.wifi?.tarjeta).toBe("wifi (0x14E4, 0x4378)");
    expect(r.wifi?.actual).toMatchObject({
      ssid: "Casa StarSeed",
      canal: 149,
      banda: "5 GHz",
      anchoMHz: 80,
      seguridad: "WPA2 Personal",
      rssiDbm: -46,
      ruidoDbm: -97,
      velocidadMbps: 867,
      mcs: 9,
      pais: "MX",
    });
  });

  it("ordena las redes cercanas por señal y entiende «2GHz» como 2,4 GHz", () => {
    const cercanas = parsearSystemProfiler(SALIDA, 0).wifi?.cercanas ?? [];
    expect(cercanas.map((c) => c.rssiDbm)).toEqual([-60, -78]);
    expect(cercanas[0]).toMatchObject({ ssid: null, seguridad: "abierta", banda: "5 GHz" });
    expect(cercanas[1]).toMatchObject({ ssid: "Vecino", canal: 6, banda: "2,4 GHz", anchoMHz: 20 });
  });

  it("lee el Bluetooth: conectados primero, batería, RSSI y fabricante por id numérico o texto", () => {
    const bt = parsearSystemProfiler(SALIDA, 0).bluetooth;
    expect(bt).toMatchObject({ encendido: true, chipset: "BCM_4378", transporte: "PCIe" });
    expect(bt?.dispositivos).toEqual([
      { nombre: "AirPods", tipo: "Headphones", conectado: true, rssiDbm: -52, bateriaPct: 80, fabricante: "Apple" },
      { nombre: "Teclado Magic", tipo: "Keyboard", conectado: false, rssiDbm: null, bateriaPct: null, fabricante: "Apple" },
      { nombre: "Reloj", tipo: null, conectado: false, rssiDbm: null, bateriaPct: null, fabricante: "Fabricante raro" },
    ]);
  });

  it("nunca copia direcciones MAC", () => {
    const texto = JSON.stringify(parsearSystemProfiler(SALIDA, 0));
    expect(texto).not.toMatch(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
  });

  it("no lanza con basura y deja null lo que no entiende", () => {
    for (const x of [null, 42, "hola", [], { SPAirPortDataType: "x", SPBluetoothDataType: [null] }]) {
      const r = parsearSystemProfiler(x, 5);
      expect(r).toEqual({ v: 1, at: 5, wifi: null, bluetooth: null });
    }
    const apagado = parsearSystemProfiler(
      { SPAirPortDataType: [{ spairport_airport_interfaces: [{ _name: "en0", spairport_status_information: "spairport_status_off" }] }] },
      0,
    );
    expect(apagado.wifi).toMatchObject({ estado: "apagado", actual: null, cercanas: [] });
  });
});
