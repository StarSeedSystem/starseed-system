import { describe, it, expect } from 'vitest';
import { debeSugerir, registrarNegativa, NEGATIVA_HORAS } from '../sugerencia-banco';
import type { EstadoConexion, FuenteLimitada } from '../tipos';

describe('debeSugerir', () => {
  const ahora = 1700000000000;

  describe('sugiere', () => {
    it('limitada sin banco activo', () => {
      const entrada = {
        estado: 'limitada' as EstadoConexion,
        fuente: 'declarada' as FuenteLimitada,
        bancoActivo: false,
        compartirConOtros: true,
        negativa: null,
        ahora,
        clave: 'cellular|cellular|saveData',
      };
      expect(debeSugerir(entrada).sugerir).toBe(true);
    });

    it('negativa hace 25h misma clave', () => {
      const entrada = {
        estado: 'limitada' as EstadoConexion,
        fuente: 'declarada' as FuenteLimitada,
        bancoActivo: false,
        negativa: { en: ahora - 25 * 3600 * 1000 - 1, conexion: 'cellular|cellular|saveData' },
        ahora,
        clave: 'cellular|cellular|saveData',
      };
      expect(debeSugerir(entrada).sugerir).toBe(true);
    });
  });

  describe('no sugiere', () => {
    it('banco activo', () => {
      const e = { estado: 'limitada' as EstadoConexion, fuente: 'declarada' as FuenteLimitada, bancoActivo: true, compartirConOtros: true, negativa: null, ahora, clave: 'c' };
      expect(debeSugerir(e).sugerir).toBe(false);
    });

    it('no limitada o desconocida', () => {
      const e1 = { estado: 'no-limitada' as EstadoConexion, fuente: 'navegador' as FuenteLimitada, bancoActivo: false, compartirConOtros: true, negativa: null, ahora, clave: 'c' };
      expect(debeSugerir(e1).sugerir).toBe(false);

      const e2 = { estado: 'desconocida' as EstadoConexion, fuente: 'ninguna' as FuenteLimitada, bancoActivo: false, negativa: null, ahora, clave: 'c' };
      expect(debeSugerir(e2).sugerir).toBe(false);
    });

    it('negativa 1h misma clave', () => {
      const e = {
        estado: 'limitada' as EstadoConexion,
        fuente: 'declarada' as FuenteLimitada,
        bancoActivo: false,
        compartirConOtros: true,
        negativa: { en: ahora - 3600000, conexion: 'cellular|cellular|saveData' },
        ahora,
        clave: 'cellular|cellular|saveData',
      };
      expect(debeSugerir(e).sugerir).toBe(false);
    });
  });

  it('fuente declarada sugiere', () => {
    const e = { estado: 'limitada' as EstadoConexion, fuente: 'declarada' as FuenteLimitada, bancoActivo: false, compartirConOtros: true, negativa: null, ahora, clave: 'c' };
    expect(debeSugerir(e).sugerir).toBe(true);
  });

  it('compartirConOtros=false sugiere', () => {
    const e = { estado: 'limitada' as EstadoConexion, fuente: 'navegador' as FuenteLimitada, bancoActivo: false, compartirConOtros: false, negativa: null, ahora, clave: 'c' };
    const r = debeSugerir(e);
    expect(r.sugerir).toBe(true);
  });

  it('negativa con otra clave sugiere', () => {
    const e = {
      estado: 'limitada' as EstadoConexion,
      fuente: 'nativa' as FuenteLimitada,
      bancoActivo: false,
      compartirConOtros: true,
      negativa: { en: ahora - 3600000, conexion: 'otra-clave' },
      ahora,
      clave: 'cellular|cellular|saveData',
    };
    expect(debeSugerir(e).sugerir).toBe(true);
  });
});

describe('registrarNegativa', () => {
  it('regresa { en, conexion }', () => {
    expect(registrarNegativa(1700000000000, 'wifi|wifi|saveData')).toEqual({ en: 1700000000000, conexion: 'wifi|wifi|saveData' });
  });
});

describe('NEGATIVA_HORAS', () => {
  it('es 24', () => {
    expect(NEGATIVA_HORAS).toBe(24);
  });
});