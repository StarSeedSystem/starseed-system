import { describe, it, expect } from 'vitest';
import {
  Contadores,
  Audiencia,
  MB,
  contadoresVacios,
  diaLocal,
  sumarBytes,
  usadoHoyMb,
} from '../contadores';

describe('MB constante', () => {
  it('MB = 1_000_000 (megabytes decimales)', () => {
    expect(MB).toBe(1_000_000);
  });
});

describe('diaLocal', () => {
  it('devuelve AAAA-MM-DD local con desfase positivo (+120 min = UTC+2)', () => {
    // 2026-01-15T23:00:00.000Z con +120 min = 2026-01-16T01:00:00 local
    const ahora = new Date('2026-01-15T23:00:00.000Z').getTime();
    expect(diaLocal(ahora, 120)).toBe('2026-01-16');
  });

  it('devuelve AAAA-MM-DD local con desfase negativo (-300 min = UTC-5)', () => {
    // 2026-01-16T03:00:00.000Z con -300 min = 2026-01-15T22:00:00 local
    const ahora = new Date('2026-01-16T03:00:00.000Z').getTime();
    expect(diaLocal(ahora, -300)).toBe('2026-01-15');
  });

  it('cambio de mes con desfase (31 enero 23:00 UTC +120 = 1 febrero)', () => {
    const ahora = new Date('2026-01-31T23:00:00.000Z').getTime();
    expect(diaLocal(ahora, 120)).toBe('2026-02-01');
  });

  it('cambio de año con desfase (31 dic 23:00 UTC +120 = 1 enero)', () => {
    const ahora = new Date('2025-12-31T23:00:00.000Z').getTime();
    expect(diaLocal(ahora, 120)).toBe('2026-01-01');
  });
});

describe('contadoresVacios', () => {
  it('crea contadores vacíos con día y mes correctos', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const c = contadoresVacios(ahora, 0);
    expect(c.dia).toBe('2026-01-15');
    expect(c.mes).toBe('2026-01');
    expect(c.bytesDia['mi-cuenta']).toBe(0);
    expect(c.bytesDia['entidad']).toBe(0);
    expect(c.bytesDia['publico']).toBe(0);
    expect(c.bytesMes['mi-cuenta']).toBe(0);
    expect(c.bytesMes['entidad']).toBe(0);
    expect(c.bytesMes['publico']).toBe(0);
  });

  it('respeta el desfase horario para día y mes', () => {
    const ahora = new Date('2026-01-15T23:00:00.000Z').getTime();
    const c = contadoresVacios(ahora, 120); // UTC+2 -> 16 enero
    expect(c.dia).toBe('2026-01-16');
    expect(c.mes).toBe('2026-01');
  });
});

describe('sumarBytes', () => {
  const baseContadores: Contadores = {
    dia: '2026-01-15',
    mes: '2026-01',
    bytesDia: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
    bytesMes: { 'mi-cuenta': 0, entidad: 0, publico: 0 },
  };

  it('suma bytes para una audiencia', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const c = sumarBytes(baseContadores, 'mi-cuenta', 1000, ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(1000);
    expect(c.bytesMes['mi-cuenta']).toBe(1000);
    expect(c.bytesDia['entidad']).toBe(0);
    expect(c.bytesMes['entidad']).toBe(0);
  });

  it('suma bytes para múltiples audiencias independientemente', () => {
    let c = baseContadores;
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    c = sumarBytes(c, 'mi-cuenta', 1000, ahora, 0);
    c = sumarBytes(c, 'entidad', 2000, ahora, 0);
    c = sumarBytes(c, 'publico', 3000, ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(1000);
    expect(c.bytesDia['entidad']).toBe(2000);
    expect(c.bytesDia['publico']).toBe(3000);
    expect(c.bytesMes['mi-cuenta']).toBe(1000);
    expect(c.bytesMes['entidad']).toBe(2000);
    expect(c.bytesMes['publico']).toBe(3000);
  });

  it('cruce de medianoche con desfase +120: reinicia día pero NO borra mes', () => {
    // Contadores del 15 enero, añadimos bytes el 16 enero (UTC 15T23:00 +120 = 16T01:00)
    const cInicial: Contadores = {
      dia: '2026-01-15',
      mes: '2026-01',
      bytesDia: { 'mi-cuenta': 5000, entidad: 3000, publico: 2000 },
      bytesMes: { 'mi-cuenta': 50000, entidad: 30000, publico: 20000 },
    };
    const ahora = new Date('2026-01-15T23:00:00.000Z').getTime(); // 16 enero local con +120
    const c = sumarBytes(cInicial, 'mi-cuenta', 1000, ahora, 120);
    expect(c.dia).toBe('2026-01-16');
    expect(c.mes).toBe('2026-01');
    expect(c.bytesDia['mi-cuenta']).toBe(1000); // día reiniciado
    expect(c.bytesDia['entidad']).toBe(0); // día reiniciado
    expect(c.bytesDia['publico']).toBe(0); // día reiniciado
    expect(c.bytesMes['mi-cuenta']).toBe(51000); // mes conserva y suma
    expect(c.bytesMes['entidad']).toBe(30000); // mes intacto
    expect(c.bytesMes['publico']).toBe(20000); // mes intacto
  });

  it('cruce de medianoche con desfase -300: reinicia día pero NO borra mes', () => {
    // Contadores del 16 enero, añadimos bytes el 15 enero (UTC 16T03:00 -300 = 15T22:00)
    const cInicial: Contadores = {
      dia: '2026-01-16',
      mes: '2026-01',
      bytesDia: { 'mi-cuenta': 5000, entidad: 3000, publico: 2000 },
      bytesMes: { 'mi-cuenta': 50000, entidad: 30000, publico: 20000 },
    };
    const ahora = new Date('2026-01-16T03:00:00.000Z').getTime(); // 15 enero local con -300
    const c = sumarBytes(cInicial, 'mi-cuenta', 1000, ahora, -300);
    expect(c.dia).toBe('2026-01-15');
    expect(c.mes).toBe('2026-01');
    expect(c.bytesDia['mi-cuenta']).toBe(1000); // día reiniciado
    expect(c.bytesMes['mi-cuenta']).toBe(51000); // mes conserva y suma
  });

  it('cambio de mes: reinicia día Y mes', () => {
    const cInicial: Contadores = {
      dia: '2026-01-31',
      mes: '2026-01',
      bytesDia: { 'mi-cuenta': 5000, entidad: 3000, publico: 2000 },
      bytesMes: { 'mi-cuenta': 50000, entidad: 30000, publico: 20000 },
    };
    // 1 febrero UTC, desfase 0 -> día 1 febrero, mes 2026-02
    const ahora = new Date('2026-02-01T00:00:00.000Z').getTime();
    const c = sumarBytes(cInicial, 'mi-cuenta', 1000, ahora, 0);
    expect(c.dia).toBe('2026-02-01');
    expect(c.mes).toBe('2026-02');
    expect(c.bytesDia['mi-cuenta']).toBe(1000); // día reiniciado
    expect(c.bytesMes['mi-cuenta']).toBe(1000); // mes reiniciado
    expect(c.bytesDia['entidad']).toBe(0);
    expect(c.bytesMes['entidad']).toBe(0);
    expect(c.bytesDia['publico']).toBe(0);
    expect(c.bytesMes['publico']).toBe(0);
  });

  it('ignora bytes negativos', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const c = sumarBytes(baseContadores, 'mi-cuenta', -1000, ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(0);
    expect(c.bytesMes['mi-cuenta']).toBe(0);
  });

  it('ignora NaN', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const c = sumarBytes(baseContadores, 'mi-cuenta', NaN, ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(0);
    expect(c.bytesMes['mi-cuenta']).toBe(0);
  });

  it('ignora Infinity', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const c = sumarBytes(baseContadores, 'mi-cuenta', Infinity, ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(0);
    expect(c.bytesMes['mi-cuenta']).toBe(0);
  });

  it('ignora -Infinity', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const c = sumarBytes(baseContadores, 'mi-cuenta', -Infinity, ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(0);
    expect(c.bytesMes['mi-cuenta']).toBe(0);
  });

  it('no muta el objeto de entrada', () => {
    const cInicial: Contadores = {
      dia: '2026-01-15',
      mes: '2026-01',
      bytesDia: { 'mi-cuenta': 100, entidad: 200, publico: 300 },
      bytesMes: { 'mi-cuenta': 1000, entidad: 2000, publico: 3000 },
    };
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const cNuevo = sumarBytes(cInicial, 'mi-cuenta', 500, ahora, 0);
    expect(cInicial.bytesDia['mi-cuenta']).toBe(100);
    expect(cInicial.bytesMes['mi-cuenta']).toBe(1000);
    expect(cNuevo).not.toBe(cInicial);
    expect(cNuevo.bytesDia).not.toBe(cInicial.bytesDia);
    expect(cNuevo.bytesMes).not.toBe(cInicial.bytesMes);
  });

  it('devuelve el mismo objeto si bytes = 0 (optimización opcional)', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const c = sumarBytes(baseContadores, 'mi-cuenta', 0, ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(0);
    expect(c.bytesMes['mi-cuenta']).toBe(0);
  });
});

describe('usadoHoyMb', () => {
  const c: Contadores = {
    dia: '2026-01-15',
    mes: '2026-01',
    bytesDia: { 'mi-cuenta': 1_000_000, entidad: 2_000_000, publico: 3_000_000 },
    bytesMes: { 'mi-cuenta': 10_000_000, entidad: 20_000_000, publico: 30_000_000 },
  };

  it('devuelve MB para una audiencia (1_000_000 bytes = 1 MB)', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    expect(usadoHoyMb(c, 'mi-cuenta', ahora, 0)).toBe(1);
    expect(usadoHoyMb(c, 'entidad', ahora, 0)).toBe(2);
    expect(usadoHoyMb(c, 'publico', ahora, 0)).toBe(3);
  });

  it('"otros" suma entidad + publico', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    // entidad: 2 MB + publico: 3 MB = 5 MB
    expect(usadoHoyMb(c, 'otros', ahora, 0)).toBe(5);
  });

  it('devuelve 0 si el día de los contadores no es hoy', () => {
    // Contadores son del 15, pero "hoy" es 16 (desfase 0)
    const ahora = new Date('2026-01-16T12:00:00.000Z').getTime();
    expect(usadoHoyMb(c, 'mi-cuenta', ahora, 0)).toBe(0);
    expect(usadoHoyMb(c, 'entidad', ahora, 0)).toBe(0);
    expect(usadoHoyMb(c, 'publico', ahora, 0)).toBe(0);
    expect(usadoHoyMb(c, 'otros', ahora, 0)).toBe(0);
  });

  it('respeta desfase horario para determinar "hoy"', () => {
    // Contadores del 15, UTC 15T23:00 con +120 = 16 local -> hoy es 16, contadores son 15 -> 0
    const ahora = new Date('2026-01-15T23:00:00.000Z').getTime();
    expect(usadoHoyMb(c, 'mi-cuenta', ahora, 120)).toBe(0);
    // Contadores del 15, UTC 15T12:00 con +120 = 15T14:00 local -> hoy es 15 -> 1 MB
    const ahora2 = new Date('2026-01-15T12:00:00.000Z').getTime();
    expect(usadoHoyMb(c, 'mi-cuenta', ahora2, 120)).toBe(1);
  });

  it('no muta el objeto de entrada', () => {
    const ahora = new Date('2026-01-15T12:00:00.000Z').getTime();
    const cCopia = { ...c, bytesDia: { ...c.bytesDia }, bytesMes: { ...c.bytesMes } };
    usadoHoyMb(c, 'mi-cuenta', ahora, 0);
    expect(c.bytesDia['mi-cuenta']).toBe(cCopia.bytesDia['mi-cuenta']);
    expect(c.bytesMes['mi-cuenta']).toBe(cCopia.bytesMes['mi-cuenta']);
  });
});