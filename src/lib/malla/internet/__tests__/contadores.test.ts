import { describe, it, expect } from 'vitest';
import {
  Contadores,
  contadoresVacios,
  diaLocal,
  mesLocal,
  sumarBytes,
  usadoHoyMb,
  MB,
} from '../contadores';
import type { Audiencia } from '../tipos';

describe('contadores', () => {
  const ahora = 1700000000000; // 2023-11-14
  const desfaseMin = -new Date().getTimezoneOffset();

  describe('contadoresVacios', () => {
    it('devuelve contadores con día y mes', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      expect(c.dia).toBeDefined();
      expect(c.mes).toBeDefined();
      expect(c.dia.length).toBe(10); // AAAA-MM-DD
      expect(c.mes.length).toBe(7); // AAAA-MM
    });

    it('todos los contadores de bytes empiezan en 0', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      const audiencias: Audiencia[] = ['mi-cuenta', 'entidad', 'publico'];
      for (const a of audiencias) {
        expect(c.bytesDia[a]).toBe(0);
        expect(c.bytesMes[a]).toBe(0);
      }
    });
  });

  describe('diaLocal', () => {
    it('devuelve la fecha local en formato AAAA-MM-DD', () => {
      const d = diaLocal(ahora, desfaseMin);
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('sumarBytes', () => {
    it('suma bytes a la audiencia indicada', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      const nuevo = sumarBytes(c, 'mi-cuenta', 500_000_000, ahora, desfaseMin);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(500_000_000);
      expect(nuevo.bytesMes['mi-cuenta']).toBe(500_000_000);
    });

    it('no muta el contenedor original', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      const c2 = sumarBytes(c, 'mi-cuenta', 500_000_000, ahora, desfaseMin);
      expect(c.bytesDia['mi-cuenta']).toBe(0);
      expect(c.bytesMes['mi-cuenta']).toBe(0);
      expect(c2.bytesDia['mi-cuenta']).toBe(500_000_000);
    });

    it('ignora bytes negativos', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      const nuevo = sumarBytes(c, 'mi-cuenta', -100, ahora, desfaseMin);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(0);
    });

    it('ignora NaN', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      const nuevo = sumarBytes(c, 'mi-cuenta', NaN, ahora, desfaseMin);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(0);
    });

    it('ignora Infinity', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      const nuevo = sumarBytes(c, 'mi-cuenta', Infinity, ahora, desfaseMin);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(0);
    });

    it('suma a audiencia distinta sin afectar la otra', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      const c2 = sumarBytes(
        sumarBytes(c, 'mi-cuenta', 100, ahora, desfaseMin),
        'entidad',
        200,
        ahora,
        desfaseMin
      );
      expect(c2.bytesDia['mi-cuenta']).toBe(100);
      expect(c2.bytesDia['entidad']).toBe(200);
    });
  });

  describe('usadoHoyMb', () => {
    it('devuelve 0 si el día de c no es hoy', () => {
      const c = contadoresVacios(ahora, desfaseMin);
      c.dia = '2020-01-01'; // día pasado
      const mb = usadoHoyMb(c, 'mi-cuenta', ahora, desfaseMin);
      expect(mb).toBe(0);
    });

    it('devuelve bytes/MB para audiencia específica', () => {
      const hoy = diaLocal(ahora, desfaseMin);
      const c: Contadores = {
        dia: hoy,
        mes: '2023-11',
        bytesDia: { 'mi-cuenta': 1_500_000, entidad: 0, publico: 0 },
        bytesMes: { 'mi-cuenta': 1_500_000, entidad: 0, publico: 0 },
      };
      const mb = usadoHoyMb(c, 'mi-cuenta', ahora, desfaseMin);
      expect(mb).toBe(1.5);
    });

    it('suma entidad y público para "otros"', () => {
      const hoy = diaLocal(ahora, desfaseMin);
      const c: Contadores = {
        dia: hoy,
        mes: '2023-11',
        bytesDia: { 'mi-cuenta': 1_000_000, entidad: 1_000_000, publico: 1_000_000 },
        bytesMes: { 'mi-cuenta': 2_000_000, entidad: 2_000_000, publico: 2_000_000 },
      };
      const mb = usadoHoyMb(c, 'otros', ahora, desfaseMin);
      expect(mb).toBe(3);
    });
  });

  describe('cambio de día con desfase', () => {
    it('cuando el día cambia, reinicia el día pero mantiene el mes', () => {
      const ahoraNuevo = ahora + 87000000;
      const diaAnterior = diaLocal(ahora, desfaseMin);
      const diaNuevo = diaLocal(ahoraNuevo, desfaseMin);
      expect(diaAnterior).not.toBe(diaNuevo);

      const c: Contadores = {
        dia: diaAnterior,
        mes: mesLocal(ahoraNuevo, desfaseMin),
        bytesDia: { 'mi-cuenta': 500_000_000, entidad: 0, publico: 0 },
        bytesMes: { 'mi-cuenta': 2_000_000_000, entidad: 0, publico: 0 },
      };
      const nuevo = sumarBytes(c, 'mi-cuenta', 100, ahoraNuevo, desfaseMin);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(100);
      expect(nuevo.bytesMes['mi-cuenta']).toBe(2_000_000_100);
      expect(nuevo.dia).toBe(diaNuevo);
    });
  });

  describe('cambio de mes', () => {
    it('cuando el mes cambia, reinicia día y mes', () => {
      const ahoraMayo = 1715700000000; // mayo 2024
      const c = contadoresVacios(ahora, desfaseMin);
      c.dia = '2023-11-14';
      c.mes = '2023-11';
      c.bytesDia['mi-cuenta'] = 500_000_000;
      c.bytesMes['mi-cuenta'] = 2_000_000_000;
      const nuevo = sumarBytes(c, 'mi-cuenta', 100, ahoraMayo, desfaseMin);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(100);
      expect(nuevo.bytesMes['mi-cuenta']).toBe(100);
    });
  });

  describe('cruce de medianoche con desfase', () => {
    it('desfase +120: recalcula día correctamente', () => {
      const desfasePositivo = 120;
      const c = contadoresVacios(ahora, desfasePositivo);
      expect(c.dia).toBeDefined();
      const nuevo = sumarBytes(c, 'mi-cuenta', 1000, ahora, desfasePositivo);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(1000);
      expect(nuevo.bytesMes['mi-cuenta']).toBe(1000);
    });

    it('desfase -300: recalcula día correctamente', () => {
      const desfaseNegativo = -300;
      const c = contadoresVacios(ahora, desfaseNegativo);
      expect(c.dia).toBeDefined();
      const nuevo = sumarBytes(c, 'mi-cuenta', 1000, ahora, desfaseNegativo);
      expect(nuevo.bytesDia['mi-cuenta']).toBe(1000);
      expect(nuevo.bytesMes['mi-cuenta']).toBe(1000);
    });
  });
});