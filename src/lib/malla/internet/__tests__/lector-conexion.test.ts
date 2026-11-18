import { describe, it, expect } from 'vitest';
import { leerConexion, suscribirConexion } from '../lector-conexion';

describe('leerConexion', () => {
  describe('con connection presente', () => {
    it('devuelve tipo, saveData, effectiveType y nativaMedida=null', () => {
      const entorno = {
        navigator: {
          connection: {
            type: 'wifi',
            saveData: false,
            effectiveType: '4g',
          },
        },
        nativa: null,
      };
      const r = leerConexion(entorno);
      expect(r.tipo).toBe('wifi');
      expect(r.saveData).toBe(false);
      expect(r.effectiveType).toBe('4g');
      expect(r.nativaMedida).toBeNull();
    });

    it('devuelve saveData=true cuando el navegador lo indica', () => {
      const entorno = {
        navigator: {
          connection: {
            type: 'cellular',
            saveData: true,
            effectiveType: '3g',
          },
        },
        nativa: null,
      };
      const r = leerConexion(entorno);
      expect(r.saveData).toBe(true);
    });

    it('devuelve effectiveType slow-2g', () => {
      const entorno = {
        navigator: {
          connection: {
            type: 'cellular',
            saveData: false,
            effectiveType: 'slow-2g',
          },
        },
        nativa: null,
      };
      const r = leerConexion(entorno);
      expect(r.effectiveType).toBe('slow-2g');
    });

    it('omit properties cuando connection no las tiene', () => {
      const entorno = {
        navigator: {
          connection: {},
        },
        nativa: null,
      };
      const r = leerConexion(entorno);
      expect(r.tipo).toBeUndefined();
      expect(r.saveData).toBeUndefined();
      expect(r.effectiveType).toBeUndefined();
      expect(r.nativaMedida).toBeNull();
    });
  });

  describe('sin connection (Safari, Firefox)', () => {
    it('devuelve solo nativaMedida=null cuando navigator es undefined', () => {
      const r = leerConexion({ navigator: undefined, nativa: null });
      expect(r.tipo).toBeUndefined();
      expect(r.saveData).toBeUndefined();
      expect(r.effectiveType).toBeUndefined();
      expect(r.nativaMedida).toBeNull();
    });

    it('devuelve solo nativaMedida=null cuando navigator.connection es undefined', () => {
      const entorno = {
        navigator: {},
        nativa: null,
      };
      const r = leerConexion(entorno);
      expect(r.tipo).toBeUndefined();
      expect(r.saveData).toBeUndefined();
      expect(r.effectiveType).toBeUndefined();
      expect(r.nativaMedida).toBeNull();
    });

    it('devuelve solo nativaMedida=null cuando navigator.connection es null', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: null,
      };
      const r = leerConexion(entorno);
      expect(r.tipo).toBeUndefined();
      expect(r.saveData).toBeUndefined();
      expect(r.effectiveType).toBeUndefined();
      expect(r.nativaMedida).toBeNull();
    });
  });

  describe('marca nativa (nativa.medida)', () => {
    it('nativaMedida=true cuando nativa.medida devuelve true', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: { medida: () => true },
      };
      const r = leerConexion(entorno);
      expect(r.nativaMedida).toBe(true);
    });

    it('nativaMedida=false cuando nativa.medida devuelve false', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: { medida: () => false },
      };
      const r = leerConexion(entorno);
      expect(r.nativaMedida).toBe(false);
    });

    it('nativaMedida=null cuando nativa.medida devuelve null', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: { medida: () => null },
      };
      const r = leerConexion(entorno);
      expect(r.nativaMedida).toBeNull();
    });

    it('nativaMedida=null cuando nativa es undefined', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: undefined,
      };
      const r = leerConexion(entorno);
      expect(r.nativaMedida).toBeNull();
    });

    it('nativaMedida=null cuando nativa es null', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: null,
      };
      const r = leerConexion(entorno);
      expect(r.nativaMedida).toBeNull();
    });

    it('nativaMedida=null cuando nativa.medida lanza', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: { medida: () => { throw new Error('fallo nativo'); } },
      };
      const r = leerConexion(entorno);
      expect(r.nativaMedida).toBeNull();
    });

    it('nativaMedida=null cuando nativa.medida no es una función', () => {
      const entorno = {
        navigator: { connection: null },
        nativa: { medida: (() => { throw new Error('no es función'); }) as () => boolean | null },
      };
      const r = leerConexion(entorno);
      expect(r.nativaMedida).toBeNull();
    });
  });

  describe('combinación de connection y nativa', () => {
    it('devuelve datos de connection y nativaMedida=true', () => {
      const entorno = {
        navigator: {
          connection: {
            type: 'wifi',
            saveData: false,
            effectiveType: '4g',
          },
        },
        nativa: { medida: () => true },
      };
      const r = leerConexion(entorno);
      expect(r.tipo).toBe('wifi');
      expect(r.saveData).toBe(false);
      expect(r.effectiveType).toBe('4g');
      expect(r.nativaMedida).toBe(true);
    });
  });
});

describe('suscribirConexion', () => {
  it('devuelve función de baja que no hace nada cuando no hay connection', () => {
    const entorno = { navigator: undefined, nativa: null };
    let llamadas = 0;
    const desuscribir = suscribirConexion(entorno, () => { llamadas++; });
    expect(typeof desuscribir).toBe('function');
    desuscribir();
    expect(llamadas).toBe(0);
  });

  it('devuelve función de baja que no hace nada cuando connection no tiene addEventListener', () => {
    const entorno = { navigator: { connection: {} }, nativa: null };
    let llamadas = 0;
    const desuscribir = suscribirConexion(entorno, () => { llamadas++; });
    desuscribir();
    expect(llamadas).toBe(0);
  });

  it('suscribe al evento change y desuscribe correctamente', () => {
    let changeCalls = 0;
    const mockConnection = {
      addEventListener: (evento: string, cb: () => void) => {
        if (evento === 'change') changeCalls++;
      },
      removeEventListener: (evento: string, cb: () => void) => {
        if (evento === 'change') changeCalls--;
      },
    };
    const entorno = { navigator: { connection: mockConnection }, nativa: null };
    let llamadasCallback = 0;
    const desuscribir = suscribirConexion(entorno, () => { llamadasCallback++; });
    expect(changeCalls).toBe(1);
    desuscribir();
    expect(changeCalls).toBe(0);
  });

  it('el callback se ejecuta cuando change dispara', () => {
    let changeHandler: () => void = () => {};
    const mockConnection = {
      addEventListener: (evento: string, cb: () => void) => {
        if (evento === 'change') changeHandler = cb;
      },
      removeEventListener: () => {},
    };
    const entorno = { navigator: { connection: mockConnection }, nativa: null };
    let llamadas = 0;
    suscribirConexion(entorno, () => { llamadas++; });
    changeHandler();
    expect(llamadas).toBe(1);
  });

  it('desuscribir previene futuras llamadas al callback', () => {
    let changeHandler: () => void = () => {};
    const mockConnection = {
      addEventListener: (evento: string, cb: () => void) => {
        if (evento === 'change') changeHandler = cb;
      },
      removeEventListener: (evento: string, cb: () => void) => {
        if (evento === 'change' && cb === changeHandler) {
          changeHandler = () => {};
        }
      },
    };
    const entorno = { navigator: { connection: mockConnection }, nativa: null };
    let llamadas = 0;
    const desuscribir = suscribirConexion(entorno, () => { llamadas++; });
    desuscribir();
    changeHandler();
    expect(llamadas).toBe(0);
  });
});