import { describe, it, expect } from 'vitest';
import { destinosDe, DestinoAlmacen } from '../destinos-almacen';
import { Dato, ClaseDato } from '../tipos';

const base: Dato = { id: 'd1', clase: 'privado', tipo: 'm', bytes: 1, prioridad: 0, origen: 'o', destino: null };
const disponibles: DestinoAlmacen[] = [
  { id: 'a', tipo: 'aparato', motor: 'local', publico: false },
  { id: 'b', tipo: 'cerebro', motor: 'gdrive', publico: true },
  { id: 'c', tipo: 'biblioteca', motor: 'dropbox', publico: false },
  { id: 'd', tipo: 'servidor', motor: 'webdav', publico: true },
  { id: 'e', tipo: 'aparato', motor: 'usb', publico: false }
];
const motoresReales = ['local', 'gdrive', 'usb'];

describe('destinosDe', () => {
  it('usa elegidosPorDato cuando se proporciona', () => {
    const dato = { ...base, clase: 'publico' };
    const res = destinosDe(dato, {
      politicaContexto: ['b', 'c'],
      elegidosPorDato: ['c', 'a'],
      disponibles,
      motoresReales: [...motoresReales, 'dropbox']
    });
    expect(res.guardar.map(d => d.id)).toEqual(['c', 'a']);
  });

  it('usa politicaContexto cuando no se proporciona elegidosPorDato', () => {
    const dato = { ...base, clase: 'publico' };
    const res = destinosDe(dato, {
      politicaContexto: ['b', 'c'],
      disponibles,
      motoresReales: [...motoresReales, 'dropbox']
    });
    expect(res.guardar.map(d => d.id)).toEqual(['b', 'c']);
  });

  it('descarta públicos para datos privados e internos', () => {
    const resPrivado = destinosDe(base, { politicaContexto: ['b', 'd'], disponibles, motoresReales });
    expect(resPrivado.guardar.length).toBe(0);
    expect(resPrivado.descartados).toEqual([
      { id: 'b', motivo: 'destino público no permitido para dato privado/interno' },
      { id: 'd', motivo: 'destino público no permitido para dato privado/interno' }
    ]);
    
    const datoInterno = { ...base, clase: 'interno' };
    const resInterno = destinosDe(datoInterno, { politicaContexto: ['b'], disponibles, motoresReales });
    expect(resInterno.guardar.length).toBe(0);
    expect(resInterno.descartados).toEqual([
      { id: 'b', motivo: 'destino público no permitido para dato privado/interno' }
    ]);
  });

  it('permite públicos para datos públicos', () => {
    const datoPublico = { ...base, clase: 'publico' };
    const res = destinosDe(datoPublico, {
      politicaContexto: ['b', 'd'],
      disponibles,
      motoresReales: ['gdrive', 'webdav']
    });
    expect(res.guardar.map(d => d.id)).toEqual(['b', 'd']);
    expect(res.descartados.length).toBe(0);
  });

  it('descarta destinos que no existen', () => {
    const res = destinosDe(base, {
      politicaContexto: ['a', 'z'],
      disponibles,
      motoresReales
    });
    expect(res.guardar.map(d => d.id)).toEqual(['a']);
    expect(res.descartados).toEqual([{ id: 'z', motivo: 'destino no disponible' }]);
  });

  it('descarta destinos con motor no implementado', () => {
    const res = destinosDe(base, {
      politicaContexto: ['a', 'c'],
      disponibles,
      motoresReales
    });
    expect(res.guardar.map(d => d.id)).toEqual(['a']);
    expect(res.descartados).toEqual([{ id: 'c', motivo: 'aún sin motor de guardado' }]);
  });

  it('aparatoto siempre válido (aplica otras reglas)', () => {
    const datoPrivado = { ...base, clase: 'privado' };
    const res = destinosDe(datoPrivado, {
      politicaContexto: ['a', 'e'],
      disponibles,
      motoresReales
    });
    expect(res.guardar.map(d => d.id)).toEqual(['a', 'e']);
    expect(res.descartados.length).toBe(0);
  });

  it('respeta el orden de los destinos solicitados', () => {
    const dato = { ...base, clase: 'publico' };
    const res = destinosDe(dato, {
      politicaContexto: ['c', 'a', 'd'],
      disponibles,
      motoresReales: ['dropbox', 'local', 'webdav']
    });
    expect(res.guardar.map(d => d.id)).toEqual(['c', 'a', 'd']);
  });

  it('combina múltiples razones de descarte', () => {
    const datoPrivado = { ...base, clase: 'privado' };
    const res = destinosDe(datoPrivado, {
      politicaContexto: ['b', 'c', 'z'],
      disponibles,
      motoresReales
    });
    expect(res.guardar.length).toBe(0);
    expect(res.descartados).toEqual([
      { id: 'b', motivo: 'destino público no permitido para dato privado/interno' },
      { id: 'c', motivo: 'aún sin motor de guardado' },
      { id: 'z', motivo: 'destino no disponible' }
    ]);
  });
});