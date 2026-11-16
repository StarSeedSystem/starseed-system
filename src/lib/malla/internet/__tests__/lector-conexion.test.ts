import { describe, it, expect, vi } from 'vitest';
import { leerConexion, suscribirConexion, NetworkInformationLike } from '../lector-conexion';

describe('leerConexion', () => {
  describe('con navigator.connection presente', () => {
    it('devuelve tipo, saveData y effectiveType cuando están disponibles', () => {
      const entorno = {
        navigator: {
          connection: {
            effectiveType: '4g',
            downlink: 20,
            rtt: 50,
            type: 'wifi',
            saveData: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          } as NetworkInformationLike,
        },
      };

      const resultado = leerConexion({ navigator: entorno.navigator as any });

      expect(resultado.tipo).toBe('wifi');
      expect(resultado.saveData).toBe(false);
      expect(resultado.effectiveType).toBe('4g');
      expect(resultado.nativaMedida).toBe(null);
    });

    it('detecta saveData=true', () => {
      const entorno = {
        navigator: {
          connection: {
            effectiveType: '3g',
            saveData: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          } as NetworkInformationLike,
        },
      };

      const resultado = leerConexion({ navigator: entorno.navigator as any });

      expect(resultado.saveData).toBe(true);
      expect(resultado.effectiveType).toBe('3g');
    });

    it('devuelve solamente los campos disponibles', () => {
      const entorno = {
        navigator: {
          connection: {
            effectiveType: '2g',
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          } as NetworkInformationLike,
        },
      };

      const resultado = leerConexion({ navigator: entorno.navigator as any });

      expect(resultado.effectiveType).toBe('2g');
      expect(resultado.tipo).toBeUndefined();
      expect(resultado.saveData).toBeUndefined();
    });
  });

  describe('sin navigator.connection (Safari, Firefox)', () => {
    it('devuelve nativaMedida null y sin tipo/saveData/effectiveType', () => {
      const entorno = {
        navigator: {},
      };

      const resultado = leerConexion({ navigator: entorno.navigator as any });

      expect(resultado.tipo).toBeUndefined();
      expect(resultado.saveData).toBeUndefined();
      expect(resultado.effectiveType).toBeUndefined();
      expect(resultado.nativaMedida).toBe(null);
    });

    it('devuelve nativaMedida null cuando navigator es null', () => {
      const resultado = leerConexion({ navigator: null });

      expect(resultado.nativaMedida).toBe(null);
      expect(resultado.tipo).toBeUndefined();
    });
  });

  describe('sin navigator (SSR)', () => {
    it('devuelve nativaMedida null sin lanzar', () => {
      const resultado = leerConexion({});

      expect(resultado.nativaMedida).toBe(null);
    });
  });

  describe('con nativa.medida (marca nativa Android)', () => {
    it('cuando es true, incluye nativaMedida=true', () => {
      const entorno = {
        navigator: {},
        nativa: { medida: () => true },
      };

      const resultado = leerConexion(entorno as any);

      expect(resultado.nativaMedida).toBe(true);
    });

    it('cuando es false, incluye nativaMedida=false', () => {
      const entorno = {
        navigator: {},
        nativa: { medida: () => false },
      };

      const resultado = leerConexion(entorno as any);

      expect(resultado.nativaMedida).toBe(false);
    });

    it('cuando medida lanza, trata como null (falta en el puente)', () => {
      const entorno = {
        navigator: {},
        nativa: { medida: () => { throw new Error('No implementado'); } },
      };

      const resultado = leerConexion(entorno as any);

      expect(resultado.nativaMedida).toBe(null);
    });
  });

  describe('sin nativa.medida proporcionado', () => {
    it('nativaMedida es null (falta en el puente: ver §8.2 del contrato)', () => {
      const entorno = { navigator: {} };

      const resultado = leerConexion(entorno as any);

      expect(resultado.nativaMedida).toBe(null);
    });
  });

  describe('jerarquía de prioridad', () => {
    it('nativaMedida se lee de marca nativa cuando está disponible', () => {
      const entorno = {
        navigator: {
          connection: {
            type: 'cellular',
            effectiveType: '3g',
            saveData: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          } as NetworkInformationLike,
        },
        nativa: { medida: () => true },
      };

      const resultado = leerConexion(entorno as any);

      expect(resultado.nativaMedida).toBe(true);
      expect(resultado.tipo).toBe('cellular');
      expect(resultado.effectiveType).toBe('3g');
    });
  });
});

describe('suscribirConexion', () => {
  describe('con connection disponible', () => {
    it('suscribe al evento change y devuelve funcion de baja', () => {
      const handleChange = vi.fn();
      const addEventListener = vi.fn();
      const removeEventListener = vi.fn();

      const entorno = {
        navigator: {
          connection: {
            addEventListener,
            removeEventListener,
          } as NetworkInformationLike,
        },
      };

      const darseDeBaja = suscribirConexion(entorno as any, handleChange);

      expect(addEventListener).toHaveBeenCalledWith('change', handleChange);

      darseDeBaja();

      expect(removeEventListener).toHaveBeenCalledWith('change', handleChange);
    });
  });

  describe('sin connection', () => {
    it('no llama a addEventListener y devuelve funcion que no hace nada', () => {
      const handleChange = vi.fn();

      const entorno = { navigator: {} };

      const darseDeBaja = suscribirConexion(entorno as any, handleChange);

      expect(handleChange).not.toHaveBeenCalled();

      darseDeBaja();

      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  describe('sin navigator', () => {
    it('devuelve funcion vacia sin lanzar', () => {
      const handleChange = vi.fn();

      const darseDeBaja = suscribirConexion({}, handleChange);

      expect(() => darseDeBaja()).not.toThrow();
      expect(handleChange).not.toHaveBeenCalled();
    });
  });
});