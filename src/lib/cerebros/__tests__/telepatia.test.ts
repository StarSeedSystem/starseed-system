import { describe, it, expect } from 'vitest';
<<<<<<< HEAD
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
});

describe('normalizarVinculos', () => {
  it('devuelve [] para null', () => {
    expect(normalizarVinculos(null)).toEqual([]);
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
=======
import * as telepatia from '../telepatia';

describe('telepatia', () => {
  describe('validarVinculo', () => {
    const valido = {
      destino: { tipo: 'server', id: '1' },
      alcance: 'completo',
      configuraciones: { servers: {} },
      fechaCreacion: '2023-01-01T00:00:00Z',
      fechaCaducidad: '2024-01-01T00:00:00Z'
    };

    it('rechaza no-objeto', () => {
      const r = telepatia.validarVinculo(null);
      expect(r.ok).toBe(false);
    });

    it('rechaza destino faltante', () => {
      const r = telepatia.validarVinculo({ alcance: 'completo', configuraciones: {} });
      expect(r.ok).toBe(false);
    });

    it('rechaza tipo o id vacío', () => {
      const r1 = telepatia.validarVinculo({ ...valido, destino: { tipo: '', id: '1' } });
      const r2 = telepatia.validarVinculo({ ...valido, destino: { tipo: 'server', id: '' } });
      expect(r1.ok && r2.ok).toBe(false);
    });

    it('acepta vinculo válido', () => {
      const r = telepatia.validarVinculo(valido);
      expect(r.ok).toBe(true);
      expect(r.vinculo).toEqual(valido);
    });
  });

  describe('normalizarVinculos', () => {
    it('devuelve [] para null/undefined o sin telepatia', () => {
      expect(telepatia.normalizarVinculos(null)).toEqual([]);
      expect(telepatia.normalizarVinculos(undefined)).toEqual([]);
      expect(telepatia.normalizarVinculos({})).toEqual([]);
    });

    it('filtra vinculos inválidos', () => {
      const config = {
        telepatia: [
          { destino: { tipo: 's', id: '1' }, alcance: 'completo', configuraciones: {}, fechaCreacion: '2023-01-01T00:00:00Z', fechaCaducidad: '2024-01-01T00:00:00Z' },
          { destino: { tipo: '', id: '2' }, alcance: 'completo', configuraciones: {}, fechaCreacion: '2023-01-01T00:00:00Z', fechaCaducidad: '2024-01-01T00:00:00Z' }
        ]
      };
      const res = telepatia.normalizarVinculos(config);
      expect(res.length).toBe(1);
      expect(res[0].destino.id).toBe('1');
    });
  });

  describe('conVinculo', () => {
    const vinculo = {
      destino: { tipo: 's', id: '1' },
      alcance: 'completo',
      configuraciones: { servers: {} },
      fechaCreacion: '2023-01-01T00:00:00Z',
      fechaCaducidad: '2024-01-01T00:00:00Z'
    };

    it('añade a config vacío', () => {
      const r = telepatia.conVinculo({}, vinculo);
      expect(r.telepatia).toEqual([vinculo]);
    });

    it('reemplaza vinculo existente por id', () => {
      const existente = { ...vinculo, destino: { tipo: 's', id: '1' } };
      const nuevo = { ...vinculo, destino: { tipo: 's', id: '1' }, configuraciones: { skills: {} } };
      const config = { telepatia: [existente] };
      const r = telepatia.conVinculo(config, nuevo);
      expect(r.telepatia).toHaveLength(1);
      expect(r.telepatia[0]).toEqual(nuevo);
    });

    it('añade cuando el id no existe', () => {
      const existente = { ...vinculo, destino: { tipo: 's', id: '1' } };
      const nuevo = { ...vinculo, destino: { tipo: 's', id: '2' } };
      const config = { telepatia: [existente] };
      const r = telepatia.conVinculo(config, nuevo);
      expect(r.telepatia).toHaveLength(2);
      expect(r.telepatia).toContainEqual(existente);
      expect(r.telepatia).toContainEqual(nuevo);
    });
  });

  describe('sinVinculo', () => {
    const vinculo = {
      destino: { tipo: 's', id: '1' },
      alcance: 'completo',
      configuraciones: { servers: {} },
      fechaCreacion: '2023-01-01T00:00:00Z',
      fechaCaducidad: '2024-01-01T00:00:00Z'
    };

    it('elimina por id', () => {
      const config = { telepatia: [vinculo] };
      const r = telepatia.sinVinculo(config, '1');
      expect(r.telepatia).toEqual([]);
    });

    it('hace nada si id no existe', () => {
      const config = { telepatia: [vinculo] };
      const r = telepatia.sinVinculo(config, '2');
      expect(r.telepatia).toEqual([vinculo]);
    });

    it('devuelve config sin cambios si no tiene telepatia', () => {
      const config = { foo: 'bar' };
      const r = telepatia.sinVinculo(config, '1');
      expect(r).toEqual(config);
    });
  });

  describe('estaCaducado', () => {
    const vinculo = {
      destino: { tipo: 's', id: '1' },
      alcance: 'completo',
      configuraciones: { servers: {} },
      fechaCreacion: '2023-01-01T00:00:00Z',
      fechaCaducidad: '2023-01-02T00:00:00Z'
    };

    it('devuelve true si vencido', () => {
      const ahora = new Date('2023-01-03T00:00:00Z').getTime();
      expect(telepatia.estaCaducado(vinculo, ahora)).toBe(true);
    });

    it('devuelve false si no vencido', () => {
      const ahora = new Date('2023-01-01T12:00:00Z').getTime();
      expect(telepatia.estaCaducado(vinculo, ahora)).toBe(false);
    });
  });

  describe('planSincronizacion', () => {
    const vinculo = {
      destino: { tipo: 's', id: '1' },
      alcance: 'completo',
      configuraciones: { servers: {}, skills: {} },
      fechaCreacion: '2023-01-01T00:00:00Z',
      fechaCaducidad: '2030-01-01T00:00:00Z'
    };

    it('devuelve [] para vinculo vencido', () => {
      const vencido = { ...vinculo, fechaCaducidad: '2023-01-02T00:00:00Z' };
      const origen = { archivos: [], prefs: {} };
      const destino = { archivos: [], prefs: {} };
      expect(telepatia.planSincronizacion(vencido, origen, destino)).toEqual([]);
    });

    it('maneja alcance completo', () => {
      const origen = {
        archivos: [
          { name: 'f1.txt', content: 'c1', updated_at: '2023-01-01T00:00:00Z' },
          { name: 'f2.txt', content: 'c2' }
        ],
        prefs: { servers: { v: 'o' }, skills: { v: 'o' } }
      };
      const destino = {
        archivos: [
          { name: 'f1.txt', content: 'c1-old', updated_at: '2022-12-31T00:00:00Z' },
          { name: 'f3.txt', content: 'c3', updated_at: '2023-01-02T00:00:00Z' }
        ],
        prefs: { servers: { v: 'd' }, skills: { v: 'd' } }
      };
      const res = telepatia.planSincronizacion(vinculo, origen, destino);
      // Esperamos al menos 3 operaciones de archivo: f1 (o->d), f2 (o->d), f3 (d->o)
      const opsArchivo = res.filter(op => op.tipo === 'archivo');
      expect(opsArchivo.length).toBeGreaterThanOrEqual(3);
    });
  });
});
>>>>>>> 02398ab3 (salvavidas · CB1013E: trabajo del agente antes de las puertas (tsc / vitest))
