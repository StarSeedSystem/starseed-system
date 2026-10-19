import { describe, it, expect } from 'vitest';
import { contenedoresPara, CONTENEDORES_DISPONIBLES } from '../contenedores';

describe('contenedoresPara', () => {
  it('devuelve todos los contenedores cuando privado es false o no se especifica', () => {
    // Cuando privado es false
    const resultadoFalse = contenedoresPara(undefined, { privado: false });
    expect(resultadoFalse).toHaveLength(CONTENEDORES_DISPONIBLES.length);
    expect(resultadoFalse).toEqual(CONTENEDORES_DISPONIBLES);

    // Cuando privado no se especifica (undefined)
    const resultadoUndefined = contenedoresPara(undefined, {});
    expect(resultadoUndefined).toHaveLength(CONTENEDORES_DISPONIBLES.length);
    expect(resultadoUndefined).toEqual(CONTENEDORES_DISPONIBLES);
  });

  it('devuelve solo los contenedores aptos para privado cuando privado es true', () => {
    const resultado = contenedoresPara(undefined, { privado: true });
    const esperados = CONTENEDORES_DISPONIBLES.filter(
      (c) => c.aptoPrivado === true
    );
    expect(resultado).toHaveLength(esperados.length);
    expect(resultado).toEqual(esperados);
  });

  it('no modifica el arreglo original de contenedores disponibles', () => {
    const original = [...CONTENEDORES_DISPONIBLES];
    contenedoresPara(undefined, { privado: true });
    expect(CONTENEDORES_DISPONIBLES).toEqual(original);
  });
});