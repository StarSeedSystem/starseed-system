import { describe, it, expect } from 'vitest';
import { leerContadores, registrarBytes, contadoresVacios, type Contadores } from '../almacen-contadores';
import type { Audiencia } from '../tipos';

const CLAVE = 'starseed.malla.internet.contadores.v1';

function crearAlmacen(datos: Record<string, string> = {}) {
  return {
    getItem: (clave: string) => datos[clave] ?? null,
    setItem: (clave: string, valor: string) => { datos[clave] = valor; },
  };
}

const ahora = 1700000000000;
const desfaseMin = -new Date().getTimezoneOffset();

describe('leerContadores', () => {
  it('devuelve contadoresVacios cuando no hay dato guardado', () => {
    const almacen = crearAlmacen({});
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.dia).toBeDefined();
    expect(resultado.mes).toBeDefined();
    expect(resultado.bytesDia['mi-cuenta']).toBe(0);
  });

  it('devuelve contadoresVacios cuando el JSON está roto', () => {
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => 'no-es-json',
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.dia).toBeDefined();
  });

  it('lee contadores guardados correctamente', () => {
    const hoy = '2023-11-14';
    const mes = '2023-11';
    const contadores: Contadores = {
      dia: hoy,
      mes: mes,
      bytesDia: { 'mi-cuenta': 100_000_000, entidad: 50_000_000, publico: 25_000_000 },
      bytesMes: { 'mi-cuenta': 500_000_000, entidad: 250_000_000, publico: 125_000_000 },
    };
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => JSON.stringify(contadores),
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado).toEqual(contadores);
  });
});

describe('registrarBytes', () => {
  it('lee, suma bytes y guarda, devuelve contadores calculados', () => {
    const hoy = '2023-11-14';
    const mes = '2023-11';
    const guardados: Contadores = {
      dia: hoy,
      mes: mes,
      bytesDia: { 'mi-cuenta': 100_000_000, entidad: 0, publico: 0 },
      bytesMes: { 'mi-cuenta': 500_000_000, entidad: 0, publico: 0 },
    };
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => JSON.stringify(guardados),
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const auditoria: Audiencia = 'mi-cuenta';
    const bytes = 50_000_000;
    const resultado = registrarBytes(almacen, auditoria, bytes, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(150_000_000);
    expect(resultado.bytesMes['mi-cuenta']).toBe(550_000_000);
    expect(JSON.parse(datos[CLAVE]).bytesDia['mi-cuenta']).toBe(150_000_000);
  });

  it('suma a todas las audiencias cuando audiencia es "otros"', () => {
    const contadores: Contadores = {
      dia: '2023-11-14',
      mes: '2023-11',
      bytesDia: { 'mi-cuenta': 100, entidad: 100, publico: 100 },
      bytesMes: { 'mi-cuenta': 500, entidad: 500, publico: 500 },
    };
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => JSON.stringify(contadores),
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const bytes = 300;
    const resultado = registrarBytes(almacen, 'otros', bytes, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(400);
    expect(resultado.bytesDia['entidad']).toBe(400);
    expect(resultado.bytesDia['publico']).toBe(400);
  });

  it('si falta el almacén, devuelve contadores calculados sin lanzar error', () => {
    const almacen = {
      getItem: () => { throw new Error('almacen fallido'); },
      setItem: () => { throw new Error('almacen fallido'); },
    };
    const bytes = 100_000;
    const resultado = registrarBytes(almacen, 'mi-cuenta', bytes, ahora, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(100_000);
    expect(resultado.bytesMes['mi-cuenta']).toBe(100_000);
  });
});

describe('cambio de día', () => {
  it('si el día guardado ya pasó, reinicia el día pero mantiene el mes', () => {
    const ahoraNuevo = ahora + 87_000_000;
    const diaAnterior = '2023-11-14';
    const mes = '2023-11';
    const guardados: Contadores = {
      dia: diaAnterior,
      mes: mes,
      bytesDia: { 'mi-cuenta': 500_000_000, entidad: 0, publico: 0 },
      bytesMes: { 'mi-cuenta': 2_000_000_000, entidad: 0, publico: 0 },
    };
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => JSON.stringify(guardados),
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const resultado = registrarBytes(almacen, 'mi-cuenta', 100, ahoraNuevo, desfaseMin);
    expect(resultado.bytesDia['mi-cuenta']).toBe(100);
    expect(resultado.bytesMes['mi-cuenta']).toBe(2_000_000_000 + 100);
    expect(resultado.dia).not.toBe(diaAnterior);
  });
});

describe('cambio de mes', () => {
  it('si el mes guardado ya pasó, reinicia día y mes', () => {
    const ahoraMayo = 1715700000000;
    const guardados: Contadores = {
      dia: '2023-11-14',
      mes: '2023-11',
      bytesDia: { 'mi-cuenta': 500_000_000, entidad: 0, publico: 0 },
      bytesMes: { 'mi-cuenta': 2_000_000_000, entidad: 0, publico: 0 },
    };
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => JSON.stringify(guardados),
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const resultado = registrarBytes(almacen, 'mi-cuenta', 100, ahoraMayo, desfaseMin);
    expect(resultado.bytesMes['mi-cuenta']).toBe(100);
    expect(resultado.bytesDia['mi-cuenta']).toBe(100);
  });
});

describe('JSON corrupto', () => {
  it('si el JSON está corrupto, usa contadoresVacios como base', () => {
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => null,
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado).toEqual(contadoresVacios(ahora, desfaseMin));
  });

  it('devuelve contadoresVacios cuando el JSON falta campos requeridos', () => {
    const datos: Record<string, string> = {};
    const almacen = {
      getItem: () => JSON.stringify({ dia: '2023-11-14' }),
      setItem: (clave: string, valor: string) => { datos[clave] = valor; },
    };
    const resultado = leerContadores(almacen, ahora, desfaseMin);
    expect(resultado.dia).toBeDefined();
    expect(resultado.bytesDia).toBeDefined();
  });
});