import { describe, it, expect } from 'vitest';
import { evaluarSparse2_4, UMBRALES_INVERSION, type MedicionMotor } from '../sparse-nvidia';

describe('evaluarSparse2_4', () => {
  const referenciaBase: MedicionMotor = {
    perplejidad: 5.38,
    tokensPorSegundo: 10,
    costoHoraUsd: 0,
  };

  it('devuelve "medir-mas" cuando faltan mediciones del candidato', () => {
    const candidato: MedicionMotor = {
      perplejidad: null,
      tokensPorSegundo: 15,
      costoHoraUsd: 0.5,
    };

    const resultado = evaluarSparse2_4(referenciaBase, candidato);

    expect(resultado.veredicto).toBe('medir-mas');
    expect(resultado.motivos.some((m) => m.includes('perplejidad del candidato'))).toBe(true);
  });

  it('devuelve "medir-mas" cuando faltan mediciones de la referencia', () => {
    const referencia: MedicionMotor = {
      perplejidad: null,
      tokensPorSegundo: null,
      costoHoraUsd: 0,
    };
    const candidato: MedicionMotor = {
      perplejidad: 5.5,
      tokensPorSegundo: 15,
      costoHoraUsd: 0.5,
    };

    const resultado = evaluarSparse2_4(referencia, candidato);

    expect(resultado.veredicto).toBe('medir-mas');
    expect(resultado.motivos.some((m) => m.includes('perplejidad de referencia') || m.includes('throughput de referencia'))).toBe(true);
  });

  it('devuelve "no-invertir" cuando la ganancia de throughput es inferior al mínimo', () => {
    const candidato: MedicionMotor = {
      perplejidad: 5.5,
      tokensPorSegundo: 12,
      costoHoraUsd: 0.5,
    };

    const resultado = evaluarSparse2_4(referenciaBase, candidato);

    expect(resultado.veredicto).toBe('no-invertir');
    expect(resultado.gananciaThroughput).toBeCloseTo(1.2, 1);
    expect(resultado.motivos.some((m) => m.includes('ganancia de throughput') && m.includes('no llega'))).toBe(true);
  });

  it('devuelve "no-invertir" cuando la pérdida de perplejidad supera el techo', () => {
    const candidato: MedicionMotor = {
      perplejidad: 5.8,
      tokensPorSegundo: 20,
      costoHoraUsd: 0.5,
    };

    const resultado = evaluarSparse2_4(referenciaBase, candidato);

    expect(resultado.veredicto).toBe('no-invertir');
    expect(resultado.perdidaPerplejidadPct).toBeGreaterThan(UMBRALES_INVERSION.perdidaMaximaPct);
    expect(resultado.motivos.some((m) => m.includes('perplejidad empeora'))).toBe(true);
  });

  it('devuelve "no-invertir" cuando el coste por millón de tokens supera el techo', () => {
    const candidato: MedicionMotor = {
      perplejidad: 5.5,
      tokensPorSegundo: 20,
      costoHoraUsd: 100,
    };

    const resultado = evaluarSparse2_4(referenciaBase, candidato);

    expect(resultado.veredicto).toBe('no-invertir');
    expect(resultado.costoPorMillonTokensUsd).toBeGreaterThan(UMBRALES_INVERSION.costoMaximoPorMillonUsd);
    expect(resultado.motivos.some((m) => m.includes('coste por millón') && m.includes('supera'))).toBe(true);
  });

  it('devuelve "invertir" cuando se cumplen todos los criterios', () => {
    const candidato: MedicionMotor = {
      perplejidad: 5.5,
      tokensPorSegundo: 20,
      costoHoraUsd: 0.05,
    };

    const resultado = evaluarSparse2_4(referenciaBase, candidato);

    expect(resultado.veredicto).toBe('invertir');
    expect(resultado.gananciaThroughput).toBeGreaterThanOrEqual(UMBRALES_INVERSION.gananciaMinima);
    expect(resultado.perdidaPerplejidadPct).toBeLessThanOrEqual(UMBRALES_INVERSION.perdidaMaximaPct);
    expect(resultado.costoPorMillonTokensUsd).toBeLessThanOrEqual(UMBRALES_INVERSION.costoMaximoPorMillonUsd);
    expect(resultado.motivos.some((m) => m.includes('Compensa'))).toBe(true);
  });

  it('calcula correctamente el ahorro de tiempo porcentual', () => {
    const candidato: MedicionMotor = {
      perplejidad: 5.5,
      tokensPorSegundo: 20,
      costoHoraUsd: 0.05,
    };

    const resultado = evaluarSparse2_4(referenciaBase, candidato);

    expect(resultado.ahorroTiempoPct).toBeCloseTo(50, 1);
  });

  it('permite sobrescribir umbrales con parámetro opcional', () => {
    const candidato: MedicionMotor = {
      perplejidad: 5.5,
      tokensPorSegundo: 12,
      costoHoraUsd: 0.03,
    };

    const resultado = evaluarSparse2_4(referenciaBase, candidato, { gananciaMinima: 1.1 });

    expect(resultado.veredicto).toBe('invertir');
  });
});