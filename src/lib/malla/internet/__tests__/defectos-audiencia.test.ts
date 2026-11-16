import { describe, it, expect } from 'vitest';
import { ajustesPorDefecto, audienciaDe } from '../defectos-audiencia';

describe('ajustesPorDefecto', () => {
  it('devuelve un objeto nuevo cada vez', () => {
    const primero = ajustesPorDefecto();
    const segundo = ajustesPorDefecto();
    expect(segundo).not.toBe(primero);
  });

  it('tiene la estructura correcta de AjustesInternet', () => {
    const resultado = ajustesPorDefecto();
    expect(resultado.version).toBe(1);
    expect(resultado.compartirConOtros).toBe(false);
    expect(resultado.banco.activo).toBe(false);
    expect(resultado.banco.modo).toBe('diario');
    expect(resultado.banco.diarioMb).toBe(1024);
    expect(resultado.banco.ventanas).toEqual([]);
    expect(resultado.declaraLimitada).toBeNull();
    expect(resultado.compartirMedidas).toBe(false);
    expect(resultado.porAudiencia['mi-cuenta'].mesh).toBe(true);
    expect(resultado.porAudiencia['mi-cuenta'].limiteMeshMb).toBeNull();
    expect(resultado.porAudiencia.entidad.mesh).toBe(false);
    expect(resultado.porAudiencia.entidad.limiteMeshMb).toBeNull();
    expect(resultado.porAudiencia.publico.mesh).toBe(false);
    expect(resultado.porAudiencia.publico.limiteMeshMb).toBeNull();
  });
});

describe('audienciaDe', () => {
  it('devuelve "mi-cuenta" cuando ambos tienen la misma cuentaId no nula', () => {
    const resultado = audienciaDe({ cuentaId: 'user123', entidades: ['e1'] }, { cuentaId: 'user123', entidades: ['e2'] });
    expect(resultado).toBe('mi-cuenta');
  });

  it('devuelve "publico" cuando cuentaId es null en ambos', () => {
    const resultado = audienciaDe({ cuentaId: null, entidades: ['e1'] }, { cuentaId: null, entidades: ['e2'] });
    expect(resultado).toBe('publico');
  });

  it('devuelve "publico" cuando cuentaId son diferentes', () => {
    const resultado = audienciaDe({ cuentaId: 'user1', entidades: ['e1'] }, { cuentaId: 'user2', entidades: ['e2'] });
    expect(resultado).toBe('publico');
  });

  it('devuelve "entidad" cuando comparten al menos una entidad', () => {
    const resultado = audienciaDe({ cuentaId: 'user1', entidades: ['e1', 'e2'] }, { cuentaId: 'user2', entidades: ['e2', 'e3'] });
    expect(resultado).toBe('entidad');
  });

  it('devuelve "publico" cuando no hay entidad compartida y cuentas son diferentes', () => {
    const resultado = audienciaDe({ cuentaId: 'user1', entidades: ['e1'] }, { cuentaId: 'user2', entidades: ['e2'] });
    expect(resultado).toBe('publico');
  });

  it('devuelve "publico" para datos desconocidos', () => {
    const resultado = audienciaDe({ cuentaId: undefined as any, entidades: [] }, { cuentaId: undefined as any, entidades: [] });
    expect(resultado).toBe('publico');
  });
});