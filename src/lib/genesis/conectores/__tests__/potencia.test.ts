import { describe, it, expect } from 'vitest';
import { puntuarPotencia, ordenarPorPotencia, Medida, ResultadoPotencia } from '../potencia';

describe('puntuarPotencia', () => {
  it('returns neutral score and zero confidence when no measures', () => {
    const result: ResultadoPotencia = puntuarPotencia([], 'escritor');
    expect(result.puntuacion).toBe(0);
    expect(result.confianza).toBe(0);
    expect(result.motivo).toBe('Sin medidas');
  });

  it('TODO: add more tests');
});

describe('ordenarPorPotencia', () => {
  it('returns empty array when no measures', () => {
    const result: Medida[] = ordenarPorPotencia([], 'escritor');
    expect(result).toEqual([]);
  });

  it('TODO: add more tests');
});