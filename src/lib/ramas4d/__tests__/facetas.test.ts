import { describe, it, expect } from 'vitest';
import type { Nodo, Grafo4D } from '../modelo';
import { crearGrafo, anadirNodo, anadirArista } from '../modelo';
import {
  CLAVES_FACETA,
  indiceFacetas,
  filtrarPorFacetas,
  agruparPorFacetaClave,
  anclasDeFaceta,
  crearTaxonomia,
  anadirValor,
  renombrarValor,
  fusionarValores,
} from '../facetas';

function nodo(overrides: Partial<Nodo> & { id: string }): Nodo {
  return {
    titulo: overrides.id,
    tipo: 'archivo',
    formato: 'texto',
    ref: `/${overrides.id}`,
    alcance: 'privado',
    dueno: 'ana',
    capas: ['cerebro-a'],
    t_creado: 1000,
    t_actividad: 1000,
    peso: 1,
    etiquetas: [],
    ...overrides,
  };
}

function grafoCon(nodos: Nodo[]): Grafo4D {
  const grafo = crearGrafo();
  for (const n of nodos) anadirNodo(grafo, n);
  return grafo;
}

function grafoBase(): Grafo4D {
  const grafo = grafoCon([
    nodo({ id: 'n1', tema: 'Salud', categoria: 'Bienestar', etiquetas: ['prevencion', 'mente'], dueno: 'ana' }),
    nodo({ id: 'n2', tema: 'Salud', categoria: 'Bienestar', etiquetas: ['mente'], formato: 'video', alcance: 'publico', dueno: 'luis' }),
    nodo({ id: 'n3', tema: 'Arte', categoria: 'Cultura', etiquetas: ['color'], tipo: 'obra', formato: 'imagen', alcance: 'publico', capas: ['cerebro-b'] }),
  ]);
  anadirArista(grafo, { de: 'n1', a: 'n2', tipo: 'contiene', t: 1000, intensidad: 1 });
  grafo.ramas.set('n1', ['n2']);
  return grafo;
}

describe('indiceFacetas', () => {
  it('cuenta temas y los ordena por recuento', () => {
    const indice = indiceFacetas(grafoBase());
    expect(indice.tema).toEqual([
      { valor: 'Salud', cuenta: 2 },
      { valor: 'Arte', cuenta: 1 },
    ]);
  });

  it('cuenta etiquetas repetidas y las ordena por recuento', () => {
    const indice = indiceFacetas(grafoBase());
    expect(indice.etiqueta[0]).toEqual({ valor: 'mente', cuenta: 2 });
    expect(indice.etiqueta.map((v) => v.valor)).toContain('prevencion');
  });

  it('incluye tipo, formato, alcance, dueño y sistema', () => {
    const indice = indiceFacetas(grafoBase());
    expect(indice.tipo).toContainEqual({ valor: 'archivo', cuenta: 2 });
    expect(indice.formato).toContainEqual({ valor: 'video', cuenta: 1 });
    expect(indice.alcance).toContainEqual({ valor: 'publico', cuenta: 2 });
    expect(indice.dueno).toContainEqual({ valor: 'ana', cuenta: 2 });
    expect(indice.sistema).toContainEqual({ valor: 'cerebro-a', cuenta: 2 });
  });

  it('devuelve todas las claves aunque el grafo esté vacío', () => {
    const indice = indiceFacetas(crearGrafo());
    for (const faceta of CLAVES_FACETA) {
      expect(indice[faceta]).toEqual([]);
    }
  });
});

describe('filtrarPorFacetas', () => {
  it('sin selección conserva nodos, aristas y ramas', () => {
    const grafo = grafoBase();
    const filtrado = filtrarPorFacetas(grafo, {});
    expect(filtrado.nodos.size).toBe(3);
    expect(filtrado.aristas).toHaveLength(1);
    expect(filtrado.ramas.get('n1')).toEqual(['n2']);
  });

  it('filtra por un tema y poda aristas y ramas ajenas', () => {
    const filtrado = filtrarPorFacetas(grafoBase(), { tema: ['Arte'] });
    expect([...filtrado.nodos.keys()]).toEqual(['n3']);
    expect(filtrado.aristas).toHaveLength(0);
    expect(filtrado.ramas.size).toBe(0);
  });

  it('combina facetas distintas con Y lógico', () => {
    const filtrado = filtrarPorFacetas(grafoBase(), { tema: ['Salud'], formato: ['video'] });
    expect([...filtrado.nodos.keys()]).toEqual(['n2']);
  });

  it('combina valores de la misma faceta con O lógico', () => {
    const filtrado = filtrarPorFacetas(grafoBase(), { tema: ['Salud', 'Arte'] });
    expect(filtrado.nodos.size).toBe(3);
  });

  it('filtra por etiqueta y admite varias etiquetas', () => {
    const soloMente = filtrarPorFacetas(grafoBase(), { etiqueta: ['mente'] });
    expect([...soloMente.nodos.keys()]).toEqual(['n1', 'n2']);
    const dos = filtrarPorFacetas(grafoBase(), { etiqueta: ['mente', 'color'] });
    expect(dos.nodos.size).toBe(3);
  });

  it('no modifica el grafo original', () => {
    const grafo = grafoBase();
    filtrarPorFacetas(grafo, { tema: ['Arte'] });
    expect(grafo.nodos.size).toBe(3);
    expect(grafo.aristas).toHaveLength(1);
  });

  it('solo devuelve referencias de nodos existentes, sin crear registros', () => {
    const grafo = grafoBase();
    const filtrado = filtrarPorFacetas(grafo, { alcance: ['publico'] });
    for (const [id, nodoFiltrado] of filtrado.nodos) {
      expect(grafo.nodos.get(id)).toBe(nodoFiltrado);
    }
    expect(filtrado.nodos.size).toBeLessThanOrEqual(grafo.nodos.size);
  });
});

describe('agruparPorFacetaClave', () => {
  it('agrupa por tema', () => {
    const grupos = agruparPorFacetaClave(grafoBase(), 'tema');
    expect(grupos.get('Salud')).toEqual(['n1', 'n2']);
    expect(grupos.get('Arte')).toEqual(['n3']);
  });

  it('agrupa por etiqueta y un nodo aparece en cada una de sus etiquetas', () => {
    const grupos = agruparPorFacetaClave(grafoBase(), 'etiqueta');
    expect(grupos.get('mente')).toEqual(['n1', 'n2']);
    expect(grupos.get('prevencion')).toEqual(['n1']);
    expect(grupos.get('color')).toEqual(['n3']);
  });

  it('delega en agrupar.ts para dueño y sistema', () => {
    const grafo = grafoBase();
    expect(agruparPorFacetaClave(grafo, 'dueno').get('ana')).toEqual(['n1', 'n3']);
    expect(agruparPorFacetaClave(grafo, 'sistema').get('cerebro-a')).toEqual(['n1', 'n2']);
  });

  it('agrupa por tipo y formato', () => {
    const grafo = grafoBase();
    expect(agruparPorFacetaClave(grafo, 'tipo').get('archivo')).toEqual(['n1', 'n2']);
    expect(agruparPorFacetaClave(grafo, 'formato').get('video')).toEqual(['n2']);
  });
});

describe('anclasDeFaceta', () => {
  it('dispone un tema por región sobre el plano', () => {
    const anclas = anclasDeFaceta(grafoBase(), 'tema', 'region', 40);
    expect(anclas).toHaveLength(2);
    expect(anclas.every((a) => a.posicion[1] === 0)).toBe(true);
    expect(anclas[0].posicion).not.toEqual(anclas[1].posicion);
    expect(anclas.every((a) => Math.hypot(a.posicion[0], a.posicion[2]) <= 40.001)).toBe(true);
  });

  it('dispone una categoría por anillo con radio creciente', () => {
    const anclas = anclasDeFaceta(grafoBase(), 'categoria', 'anillo', 50);
    expect(anclas).toHaveLength(2);
    const radios = anclas.map((a) => Math.hypot(...a.posicion));
    expect(radios[1]).toBeGreaterThan(radios[0]);
    expect(radios[0]).toBeCloseTo(50 * 0.35, 5);
    expect(radios[1]).toBeCloseTo(50, 5);
  });

  it('dispone un formato por forma sobre una esfera', () => {
    const anclas = anclasDeFaceta(grafoBase(), 'formato', 'forma', 30);
    expect(anclas).toHaveLength(3);
    expect(anclas.every((a) => a.forma.length > 0)).toBe(true);
    expect(anclas.every((a) => Math.abs(Math.hypot(...a.posicion) - 30) < 0.001)).toBe(true);
  });

  it('devuelve lista vacía sin nodos', () => {
    expect(anclasDeFaceta(crearGrafo(), 'tema')).toEqual([]);
  });
});

describe('taxonomías propias', () => {
  it('crea una taxonomía vacía para una persona o grupo', () => {
    const tax = crearTaxonomia('ana');
    expect(tax).toEqual({ id: 'ana', temas: [], categorias: [], etiquetas: [] });
  });

  it('añade valores recortando espacios, sin duplicar ni mutar', () => {
    const base = crearTaxonomia('ana');
    const conTema = anadirValor(base, 'temas', '  Salud ');
    expect(conTema.temas).toEqual(['Salud']);
    expect(base.temas).toEqual([]);
    expect(anadirValor(conTema, 'temas', 'Salud')).toBe(conTema);
    expect(anadirValor(conTema, 'temas', '   ')).toBe(conTema);
  });

  it('permite crear valores sin límite en cada lista', () => {
    let tax = crearTaxonomia('grupo');
    for (let i = 0; i < 60; i++) {
      tax = anadirValor(tax, 'categorias', `Categoría ${i}`);
    }
    expect(tax.categorias).toHaveLength(60);
  });

  it('renombra un tema sin mutar la taxonomía original', () => {
    const base = anadirValor(crearTaxonomia('ana'), 'temas', 'Salud');
    const nueva = renombrarValor(base, 'temas', 'Salud', 'Bienestar');
    expect(nueva.temas).toEqual(['Bienestar']);
    expect(base.temas).toEqual(['Salud']);
  });

  it('renombrar hacia un valor existente fusiona las etiquetas', () => {
    let tax = crearTaxonomia('ana');
    tax = anadirValor(tax, 'etiquetas', 'mente');
    tax = anadirValor(tax, 'etiquetas', 'psique');
    const fusionada = renombrarValor(tax, 'etiquetas', 'psique', 'mente');
    expect(fusionada.etiquetas).toEqual(['mente']);
  });

  it('fusiona categorías eliminando el origen y conservando el destino', () => {
    let tax = crearTaxonomia('grupo');
    tax = anadirValor(tax, 'categorias', 'Cultura');
    tax = anadirValor(tax, 'categorias', 'Arte');
    const fusionada = fusionarValores(tax, 'categorias', 'Arte', 'Cultura');
    expect(fusionada.categorias).toEqual(['Cultura']);
    expect(fusionarValores(tax, 'categorias', 'Arte', 'No existe')).toBe(tax);
  });
});


