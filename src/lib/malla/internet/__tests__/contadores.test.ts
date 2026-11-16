import { describe, it, expect } from 'vitest';
import { Audiencia } from '../tipos';
import {
  Contadores,
  contadoresVacios,
  diaLocal,
  sumarBytes,
  usadoHoyMb,
} from '../contadores';

describe('contadores', () => {
  const ahoraEnero17_2025 = 1737093600000;
  const desfaseMexico = -360;

  describe('contadoresVacios', () => {
    it('crea contadores vacíos con día y mes', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      expect(c.dia).toBe('2025-01-17');
      expect(c.mes).toBe('2025-01');
    });

    it('asigna ceros a bytesDia y bytesMes', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      for (const aud of ['mi-cuenta', 'entidad', 'publico'] as Audiencia[]) {
        expect(c.bytesDia[aud]).toBe(0);
        expect(c.bytesMes[aud]).toBe(0);
      }
    });
  });

  describe('diaLocal', () => {
    it('devuelve formato AAAA-MM-DD', () => {
      expect(diaLocal(ahoraEnero17_2025, desfaseMexico)).toBe('2025-01-17');
    });

    it('ajusta con desfase positivo', () => {
      const unaHora = 3600000;
      const desfase = 0;
      const tarde = ahoraEnero17_2025 + unaHora;
      expect(diaLocal(tarde, desfase)).toBe('2025-01-17');
    });

    it('ajusta con desfase negativo al día anterior', () => {
      const unaHora = 3600000;
      const desfase = -720;
      const madrugada = ahoraEnero17_2025 - unaHora;
      expect(diaLocal(madrugada, desfase)).toBe('2025-01-16');
    });
  });

  describe('sumarBytes', () => {
    it('suma bytes a la audiencia indicada', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const r = sumarBytes(c, 'mi-cuenta', 500000000, ahoraEnero17_2025, desfaseMexico);
      expect(r.bytesDia['mi-cuenta']).toBe(500000000);
      expect(r.bytesMes['mi-cuenta']).toBe(500000000);
    });

    it('suma múltiples veces a la misma audiencia', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      let r = sumarBytes(c, 'mi-cuenta', 100000000, ahoraEnero17_2025, desfaseMexico);
      r = sumarBytes(r, 'mi-cuenta', 150000000, ahoraEnero17_2025, desfaseMexico);
      expect(r.bytesDia['mi-cuenta']).toBe(250000000);
      expect(r.bytesMes['mi-cuenta']).toBe(250000000);
    });

    it('no muta el objeto original', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const original = JSON.stringify(c);
      sumarBytes(c, 'mi-cuenta', 100000000, ahoraEnero17_2025, desfaseMexico);
      expect(JSON.stringify(c)).toBe(original);
    });

    it('ignora bytes negativos', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const r = sumarBytes(c, 'mi-cuenta', -100000000, ahoraEnero17_2025, desfaseMexico);
      expect(r.bytesDia['mi-cuenta']).toBe(0);
      expect(r.bytesMes['mi-cuenta']).toBe(0);
    });

    it('ignora NaN', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const r = sumarBytes(c, 'mi-cuenta', NaN, ahoraEnero17_2025, desfaseMexico);
      expect(r.bytesDia['mi-cuenta']).toBe(0);
      expect(r.bytesMes['mi-cuenta']).toBe(0);
    });

    it('ignora Infinity', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const r = sumarBytes(c, 'mi-cuenta', Infinity, ahoraEnero17_2025, desfaseMexico);
      expect(r.bytesDia['mi-cuenta']).toBe(0);
      expect(r.bytesMes['mi-cuenta']).toBe(0);
    });

    it('ignora -Infinity', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const r = sumarBytes(c, 'mi-cuenta', -Infinity, ahoraEnero17_2025, desfaseMexico);
      expect(r.bytesDia['mi-cuenta']).toBe(0);
      expect(r.bytesMes['mi-cuenta']).toBe(0);
    });
  });

  describe('cambio de día con desfase', () => {
    it('reinicia bytesDia pero conserva bytesMes al cambiar de día', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      let r = sumarBytes(c, 'mi-cuenta', 100000000, ahoraEnero17_2025, desfaseMexico);
      r = sumarBytes(r, 'entidad', 200000000, ahoraEnero17_2025, desfaseMexico);

      const unDia = 86400000;
      const unDiaYSieteHoras = unDia + 7 * 3600000;
      const desfaseCero = 0;
      const siguienteDia = ahoraEnero17_2025 + unDiaYSieteHoras;

      r = sumarBytes(r, 'mi-cuenta', 50000000, siguienteDia, desfaseCero);

      expect(r.dia).toBe('2025-01-18');
      expect(r.bytesDia['mi-cuenta']).toBe(50000000);
      expect(r.bytesMes['mi-cuenta']).toBe(150000000);
      expect(r.bytesMes['entidad']).toBe(200000000);
    });

    it('reinicia ambos día y mes al cambiar de mes', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      let r = sumarBytes(c, 'mi-cuenta', 100000000, ahoraEnero17_2025, desfaseMexico);
      r = sumarBytes(r, 'entidad', 50000000, ahoraEnero17_2025, desfaseMexico);

      const unMes = 31 * 86400000;
      const desfaseFebrero = -60;
      const eneroFin = ahoraEnero17_2025 + unMes;

      r = sumarBytes(r, 'mi-cuenta', 75000000, eneroFin, desfaseFebrero);

      expect(r.dia).toBe('2025-02-17');
      expect(r.mes).toBe('2025-02');
      expect(r.bytesDia['mi-cuenta']).toBe(75000000);
      expect(r.bytesMes['mi-cuenta']).toBe(75000000);
      expect(r.bytesMes['entidad']).toBe(0);
    });
  });

  describe('cambio de mes', () => {
    it('reinicia bytesMes y bytesDia al cambiar de mes', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      let r = sumarBytes(c, 'mi-cuenta', 1000000000, ahoraEnero17_2025, desfaseMexico);
      r = sumarBytes(r, 'entidad', 500000000, ahoraEnero17_2025, desfaseMexico);

      const unMes = 30 * 86400000;
      const desfaseFebrero = -60;
      const eneroFin = ahoraEnero17_2025 + unMes;

      r = sumarBytes(r, 'publico', 250000000, eneroFin, desfaseFebrero);

      expect(r.dia).toBe('2025-02-16');
      expect(r.mes).toBe('2025-02');
      expect(r.bytesDia['publico']).toBe(250000000);
      expect(r.bytesMes['mi-cuenta']).toBe(0);
      expect(r.bytesMes['entidad']).toBe(0);
      expect(r.bytesMes['publico']).toBe(250000000);
    });
  });

  describe('usadoHoyMb', () => {
    it('devuelve MB usados para la audiencia', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const r = sumarBytes(c, 'mi-cuenta', 1500000000, ahoraEnero17_2025, desfaseMexico);
      expect(usadoHoyMb(r, 'mi-cuenta', ahoraEnero17_2025, desfaseMexico)).toBe(1500);
    });

    it('devuelve 0 si el día de c no es hoy', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const enero16_05utc = 1737003600000;
      const r = sumarBytes(c, 'mi-cuenta', 1500000000, enero16_05utc, -300);
      expect(r.dia).toBe('2025-01-16');
      expect(usadoHoyMb(r, 'mi-cuenta', ahoraEnero17_2025, desfaseMexico)).toBe(0);
    });

    it('suma entidad y público para "otros"', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      let r = sumarBytes(c, 'entidad', 800000000, ahoraEnero17_2025, desfaseMexico);
      r = sumarBytes(r, 'publico', 1200000000, ahoraEnero17_2025, desfaseMexico);
      expect(usadoHoyMb(r, 'otros', ahoraEnero17_2025, desfaseMexico)).toBe(2000);
    });

    it('ignora valores inválidos en bytesDia', () => {
      const c = contadoresVacios(ahoraEnero17_2025, desfaseMexico);
      const r = sumarBytes(c, 'mi-cuenta', NaN, ahoraEnero17_2025, desfaseMexico);
      expect(usadoHoyMb(r, 'mi-cuenta', ahoraEnero17_2025, desfaseMexico)).toBe(0);
    });
  });
});