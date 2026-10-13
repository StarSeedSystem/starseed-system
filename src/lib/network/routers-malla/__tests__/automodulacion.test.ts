import { describe, it, expect } from 'vitest';
import { ajustarEnlace } from '../automodulacion';

describe('ajustarEnlace', () => {
  const limites = { anchosMhz: [20, 40, 80], pireMaxDbm: 30 };
  const medicion = (snr: number, re: number, n: number = 3): { snrDb: number; reintentosPct: number }[] =>
    Array(n).fill({ snrDb: snr, reintentosPct: re });

  it('baja ancho por SNR bajo', () => {
    const actual = { anchoMhz: 80, potenciaDbm: 20 };
    const res = ajustarEnlace(actual, medicion(10, 0), limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.motivo).toContain('Bajando ancho');
  });

  it('baja ancho por reintentos altos', () => {
    const actual = { anchoMhz: 80, potenciaDbm: 20 };
    const res = ajustarEnlace(actual, medicion(25, 20), limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.motivo).toContain('Bajando ancho');
    expect(res.motivo).toContain('reintentos altos');
  });

  it('sube ancho con histéresis', () => {
    const actual = { anchoMhz: 40, potenciaDbm: 20 };
    const res = ajustarEnlace(actual, medicion(27, 0), limites);
    expect(res.anchoMhz).toBe(80);
    expect(res.motivo).toContain('Subiendo ancho');
    expect(res.motivo).toContain('SNR alto');
    expect(res.motivo).toContain('reintentos bajos');
  });

  it('no oscila en el borde', () => {
    const actual = { anchoMhz: 40, potenciaDbm: 20 };
    const res = ajustarEnlace(actual, medicion(20, 0), limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.motivo).toContain('Manteniendo ancho');
  });

  it('aumenta potencia con margen legal', () => {
    const actual = { anchoMhz: 40, potenciaDbm: 20 };
    const res = ajustarEnlace(actual, medicion(10, 0), limites);
    expect(res.potenciaDbm).toBe(22);
    expect(res.motivo).toContain('aumentando potencia');
  });

  it('no aumenta potencia sobre límite legal', () => {
    const actual = { anchoMhz: 40, potenciaDbm: 30 };
    const res = ajustarEnlace(actual, medicion(10, 0), limites);
    expect(res.potenciaDbm).toBe(30);
    expect(res.motivo).toContain('aumentando potencia');
  });

  it('disminuye potencia por alto SNR', () => {
    const actual = { anchoMhz: 40, potenciaDbm: 20 };
    const res = ajustarEnlace(actual, medicion(40, 0), limites);
    expect(res.potenciaDbm).toBe(18);
    expect(res.motivo).toContain('disminuyendo potencia');
  });

  it('no disminuye potencia por debajo de 0 dBm', () => {
    const actual = { anchoMhz: 40, potenciaDbm: 1 };
    const res = ajustarEnlace(actual, medicion(40, 0), limites);
    expect(res.potenciaDbm).toBe(0);
    expect(res.motivo).toContain('disminuyendo potencia');
  });

  it('mantiene ancho y potencia en condiciones estables', () => {
    const actual = { anchoMhz: 40, potenciaDbm: 20 };
    const res = ajustarEnlace(actual, medicion(22, 2), limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.potenciaDbm).toBe(20);
    expect(res.motivo).toContain('Manteniendo ancho y potencia');
  });
});