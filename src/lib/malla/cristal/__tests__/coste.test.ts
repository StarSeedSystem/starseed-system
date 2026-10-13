import { describe, it, expect } from 'vitest';
import { calidadSenal, costeSenal, CAPACIDAD_KBPS } from '../coste';
import type { SenalMedida } from '../tipos';

const base = (p: Partial<SenalMedida> = {}): SenalMedida => ({
  de: 'a', a: 'b', medio: 'wifi-lan', vistaEn: 1, ...p,
});

describe('coste de señal', () => {
  it('devuelve capacidad por medio', () => {
    expect(CAPACIDAD_KBPS.lora).toBe(5);
    expect(CAPACIDAD_KBPS['wifi-mesh']).toBe(200000);
    expect(CAPACIDAD_KBPS.nfc).toBe(400);
  });

  it('sin medidas devuelve 0.3', () => {
    expect(calidadSenal(base())).toBeCloseTo(0.3);
  });

  it('rssi normalizado', () => {
    expect(calidadSenal(base({ rssiDbm: -40 }))).toBeCloseTo(1);
    expect(calidadSenal(base({ rssiDbm: -90 }))).toBeCloseTo(0);
    expect(calidadSenal(base({ rssiDbm: -65 }))).toBeCloseTo(0.5);
  });

  it('snr normalizado', () => {
    expect(calidadSenal(base({ snrDb: 15 }))).toBeCloseTo(1);
    expect(calidadSenal(base({ snrDb: -20 }))).toBeCloseTo(0);
  });

  it('pérdida 0%→1, >=30%→0', () => {
    expect(calidadSenal(base({ perdidaPct: 0 }))).toBeCloseTo(1);
    expect(calidadSenal(base({ perdidaPct: 30 }))).toBeCloseTo(0);
  });

  it('monotonía rssi', () => {
    const q1 = calidadSenal(base({ rssiDbm: -80 }));
    const q2 = calidadSenal(base({ rssiDbm: -60 }));
    expect(q2).toBeGreaterThan(q1);
  });

  it('renormaliza con medidas parciales', () => {
    const q = calidadSenal(base({ rssiDbm: -40, snrDb: -20 }));
    expect(q).toBeCloseTo(0.5);
  });

  it('coste con confianza', () => {
    const s = base({ rssiDbm: -40, snrDb: 15, rttMs: 20, anchoBandaKbps: 100000, perdidaPct: 0 });
    expect(costea(s)).toBeCloseTo(0);
    expect(costea(s, 0.5)).toBeCloseTo(0.25);
  });
});

function costea(s: SenalMedida, conf = 1) {
  return costeSenal(s, conf);
}
