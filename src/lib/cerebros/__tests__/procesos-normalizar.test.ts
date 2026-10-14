import { describe, it, expect } from 'vitest';
import {
  desdeAgentesMac,
  desdeLatidos,
  desdeNodos,
  desdePoligenesis,
  desdeSuenos,
  desdeImaginacion,
  desdeInstalaciones,
  desdeActualizaciones,
  desdeVentanas,
  desdePresencia,
  unirProcesos,
  agruparPorTipo,
} from '../procesos-normalizar';

describe('desdeAgentesMac', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeAgentesMac(null)).toEqual([]);
    expect(desdeAgentesMac(undefined)).toEqual([]);
    expect(desdeAgentesMac('')).toEqual([]);
  });
});

describe('desdeLatidos', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeLatidos(null)).toEqual([]);
    expect(desdeLatidos(undefined)).toEqual([]);
    expect(desdeLatidos('')).toEqual([]);
  });
});

describe('desdeNodos', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeNodos(null)).toEqual([]);
    expect(desdeNodos(undefined)).toEqual([]);
    expect(desdeNodos('')).toEqual([]);
  });
});

describe('desdePoligenesis', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdePoligenesis(null)).toEqual([]);
    expect(desdePoligenesis(undefined)).toEqual([]);
    expect(desdePoligenesis('')).toEqual([]);
  });
});

describe('desdeSuenos', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeSuenos(null)).toEqual([]);
    expect(desdeSuenos(undefined)).toEqual([]);
    expect(desdeSuenos('')).toEqual([]);
  });
});

describe('desdeImaginacion', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeImaginacion(null)).toEqual([]);
    expect(desdeImaginacion(undefined)).toEqual([]);
    expect(desdeImaginacion('')).toEqual([]);
  });
});

describe('desdeInstalaciones', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeInstalaciones(null)).toEqual([]);
    expect(desdeInstalaciones(undefined)).toEqual([]);
    expect(desdeInstalaciones('')).toEqual([]);
  });
});

describe('desdeActualizaciones', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeActualizaciones(null)).toEqual([]);
    expect(desdeActualizaciones(undefined)).toEqual([]);
    expect(desdeActualizaciones('')).toEqual([]);
  });
});

describe('desdeVentanas', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdeVentanas(null)).toEqual([]);
    expect(desdeVentanas(undefined)).toEqual([]);
    expect(desdeVentanas('')).toEqual([]);
  });
});

describe('desdePresencia', () => {
  it('should return an empty array for invalid input', () => {
    expect(desdePresencia(null)).toEqual([]);
    expect(desdePresencia(undefined)).toEqual([]);
    expect(desdePresencia('')).toEqual([]);
  });
});

describe('unirProcesos', () => {
  it('should return an empty array when no lists are provided', () => {
    expect(unirProcesos()).toEqual([]);
  });

  it('should return an empty array when all lists are empty', () => {
    expect(unirProcesos([], [], [])).toEqual([]);
  });
});

describe('agruparPorTipo', () => {
  it('should return an empty object when given an empty array', () => {
    expect(agruparPorTipo([])).toEqual({});
  });
});