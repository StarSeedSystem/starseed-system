import { describe, it, expect } from 'vitest';
import { TEXTOS_INTERNET, TEXTOS_EXTRA_INTERNET, type TextosInternet } from '../textos-internet';

describe('TEXTOS_INTERNET', () => {
  describe('todas las claves existen y no están vacías', () => {
    const claves: (keyof TextosInternet)[] = [
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

    for (const clave of claves) {
      it(`tiene la clave "${clave}" y no está vacía`, () => {
        const valor = TEXTOS_INTERNET[clave];
        expect(valor).toBeDefined();
        if (typeof valor === 'string') {
          expect(valor.length).toBeGreaterThan(0);
        } else if (typeof valor === 'function') {
          expect(typeof valor).toBe('function');
        }
      });
    }
  });

  describe('términos prohibidos', () => {
    const textos = [
      TEXTOS_INTERNET.bancoTitulo,
      TEXTOS_INTERNET.bancoAyuda,
      TEXTOS_INTERNET.racionDiaria,
      TEXTOS_INTERNET.programacion,
      TEXTOS_INTERNET.quedaHoy(100),
      TEXTOS_INTERNET.agotadoHoy,
      TEXTOS_INTERNET.meshTitulo,
      TEXTOS_INTERNET.meshAyuda,
      TEXTOS_INTERNET.meshSinLimite,
      TEXTOS_INTERNET.meshConLimite(100),
      TEXTOS_INTERNET.conexionLimitada,
      TEXTOS_INTERNET.conexionNoLimitada,
      TEXTOS_INTERNET.conexionDesconocida,
      TEXTOS_INTERNET.fuenteDeclarada,
      TEXTOS_INTERNET.fuenteNativa,
      TEXTOS_INTERNET.fuenteNavegador,
      TEXTOS_INTERNET.sugerirTitulo,
      TEXTOS_INTERNET.sugerirCuerpo,
      TEXTOS_INTERNET.sugerirActivar,
      TEXTOS_INTERNET.sugerirAhoraNo,
      TEXTOS_INTERNET.audMiCuenta,
      TEXTOS_INTERNET.audEntidad,
      TEXTOS_INTERNET.audPublico,
    ];

    for (const texto of textos) {
      it('no contiene "Mando"', () => {
        expect(texto).not.toContain('Mando');
      });

      it('no contiene "llamadas"', () => {
        expect(texto).not.toContain('llamadas');
      });

      it('no contiene "banco de llamadas"', () => {
        expect(texto.toLowerCase()).not.toContain('banco de llamadas');
      });
    }
  });

  describe('términos esperados', () => {
    it('"modo banco" aparece en bancoTitulo', () => {
      expect(TEXTOS_INTERNET.bancoTitulo.toLowerCase()).toContain('modo banco');
    });

    it('"modo mesh" aparece en meshTitulo', () => {
      expect(TEXTOS_INTERNET.meshTitulo.toLowerCase()).toContain('modo mesh');
    });

    it('bancoAyuda menciona internet limitado y reparte datos entre neuronas', () => {
      const ayuda = TEXTOS_INTERNET.bancoAyuda.toLowerCase();
      expect(ayuda).toContain('limitado');
      expect(ayuda).toContain('neurona');
    });

    it('meshAyuda menciona compartir internet por malla P2P con o sin límite', () => {
      const ayuda = TEXTOS_INTERNET.meshAyuda.toLowerCase();
      expect(ayuda).toContain('malla');
      expect(ayuda).toContain('p2p');
      expect(ayuda).toContain('límite');
    });

    it('sugerirCuerpo dice que la conexión parece de pago, es solo sugerencia y nada cambia hasta aceptar', () => {
      const cuerpo = TEXTOS_INTERNET.sugerirCuerpo.toLowerCase();
      expect(cuerpo).toContain('pago');
      expect(cuerpo).toContain('sugerencia');
      expect(cuerpo).toContain('acept');
    });
  });

  describe('formato de quedaHoy y meshConLimite', () => {
    it('quedaHoy(512) contiene "MB"', () => {
      expect(TEXTOS_INTERNET.quedaHoy(512)).toContain('MB');
    });

    it('quedaHoy(2048) dice "2,0 GB"', () => {
      expect(TEXTOS_INTERNET.quedaHoy(2048)).toContain('2,0 GB');
    });

    it('meshConLimite(512) contiene "MB"', () => {
      expect(TEXTOS_INTERNET.meshConLimite(512)).toContain('MB');
    });

    it('meshConLimite(2048) dice "2,0 GB"', () => {
      expect(TEXTOS_INTERNET.meshConLimite(2048)).toContain('2,0 GB');
    });

    it('quedaHoy usa coma decimal para GB', () => {
      expect(TEXTOS_INTERNET.quedaHoy(1536)).toMatch(/1,5 GB/);
    });

    it('meshConLimite usa coma decimal para GB', () => {
      expect(TEXTOS_INTERNET.meshConLimite(1536)).toMatch(/1,5 GB/);
    });
  });
});

describe('TEXTOS_EXTRA_INTERNET', () => {
  const claves = ['desde', 'hasta', 'limite', 'compartirConOtros', 'declararDePago', 'declararNoDePago'] as const;

  for (const clave of claves) {
    it(`tiene la clave "${clave}" y no está vacía`, () => {
      const valor = TEXTOS_EXTRA_INTERNET[clave];
      expect(valor).toBeDefined();
      expect(typeof valor).toBe('string');
      expect(valor.length).toBeGreaterThan(0);
    });
  }

  it('no contiene términos prohibidos', () => {
    for (const clave of claves) {
      const valor = TEXTOS_EXTRA_INTERNET[clave].toLowerCase();
      expect(valor).not.toContain('mando');
      expect(valor).not.toContain('llamadas');
      expect(valor).not.toContain('banco de llamadas');
    }
  });
});