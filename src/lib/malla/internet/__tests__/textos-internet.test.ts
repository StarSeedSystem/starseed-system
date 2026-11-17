import { describe, it, expect } from 'vitest';
import { TEXTOS_INTERNET, TEXTOS_EXTRA_INTERNET, quedaHoy, meshConLimite } from '../textos-internet';

describe('TEXTOS_INTERNET', () => {
  it('tiene todas las claves requeridas y no están vacías', () => {
    const clavesRequeridas = [
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

    for (const clave of clavesRequeridas) {
      expect(TEXTOS_INTERNET).toHaveProperty(clave);
      const valor = (TEXTOS_INTERNET as Record<string, unknown>)[clave];
      if (typeof valor === 'string') {
        expect(valor.length).toBeGreaterThan(0);
      } else if (typeof valor === 'function') {
        expect(valor).toBeDefined();
      }
    }
  });

  it('no contiene términos prohibidos', () => {
    const valores = Object.values(TEXTOS_INTERNET) as unknown[];
    const textos = valores.filter((v): v is string => typeof v === 'string').join(' ');

    expect(textos.toLowerCase()).not.toContain('mando');
    expect(textos.toLowerCase()).not.toContain('llamadas');
    expect(textos.toLowerCase()).not.toContain('banco de llamadas');
  });

  it('contiene "modo banco" en bancoTitulo', () => {
    expect(TEXTOS_INTERNET.bancoTitulo.toLowerCase()).toContain('modo banco');
  });

  it('contiene "modo mesh" en meshTitulo', () => {
    expect(TEXTOS_INTERNET.meshTitulo.toLowerCase()).toContain('modo mesh');
  });

  it('bancoAyuda menciona internet limitado y repartir entre neuronas', () => {
    const ayuda = TEXTOS_INTERNET.bancoAyuda.toLowerCase();
    expect(ayuda).toContain('limitado');
    expect(ayuda).toContain('neurona');
  });

  it('meshAyuda menciona malla P2P y con o sin límite', () => {
    const ayuda = TEXTOS_INTERNET.meshAyuda.toLowerCase();
    expect(ayuda).toContain('malla');
    expect(ayuda).toContain('p2p');
    expect(ayuda).toContain('límite');
  });

  it('sugerirCuerpo menciona conexión de pago, solo sugerencia y nada cambia hasta aceptar', () => {
    const cuerpo = TEXTOS_INTERNET.sugerirCuerpo.toLowerCase();
    expect(cuerpo).toContain('pago');
    expect(cuerpo).toContain('sugerencia');
    expect(cuerpo).toContain('acept');
  });
});

describe('quedaHoy', () => {
  it('formatea 512 MB como "512 MB"', () => {
    const resultado = quedaHoy(512);
    expect(resultado).toContain('512');
    expect(resultado).toContain('MB');
  });

  it('formatea 2048 MB como "2,0 GB"', () => {
    const resultado = quedaHoy(2048);
    expect(resultado).toContain('2,0');
    expect(resultado).toContain('GB');
  });

  it('formatea 1024 MB como "1,0 GB"', () => {
    const resultado = quedaHoy(1024);
    expect(resultado).toContain('1,0');
    expect(resultado).toContain('GB');
  });

  it('formatea 999 MB como "999 MB"', () => {
    const resultado = quedaHoy(999);
    expect(resultado).toContain('999');
    expect(resultado).toContain('MB');
  });

  it('formatea 1536 MB como "1,5 GB"', () => {
    const resultado = quedaHoy(1536);
    expect(resultado).toContain('1,5');
    expect(resultado).toContain('GB');
  });
});

describe('meshConLimite', () => {
  it('formatea 512 MB como "512 MB disponibles"', () => {
    const resultado = meshConLimite(512);
    expect(resultado).toContain('512');
    expect(resultado).toContain('MB');
    expect(resultado).toContain('disponible');
  });

  it('formatea 2048 MB como "2,0 GB disponibles"', () => {
    const resultado = meshConLimite(2048);
    expect(resultado).toContain('2,0');
    expect(resultado).toContain('GB');
    expect(resultado).toContain('disponible');
  });
});

describe('TEXTOS_EXTRA_INTERNET', () => {
  it('tiene todas las claves requeridas y no están vacías', () => {
    const clavesRequeridas = [
      'desde',
      'hasta',
      'limite',
      'compartirConOtros',
      'declararDePago',
      'declararNoDePago',
    ];

    for (const clave of clavesRequeridas) {
      expect(TEXTOS_EXTRA_INTERNET).toHaveProperty(clave);
      const valor = TEXTOS_EXTRA_INTERNET[clave as keyof typeof TEXTOS_EXTRA_INTERNET];
      expect(typeof valor).toBe('string');
      expect(valor.length).toBeGreaterThan(0);
    }
  });

  it('no contiene términos prohibidos', () => {
    const textos = Object.values(TEXTOS_EXTRA_INTERNET).join(' ');
    expect(textos.toLowerCase()).not.toContain('mando');
    expect(textos.toLowerCase()).not.toContain('llamadas');
    expect(textos.toLowerCase()).not.toContain('banco de llamadas');
  });
});