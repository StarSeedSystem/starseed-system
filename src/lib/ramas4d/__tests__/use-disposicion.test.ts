import { describe, expect, it, vi } from 'vitest';
import { calcularDisposicion, tipoDisposicionValido } from '../use-disposicion';

describe('use-disposicion (funciones puras)', () => {
  it('tipoDisposicionValido acepta los cuatro modos', () => {
    expect(tipoDisposicionValido('fuerza')).toBe(true);
    expect(tipoDisposicionValido('radial')).toBe(true);
    expect(tipoDisposicionValido('espiral')).toBe(true);
    expect(tipoDisposicionValido('planos')).toBe(true);
    expect(tipoDisposicionValido('otro')).toBe(false);
  });

  it('calcularDisposicion delega a la función pura del worker', async () => {
    const posiciones = await calcularDisposicion({
      modo: 'fuerza',
      n: 4,
      aristas: [{ de: 0, a: 1, intensidad: 1 }],
      opciones: { iteraciones: 2 },
    });
    expect(posiciones).toBeInstanceOf(Float32Array);
    expect(posiciones.length).toBe(12);
  });

  it('calcularDisposicion es determinista con la misma semilla', async () => {
    const peticion = {
      modo: 'fuerza' as const,
      n: 6,
      aristas: [{ de: 0, a: 1, intensidad: 1 }],
      opciones: { semilla: 4, iteraciones: 5 },
    };
    const a = await calcularDisposicion(peticion);
    const b = await calcularDisposicion(peticion);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('calcularDisposicion maneja los cuatro modos', async () => {
    const fuerza = await calcularDisposicion({ modo: 'fuerza', n: 3, aristas: [] });
    const radial = await calcularDisposicion({ modo: 'radial', padres: [-1, 0] });
    const espiral = await calcularDisposicion({ modo: 'espiral', tiempos: [0, 1] });
    const planos = await calcularDisposicion({ modo: 'planos', capas: ['a', 'b'] });
    expect(fuerza.length).toBe(9);
    expect(radial.length).toBe(6);
    expect(espiral.length).toBe(6);
    expect(planos.length).toBe(6);
  });
});