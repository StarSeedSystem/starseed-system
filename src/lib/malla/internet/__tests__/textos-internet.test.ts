import { describe, it, expect } from 'vitest';
import { TEXTOS_INTERNET, TEXTOS_EXTRA_INTERNET } from '../textos-internet';
import type { TextosInternet } from '../tipos';

describe('TEXTOS_INTERNET', () => {
  it('exporta un objeto con todas las claves de TextosInternet', () => {
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
      expect(clave in TEXTOS_INTERNET).toBe(true);
      const valor = TEXTOS_INTERNET[clave];
      expect(valor).toBeDefined();
      if (typeof valor === 'string') {
        expect(valor.length).toBeGreaterThan(0);
      } else if (typeof valor === 'function') {
        expect(typeof valor).toBe('function');
      }
    }
  });

  it('ningún texto contiene "Mando", "llamadas" ni "banco de llamadas"', () => {
    const prohibidos = ['Mando', 'llamadas', 'banco de llamadas'];
    const todosLosTextos = Object.values(TEXTOS_INTERNET)
      .filter((v): v is string => typeof v === 'string')
      .join(' ');

    for (const prohibido of prohibidos) {
      expect(todosLosTextos.toLowerCase()).not.toContain(prohibido.toLowerCase());
    }
  });

  it('"modo banco" aparece en bancoTitulo', () => {
    expect(TEXTOS_INTERNET.bancoTitulo.toLowerCase()).toContain('modo banco');
  });

  it('bancoAyuda explica que sirve para internet limitado y repartir entre neuronas', () => {
    expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('internet');
    expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('limitado');
    expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('reparte');
    expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('neuronas');
  });

  it('"modo mesh" aparece en meshTitulo', () => {
    expect(TEXTOS_INTERNET.meshTitulo.toLowerCase()).toContain('modo mesh');
  });

  it('meshAyuda explica que comparte por malla P2P con o sin límite', () => {
    expect(TEXTOS_INTERNET.meshAyuda.toLowerCase()).toContain('malla');
    expect(TEXTOS_INTERNET.meshAyuda.toLowerCase()).toContain('p2p');
    expect(TEXTOS_INTERNET.meshAyuda.toLowerCase()).toContain('límite');
  });

  describe('quedaHoy(mb)', () => {
    it('quedaHoy(512) contiene "512 MB"', () => {
      const resultado = TEXTOS_INTERNET.quedaHoy(512);
      expect(resultado).toContain('512 MB');
    });

    it('quedaHoy(2048) dice "2,0 GB"', () => {
      const resultado = TEXTOS_INTERNET.quedaHoy(2048);
      expect(resultado).toContain('2,0 GB');
    });

    it('quedaHoy(0) dice "0 MB"', () => {
      const resultado = TEXTOS_INTERNET.quedaHoy(0);
      expect(resultado).toContain('0 MB');
    });

    it('quedaHoy(999) usa MB', () => {
      const resultado = TEXTOS_INTERNET.quedaHoy(999);
      expect(resultado).toContain('999 MB');
    });

    it('quedaHoy(1000) usa GB con un decimal', () => {
      const resultado = TEXTOS_INTERNET.quedaHoy(1000);
      expect(resultado).toContain('1,0 GB');
    });

    it('quedaHoy(1536) dice "1,5 GB"', () => {
      const resultado = TEXTOS_INTERNET.quedaHoy(1536);
      expect(resultado).toContain('1,5 GB');
    });
  });

  describe('meshConLimite(mb)', () => {
    it('meshConLimite(512) contiene "512 MB"', () => {
      const resultado = TEXTOS_INTERNET.meshConLimite(512);
      expect(resultado).toContain('512 MB');
    });

    it('meshConLimite(2048) dice "2,0 GB"', () => {
      const resultado = TEXTOS_INTERNET.meshConLimite(2048);
      expect(resultado).toContain('2,0 GB');
    });

    it('meshConLimite(0) dice "0 MB"', () => {
      const resultado = TEXTOS_INTERNET.meshConLimite(0);
      expect(resultado).toContain('0 MB');
    });

    it('meshConLimite(1000) usa GB con un decimal', () => {
      const resultado = TEXTOS_INTERNET.meshConLimite(1000);
      expect(resultado).toContain('1,0 GB');
    });
  });

  describe('bancoAyuda', () => {
    it('menciona que sirve para cuando el internet es limitado', () => {
      expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('internet');
      expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('limitado');
    });

    it('menciona que reparte datos entre las neuronas', () => {
      expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('reparte');
      expect(TEXTOS_INTERNET.bancoAyuda.toLowerCase()).toContain('neuronas');
    });
  });

  describe('meshAyuda', () => {
    it('dice que comparte internet por la malla P2P', () => {
      expect(TEXTOS_INTERNET.meshAyuda.toLowerCase()).toContain('malla');
      expect(TEXTOS_INTERNET.meshAyuda.toLowerCase()).toContain('p2p');
    });

    it('menciona con o sin límite', () => {
      expect(TEXTOS_INTERNET.meshAyuda.toLowerCase()).toContain('límite');
    });
  });

  describe('sugerirCuerpo', () => {
    it('dice que la conexión parece de pago', () => {
      expect(TEXTOS_INTERNET.sugerirCuerpo.toLowerCase()).toContain('pago');
    });

    it('dice que es solo una sugerencia', () => {
      expect(TEXTOS_INTERNET.sugerirCuerpo.toLowerCase()).toContain('sugerencia');
    });

    it('dice que nada cambia hasta que la persona acepte', () => {
      expect(TEXTOS_INTERNET.sugerirCuerpo.toLowerCase()).toContain('acepte');
    });
  });
});

describe('TEXTOS_EXTRA_INTERNET', () => {
  it('exporta un objeto con las claves requeridas', () => {
    const clavesRequeridas = ['desde', 'hasta', 'limite', 'compartirConOtros', 'declararDePago', 'declararNoDePago'];
    for (const clave of clavesRequeridas) {
      expect(clave in TEXTOS_EXTRA_INTERNET).toBe(true);
    }
  });

  it('ningún valor está vacío', () => {
    for (const valor of Object.values(TEXTOS_EXTRA_INTERNET)) {
      expect(typeof valor).toBe('string');
      expect(valor.length).toBeGreaterThan(0);
    }
  });
});