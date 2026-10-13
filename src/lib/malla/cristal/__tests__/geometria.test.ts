import { describe, it, expect } from 'vitest';
import { distanciaPorSenal, multilateracion, posicionesEstimadas } from '../geometria';
import type { NeuronaReticula, SenalMedida } from '../tipos';

describe('geometría de la malla', () => {
  describe('distanciaPorSenal', () => {
    it('calcula distancia wifi log-distance', () => {
      const base: SenalMedida = { de: 'a', a: 'b', medio: 'wifi-lan', vistaEn: 1 };
      expect(distanciaPorSenal({ ...base, rssiDbm: -40 })).toBeCloseTo(1);
      expect(distanciaPorSenal({ ...base, rssiDbm: -67 })).toBeCloseTo(10);
    });

    it('calcula distancia ble log-distance', () => {
      const base: SenalMedida = { de: 'a', a: 'b', medio: 'ble', vistaEn: 1 };
      expect(distanciaPorSenal({ ...base, rssiDbm: -59 })).toBeCloseTo(1);
      expect(distanciaPorSenal({ ...base, rssiDbm: -86 })).toBeCloseTo(10);
    });

    it('calcula distancia lora snr', () => {
      const base: SenalMedida = { de: 'a', a: 'b', medio: 'lora', vistaEn: 1 };
      expect(distanciaPorSenal({ ...base, snrDb: 10 })).toBeCloseTo(500);
      expect(distanciaPorSenal({ ...base, snrDb: -20 })).toBeCloseTo(15000);
      expect(distanciaPorSenal({ ...base, snrDb: -5 })).toBeCloseTo(7750);
    });

    it('nfc es 0.1m', () => {
      expect(distanciaPorSenal({ de: 'a', a: 'b', medio: 'nfc', vistaEn: 1 })).toBe(0.1);
    });
  });

  describe('multilateración', () => {
    it('recupera punto con error < 1m', () => {
      const anchors = [
        { x: 0, y: 0, d: 10 },
        { x: 20, y: 0, d: 10 },
        { x: 10, y: 17.32, d: 10 },
      ];
      const pos = multilateracion(anchors);
      expect(pos).not.toBeNull();
      expect(pos!.x).toBeCloseTo(10, 0);
      expect(pos!.y).toBeCloseTo(5.77, 0);
    });
  });

  describe('posicionesEstimadas', () => {
    it('mantiene posiciones fijas', () => {
      const ns: NeuronaReticula[] = [{ id: '1', cuenta: 'c', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: [], posicion: { x: 10, y: 20, precisionM: 0 } }];
      const res = posicionesEstimadas(ns, []);
      expect(res['1']).toEqual({ x: 10, y: 20, estimada: false });
    });

    it('estima posición por trilateración', () => {
      const ns: NeuronaReticula[] = [
        { id: '1', cuenta: 'c', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: [], posicion: { x: 0, y: 0, precisionM: 0 } },
        { id: '2', cuenta: 'c', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: [], posicion: { x: 20, y: 0, precisionM: 0 } },
        { id: '3', cuenta: 'c', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: [], posicion: { x: 10, y: 17.32, precisionM: 0 } },
        { id: '4', cuenta: 'c', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: [] },
      ];
      const s: SenalMedida[] = [
        { de: '1', a: '4', medio: 'wifi-lan', rssiDbm: -67, vistaEn: 1 }, // 10m
        { de: '2', a: '4', medio: 'wifi-lan', rssiDbm: -67, vistaEn: 1 }, // 10m
        { de: '3', a: '4', medio: 'wifi-lan', rssiDbm: -67, vistaEn: 1 }, // 10m
      ];
      const res = posicionesEstimadas(ns, s);
      expect(res['4'].estimada).toBe(true);
      expect(res['4'].x).toBeCloseTo(10, 0);
      expect(res['4'].y).toBeCloseTo(5.77, 0);
    });
  });
});
