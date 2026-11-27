/**
 * use-disposicion.test.ts — pruebas de la lógica pura para la disposición 4D (MV1125C · parte 2 de 2).
 * ─────────────────────────────────────────────────────────────────────────────
 * Pruebas de funciones puras: validación, construcción de petición, generación de IDs.
 */
import { describe, expect, it } from 'vitest';
import {
  construirPeticion,
  tipoValido,
  generarIdsUnicos,
} from '../use-disposicion-puro';

describe('construirPeticion', () => {
  it('crea petición válida para fuerza', () => {
    const p = construirPeticion('fuerza', { n: 10, aristas: [{ de: 0, a: 1, intensidad: 1 }] });
    expect(p).toEqual({
      modo: 'fuerza',
      n: 10,
      aristas: [{ de: 0, a: 1, intensidad: 1 }],
    });
  });

  it('crea petición válida para radial', () => {
    const p = construirPeticion('radial', { padres: [-1, 0, 1] });
    expect(p).toEqual({
      modo: 'radial',
      padres: [-1, 0, 1],
    });
  });

  it('crea petición válida para espiral', () => {
    const p = construirPeticion('espiral', { tiempos: [0, 1, 2] });
    expect(p).toEqual({
      modo: 'espiral',
      tiempos: [0, 1, 2],
    });
  });

  it('crea petición válida para planos', () => {
    const p = construirPeticion('planos', { capas: ['a', 'b', 'a'] });
    expect(p).toEqual({
      modo: 'planos',
      capas: ['a', 'b', 'a'],
    });
  });
});

describe('tipoValido', () => {
  it('acepta los cuatro tipos válidos', () => {
    expect(tipoValido('fuerza')).toBe(true);
    expect(tipoValido('radial')).toBe(true);
    expect(tipoValido('espiral')).toBe(true);
    expect(tipoValido('planos')).toBe(true);
  });

  it('rechaza tipos no válidos', () => {
    expect(tipoValido('invalido' as any)).toBe(false);
    expect(tipoValido('FUERZA' as any)).toBe(false);
  });
});

describe('generarIdsUnicos', () => {
  it('asigna IDs únicos secuencialmente', () => {
    const ids1 = generarIdsUnicos(5);
    const ids2 = generarIdsUnicos(5);
    expect(ids1).toEqual([0, 1, 2, 3, 4]);
    expect(ids2).toEqual([0, 1, 2, 3, 4]);
  });

  it('devuelve array vacío para n = 0', () => {
    expect(generarIdsUnicos(0)).toEqual([]);
  });
});