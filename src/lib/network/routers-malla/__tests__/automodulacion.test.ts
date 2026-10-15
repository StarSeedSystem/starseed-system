import { describe, it, expect } from 'vitest';
import { ajustarEnlace, AnchoMhzActual, Medida, Limites, ResultadoAjuste } from '../automodulacion';

const limites: Limites = { anchosMhz: [20, 40, 80], pireMaxDbm: 30 };

describe('ajustarEnlace', () => {
  it('no change when stable', () => {
    const actual: AnchoMhzActual = { anchoMhz: 20, potenciaDbm: 10 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 25, reintentosPct: 5 });
    expect(ajustarEnlace(actual, medidas, limites)).toEqual({ anchoMhz: 20, potenciaDbm: 10, motivo: 'Sin cambios' });
  });

  it('decrease 80→40 for low SNR', () => {
    const actual: AnchoMhzActual = { anchoMhz: 80, potenciaDbm: 20 };
    const medidas: Medida[] = [{ snrDb: 18, reintentosPct: 5 }, { snrDb: 19, reintentosPct: 4 }, { snrDb: 17, reintentosPct: 6 }, { snrDb: 18, reintentosPct: 5 }, { snrDb: 20, reintentosPct: 3 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.motivo).toContain('SNR bajo para 80 MHz');
  });

  it('decrease 40→20 for low SNR', () => {
    const actual: AnchoMhzActual = { anchoMhz: 40, potenciaDbm: 20 };
    const medidas: Medida[] = [{ snrDb: 14, reintentosPct: 5 }, { snrDb: 13, reintentosPct: 4 }, { snrDb: 15, reintentosPct: 6 }, { snrDb: 14, reintentosPct: 5 }, { snrDb: 12, reintentosPct: 3 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(20);
    expect(res.motivo).toContain('SNR bajo para 40 MHz');
  });

  it('decrease for high retries', () => {
    const actual: AnchoMhzActual = { anchoMhz: 80, potenciaDbm: 20 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 25, reintentosPct: 16 });
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.motivo).toContain('Demasiados reintentos');
  });

  it('increase 20→40 with hysteresis', () => {
    const actual: AnchoMhzActual = { anchoMhz: 20, potenciaDbm: 20 };
    const medidas: Medida[] = [{ snrDb: 26, reintentosPct: 4 }, { snrDb: 24, reintentosPct: 3 }, { snrDb: 25, reintentosPct: 2 }, { snrDb: 26, reintentosPct: 4 }, { snrDb: 24, reintentosPct: 3 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.motivo).toContain('SNR suficiente para aumentar a 40 MHz');
  });

  it('increase 40→80 with hysteresis', () => {
    const actual: AnchoMhzActual = { anchoMhz: 40, potenciaDbm: 20 };
    const medidas: Medida[] = [{ snrDb: 26, reintentosPct: 4 }, { snrDb: 28, reintentosPct: 3 }, { snrDb: 27, reintentosPct: 2 }, { snrDb: 26, reintentosPct: 4 }, { snrDb: 29, reintentosPct: 3 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(80);
    expect(res.motivo).toContain('SNR suficiente para aumentar a 80 MHz');
  });

  it('no oscillation at threshold', () => {
    const actual: AnchoMhzActual = { anchoMhz: 20, potenciaDbm: 20 };
    const medidas: Medida[] = Array(5).fill({ snrDb: 20, reintentosPct: 3 });
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(20);
    expect(res.motivo).toBe('Sin cambios');
  });

  it('increase power for low SNR with margin', () => {
    const actual: AnchoMhzActual = { anchoMhz: 20, potenciaDbm: 10 };
    const medidas: Medida[] = [{ snrDb: 10, reintentosPct: 5 }, { snrDb: 12, reintentosPct: 4 }, { snrDb: 8, reintentosPct: 6 }, { snrDb: 11, reintentosPct: 5 }, { snrDb: 9, reintentosPct: 3 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.potenciaDbm).toBe(12);
    expect(res.motivo).toContain('Potencia aumentada');
  });

  it('no increase power at max', () => {
    const actual: AnchoMhzActual = { anchoMhz: 20, potenciaDbm: 30 };
    const medidas: Medida[] = [{ snrDb: 10, reintentosPct: 5 }, { snrDb: 12, reintentosPct: 4 }, { snrDb: 8, reintentosPct: 6 }, { snrDb: 11, reintentosPct: 5 }, { snrDb: 9, reintentosPct: 3 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.potenciaDbm).toBe(30);
    expect(res.motivo).toContain('Potencia limitada al máximo legal');
  });

  it('decrease power for high SNR', () => {
    const actual: AnchoMhzActual = { anchoMhz: 20, potenciaDbm: 20 };
    const medidas: Medida[] = [{ snrDb: 36, reintentosPct: 5 }, { snrDb: 38, reintentosPct: 4 }, { snrDb: 40, reintentosPct: 6 }, { snrDb: 37, reintentosPct: 5 }, { snrDb: 39, reintentosPct: 3 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.potenciaDbm).toBe(18);
    expect(res.motivo).toContain('Potencia disminuida por interferencia');
  });

  it('use median of last 5', () => {
    const actual: AnchoMhzActual = { anchoMhz: 80, potenciaDbm: 20 };
    const medidas: Medida[] = [
      { snrDb: 10, reintentosPct: 5 },
      { snrDb: 12, reintentosPct: 4 },
      { snrDb: 25, reintentosPct: 6 },
      { snrDb: 26, reintentosPct: 5 },
      { snrDb: 24, reintentosPct: 3 }
    ];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(80);
  });

  it('handle fewer than 5 measurements', () => {
    const actual: AnchoMhzActual = { anchoMhz: 80, potenciaDbm: 20 };
    const medidas: Medida[] = [{ snrDb: 18, reintentosPct: 5 }, { snrDb: 19, reintentosPct: 4 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(40);
    expect(res.motivo).toContain('SNR bajo para 80 MHz');
  });

  it('not decrease below minimum', () => {
    const actual: AnchoMhzActual = { anchoMhz: 20, potenciaDbm: 20 };
    const medidas: Medida[] = [{ snrDb: 10, reintentosPct: 20 }];
    const res = ajustarEnlace(actual, medidas, limites);
    expect(res.anchoMhz).toBe(20);
    expect(res.potenciaDbm).toBe(22);
    expect(res.motivo).toContain('Potencia aumentada');
  });
});