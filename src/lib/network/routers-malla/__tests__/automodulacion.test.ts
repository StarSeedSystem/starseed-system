import { describe, it, expect } from 'vitest';
import { ajustarEnlace, type Medida, type EstadoActual, type Limites, type Resultado } from '../automodulacion';

describe('ajustarEnlace', () => {
  const limites: Limites = { anchosMhz: [20, 40, 80], pireMaxDbm: 30 };

  it('should return current state when no measurements', () => {
    const actual: EstadoActual = { anchoMhz: 20, potenciaDbm: 10 };
    const medidas: Medida[] = [];
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result).toEqual({
      anchoMhz: 20,
      potenciaDbm: 10,
      motivo: 'Sin medidas para ajustar',
    });
  });

  it('should decrease ancho from 80 to 40 when SNR < 20', () => {
    const actual: EstadoActual = { anchoMhz: 80, potenciaDbm: 10 };
    // Last 5 measurements: all with SNR < 20
    const medidas: Medida[] = [
      { snrDb: 10, reintentosPct: 0 },
      { snrDb: 12, reintentosPct: 0 },
      { snrDb: 15, reintentosPct: 0 },
      { snrDb: 18, reintentosPct: 0 },
      { snrDb: 19, reintentosPct: 0 },
    ];
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(40);
    expect(result.motivo).toContain('Se disminuye el ancho de banda a 40 MHz');
    expect(result.motivo).toContain('bajo SNR');
  });

  it('should decrease ancho from 40 to 20 when SNR < 15', () => {
    const actual: EstadoActual = { anchoMhz: 40, potenciaDbm: 10 };
    const medidas: Medida[] = [
      { snrDb: 10, reintentosPct: 0 },
      { snrDb: 12, reintentosPct: 0 },
      { snrDb: 14, reintentosPct: 0 },
      { snrDb: 13, reintentosPct: 0 },
      { snrDb: 11, reintentosPct: 0 },
    ];
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(20);
    expect(result.motivo).toContain('Se disminuye el ancho de banda a 20 MHz');
    expect(result.motivo).toContain('bajo SNR');
  });

  it('should decrease ancho when reintentos > 15%', () => {
    const actual: EstadoActual = { anchoMhz: 80, potenciaDbm: 10 };
    const medidas: Medida[] = [
      { snrDb: 30, reintentosPct: 20 }, // high reintentos
      { snrDb: 30, reintentosPct: 20 },
      { snrDb: 30, reintentosPct: 20 },
      { snrDb: 30, reintentosPct: 20 },
      { snrDb: 30, reintentosPct: 20 },
    ];
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(40); // decreased from 80 to 40
    expect(result.motivo).toContain('Se disminuye el ancho de banda a 40 MHz');
    expect(result.motivo).toContain('alto reintentos');
  });

  it('should increase ancho from 20 to 40 when SNR > 25 and reintentos < 5%', () => {
    const actual: EstadoActual = { anchoMhz: 20, potenciaDbm: 10 };
    const medidas: Medida[] = [
      { snrDb: 28, reintentosPct: 0 },
      { snrDb: 30, reintentosPct: 0 },
      { snrDb: 27, reintentosPct: 0 },
      { snrDb: 29, reintentosPct: 0 },
      { snrDb: 26, reintentosPct: 0 },
    ];
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(40);
    expect(result.motivo).toContain('Se aumenta el ancho de banda a 40 MHz');
    expect(result.motivo).toContain('buen SNR');
    expect(result.motivo).toContain('bajo reintentos');
  });

  it('should increase ancho from 40 to 80 when SNR > 25 and reintentos < 5%', () => {
    const actual: EstadoActual = { anchoMhz: 40, potenciaDbm: 10 };
    const medidas: Medida[] = [
      { snrDb: 28, reintentosPct: 0 },
      { snrDb: 30, reintentosPct: 0 },
      { snrDb: 27, reintentosPct: 0 },
      { snrDb: 29, reintentosPct: 0 },
      { snrDb: 26, reintentosPct: 0 },
    ];
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(80);
    expect(result.motivo).toContain('Se aumenta el ancho de banda a 80 MHz');
    expect(result.motivo).toContain('buen SNR');
    expect(result.motivo).toContain('bajo reintentos');
  });

  it('should not oscillate when SNR at border for decrease', () => {
    // For 80->40: threshold is 20, so at 20 should not decrease
    const actual: EstadoActual = { anchoMhz: 80, potenciaDbm: 10 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 20, reintentosPct: 0 });
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(80); // should not decrease
    expect(result.motivo).toContain('Se mantiene el ancho de banda en 80 MHz');
  });

  it('should not oscillate when SNR at border for decrease from 40 to 20', () => {
    // For 40->20: threshold is 15, so at 15 should not decrease
    const actual: EstadoActual = { anchoMhz: 40, potenciaDbm: 10 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 15, reintentosPct: 0 });
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(40);
    expect(result.motivo).toContain('Se mantiene el ancho de banda en 40 MHz');
  });

  it('should increase power when SNR < 15 and within legal margin', () => {
    const actual: EstadoActual = { anchoMhz: 20, potenciaDbm: 10 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 10, reintentosPct: 0 });
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.potenciaDbm).toBe(12);
    expect(result.motivo).toContain('Se aumenta la potencia a 12 dBm');
    expect(result.motivo).toContain('bajo SNR');
  });

  it('should not increase power when at legal limit', () => {
    const actual: EstadoActual = { anchoMhz: 20, potenciaDbm: 30 }; // already at pireMaxDbm
    const medidas: Medida[] = Array(5).fill({ snrDb: 10, reintentosPct: 0 });
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.potenciaDbm).toBe(30); // should not increase
    expect(result.motivo).toContain('Se mantiene la potencia en 30 dBm');
  });

  it('should decrease power when SNR > 35', () => {
    const actual: EstadoActual = { anchoMhz: 20, potenciaDbm: 20 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 40, reintentosPct: 0 });
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.potenciaDbm).toBe(18);
    expect(result.motivo).toContain('Se disminuye la potencia a 18 dBm');
    expect(result.motivo).toContain('alto SNR');
    expect(result.motivo).toContain('reducir interferencia');
  });

  it('should not change power when SNR between 15 and 35', () => {
    const actual: EstadoActual = { anchoMhz: 20, potenciaDbm: 15 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 20, reintentosPct: 0 });
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.potenciaDbm).toBe(15);
    expect(result.motivo).toContain('Se mantiene la potencia en 15 dBm');
  });

  it('should handle less than 5 measurements', () => {
    const actual: EstadoActual = { anchoMhz: 80, potenciaDbm: 10 };
    const medidas: Medida[] = [
      { snrDb: 10, reintentosPct: 0 },
      { snrDb: 12, reintentosPct: 0 },
      { snrDb: 14, reintentosPct: 0 },
    ]; // only 3 measurements
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(40); // decreased because SNR < 20
    expect(result.motivo).toContain('Se disminuye el ancho de banda a 40 MHz');
  });

  it('should combine ancho and power adjustments', () => {
    const actual: EstadoActual = { anchoMhz: 80, potenciaDbm: 10 };
    // Low SNR and high reintentos -> decrease ancho, and low SNR -> increase power (if within margin)
    const medidas: Medida[] = [
      { snrDb: 10, reintentosPct: 20 }, // low SNR, high reintentos
      { snrDb: 10, reintentosPct: 20 },
      { snrDb: 10, reintentosPct: 20 },
      { snrDb: 10, reintentosPct: 20 },
      { snrDb: 10, reintentosPct: 20 },
    ];
    const result: Resultado = ajustarEnlace(actual, medidas, limites);
    expect(result.anchoMhz).toBe(40);
    expect(result.potenciaDbm).toBe(12); // increased from 10 to 12
    expect(result.motivo).toContain('Se disminuye el ancho de banda a 40 MHz');
    expect(result.motivo).toContain('Se aumenta la potencia a 12 dBm');
  });
});