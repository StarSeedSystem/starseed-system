import { describe, it, expect } from 'vitest';
import { uciMalla, guionAplicar, htmodePorBandaYAncho, ConfigMalla } from '../uci-malla';

const cfg: ConfigMalla = {
  router: 'router01',
  meshId: 'malla-starseed',
  claveMalla: 'secret-key',
  region: 'ES',
  troncal: {
    banda: '5g',
    canal: 36,
    anchoMhz: 80,
    pireDbm: 20,
  },
  cliente: {
    canal: 6,
    ssid: 'starseed-ap',
    clave: 'ap-password',
  },
};

describe('htmodePorBandaYAncho', () => {
  it('returns HT20 for 2g band', () => {
    expect(htmodePorBandaYAncho('2g', 20)).toBe('HT20');
  });

  it('returns VHT20 for 5g with 20MHz', () => {
    expect(htmodePorBandaYAncho('5g', 20)).toBe('VHT20');
  });

  it('returns VHT40 for 5g with 40MHz', () => {
    expect(htmodePorBandaYAncho('5g', 40)).toBe('VHT40');
  });

  it('returns HE80 for 5g with 80MHz', () => {
    expect(htmodePorBandaYAncho('5g', 80)).toBe('HE80');
  });

  it('returns HE160 for 6g with 160MHz', () => {
    expect(htmodePorBandaYAncho('6g', 160)).toBe('HE160');
  });

  it('returns HE80 for 6g with 80MHz', () => {
    expect(htmodePorBandaYAncho('6g', 80)).toBe('HE80');
  });

  it('returns VHT40 for 6g with 40MHz', () => {
    expect(htmodePorBandaYAncho('6g', 40)).toBe('VHT40');
  });
});

describe('uciMalla', () => {
  it('generates wireless config with mesh mode and ap-lan', () => {
    const { wireless } = uciMalla(cfg);
    expect(wireless).toContain("option mode 'mesh'");
    expect(wireless).toContain('mesh_id');
    expect(wireless).toContain("option encryption 'sae'");
    expect(wireless).toContain("mesh_fwding '0'");
    expect(wireless).toContain("network 'bat0_hardif_mesh'");
    expect(wireless).toContain("option mode 'ap'");
    expect(wireless).toContain("ssid 'starseed-ap'");
    expect(wireless).toContain("option country 'ES'");
    expect(wireless).toContain("txpower '20'");
  });

  it('generates network config with bat0 and batadv and BATMAN_V', () => {
    const { network } = uciMalla(cfg);
    expect(network).toContain("option proto 'batadv'");
    expect(network).toContain("option routing_algo 'BATMAN_V'");
    expect(network).toContain("option proto 'batadv_hardif'");
    expect(network).toContain("option master 'bat0'");
    expect(network).toContain("option type 'bridge'");
    expect(network).toContain("list device 'bat0'");
    expect(network).toContain("list device 'lan'");
  });

  it('uses correct htmode for 5g 80MHz', () => {
    const cfg5g80: ConfigMalla = {
      ...cfg,
      troncal: { ...cfg.troncal, banda: '5g', anchoMhz: 80 },
    };
    const { wireless } = uciMalla(cfg5g80);
    expect(wireless).toContain('HE80');
  });

  it('uses correct htmode for 2g', () => {
    const cfg2g: ConfigMalla = {
      ...cfg,
      troncal: { ...cfg.troncal, banda: '2g', anchoMhz: 20 },
    };
    const { wireless } = uciMalla(cfg2g);
    expect(wireless).toContain('HT20');
  });

  it('uses correct htmode for 6g 160MHz', () => {
    const cfg6g160: ConfigMalla = {
      ...cfg,
      troncal: { ...cfg.troncal, banda: '6g', anchoMhz: 160 },
    };
    const { wireless } = uciMalla(cfg6g160);
    expect(wireless).toContain('HE160');
  });
});

describe('guionAplicar', () => {
  it('genera script con copia de seguridad previa', () => {
    const script = guionAplicar(cfg);
    expect(script).toContain('cp -r /etc/config /etc/config.antes-starseed');
  });

  it('genera script que instala kmod-batman-adv', () => {
    const script = guionAplicar(cfg);
    expect(script).toContain('kmod-batman-adv');
  });

  it('genera script que instala wpad-mesh-mbedtls', () => {
    const script = guionAplicar(cfg);
    expect(script).toContain('wpad-mesh-mbedtls');
  });

  it('genera script con wifi reload', () => {
    const script = guionAplicar(cfg);
    expect(script).toContain('wifi reload');
  });

  it('genera script con /etc/init.d/network restart', () => {
    const script = guionAplicar(cfg);
    expect(script).toContain('/etc/init.d/network restart');
  });

  it('genera script con opkg install', () => {
    const script = guionAplicar(cfg);
    expect(script).toContain('opkg install');
  });
});