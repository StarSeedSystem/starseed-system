import { describe, expect, it } from 'vitest';
import { calcularPeticion } from '../disposicion.worker';

describe('worker de disposición (cálculo puro)', () => {
  it('importar el módulo fuera de un worker no arranca nada', () => {
    expect(typeof calcularPeticion).toBe('function');
  });

  it('calcula los cuatro modos y devuelve Float32Array', () => {
    const fuerza = calcularPeticion({
      modo: 'fuerza',
      n: 4,
      aristas: [{ de: 0, a: 1, intensidad: 1 }],
      opciones: { iteraciones: 2 },
    });
    expect(fuerza).toBeInstanceOf(Float32Array);
    expect(fuerza.length).toBe(12);

    const radial = calcularPeticion({ modo: 'radial', padres: [-1, 0] });
    expect(radial.length).toBe(6);

    const espiral = calcularPeticion({ modo: 'espiral', tiempos: [0, 1] });
    expect(espiral.length).toBe(6);

    const planos = calcularPeticion({ modo: 'planos', capas: ['a', 'b'] });
    expect(planos.length).toBe(6);
  });

  it('es determinista entre llamadas', () => {
    const peticion = {
      modo: 'fuerza' as const,
      n: 6,
      aristas: [{ de: 0, a: 1, intensidad: 1 }],
      opciones: { semilla: 4, iteraciones: 5 },
    };
    expect(Array.from(calcularPeticion(peticion))).toEqual(
      Array.from(calcularPeticion(peticion)),
    );
  });
});
