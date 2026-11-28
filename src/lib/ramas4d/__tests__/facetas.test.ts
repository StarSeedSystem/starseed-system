import { describe, it, expect } from 'vitest';
import { indiceFacetas, buscarFacetas, filtrarPorFacetas, agruparFacetas, anclasPorFaceta, aplicarAnclas, taxonomiaVacia, crearFaceta, renombrarFaceta, fusionarFacetas, renombrarFacetasEnGrafo } from '../facetas';
import { crearGrafo, anadirNodo, type Nodo, type Grafo4D } from '../modelo';
import type { Observador } from '../alcance';

const yo: Observador = { id: 'yo' };

function nodo(overrides: Partial<Nodo> = {}): Nodo {
  return {
    id: 'n1', titulo: 'Nodo', tipo: 'archivo', formato: 'texto', ref: '/n1', alcance: 'publico', dueno: 'yo', capas: ['educativo'], t_creado: 1000, t_actividad: 1000, peso: 1, etiquetas: [], ...overrides,
  };
}
function grafoCon(nodos: Nodo[]): Grafo4D { const grafo = crearGrafo(); nodos.forEach((n) => anadirNodo(grafo, n)); return grafo; }
const ids = (g: Grafo4D) => [...g.nodos.keys()];

describe('índice de facetas', () => {
  it('cuenta temas, categorías, etiquetas, tipos y formatos de los nodos visibles', () => {
    const grafo = grafoCon([
      nodo({ id: 'a', tema: 'diseño', categoria: 'arte', etiquetas: ['ui', 'flujo'], formato: 'imagen' }),
      nodo({ id: 'b', tema: 'diseño', categoria: 'ciencia', etiquetas: ['ui'], formato: 'texto' }),
    ]);
    const indice = indiceFacetas(grafo, yo);
    expect(indice.tema.find((e) => e.valor === 'diseño')?.recuento).toBe(2);
    expect(indice.categoria.map((e) => e.valor)).toEqual(['arte', 'ciencia']);
    expect(indice.etiquetas.find((e) => e.valor === 'ui')?.ids).toEqual(['a', 'b']);
    expect(indice.formato.find((e) => e.valor === 'imagen')?.recuento).toBe(1);
  });
  it('busca sin acentos y conserva las demás facetas', () => {
    const indice = indiceFacetas(grafoCon([
      nodo({ id: 'a', tema: 'diseño', formato: 'imagen' }),
      nodo({ id: 'b', tema: 'ciencia', formato: 'texto' }),
    ]));
    const encontrado = buscarFacetas(indice, 'DISENO');
    expect(encontrado.tema.map((e) => e.valor)).toEqual(['diseño']);
    expect(encontrado.formato).toEqual([]);
    expect(indice.tema.map((e) => e.valor)).toContain('ciencia');
  });
});
describe('filtrar por varias facetas', () => {
  const grafo = grafoCon([
    nodo({ id: 'a', tema: 'diseño', categoria: 'arte', etiquetas: ['ui'], formato: 'imagen' }),
    nodo({ id: 'b', tema: 'diseño', categoria: 'ciencia', etiquetas: ['ui'], formato: 'texto' }),
    nodo({ id: 'c', tema: 'arte', categoria: 'arte', etiquetas: ['ui'], formato: 'imagen' }),
    nodo({ id: 'd', tema: 'diseño', categoria: 'arte', etiquetas: ['flujo'], formato: 'video' }),
  ]);
  it('usa OR dentro de una faceta y AND entre facetas', () => {
    expect(ids(filtrarPorFacetas(grafo, { valores: { tema: ['diseño'], etiquetas: ['ui', 'flujo'] } }, yo))).toEqual(['a', 'b', 'd']);
    expect(ids(filtrarPorFacetas(grafo, { valores: { tema: ['diseño'], categoria: ['arte'], etiquetas: ['ui'] } }, yo))).toEqual(['a']);
  });
  it('busca en título y referencia sin acentos', () => {
    const conGuia = grafoCon([...grafo.nodos.values(), nodo({ id: 'e', titulo: 'Guía de imagen', tema: 'fotografía' })]);
    expect(ids(filtrarPorFacetas(conGuia, { busqueda: 'GUIA' }, yo))).toEqual(['e']);
  });
  it('nunca muestra lo privado ajeno', () => {
    const mixto = grafoCon([
      nodo({ id: 'publico', tema: 'secreto', alcance: 'publico', dueno: 'otro' }),
      nodo({ id: 'ajeno', tema: 'secreto', alcance: 'privado', dueno: 'otro' }),
    ]);
    expect(ids(filtrarPorFacetas(mixto, { valores: { tema: ['secreto'] } }, yo))).toEqual(['publico']);
    expect(indiceFacetas(mixto, yo).tema[0].recuento).toBe(1);
  });
});
describe('agrupar por faceta', () => {
  it('usa los grupos de agrupar.ts para dueño y agrupa las facetas nuevas', () => {
    const grafo = grafoCon([
      nodo({ id: 'a', tema: 'diseño', categoria: 'arte', dueno: 'yo' }),
      nodo({ id: 'b', tema: 'diseño', categoria: 'ciencia', dueno: 'otro' }),
      nodo({ id: 'c', tema: 'arte', categoria: 'arte', dueno: 'yo' }),
    ]);
    expect([...agruparFacetas(grafo, 'dueno', yo).get('yo') ?? []]).toEqual(['a', 'c']);
    expect(agruparFacetas(grafo, 'tema', yo).get('diseño')).toEqual(['a', 'b']);
    expect(agruparFacetas(grafo, 'categoria', yo).get('arte')).toEqual(['a', 'c']);
  });
});
describe('anclas de disposición por faceta', () => {
  const grafo = grafoCon([
    nodo({ id: 'a', tema: 'diseño', categoria: 'arte', formato: 'imagen' }),
    nodo({ id: 'b', tema: 'ciencia', categoria: 'arte', formato: 'texto' }),
    nodo({ id: 'c', tema: 'diseño', categoria: 'ciencia', formato: 'imagen' }),
  ]);
  it('da una región por tema, un anillo por categoría y una forma por formato', () => {
    const porTema = anclasPorFaceta(grafo, 'tema', yo);
    const porCategoria = anclasPorFaceta(grafo, 'categoria', yo);
    expect(porTema.get('a')?.region).toBe(porTema.get('c')?.region);
    expect(porTema.get('a')?.region).not.toBe(porTema.get('b')?.region);
    expect(porCategoria.get('a')?.anillo).not.toBe(porCategoria.get('c')?.anillo);
    expect(anclasPorFaceta(grafo, 'formato', yo).get('a')?.forma).toBe('esfera');
  });
  it('aplica las anclas a las posiciones conservando el tamaño del buffer', () => {
    const anclas = anclasPorFaceta(grafo, 'tema', yo);
    const resultado = aplicarAnclas(new Float32Array(9), ['a', 'b', 'c'], anclas);
    expect(resultado.length).toBe(9);
    expect(resultado.slice(0, 3)).toEqual(new Float32Array(anclas.get('a')!.centro));
  });
});
describe('taxonomías propias', () => {
  it('crea sin límite y renombra sin tocar la entrada', () => {
    const vacia = taxonomiaVacia();
    let taxonomia = vacia;
    for (let i = 0; i < 200; i++) taxonomia = crearFaceta(taxonomia, 'tema', `tema ${i}`);
    expect(taxonomia.temas).toHaveLength(200);
    expect(vacia.temas).toHaveLength(0);
    expect(renombrarFaceta(taxonomia, 'tema', 'tema 0', 'origen').temas[0]).toBe('origen');
  });
  it('fusiona etiquetas y actualiza las referencias de los nodos', () => {
    const fusion = fusionarFacetas({ ...taxonomiaVacia(), etiquetas: ['ui', 'interfaz'] }, 'etiqueta', 'ui', 'interfaz');
    expect(fusion.etiquetas).toEqual(['interfaz']);
    const grafo = grafoCon([nodo({ id: 'a', etiquetas: ['ui', 'otra'] }), nodo({ id: 'b', etiquetas: ['ui'] })]);
    const cambiado = renombrarFacetasEnGrafo(grafo, 'etiqueta', 'ui', 'interfaz');
    expect(cambiado.nodos.get('a')?.etiquetas).toEqual(['interfaz', 'otra']);
    expect(grafo.nodos.get('a')?.etiquetas).toEqual(['ui', 'otra']);
  });
});
