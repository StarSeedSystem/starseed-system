// src/lib/astraura/laya/__tests__/libreta-vecinos.test.ts
import { describe, it, expect } from 'vitest';
import { huellaPalabras, similitud, vecinos, votar, EjemploLibreta } from '../../libreta-vecinos';

describe('huellaPalabras', () => {
  it('debe normalizar y dividir texto en palabras', () => {
    const huella = huellaPalabras('Hola Mundo! 123; áÉíóúñ');
    expect(Array.from(huella)).toEqual([ 'hola', 'mundo', 'á', 'é', 'í', 'ó', 'ú', 'ñ' ]);
  });
});

describe('similitud', () => {
  it('devuelve 1 para huellas idénticas', () => {
    const a = huellaPalabras('uno dos tres');
    const b = huellaPalabras('uno dos tres');
    expect(similitud(a, b)).toBeCloseTo(1);
  });
  it('devuelve 0 cuando no hay palabras comunes', () => {
    const a = huellaPalabras('uno dos');
    const b = huellaPalabras('tres cuatro');
    expect(similitud(a, b)).toBeCloseTo(0);
  });
});

describe('vecinos', () => {
  const ejemplos: EjemploLibreta[] = [
    { punto: '0', ambito: 'test', estado: 'ok', respuesta: 'yes', desenlaceOk: true },
    { punto: '1', ambito: 'test', estado: 'ok', respuesta: 'no', desenlaceOk: true },
    { punto: '2', ambito: 'test', estado: 'bad', respuesta: 'yes', desenlaceOk: true },
    { punto: '3', ambito: 'other', estado: 'ok', respuesta: 'yes', desenlaceOk: true },
    { punto: '4', ambito: 'test', estado: 'ok', respuesta: 'yes', desenlaceOk: null },
  ];
  it('filtra por ambito, estado y desenlaceOk', () => {
    const v = vecinos(ejemplos, 'ok', 10, 'test');
    expect(v.length).toBe(2);
    expect(v.map((e) => e.punto)).toEqual(['0', '1']);
  });
  it('respecta el límite k', () => {
    const v = vecinos(ejemplos, 'ok', 1, 'test');
    expect(v.length).toBe(1);
  });
});

describe('votar', () => {
  const ejemploConRespuesta = {
    punto: '0', ambito: 'a', estado: 's', respuesta: 'A', desenlaceOk: true,
  };
  it('retorna null si menos de 5 vecinos', () => {
    const v = votar([ejemploConRespuesta, ejemploConRespuesta]);
    expect(v).toBeNull();
  });
  it('retorna null si apoyo < 0.6', () => {
    const vecinosC = Array(5).fill(ejemploConRespuesta).map((e, i) => ({ ...e, respuesta: i % 2 === 0 ? 'A' : 'B' }));
    const res = votar(vecinosC);
    expect(res).toBeNull();
  });
  it('retorna respuesta con apoyo >= 0.6', () => {
    const vecinosC = Array(5).fill(ejemploConRespuesta).map((e, i) => i < 3 ? e : { ...e, respuesta: 'B' });
    const res = votar(vecinosC);
    expect(res).not.toBeNull();
    expect(res?.respuesta).toBe('A');
    expect(res?.apoyo).toBeCloseTo(0.6);
  });
});
