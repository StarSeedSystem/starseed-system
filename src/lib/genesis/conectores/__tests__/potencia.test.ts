import { describe, it, expect } from 'vitest';
import { puntuarPotencia, ordenarPorPotencia, Medida, ResultadoPuntuacion } from '../potencia';

describe('puntuarPotencia', () => {
  it('should return neutral score and zero confidence when no measures are provided', () => {
    const medidas: Medida[] = [];
    const papel = 'escritor';
    const resultado = puntuarPotencia(medidas, papel);
    expect(resultado.puntuacion).toBe(0); // neutral score
    expect(resultado.confianza).toBe(0);
    expect(resultado.motivo).toBe('Sin medidas');
  });

  it('should calculate a score based on measures', () => {
    const medidas: Medida[] = [
      {
        tokensPorSeg: 100, // half of 200 -> 0.5
        aciertos: 8,
        intentos: 10, // accuracy 0.8
        latenciaMs: 1000, // half of 2000 -> latencyNorm 0.5, inverse 0.5
        capa: 'capa1'
      }
    ];
    const papel = 'escritor';
    const resultado = puntuarPotencia(medidas, papel);
    // Expected score: average of 0.5 (tokens), 0.8 (accuracy), 0.5 (inverse latency) = (0.5+0.8+0.5)/3 = 1.8/3 = 0.6
    // We allow some floating point tolerance
    expect(resultado.puntuacion).toBeCloseTo(0.6);
    // Confidence: all three measures are present, so total weight = 3, max possible weight = 3 (since we have one entry and three measures each weight 1)
    expect(resultado.confianza).toBe(1);
    expect(resultado.motivo).toContain('Puntuación basada en 1 medida');
  });

  it('should handle null measures correctly', () => {
    const medidas: Medida[] = [
      {
        tokensPorSeg: null,
        aciertos: 5,
        intentos: 10, // accuracy 0.5
        latenciaMs: null,
        capa: null
      }
    ];
    const papel = 'revisor';
    const resultado = puntuarPotencia(medidas, papel);
    // Only accuracy is present: 0.5
    expect(resultado.puntuacion).toBeCloseTo(0.5);
    // Confidence: only one measure present out of three possible -> 1/3
    expect(resultado.confianza).toBeCloseTo(1/3);
    expect(resultado.motivo).toContain('Puntuación basada en 1 medida');
  });

  it('should return zero confidence when no valid measures', () => {
    const medidas: Medida[] = [
      {
        tokensPorSeg: null,
        aciertos: null,
        intentos: 0, // accuracy cannot be calculated because intentos=0
        latenciaMs: null,
        capa: null
      }
    ];
    const papel = 'director';
    const resultado = puntuarPotencia(medidas, papel);
    expect(resultado.puntuacion).toBe(0);
    expect(resultado.confianza).toBe(0);
    expect(resultado.motivo).toBe('No se pudieron calcular puntuaciones válidas');
  });
});

describe('ordenarPorPotencia', () => {
  it('should return an empty array when no measures are provided', () => {
    const medidas: Medida[] = [];
    const papel = 'escritor';
    const resultado = ordenarPorPotencia(medidas, papel);
    expect(resultado).toEqual([]);
  });

  it('should sort measures by potency descending', () => {
    const medidas: Medida[] = [
      {
        tokensPorSeg: 200, // 1.0
        aciertos: 10,
        intentos: 10, // accuracy 1.0
        latenciaMs: 0, // inverse latency 1.0
        capa: 'capaA'
      },
      {
        tokensPorSeg: 100, // 0.5
        aciertos: 5,
        intentos: 10, // accuracy 0.5
        latenciaMs: 1000, // inverse latency 0.5
        capa: 'capaB'
      },
      {
        tokensPorSeg: 0, // 0.0
        aciertos: 0,
        intentos: 10, // accuracy 0.0
        latenciaMs: 2000, // inverse latency 0.0
        capa: 'capaC'
      }
    ];
    const papel = 'escritor';
    const resultado = ordenarPorPotencia(medidas, papel);
    // Expected order: first, second, third (descending potency)
    expect(resultado[0]).toBe(medidas[0]);
    expect(resultado[1]).toBe(medidas[1]);
    expect(resultado[2]).toBe(medidas[2]);
  });

  it('should handle ties in potency (maintain original order for equal scores)', () => {
    const medidas: Medida[] = [
      {
        tokensPorSeg: 100,
        aciertos: 5,
        intentos: 10,
        latenciaMs: 1000,
        capa: 'capaX'
      },
      {
        tokensPorSeg: 100,
        aciertos: 5,
        intentos: 10,
        latenciaMs: 1000,
        capa: 'capaY'
      }
    ];
    const papel = 'escritor';
    const resultado = ordenarPorPotencia(medidas, papel);
    // Since the scores are equal, the order should be the same as the input (stable sort)
    expect(resultado[0]).toBe(medidas[0]);
    expect(resultado[1]).toBe(medidas[1]);
  });
});