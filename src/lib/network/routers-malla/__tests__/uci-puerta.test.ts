import { describe, it, expect } from 'vitest';
import { uciPuerta, uciClientePuerta, guionGuardianTope } from '../uci-puerta';

describe('uciPuerta', () => {
  it('genera interfaz movil', () => {
    const { network } = uciPuerta({ tipo: 'movil-4g', bajadaKbps: 5000, subidaKbps: 1000 });
    expect(network).toContain("config interface 'wwan'");
    expect(network).toContain("option proto 'qmi'");
    expect(network).toContain("option gw_mode 'server'");
    expect(network).toContain("option gw_bandwidth '5000kbit/1000kbit'");
  });

  it('genera firewall', () => {
    const { firewall } = uciPuerta({ tipo: 'movil-4g', bajadaKbps: 5000, subidaKbps: 1000 });
    expect(firewall).toContain("config zone 'wwan'");
    expect(firewall).toContain("option masq '1'");
  });
});

describe('uciClientePuerta', () => {
  it('genera gw_mode client', () => {
    const net = uciClientePuerta();
    expect(net).toContain("option gw_mode 'client'");
    expect(net).toContain("option gw_sel_class '5000'");
  });
});

describe('guionGuardianTope', () => {
  it('genera guion con logica de bytes', () => {
    const sh = guionGuardianTope({ interfaz: 'wwan0', topeMb: 100, reservaPct: 20, bajadaKbps: 1000, subidaKbps: 500 });
    expect(sh).toContain('batctl gw_mode client');
    expect(sh).toContain('batctl gw_mode server 1000kbit/500kbit');
  });
});
