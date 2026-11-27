import { describe, it, expect } from 'vitest';
import { crearGrafo, anadirNodo } from '../modelo';
import type { Grafo4D, Nodo } from '../modelo';
import {
  agrupar,
  nivelDeDetalle,
  valorDeFaceta,
  DISTANCIA_GALAXIA,
  type FacetaAgrupacion,
} from '../agrupar';

function nodo(id: string, extra: Partial<Nodo> = {}): Nodo {
  return {
    id,
    tipo: 'archivo',
    titulo: id,
    formato: 'texto',
    ref: `/carpeta/${id}`,
    alcance: 'publico',
    dueno: 'ana',
    capas: [],
    t_creado: 1,
    t_actividad: 1,
    peso: 1,
    etiquetas: [],
    ...extra,
  };
}

function grafoCon(cantidad: number, grupos: number, extra: (i: number) => Partial<Nodo> = () => ({})): Grafo4D {
  const grafo = crearGrafo();
  for (let i = 0; i < cantidad; i++) {
    anadirNodo(grafo, nodo(`n${i}`, { dueno: `d${i % grupos}`, ...extra(i) }));
  }
  return grafo;
}

function cuerposVisibles(cuerpos: { colapsado: boolean; nodos: string[] }[]): number {
  return cuerpos.reduce((total, cuerpo) => total + (cuerpo.colapsado ? 1 : cuerpo.nodos.length), 0);
}

describe('valorDeFaceta', () => {
  it('lee cada faceta de los datos existentes', () => {
    const base = nodo('x', {
      dueno: 'maggasukha',
      categoria: 'educacion',
      capas: ['cerebro:alfa', 'comunidad:jardin', 'carpeta:cursos'],
      ref: '/brains/alfa/nota.txt',
    });
    const casos: [FacetaAgrupacion, string][] = [
      ['dueno', 'maggasukha'],
      ['cerebro', 'alfa'],
      ['entidad', 'educacion'],
      ['carpeta', 'cursos'],
      ['comunidad', 'jardin'],
    ];
    for (const [faceta, esperado] of casos) {
      expect(valorDeFaceta(base, faceta)).toBe(esperado);
    }
  });

  it('deduce la carpeta de la referencia y cae en sin-dato', () => {
    expect(valorDeFaceta(nodo('y', { ref: '/uno/dos/tres.md' }), 'carpeta')).toBe('uno/dos');
    expect(valorDeFaceta(nodo('z', { capas: [] }), 'cerebro')).toBe('sin-dato');
  });
});

describe('agrupar', () => {
  it('agrupa por dueño, suma pesos y ordena de mayor a menor', () => {
    const grafo = grafoCon(10, 2, (i) => ({ peso: i % 2 === 0 ? 2 : 1 }));
    const grupos = agrupar(grafo, 'dueno');
    expect(grupos).toHaveLength(2);
    expect(grupos[0].peso).toBeGreaterThanOrEqual(grupos[1].peso);
    const total = grupos.reduce((suma, grupo) => suma + grupo.peso, 0);
    expect(total).toBe(15);
    expect(grupos[0].nodos).toHaveLength(5);
  });

  it('anida subgrupos cuando se indica una faceta secundaria', () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, nodo('a', { dueno: 'ana', categoria: 'arte' }));
    anadirNodo(grafo, nodo('b', { dueno: 'ana', categoria: 'ciencia' }));
    anadirNodo(grafo, nodo('c', { dueno: 'luis', categoria: 'arte' }));
    const grupos = agrupar(grafo, 'dueno', 'entidad');
    const ana = grupos.find((grupo) => grupo.etiqueta === 'ana');
    expect(ana?.subgrupos.map((sub) => sub.etiqueta).sort()).toEqual(['arte', 'ciencia']);
  });
});

describe('nivelDeDetalle', () => {
  it('lejos colapsa todos los cuerpos y cerca los abre', () => {
    const grupos = agrupar(grafoCon(10, 2), 'dueno');
    const lejos = nivelDeDetalle(DISTANCIA_GALAXIA, grupos);
    expect(lejos.nivel).toBe('galaxia');
    expect(lejos.cuerpos.every((cuerpo) => cuerpo.colapsado)).toBe(true);
    const cerca = nivelDeDetalle(1, grupos);
    expect(cerca.nivel).toBe('contenido');
    expect(cerca.cuerpos.every((cuerpo) => !cuerpo.colapsado)).toBe(true);
    expect(cuerpoDe(cerca.cuerpos, 'dueno:d0').nodos).toHaveLength(5);
  });

  it('respeta el tope de cuerpos visibles con 1 000 y 20 000 nodos', () => {
    for (const [cantidad, grupos] of [[1000, 100], [20000, 200]] as const) {
      const agrupados = agrupar(grafoCon(cantidad, grupos), 'dueno');
      const detalle = nivelDeDetalle(0, agrupados, { topeCuerpos: 400 });
      expect(agrupados).toHaveLength(grupos);
      expect(cuerposVisibles(detalle.cuerpos)).toBeLessThanOrEqual(400);
      expect(detalle.ocultos).toBeGreaterThanOrEqual(0);
    }
  });
});

function cuerpoDe(cuerpos: { id: string; nodos: string[] }[], id: string): { id: string; nodos: string[] } {
  const cuerpo = cuerpos.find((candidato) => candidato.id === id);
  if (!cuerpo) throw new Error(`Falta el cuerpo ${id}`);
  return cuerpo;
}
