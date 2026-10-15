import { describe, it, expect } from 'vitest';
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