import { describe, it, expect } from "vitest";
import { uciMalla, guionAplicar, type UciMallaEntrada } from "../uci-malla";

const e: UciMallaEntrada = {
  router: "TP-Link Archer C7",
  meshId: "malla-starseed",
  claveMalla: "clave-secreta-malla-123",
  region: "EU",
  troncal: { banda: '5g', canal: 36, anchoMhz: 40, pireDbm: 23 },
  cliente: { canal: 1, ssid: "StarSeed-Cliente", clave: "clave-secreta-ap" }
};

describe("uciMalla", () => {
  it("wireless válido", () => {
    const r = uciMalla(e).wireless;
    expect(r).toContain("config wifi-device 'radio1'");
    expect(r).toContain("option channel '36'");
    expect(r).toContain("option htmode 'VHT40'");
    expect(r).toContain("option country 'DE'");
    expect(r).toContain("option mode 'mesh'");
    expect(r).toContain(`option mesh_id '${e.meshId}'`);
    expect(r).toContain("option encryption 'sae'");
    expect(r).toContain(`option key '${e.claveMalla}'`);
    expect(r).toContain("option mesh_fwding '0'");
    expect(r).toContain("option network 'bat0_hardif_mesh'");
    expect(r).toContain("config wifi-iface 'ap_cliente'");
    expect(r).toContain("option device 'radio0'");
    expect(r).toContain("option mode 'ap'");
    expect(r).toContain(`option ssid '${e.cliente.ssid}'`);
    expect(r).toContain("option encryption 'psk2'");
    expect(r).toContain(`option key '${e.cliente.clave}'`);
    expect(r).toContain("option network 'lan'");
  });

  it("network válido", () => {
    const r = uciMalla(e).network;
    expect(r).toContain("config interface 'bat0'");
    expect(r).toContain("option proto 'batadv'");
    expect(r).toContain("option routing_algo 'BATMAN_V'");
    expect(r).toContain("option mesh 'bat0_hardif_mesh'");
    expect(r).toContain("config interface 'bat0_hardif'");
    expect(r).toContain("option proto 'batadv_hardif'");
    expect(r).toContain("option master 'bat0'");
    expect(r).toContain("config interface 'lan'");
    expect(r).toContain("option type 'bridge'");
    expect(r).toContain("config device 'lan_bat0'");
    expect(r).toContain("option name 'bat0'");
  });

  it("banda 2g", () => {
    const r = uciMalla({ ...e, troncal: { ...e.troncal, banda: '2g', canal: 6, anchoMhz: 20 } }).wireless;
    expect(r).toContain("option htmode 'HT20'");
    expect(r).toContain("option device 'radio0'");
  });

  it("banda 6g", () => {
    const r = uciMalla({ ...e, troncal: { ...e.troncal, banda: '6g', canal: 1, anchoMhz: 80 } }).wireless;
    expect(r).toContain("option htmode 'HE80'");
    expect(r).toContain("option device 'radio2'");
  });

  it("país por región", () => {
    const regiones: Record<string, string> = { 'US':'US', 'ES':'ES', 'FR':'FR', 'JP':'JP' };
    for (const [r, c] of Object.entries(regiones)) {
      const res = uciMalla({ ...e, region: r as any }).wireless;
      expect(res).toContain(`option country '${c}'`);
    }
  });
});

describe("guionAplicar", () => {
  it("guion válido", () => {
    const g = guionAplicar(e);
    expect(g.length).toBeGreaterThan(0);
    expect(g).toContain("#!/bin/sh");
    expect(g).toContain("cp /etc/config/wireless /etc/config/wireless.antes-starseed");
    expect(g).toContain("cp /etc/config/network /etc/config/network.antes-starseed");
    expect(g).toContain("wifi reload");
    expect(g).toContain("/etc/init.d/network restart");
    expect(g).toContain("Configuración aplicada correctamente");
  });

  it("incluye configuraciones", () => {
    const g = guionAplicar(e);
    const { wireless, network } = uciMalla(e);
    expect(g).toContain(wireless.split('\n')[0]);
    expect(g).toContain(wireless.split('\n')[wireless.split('\n').length - 1]);
    expect(g).toContain(network.split('\n')[0]);
    expect(g).toContain(network.split('\n')[network.split('\n').length - 1]);
  });
});