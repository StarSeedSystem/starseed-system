import { describe, it, expect } from 'vitest';
import { debeSugerir, registrarNegativa, NEGATIVA_HORAS } from '../sugerencia-banco';
import { EstadoConexion, FuenteLimitada } from '../tipos';

describe('NEGATIVA_HORAS', () => {
  it('es 24 horas', () => {
    expect(NEGATIVA_HORAS).toBe(24);
  });
});

describe('registrarNegativa', () => {
  it('devuelve objeto con timestamp y clave de conexión', () => {
    const ahora = 1_700_000_000_000;
    const clave = 'cellular|4g|false';
    const r = registrarNegativa(ahora, clave)!;
    expect(r.en).toBe(ahora);
    expect(r.conexion).toBe(clave);
  });
});

describe('debeSugerir', () => {
  const baseEntrada = {
    estado: 'limitada' as EstadoConexion,
    fuente: 'navegador' as FuenteLimitada,
    bancoActivo: false,
    compartirConOtros: true,
    negativa: null,
    ahora: 1_700_000_000_000,
    clave: 'cellular|4g|false',
  };

  describe('caso base: limitada y sin banco → sugiere', () => {
    it('sugiere con motivo que menciona conexión limitada', () => {
      const r = debeSugerir(baseEntrada);
      expect(r.sugerir).toBe(true);
      expect(r.motivo).toContain('limitada');
    });
  });

  describe('banco ya activo → no sugiere', () => {
    it('no sugiere aunque la conexión sea limitada', () => {
      const r = debeSugerir({ ...baseEntrada, bancoActivo: true });
      expect(r.sugerir).toBe(false);
      expect(r.motivo).toContain('ya está activo');
    });
  });

  describe('conexión no limitada o desconocida → no sugiere', () => {
    it('no-limitada → no sugiere', () => {
      const r = debeSugerir({ ...baseEntrada, estado: 'no-limitada' });
      expect(r.sugerir).toBe(false);
      expect(r.motivo).toContain('no es limitada');
    });

    it('desconocida → no sugiere', () => {
      const r = debeSugerir({ ...baseEntrada, estado: 'desconocida' });
      expect(r.sugerir).toBe(false);
      expect(r.motivo).toContain('desconocida');
    });
  });

  describe('negativa reciente (menos de 24 h) con misma clave → no sugiere', () => {
    it('negativa de 1 hora atrás misma clave → no sugiere', () => {
      const ahora = 1_700_000_000_000;
      const negativa = { en: ahora - 1 * 60 * 60 * 1000, conexion: 'cellular|4g|false' };
      const r = debeSugerir({ ...baseEntrada, ahora, negativa });
      expect(r.sugerir).toBe(false);
      expect(r.motivo).toContain('dijo «Ahora no»');
    });

    it('negativa de 23 horas atrás misma clave → no sugiere', () => {
      const ahora = 1_700_000_000_000;
      const negativa = { en: ahora - 23 * 60 * 60 * 1000, conexion: 'cellular|4g|false' };
      const r = debeSugerir({ ...baseEntrada, ahora, negativa });
      expect(r.sugerir).toBe(false);
    });
  });

  describe('negativa antigua (más de 24 h) → sugiere', () => {
    it('negativa de 25 horas atrás → sugiere', () => {
      const ahora = 1_700_000_000_000;
      const negativa = { en: ahora - 25 * 60 * 60 * 1000, conexion: 'cellular|4g|false' };
      const r = debeSugerir({ ...baseEntrada, ahora, negativa });
      expect(r.sugerir).toBe(true);
    });

    it('negativa de exactamente 24 horas → sugiere (límite exclusivo: menos de 24 h)', () => {
      const ahora = 1_700_000_000_000;
      const negativa = { en: ahora - 24 * 60 * 60 * 1000, conexion: 'cellular|4g|false' };
      const r = debeSugerir({ ...baseEntrada, ahora, negativa });
      expect(r.sugerir).toBe(true);
    });
  });

  describe('negativa con otra clave → sugiere (la conexión cambió)', () => {
    it('negativa de 1 hora atrás con clave distinta → sugiere', () => {
      const ahora = 1_700_000_000_000;
      const negativa = { en: ahora - 1 * 60 * 60 * 1000, conexion: 'wifi|4g|false' };
      const r = debeSugerir({ ...baseEntrada, ahora, negativa });
      expect(r.sugerir).toBe(true);
    });

    it('negativa de 1 hora atrás con effectiveType distinto → sugiere', () => {
      const ahora = 1_700_000_000_000;
      const negativa = { en: ahora - 1 * 60 * 60 * 1000, conexion: 'cellular|3g|false' };
      const r = debeSugerir({ ...baseEntrada, ahora, negativa });
      expect(r.sugerir).toBe(true);
    });

    it('negativa de 1 hora atrás con saveData distinto → sugiere', () => {
      const ahora = 1_700_000_000_000;
      const negativa = { en: ahora - 1 * 60 * 60 * 1000, conexion: 'cellular|4g|true' };
      const r = debeSugerir({ ...baseEntrada, ahora, negativa });
      expect(r.sugerir).toBe(true);
    });
  });

  describe('fuente declarada también sugiere', () => {
    it('fuente "declarada" con estado limitada → sugiere', () => {
      const r = debeSugerir({ ...baseEntrada, fuente: 'declarada' });
      expect(r.sugerir).toBe(true);
    });

    it('fuente "nativa" con estado limitada → sugiere', () => {
      const r = debeSugerir({ ...baseEntrada, fuente: 'nativa' });
      expect(r.sugerir).toBe(true);
    });
  });

  describe('compartirConOtros = false → sugiere pero el motivo lo indica', () => {
    it('sugiere aunque compartirConOtros sea false', () => {
      const r = debeSugerir({ ...baseEntrada, compartirConOtros: false });
      expect(r.sugerir).toBe(true);
      expect(r.motivo).toContain('compartir');
    });
  });
});