import { describe, it, expect } from 'vitest';
import { leerConexion, suscribirConexion } from '../lector-conexion';

/** Conexión de mentira con registro de oyentes, como Network Information API. */
function conexionFalsa() {
  const oyentes = new Map<string, () => void>();
  return {
    type: 'cellular' as const,
    saveData: true,
    effectiveType: '2g',
    addEventListener: (t: string, cb: () => void) => {
      oyentes.set(t, cb);
    },
    removeEventListener: (t: string, cb: () => void) => {
      if (oyentes.get(t) === cb) oyentes.delete(t);
    },
    emitir: (t: string) => {
      oyentes.get(t)?.();
    },
    oyentes: () => oyentes.size,
  };
}

describe('leerConexion', () => {
  it('sin connection (Safari, Firefox) devuelve solo nativaMedida', () => {
    const r = leerConexion({ navigator: { connection: null } });
    expect(r.nativaMedida).toBeNull();
    expect('tipo' in r).toBe(false);
    expect('saveData' in r).toBe(false);
    expect('effectiveType' in r).toBe(false);
  });

  it('lee tipo, saveData y effectiveType de connection', () => {
    const r = leerConexion({ navigator: { connection: conexionFalsa() } });
    expect(r.tipo).toBe('cellular');
    expect(r.saveData).toBe(true);
    expect(r.effectiveType).toBe('2g');
    expect(r.nativaMedida).toBeNull();
  });

  it('entorno vacío no lanza y devuelve nativaMedida null', () => {
    expect(leerConexion({})).toEqual({ nativaMedida: null });
  });
});

describe('leerConexion · marca nativa', () => {
  it('medida true → nativaMedida true', () => {
    const r = leerConexion({ nativa: { medida: () => true } });
    expect(r.nativaMedida).toBe(true);
  });

  it('medida false → nativaMedida false', () => {
    const r = leerConexion({ nativa: { medida: () => false } });
    expect(r.nativaMedida).toBe(false);
  });

  it('medida que devuelve null → nativaMedida null', () => {
    const r = leerConexion({ nativa: { medida: () => null } });
    expect(r.nativaMedida).toBeNull();
  });

  it('sin nativa ni medida → nativaMedida null (falta en el puente nativo)', () => {
    expect(leerConexion({ nativa: null }).nativaMedida).toBeNull();
    expect(leerConexion({ nativa: {} }).nativaMedida).toBeNull();
  });

  it('medida que lanza → nativaMedida null, nunca tumba la lectura', () => {
    const r = leerConexion({
      navigator: { connection: conexionFalsa() },
      nativa: { medida: () => { throw new Error('puente caído'); } },
    });
    expect(r.nativaMedida).toBeNull();
    expect(r.tipo).toBe('cellular');
  });

  it('marca nativa y navegador se combinan en una lectura', () => {
    const r = leerConexion({
      navigator: { connection: conexionFalsa() },
      nativa: { medida: () => true },
    });
    expect(r.tipo).toBe('cellular');
    expect(r.effectiveType).toBe('2g');
    expect(r.nativaMedida).toBe(true);
  });
});

describe('suscribirConexion', () => {
  it('registra el oyente, avisa en change y la baja lo quita', () => {
    const conexion = conexionFalsa();
    let avisos = 0;
    const baja = suscribirConexion({ navigator: { connection: conexion } }, () => {
      avisos += 1;
    });
    conexion.emitir('change');
    expect(avisos).toBe(1);
    baja();
    conexion.emitir('change');
    expect(avisos).toBe(1);
  });

  it('sin connection devuelve una baja que no hace nada', () => {
    const baja = suscribirConexion({ navigator: null }, () => {
      throw new Error('no debe avisar');
    });
    expect(() => baja()).not.toThrow();
  });

  it('connection sin addEventListener devuelve una baja inofensiva', () => {
    const baja = suscribirConexion({ navigator: { connection: { type: 'wifi' } } }, () => {});
    expect(() => baja()).not.toThrow();
  });
});
