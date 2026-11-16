import { describe, it, expect } from 'vitest';
import { EjemploLibreta, vecinos, votar } from '../libreta-vecinos';

function setupLibreta(escribe: EjemploLibreta[]): EjemploLibreta[] {
  return escribe;
}

describe('vecinos', () => {
  it('no incluye ejemplos de otros ámbitos', () => {
    const libreta = setupLibreta([
      {
        punto: 1,
        ambito: 'test',
        estado: 'activo',
        respuesta: 'hola mundo',
        desenlaceOk: true,
      },
      {
        punto: 2,
        ambito: 'otro',
        estado: 'activo',
        respuesta: 'hola mundo',
        desenlaceOk: true,
      },
    ]);
    const vecinosResultado = vecinos(libreta, 'activo', 3, 'test');
    expect(vecinosResultado).toHaveLength(0);
  });

  it('no incluye ejemplos sin desenlace', () => {
    const libreta = setupLibreta([
      {
        punto: 1,
        ambito: 'test',
        estado: 'activo',
        respuesta: 'uno',
        desenlaceOk: null,
      },
      {
        punto: 2,
        ambito: 'test',
        estado: 'activo',
        respuesta: 'dos',
        desenlaceOk: true,
      },
    ]);
    const vecinosResultado = vecinos(libreta, 'activo', 3, 'test');
    expect(vecinosResultado).toHaveLength(0);
  });

  it('devolvE null si menos de 5 vecinos', () => {
    const libreta = setupLibreta([
      {
        punto: 0,
        ambito: 'test',
        estado: 'operativo',
        respuesta: 'simple',
        desenlaceOk: true,
      },
      {
        punto: 1,
        ambito: 'test',
        estado: 'operativo',
        respuesta: 'simple one',
        desenlaceOk: true,
      },
      {
        punto: 2,
        ambito: 'test',
        estado: 'operativo',
        respuesta: 'simple two',
        desenlaceOk: true,
      },
      {
        punto: 3,
        ambito: 'test',
        estado: 'operativo',
        respuesta: 'simple three',
        desenlaceOk: true,
      },
    ]);
    const v = votar(vecinos(libreta, 'operativo', 10, 'test'));
    expect(v).toBeNull();
  });

  it('mantiene orden estable cuando hay empate', () => {
    const libreta = setupLibreta([
      {
        punto: 0,
        ambito: 'test',
        estado: 'x',
        respuesta: 'aaaa',
        desenlaceOk: true,
      },
      {
        punto: 1,
        ambito: 'test',
        estado: 'x',
        respuesta: 'bbbb',
        desenlaceOk: true,
      },
      {
        punto: 2,
        ambito: 'test',
        estado: 'x',
        respuesta: 'cccc',
        desenlaceOk: true,
      },
      {
        punto: 3,
        ambito: 'test',
        estado: 'x',
        respuesta: 'dddd',
        desenlaceOk: true,
      },
      {
        punto: 4,
        ambito: 'test',
        estado: 'x',
        respuesta: 'eeee',
        desenlaceOk: true,
      },
      {
        punto: 5,
        ambito: 'test',
        estado: 'x',
        respuesta: 'ffff',
        desenlaceOk: true,
      },
    ]);
    const v = vecinos(libreta, 'x', 3, 'test');
    const respuestas = v.map((e) => e.respuesta);
    expect(respuestas).toEqual([ 'bbbb', 'cccc', 'dddd' ]);
  });
});
