import { describe, it, expect } from 'vitest';
import { clasificarPrincipal, estadoReplica, puedeBorrar } from '../almacen-replica';

describe('clasificarPrincipal', () => {
  it('identifica un archivo como principal por su nombre', () => {
    const resultado = clasificarPrincipal('main-commit.txt');
    expect(resultado).toBe(true);
  });

  it('identifica una carpeta como principal', () => {
    const resultado = clasificarPrincipal('starseed_memory_root');
    expect(resultado).toBe(true);
  });

  it('no clasifica como principal un archivo temporal', () => {
    const resultado = clasificarPrincipal('.next/cache/file.tmp');
    expect(resultado).toBe(false);
  });
});

describe('estadoReplica', () => {
  it('devuelve verificado con dos medios distintos', () => {
    const resultado = estadoReplica({
      copias: [
        { medio: 'interno', verificado: true },
        { medio: 'externo', verificado: true }
      ]
    });
    expect(resultado).toBe('verificado');
  });

  it('devuelve pendiente con un solo medio', () => {
    const resultado = estadoReplica({
      copias: [
        { medio: 'interno', verificado: true }
      ]
    });
    expect(resultado).toBe('pendiente');
  });

  it('devuelve pendiente con copia no verificada', () => {
    const resultado = estadoReplica({
      copias: [
        { medio: 'interno', verificado: true },
        { medio: 'externo', verificado: false }
      ]
    });
    expect(resultado).toBe('pendiente');
  });

  it('devuelve fijado cuando el archivo está marcado como fijo', () => {
    const resultado = estadoReplica({
      copias: [
        { medio: 'interno', verificado: true },
        { medio: 'externo', verificado: true }
      ],
      fijado: true
    });
    expect(resultado).toBe('fijado');
  });
});

describe('puedeBorrar', () => {
  it('devuelve false si el elemento es principal', () => {
    const resultado = puedeBorrar({
      esPrincipal: true,
      fijado: false,
      replicaVerificada: true
    });
    expect(resultado.puedeBorrar).toBe(false);
    expect(resultado.motivo).toBe('es-principal');
  });

  it('devuelve false si el elemento está fijado', () => {
    const resultado = puedeBorrar({
      esPrincipal: false,
      fijado: true,
      replicaVerificada: true
    });
    expect(resultado.puedeBorrar).toBe(false);
    expect(resultado.motivo).toBe('fijado');
  });

  it('devuelve false si la réplica no está verificada', () => {
    const resultado = puedeBorrar({
      esPrincipal: false,
      fijado: false,
      replicaVerificada: false
    });
    expect(resultado.puedeBorrar).toBe(false);
    expect(resultado.motivo).toBe('replica-no-verificada');
  });

  it('devuelve true solo con copia verificada', () => {
    const resultado = puedeBorrar({
      esPrincipal: false,
      fijado: false,
      replicaVerificada: true
    });
    expect(resultado.puedeBorrar).toBe(true);
    expect(resultado.motivo).toBe(null);
  });
});