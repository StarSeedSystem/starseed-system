import { describe, it, expect } from 'vitest';
import { FACETAS_TEXTO, indiceDeFacetas, filtrarPorFacetas, agruparFacetas, anclasPorFaceta, taxonomiasDe,
  crearFaceta, renombrarFaceta, fusionarFacetas, ladosFormato, type FacetaTexto } from '../facetas';
import { type Grafo4D, type Nodo, crearGrafo, anadirNodo, anadirArista } from '../modelo';

function nodo(overrides: Partial<Nodo> = {}): Nodo {
  return { id: 'n1', titulo: 'Nodo de prueba', tipo: 'archivo', formato: 'texto', ref: '/prueba', alcance: 'publico',
    dueno: 'maggasukha', capas: ['educativo'], t_creado: 1000, t_actividad: 1000, peso: 1, etiquetas: [], ...overrides };
}
function grafoCon(nodos: Nodo[]): Grafo4D {
  const grafo = crearGrafo();
  nodos.forEach((n) => anadirNodo(grafo, n));
  return grafo;
}
describe('índice de facetas', () => {
  it('cuenta temas, etiquetas y estados sin guardar referencias', () => {
    const grafo = grafoCon([
      nodo({ id: 'a', tema: 'diseño', categoria: 'teoría', etiquetas: ['armonía', 'φ'] }),
      nodo({ id: 'b', tema: 'diseño', etiquetas: ['armonía'], peso: 0.2 })]);
    const indice = indiceDeFacetas(grafo);
    const cuenta = (faceta: FacetaTexto, valor: string) => indice.porFaceta.get(faceta)?.get(valor);
    expect([indice.total, cuenta('tema', 'diseño'), cuenta('etiquetas', 'armonía'),
      cuenta('estado', 'activo'), cuenta('estado', 'inactivo')]).toEqual([2, 2, 2, 1, 1]);
    expect(JSON.stringify(indice)).not.toContain('/prueba');
  });
  it('cubre todas las facetas declaradas', () => {
    expect(Array.from(indiceDeFacetas(grafoCon([nodo()])).porFaceta.keys())).toEqual([...FACETAS_TEXTO]);
  });
});
describe('filtrar por varias facetas', () => {
  it('junta las facetas con Y y los valores de una con O', () => {
    const grafo = grafoCon([
      nodo({ id: 'a', tema: 'diseño', formato: 'texto', categoria: 'teoría' }),
      nodo({ id: 'b', tema: 'diseño', formato: 'video', categoria: 'práctica' }),
      nodo({ id: 'c', tema: 'ciencia', formato: 'texto' })]);
    const filtrado = filtrarPorFacetas(grafo, { tema: ['diseño'], formato: ['texto', 'video'] });
    expect(Array.from(filtrado.nodos.keys())).toEqual(['a', 'b']);
  });
  it('devuelve el grafo intacto si no hay selección', () => {
    const grafo = grafoCon([nodo()]);
    expect(filtrarPorFacetas(grafo, {})).toBe(grafo);
    expect(filtrarPorFacetas(grafo, { tema: [] })).toBe(grafo);
  });
  it('recorta aristas y ramas a los nodos visibles', () => {
    const grafo = grafoCon([nodo({ id: 'a', tema: 'diseño' }),
      nodo({ id: 'b', tema: 'diseño' }), nodo({ id: 'c', tema: 'ciencia' })]);
    anadirArista(grafo, { de: 'a', a: 'b', tipo: 'contiene', t: 1, intensidad: 1 });
    anadirArista(grafo, { de: 'b', a: 'c', tipo: 'contiene', t: 1, intensidad: 1 });
    grafo.ramas.set('a', ['b', 'c']);
    const filtrado = filtrarPorFacetas(grafo, { tema: ['diseño'] });
    expect([filtrado.aristas.length, filtrado.ramas.get('a')]).toEqual([1, ['b']]);
  });
});
describe('agrupar por faceta', () => {
  it('usa agrupar.ts para dueño, cerebro y comunidad', () => {
    const grafo = grafoCon([
      nodo({ id: 'a', dueno: 'u1', capas: ['cerebro-1', 'comunidad-luna'] }),
      nodo({ id: 'b', dueno: 'u1', capas: ['cerebro-1'] }),
      nodo({ id: 'c', dueno: 'u2', capas: ['cerebro-2', 'comunidad-luna'] })]);
    const grupos = [agruparFacetas(grafo, 'dueno').get('u1'), agruparFacetas(grafo, 'cerebro').get('cerebro-1'), agruparFacetas(grafo, 'comunidad').get('luna')];
    expect(grupos).toEqual([['a', 'b'], ['a', 'b'], ['a', 'c']]);
  });
  it('agrupa temas y etiquetas del modelo', () => {
    const grafo = grafoCon([
      nodo({ id: 'a', tema: 'diseño', etiquetas: ['armonía', 'φ'] }),
      nodo({ id: 'b', tema: 'diseño', etiquetas: ['armonía'] })]);
    expect([agruparFacetas(grafo, 'tema').get('diseño'),
      agruparFacetas(grafo, 'etiquetas').get('φ')]).toEqual([['a', 'b'], ['a']]);
  });
});
describe('anclas de disposición', () => {
  it('da a cada tema una región determinista', () => {
    const grafo = grafoCon([nodo({ id: 'a', tema: 'diseño' }), nodo({ id: 'b', tema: 'ciencia' })]);
    const anclas = anclasPorFaceta(grafo, 'tema');
    expect(anclas.get('diseño')).toEqual(anclasPorFaceta(grafo, 'tema').get('diseño'));
    expect(anclas.get('diseño')?.[1]).toBe(0);
    expect(anclas.get('diseño')?.[0]).not.toBe(anclas.get('ciencia')?.[0]);
  });
  it('sitúa las categorías en anillos que crecen con φ', () => {
    const grafo = grafoCon(['a', 'b', 'c'].map((categoria, id) => nodo({ id: String(id), categoria })));
    const anclas = anclasPorFaceta(grafo, 'categoria');
    const radio = (clave: string) => Math.hypot(anclas.get(clave)![0], anclas.get(clave)![2]);
    expect([radio('b') / radio('a'), radio('c') / radio('b')]).toEqual([expect.closeTo(1.618, 2), expect.closeTo(1.618, 2)]);
  });
  it('asocia cada formato a una forma', () => {
    const grafo = grafoCon([
      nodo({ id: 'a', formato: 'texto' }), nodo({ id: 'b', formato: 'modelo3d' }),
      nodo({ id: 'c', formato: 'exótico' })]);
    expect([ladosFormato('texto'), ladosFormato('modelo3d'), ladosFormato('exótico')]).toEqual([3, 7, 5]);
    const anclas = anclasPorFaceta(grafo, 'formato');
    expect(anclas.get('texto')?.[1]).not.toBe(anclas.get('modelo3d')?.[1]);
  });
});
describe('taxonomías propias', () => {
  it('parte de los valores del grafo visible por dueño', () => {
    const grafo = grafoCon([
      nodo({ dueno: 'u1', tema: 'diseño', categoria: 'teoría', etiquetas: ['armonía'] }),
      nodo({ id: 'b', dueno: 'u2', tema: 'ciencia' })]);
    expect(taxonomiasDe(grafo)).toEqual({ u1: { tema: ['diseño'], categoria: ['teoría'], etiquetas: ['armonía'] },
      u2: { tema: ['ciencia'], categoria: [], etiquetas: [] } });
  });
  it('crea sin límite y sin mutar la taxonomía original', () => {
    const base = taxonomiasDe(grafoCon([nodo()]));
    let actual = base;
    for (let i = 0; i < 200; i++) actual = crearFaceta(actual, 'maggasukha', 'tema', `tema-${i}`);
    expect([actual.maggasukha.tema.length, base.maggasukha.tema]).toEqual([200, []]);
  });
  it('renombra solo en la taxonomía de su dueño', () => {
    const base = taxonomiasDe(grafoCon([nodo({ dueno: 'u1', tema: 'viejo' }),
      nodo({ id: 'b', dueno: 'u2', tema: 'ajeno' })]));
    const actual = renombrarFaceta(base, 'u1', 'tema', 'viejo', 'nuevo');
    expect([actual.u1.tema, actual.u2.tema, base.u1.tema]).toEqual([['nuevo'], ['ajeno'], ['viejo']]);
  });
  it('fusiona varias facetas en una destino', () => {
    const base = taxonomiasDe(grafoCon([nodo({ dueno: 'u1', tema: 'viejo' }),
      nodo({ id: 'b', dueno: 'u1', tema: 'otro' }), nodo({ id: 'c', dueno: 'u2', tema: 'ajeno' })]));
    const actual = fusionarFacetas(base, 'u1', 'tema', ['viejo', 'otro'], 'unificado');
    expect([actual.u1.tema, actual.u2.tema]).toEqual([['unificado'], ['ajeno']]);
  });
});
