import { describe, it, expect } from 'vitest';
import { leerAjustes, guardarAjustes, AJUSTES_APAGADOS } from '../almacen-ajustes';
import type { AjustesInternet } from '../tipos';

const CLAVE = 'starseed.malla.internet.v1';

function crearAlmacen(datos: Record<string, string> = {}) {
  return {
    getItem: (clave: string) => datos[clave] ?? null,
    setItem: (clave: string, valor: string) => { datos[clave] = valor; },
  };
}

function ajustesValidos(): AjustesInternet {
  return {
    version: 1,
    compartirConOtros: true,
    banco: { activo: true, modo: 'diario', diarioMb: 500, ventanas: [] },
    porAudiencia: {
      'mi-cuenta': { mesh: true, limiteMeshMb: 100 },
      entidad: { mesh: false, limiteMeshMb: null },
      publico: { mesh: false, limiteMeshMb: null },
    },
    declaraLimitada: true,
    compartirMedidas: true,
  };
}

describe('leerAjustes', () => {
  it('devuelve defectos cuando no hay dato guardado', () => {
    const almacen = crearAlmacen({});
    const defectos = ajustesValidos();
    const resultado = leerAjustes(almacen, defectos);
    expect(resultado).toEqual(defectos);
  });

  it('devuelve defectos cuando el JSON está roto', () => {
    const almacen = crearAlmacen({ [CLAVE]: 'no-es-json' });
    const defectos = ajustesValidos();
    const resultado = leerAjustes(almacen, defectos);
    expect(resultado).toEqual(defectos);
  });

  it('devuelve defectos cuando la versión es distinta', () => {
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify({ ...ajustesValidos(), version: 2 }) });
    const defectos = ajustesValidos();
    const resultado = leerAjustes(almacen, defectos);
    expect(resultado).toEqual(defectos);
  });

  it('reemplaza campo inválido por el defecto (número negativo)', () => {
    const datos = ajustesValidos();
    datos.banco.diarioMb = -10;
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(datos) });
    const defectos = ajustesValidos();
    const resultado = leerAjustes(almacen, defectos);
    expect(resultado.banco.diarioMb).toBe(defectos.banco.diarioMb);
  });

  it('reemplaza campo inválido por el defecto (hora malformada)', () => {
    const datos = ajustesValidos();
    datos.banco.ventanas = [{ desde: '2024-01-01', hasta: '2024-12-31', horaDesde: '25:00', horaHasta: '23:00', limiteMb: 100 }];
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(datos) });
    const defectos = ajustesValidos();
    const resultado = leerAjustes(almacen, defectos);
    expect(resultado.banco.ventanas).toHaveLength(1);
    expect(resultado.banco.ventanas[0].horaDesde).toBe('00:00');
    expect(resultado.banco.ventanas[0].horaHasta).toBe('23:00');
    expect(resultado.banco.ventanas[0].limiteMb).toBe(100);
  });

  it('completa campos faltantes con defectos', () => {
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify({ version: 1, compartirConOtros: true }) });
    const defectos = ajustesValidos();
    const resultado = leerAjustes(almacen, defectos);
    expect(resultado.compartirConOtros).toBe(true);
    expect(resultado.banco.activo).toBe(defectos.banco.activo);
    expect(resultado.declaraLimitada).toBe(defectos.declaraLimitada);
  });

  it('trunca ventanas a 12 cuando hay 13 o más', () => {
    const datos = ajustesValidos();
    datos.banco.ventanas = Array.from({ length: 13 }, (_, i) => ({
      desde: '2024-01-01', hasta: '2024-12-31', horaDesde: '00:00', horaHasta: '23:59', limiteMb: 100 + i
    }));
    const almacen = crearAlmacen({ [CLAVE]: JSON.stringify(datos) });
    const defectos = ajustesValidos();
    const resultado = leerAjustes(almacen, defectos);
    expect(resultado.banco.ventanas.length).toBe(12);
  });

  it('ida y vuelta: guarda y lee lo mismo', () => {
    const datos: Record<string, string> = {};
    const almacen = crearAlmacen(datos);
    const original = ajustesValidos();
    const ok = guardarAjustes(almacen, original);
    expect(ok).toBe(true);
    const leido = leerAjustes(almacen, ajustesValidos());
    expect(leido).toEqual(original);
  });

  it('devuelve false si el almacén lanza al guardar', () => {
    const almacen = {
      getItem: () => null,
      setItem: () => { throw new Error('fallo'); },
    };
    const ok = guardarAjustes(almacen, ajustesValidos());
    expect(ok).toBe(false);
  });
});

describe('AJUSTES_APAGADOS', () => {
  it('tiene todo apagado', () => {
    expect(AJUSTES_APAGADOS.compartirConOtros).toBe(false);
    expect(AJUSTES_APAGADOS.banco.activo).toBe(false);
    expect(AJUSTES_APAGADOS.banco.modo).toBe('diario');
    expect(AJUSTES_APAGADOS.banco.diarioMb).toBe(0);
    expect(AJUSTES_APAGADOS.banco.ventanas).toEqual([]);
    expect(AJUSTES_APAGADOS.porAudiencia['mi-cuenta'].mesh).toBe(false);
    expect(AJUSTES_APAGADOS.porAudiencia.entidad.mesh).toBe(false);
    expect(AJUSTES_APAGADOS.porAudiencia.publico.mesh).toBe(false);
    expect(AJUSTES_APAGADOS.declaraLimitada).toBeNull();
    expect(AJUSTES_APAGADOS.compartirMedidas).toBe(false);
  });
});