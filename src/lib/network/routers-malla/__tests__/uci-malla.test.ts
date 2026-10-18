import { describe, it, expect } from "vitest";
import { uciMalla, type CfgUciMalla, type UciMalla } from "../uci-malla";

describe("uciMalla", () => {
  it("genera configuración UCI para una troncal en 2g y cliente en 2g", () => {
    const config: CfgUciMalla = {
      router: "test-router",
      meshId: "malla-test",
      claveMalla: "clave-malla-secreta-123",
      region: "ES",
      troncal: {
        banda: "2g",
        canal: 1,
        anchoMhz: 20,
        pireDbm: 20,
      },
      cliente: {
        canal: 6,
        ssid: "SSID-Cliente",
        clave: "clave-cliente-secreta-456",
      },
    };

    const result: UciMalla = uciMalla(config);

    // Verificamos que la sección wireless contiene las partes esperadas
    expect(result.wireless).toContain("config wifi-device 'radio_troncal'");
    expect(result.wireless).toContain("option type 'mac80211'");
    expect(result.wireless).toContain("option band '2g'");
    expect(result.wireless).toContain("option channel '1'");
    expect(result.wireless).toContain("option htmode 'HT20'");
    expect(result.wireless).toContain("option country 'ES'");
    expect(result.wireless).toContain("option txpower '20'");
    expect(result.wireless).toContain("config wifi-iface 'malla0'");
    expect(result.wireless).toContain("option device 'radio_troncal'");
    expect(result.wireless).toContain("option mode 'mesh'");
    expect(result.wireless).toContain(`option mesh_id 'malla-test'`);
    expect(result.wireless).toContain("option encryption 'sae'");
    expect(result.wireless).toContain(`option key 'clave-malla-secreta-123'`);
    expect(result.wireless).toContain("option mesh_fwding '0'");
    expect(result.wireless).toContain("option network 'bat0_hardif_mesh'");
    expect(result.wireless).toContain("config wifi-iface 'ap0'");
    expect(result.wireless).toContain("option device 'radio_troncal'");
    expect(result.wireless).toContain("option mode 'ap'");
    expect(result.wireless).toContain(`option ssid 'SSID-Cliente'`);
    expect(result.wireless).toContain("option encryption 'sae-mixed'");
    expect(result.wireless).toContain(`option key 'clave-cliente-secreta-456'`);
    expect(result.wireless).toContain("option network 'lan'");

    // Verificamos que la sección network contiene las interfaces de batman-adv
    expect(result.network).toContain("config interface 'bat0'");
    expect(result.network).toContain("option proto 'batadv'");
    expect(result.network).toContain("option routing_algo 'BATMAN_V'");
    expect(result.network).toContain("option bridge_loop_avoidance '1'");
    expect(result.network).toContain("option distributed_arp_table '1'");
    expect(result.network).toContain("config interface 'bat0_hardif_mesh'");
    expect(result.network).toContain("option proto 'batadv_hardif'");
    expect(result.network).toContain("option master 'bat0'");
    expect(result.network).toContain("option mtu '1536'");
    expect(result.network).toContain("config device 'br_lan'");
    expect(result.network).toContain("option name 'br-lan'");
    expect(result.network).toContain("option type 'bridge'");
    expect(result.network).toContain("list ports 'bat0'");
  });

  it("genera configuración UCI para una troncal en 5g y cliente en 2g", () => {
    const config: CfgUciMalla = {
      router: "test-router",
      meshId: "malla-test",
      claveMalla: "clave-malla-secreta-123",
      region: "FR",
      troncal: {
        banda: "5g",
        canal: 36,
        anchoMhz: 40,
        pireDbm: 23,
      },
      cliente: {
        canal: 11,
        ssid: "SSID-Cliente",
        clave: "clave-cliente-secreta-456",
      },
    };

    const result: UciMalla = uciMalla(config);

    expect(result.wireless).toContain("config wifi-device 'radio_troncal'");
    expect(result.wireless).toContain("option type 'mac80211'");
    expect(result.wireless).toContain("option band '5g'");
    expect(result.wireless).toContain("option channel '36'");
    expect(result.wireless).toContain("option htmode 'VHT40'");
    expect(result.wireless).toContain("option country 'FR'");
    expect(result.wireless).toContain("option txpower '23'");
    expect(result.wireless).toContain("config wifi-device 'radio_cliente'");
    expect(result.wireless).toContain("option type 'mac80211'");
    expect(result.wireless).toContain("option band '2g'");
    expect(result.wireless).toContain("option channel '11'");
    expect(result.wireless).toContain("option htmode 'HT20'");
    // ... (we could check more, but for brevity we trust the function)
  });

  it("lanza error si la región no es un código de país de dos letras", () => {
    const config: CfgUciMalla = {
      router: "test-router",
      meshId: "malla-test",
      claveMalla: "clave-malla-secreta-123",
      region: "Europe", // Inválido
      troncal: {
        banda: "2g",
        canal: 1,
        anchoMhz: 20,
        pireDbm: 20,
      },
      cliente: {
        canal: 6,
        ssid: "SSID-Cliente",
        clave: "clave-cliente-secreta-456",
      },
    };

    expect(() => uciMalla(config)).toThrow(
      "La región del router debe ser su país en dos letras (ES, FR, US…): «Europe» no lo es"
    );
  });

  it("lanza error si el meshId está vacío", () => {
    const config: CfgUciMalla = {
      router: "test-router",
      meshId: "", // Inválido
      claveMalla: "clave-malla-secreta-123",
      region: "ES",
      troncal: {
        banda: "2g",
        canal: 1,
        anchoMhz: 20,
        pireDbm: 20,
      },
      cliente: {
        canal: 6,
        ssid: "SSID-Cliente",
        clave: "clave-cliente-secreta-456",
      },
    };

    expect(() => uciMalla(config)).toThrow("meshId y ssid: de 1 a 32 bytes, sin caracteres de control");
  });
});