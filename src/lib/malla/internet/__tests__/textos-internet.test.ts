import { describe, it, expect } from 'vitest';
import { TEXTOS_INTERNET, TEXTOS_EXTRA_INTERNET, TextosInternet } from '../textos-internet';

describe('TEXTOS_INTERNET', () => {
  it('tiene todas las claves requeridas y no están vacías', () => {
    const requiredKeys: (keyof TextosInternet)[] = [
      'bancoTitulo',
      'bancoAyuda',
      'racionDiaria',
      'programacion',
      'mb',
      'gb',
      'quedaHoy',
      'agotadoHoy',
      'meshTitulo',
      'meshAyuda',
      'meshSinLimite',
      'meshConLimite',
      'conexionLimitada',
      'conexionNoLimitada',
      'conexionDesconocida',
      'fuenteDeclarada',
      'fuenteNativa',
      'fuenteNavegador',
      'sugerirTitulo',
      'sugerirCuerpo',
      'sugerirActivar',
      'sugerirAhoraNo',
      'audMiCuenta',
      'audEntidad',
      'audPublico',
    ];

    for (const key of requiredKeys) {
      const value = TEXTOS_INTERNET[key];
      expect(value, `Clave "${key}" no debe estar vacía`).toBeTruthy();
      if (typeof value === 'string') {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });

  it('no contiene términos prohibidos', () => {
    const prohibited = ['Mando', 'llamadas', 'banco de llamadas'];
    const allText = Object.values(TEXTOS_INTERNET)
      .filter((v): v is string => typeof v === 'string')
      .join(' ');

    for (const term of prohibited) {
      expect(allText.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it('contiene "modo banco" y "modo mesh" donde se espera', () => {
    expect(TEXTOS_INTERNET.bancoTitulo.toLowerCase()).toContain('modo banco');
    expect(TEXTOS_INTERNET.meshTitulo.toLowerCase()).toContain('modo mesh');
  });

  it('bancoAyuda explica que sirve para internet limitado y repartir datos entre neuronas', () => {
    const ayuda = TEXTOS_INTERNET.bancoAyuda.toLowerCase();
    expect(ayuda).toContain('limitado');
    expect(ayuda).toContain('reparte');
    expect(ayuda).toContain('neuronas');
  });

  it('meshAyuda explica que comparte por malla P2P con o sin límite', () => {
    const ayuda = TEXTOS_INTERNET.meshAyuda.toLowerCase();
    expect(ayuda).toContain('malla');
    expect(ayuda).toContain('p2p');
    expect(ayuda).toMatch(/con|sin.*l[ií]mite/);
  });

  it('sugerirCuerpo dice que la conexión parece de pago, es solo sugerencia y nada cambia hasta aceptar', () => {
    const cuerpo = TEXTOS_INTERNET.sugerirCuerpo.toLowerCase();
    expect(cuerpo).toContain('pago');
    expect(cuerpo).toContain('sugerencia');
    expect(cuerpo).toContain('acepte');
  });

  it('quedaHoy formatea MB por debajo de 1000', () => {
    expect(TEXTOS_INTERNET.quedaHoy(512)).toMatch(/512\s*MB/i);
    expect(TEXTOS_INTERNET.quedaHoy(999)).toMatch(/999\s*MB/i);
  });

  it('quedaHoy formatea GB con un decimal y coma por encima de 1000', () => {
    const result = TEXTOS_INTERNET.quedaHoy(2048);
    expect(result).toMatch(/2,0\s*GB/i);
  });

  it('meshConLimite formatea MB por debajo de 1000', () => {
    expect(TEXTOS_INTERNET.meshConLimite(512)).toMatch(/512\s*MB/i);
    expect(TEXTOS_INTERNET.meshConLimite(999)).toMatch(/999\s*MB/i);
  });

  it('meshConLimite formatea GB con un decimal y coma por encima de 1000', () => {
    const result = TEXTOS_INTERNET.meshConLimite(2048);
    expect(result).toMatch(/2,0\s*GB/i);
  });
});

describe('TEXTOS_EXTRA_INTERNET', () => {
  it('tiene todas las claves requeridas y no están vacías', () => {
    const requiredKeys = ['desde', 'hasta', 'limite', 'compartirConOtros', 'declararDePago', 'declararNoDePago'] as const;

    for (const key of requiredKeys) {
      const value = TEXTOS_EXTRA_INTERNET[key];
      expect(value, `Clave "${key}" no debe estar vacía`).toBeTruthy();
      expect(value.length).toBeGreaterThan(0);
    }
  });
});