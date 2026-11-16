import { describe, it, expect } from 'vitest';
import { contadoresVacios, diaLocal, sumarBytes, usadoHoyMb, MB } from '../contadores';

describe('contadores de internet', () => {
  it('MB está definido correctamente', () => {
    expect(MB).toBe(1_000_000);
  });

  it('diaLocal calcula el día correcto con desfase', () => {
    // 2026-06-15T12:00:00Z
    const ahora = Date.UTC(2026, 5, 15, 12, 0, 0);
    expect(diaLocal(ahora, 0)).toBe('2026-06-15');
    // +120 min (UTC+2) -> 14:00 -> mismo día
    expect(diaLocal(ahora, 120)).toBe('2026-06-15');
    // -300 min (UTC-5) -> 07:00 -> mismo día
    expect(diaLocal(ahora, -300)).toBe('2026-06-15');
  });

  it('suma por audiencia correctamente', () => {
    const ahora = Date.UTC(2026, 5, 15, 12, 0, 0);
    const vacios = contadoresVacios(ahora, 0);
    const c1 = sumarBytes(vacios, 'mi-cuenta', 500, ahora, 0);
    expect(c1.bytesDia['mi-cuenta']).toBe(500);
    expect(c1.bytesMes['mi-cuenta']).toBe(500);

    const c2 = sumarBytes(c1, 'mi-cuenta', 300, ahora, 0);
    expect(c2.bytesDia['mi-cuenta']).toBe(800);
  });

  it('ignora bytes inválidos (negativos, NaN, infinitos)', () => {
    const ahora = Date.UTC(2026, 5, 15, 12, 0, 0);
    const vacios = contadoresVacios(ahora, 0);
    let c = sumarBytes(vacios, 'publico', 1000, ahora, 0);
    c = sumarBytes(c, 'publico', -500, ahora, 0);
    c = sumarBytes(c, 'publico', NaN, ahora, 0);
    c = sumarBytes(c, 'publico', Infinity, ahora, 0);
    expect(c.bytesDia['publico']).toBe(1000);
  });

  it('no muta la entrada', () => {
    const ahora = Date.UTC(2026, 5, 15, 12, 0, 0);
    const vacios = contadoresVacios(ahora, 0);
    const c1 = sumarBytes(vacios, 'entidad', 100, ahora, 0);
    expect(vacios.bytesDia['entidad']).toBe(0);
    expect(c1).not.toBe(vacios);
  });

  it('cruce de medianoche con desfase +120 y -300', () => {
    // 2026-06-15T23:30:00Z -> en UTC+120 (+2h) es 2026-06-16T01:30:00
    const ahoraMedianoche = Date.UTC(2026, 5, 15, 23, 30, 0);
    const c = contadoresVacios(ahoraMedianoche, 120);
    expect(c.dia).toBe('2026-06-16');

    // Cambiar día con un desfase de -300
    const ahoraAyer = Date.UTC(2026, 5, 15, 2, 0, 0);
    const cOld = contadoresVacios(ahoraAyer, -300); // 2026-06-14 21:00
    const ahoraHoy = Date.UTC(2026, 5, 16, 6, 0, 0); // 2026-06-16 01:00
    const cNew = sumarBytes(cOld, 'mi-cuenta', 1000, ahoraHoy, -300);
    expect(cNew.dia).toBe('2026-06-16');
    expect(cNew.bytesDia['mi-cuenta']).toBe(1000);
  });

  it('cambio de mes reinicia el día y el mes', () => {
    const ahoraJunio = Date.UTC(2026, 5, 30, 12, 0, 0);
    const cJunio = contadoresVacios(ahoraJunio, 0);
    const cFilled = sumarBytes(cJunio, 'mi-cuenta', 5000, ahoraJunio, 0);
    expect(cFilled.mes).toBe('2026-06');

    const ahoraJulio = Date.UTC(2026, 6, 1, 12, 0, 0);
    const cJulio = sumarBytes(cFilled, 'mi-cuenta', 100, ahoraJulio, 0);
    expect(cJulio.mes).toBe('2026-07');
    expect(cJulio.bytesMes['mi-cuenta']).toBe(100);
    expect(cJulio.bytesDia['mi-cuenta']).toBe(100);
  });

  it('usadoHoyMb("otros") suma entidad y público y convierte a MB', () => {
    const ahora = Date.UTC(2026, 5, 15, 12, 0, 0);
    let c = contadoresVacios(ahora, 0);
    c = sumarBytes(c, 'entidad', 2_500_000, ahora, 0); // 2.5 MB
    c = sumarBytes(c, 'publico', 1_500_000, ahora, 0);  // 1.5 MB
    c = sumarBytes(c, 'mi-cuenta', 10_000_000, ahora, 0); // 10 MB (no cuenta para "otros")

    expect(usadoHoyMb(c, 'otros', ahora, 0)).toBe(4.0);
    expect(usadoHoyMb(c, 'entidad', ahora, 0)).toBe(2.5);
  });

  it('usadoHoyMb devuelve 0 si el día de c ya no es hoy', () => {
    const ahoraAyer = Date.UTC(2026, 5, 15, 12, 0, 0);
    const c = contadoresVacios(ahoraAyer, 0);
    const ahoraHoy = Date.UTC(2026, 5, 16, 12, 0, 0);
    expect(usadoHoyMb(c, 'mi-cuenta', ahoraHoy, 0)).toBe(0);
  });
});
