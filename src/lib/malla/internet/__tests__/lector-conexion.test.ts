import { describe, it, expect } from 'vitest';
import { leerConexion, suscribirConexion, type ConexionNavegador } from '../lector-conexion';

const conexion = (extra: Partial<ConexionNavegador>): ConexionNavegador => ({ ...extra });

describe('leerConexion', () => {
  it('con connection completa devuelve tipo, saveData y effectiveType; sin nativa, nativaMedida es null', () => {
    const r = leerConexion({
      navigator: {
        connection: conexion({ type: 'cellular', saveData: true, effectiveType: '2g' }),
      },
    });
    expect(r.tipo).toBe('cellular');
    expect(r.saveData).toBe(true);
    expect(r.effectiveType).toBe('2g');
    expect(r.nativaMedida).toBe(null);
  });

  it('sin connection (Safari, Firefox) devuelve solo nativaMedida', () => {
    const r = leerConexion({ navigator: {} });
    expect(r.tipo).toBeUndefined();
    expect(r.saveData).toBeUndefined();
    expect(r.effectiveType).toBeUndefined();
    expect(r.nativaMedida).toBe(null);
  });

  it('sin navegador y sin nativa tampoco lanza', () => {
    expect(leerConexion({})).toEqual({ nativaMedida: null });
    expect(leerConexion({ navigator: null, nativa: null })).toEqual({ nativaMedida: null });
  });

  it('marca nativa true → nativaMedida true', () => {
    const r = leerConexion({ nativa: { medida: () => true } });
    expect(r.nativaMedida).toBe(true);
  });

  it('marca nativa false → nativaMedida false', () => {
    const r = leerConexion({ nativa: { medida: () => false } });
    expect(r.nativaMedida).toBe(false);
  });

  it('nativa presente pero medida ausente → nativaMedida null (falta en el puente nativo)', () => {
    const r = leerConexion({ nativa: {} });
    expect(r.nativaMedida).toBe(null);
  });

  it('medida que lanza → nativaMedida null y no propaga el error', () => {
    const r = leerConexion({ nativa: { medida: () => { throw new Error('puente roto'); } } });
    expect(r.nativaMedida).toBe(null);
  });

  it('combinación: navegador y marca nativa a la vez', () => {
    const r = leerConexion({
      navigator: { connection: conexion({ type: 'wifi', effectiveType: '4g' }) },
      nativa: { medida: () => true },
    });
    expect(r.tipo).toBe('wifi');
    expect(r.effectiveType).toBe('4g');
    expect(r.nativaMedida).toBe(true);
  });
});

describe('suscribirConexion', () => {
  it('escucha el evento change de connection', () => {
    const oidas: string[] = [];
    const c = conexion({
      addEventListener: (t) => { oidas.push(t); },
    });
    const alCambiar = (): void => undefined;
    suscribirConexion({ navigator: { connection: c } }, alCambiar);
    expect(oidas).toEqual(['change']);
  });

  it('la baja quita el mismo callback', () => {
    const registrados: Array<[string, () => void]> = [];
    const c = conexion({
      addEventListener: (t, cb) => { registrados.push([t, cb]); },
      removeEventListener: (t, cb) => {
        const i = registrados.findIndex(([rt, rcb]) => rt === t && rcb === cb);
        if (i >= 0) registrados.splice(i, 1);
      },
    });
    const alCambiar = (): void => undefined;
    const baja = suscribirConexion({ navigator: { connection: c } }, alCambiar);
    expect(registrados.length).toBe(1);
    baja();
    expect(registrados.length).toBe(0);
  });

  it('sin connection devuelve una baja que no hace nada y no lanza', () => {
    const baja = suscribirConexion({ navigator: {} }, () => undefined);
    expect(() => baja()).not.toThrow();
  });

  it('connection sin addEventListener tampoco lanza', () => {
    const baja = suscribirConexion(
      { navigator: { connection: conexion({}) } },
      () => undefined,
    );
    expect(() => baja()).not.toThrow();
  });
});
