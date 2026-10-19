import { describe, it, expect } from 'vitest';
import { validarVinculo, normalizarVinculos, conVinculo, sinVinculo, estaCaducado, planSincronizacion, CONFIGURACIONES_TELEPATIA } from '../telepatia';

const vinculoValido = {
  id: 'v1',
  destino: { tipo: 'cerebro' as const, id: 'b1' },
  alcance: { completo: true, memorias: [], carpetas: [], configuraciones: [] },
  direccion: 'ambas' as const,
  acceso: 'escribir' as const,
  auto: true,
  estado: 'activo' as const,
  creadoEn: '2023-01-01T00:00:00Z',
  expiraEn: null,
  ultimaSync: null
};

describe('validarVinculo', () => {
  it('acepta vinculo válido', () => {
    const r = validarVinculo(vinculoValido);
    expect(r.ok).toBe(true);
  });

  it('rechaza no objeto', () => {
    expect(validarVinculo(null).ok).toBe(false);
  });

  it('rechaza id vacío', () => {
    const v = { ...vinculoValido, id: '' };
    expect(validarVinculo(v).ok).toBe(false);
  });

  it('rechaza destino tipo inválido', () => {
    const v = { ...vinculoValido, destino: { tipo: 's', id: '1' } };
    expect(validarVinculo(v).ok).toBe(false);
  });

  it('rechaza alcance vacío cuando no completo', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: [], carpetas: [], configuraciones: [] } };
    expect(validarVinculo(v).ok).toBe(false);
  });

  it('rechaza configuración fuera de lista', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: ['m1'], carpetas: [], configuraciones: ['no-existe' as any] } };
    expect(validarVinculo(v).ok).toBe(false);
   });
   
   it('rechaza fecha ISO inválida', () => {
     const v = { ...vinculoValido, creadoEn: '2023-01-01' };
     expect(validarVinculo(v).ok).toBe(false);
   });

    it("rechaza lo que no es objeto con id y destino", () => {
      expect(validarVinculo(null).ok).toBe(false);
      expect(validarVinculo({}).ok).toBe(false);
      expect(validarVinculo({ id: "v", destino: {} }).ok).toBe(false);
});
});

describe('normalizarVinculos', () => {
  it('devuelve [] para null', () => {
    expect(normalizarVinculos(null)).toEqual([]);
  });

  it('devuelve [] para entrada no objeto', () => {
    expect(normalizarVinculos('bad' as any)).toEqual([]);
    expect(normalizarVinculos(123 as any)).toEqual([]);
    expect(normalizarVinculos([] as any)).toEqual([]);
  });

  it('filtra inválidos', () => {
    const config = { telepatia: [vinculoValido, { id: '' }] };
    const res = normalizarVinculos(config);
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('v1');
  });
});

describe('conVinculo', () => {
  it('añade vínculo', () => {
    const cfg = conVinculo({}, vinculoValido);
    expect((cfg as any).telepatia).toHaveLength(1);
  });

  it('reemplaza por id', () => {
    const v2 = { ...vinculoValido, auto: false };
    const cfg1 = conVinculo({}, vinculoValido);
    const cfg2 = conVinculo(cfg1, v2);
    expect((cfg2 as any).telepatia).toHaveLength(1);
    expect((cfg2 as any).telepatia[0].auto).toBe(false);
  });
});

describe('sinVinculo', () => {
  it('elimina por id', () => {
    const cfg = { telepatia: [vinculoValido] };
    const out = sinVinculo(cfg, 'v1');
    expect((out as any).telepatia).toHaveLength(0);
  });
});

describe('estaCaducado', () => {
  it('detecta caducidad', () => {
    const v = { ...vinculoValido, expiraEn: '2020-01-01T00:00:00Z' };
    expect(estaCaducado(v, Date.now())).toBe(true);
  });

  it('no caduca sin expiraEn', () => {
    expect(estaCaducado(vinculoValido, Date.now())).toBe(false);
  });
});

describe('planSincronizacion', () => {
  it('vacío si estado pausado', () => {
    const v = { ...vinculoValido, estado: 'pausado' as any };
    const ops = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
    expect(ops).toEqual([]);
  });

  it('vacío si caducado', () => {
    const v = { ...vinculoValido, expiraEn: '2000-01-01T00:00:00Z' };
    const ops = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
    expect(ops).toEqual([]);
  });

  it('sincroniza archivos por updated_at', () => {
    const origen = {
      archivos: [
        { name: 'f1.txt', content: 'c1', updated_at: '2023-01-01T00:00:00Z' },
        { name: 'f2.txt', content: 'c2' }
      ],
      prefs: {}
    };
    const destino = {
      archivos: [
        { name: 'f1.txt', content: 'old', updated_at: '2022-12-31T00:00:00Z' },
        { name: 'f3.txt', content: 'c3', updated_at: '2023-01-02T00:00:00Z' }
      ],
      prefs: {}
    };
    const ops = planSincronizacion(vinculoValido, origen, destino);
    const archivos = ops.filter(o => o.tipo === 'archivo');
    expect(archivos).toContainEqual({ tipo: 'archivo', nombre: 'f1.txt', de: 'origen', a: 'destino' });
    expect(archivos).toContainEqual({ tipo: 'archivo', nombre: 'f2.txt', de: 'origen', a: 'destino' });
    expect(archivos).toContainEqual({ tipo: 'archivo', nombre: 'f3.txt', de: 'destino', a: 'origen' });
  });

  it('respeta dirección enviar', () => {
    const v = { ...vinculoValido, direccion: 'enviar' as const };
    const origen = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-02T00:00:00Z' }], prefs: {} };
    const destino = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-01T00:00:00Z' }], prefs: {} };
    const ops = planSincronizacion(v, origen, destino);
    expect(ops.every(o => o.a === 'destino')).toBe(true);
  });

  it('acceso leer impide destino→origen', () => {
    const v = { ...vinculoValido, acceso: 'leer' as const };
    const origen = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-01T00:00:00Z' }], prefs: {} };
    const destino = { archivos: [{ name: 'a', content: '', updated_at: '2023-01-02T00:00:00Z' }], prefs: {} };
    const ops = planSincronizacion(v, origen, destino);
    expect(ops.every(o => o.de !== 'destino')).toBe(true);
  });

  it('respeta alcance memorias', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: ['keep.txt'], carpetas: [], configuraciones: [] } };
    const origen = { archivos: [{ name: 'keep.txt', content: '', updated_at: '2023-01-02T00:00:00Z' }, { name: 'skip.txt', content: '', updated_at: '2023-01-02T00:00:00Z' }], prefs: {} };
    const destino = { archivos: [{ name: 'keep.txt', content: '', updated_at: '2023-01-01T00:00:00Z' }], prefs: {} };
    const ops = planSincronizacion(v, origen, destino);
    const nombres = ops.filter(o => o.tipo === 'archivo').map(o => o.nombre);
    expect(nombres).toContain('keep.txt');
    expect(nombres).not.toContain('skip.txt');
  });

  it('genera operación carpeta', () => {
    const v = { ...vinculoValido, alcance: { completo: false, memorias: [], carpetas: ['c1'], configuraciones: [] } };
    const ops = planSincronizacion(v, { archivos: [], prefs: {} }, { archivos: [], prefs: {} });
    expect(ops.some(o => o.tipo === 'carpeta' && o.nombre === 'c1')).toBe(true);
  });
});
