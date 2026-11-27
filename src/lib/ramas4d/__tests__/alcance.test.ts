import { describe, it, expect } from 'vitest';
import { visiblePara, podarGrafo, Observador } from '../alcance';
import { podarGrafo as podarGrafoPublico, visiblePara as visibleParaPublica } from '../index';
import { filtrarGrafoPorCapasQuintaDimension } from '../capas';
import { AlcanceNodo, Arista, Grafo4D, Nodo } from '../modelo';

function crearNodo(id: string, alcance: AlcanceNodo, dueno: string): Nodo {
  return {
    id,
    tipo: 'archivo',
    titulo: `Nodo ${id}`,
    formato: 'texto',
    ref: `/${id}`,
    alcance,
    dueno,
    capas: [],
    t_creado: 1000,
    t_actividad: 1000,
    peso: 1,
    etiquetas: [],
  };
}

function crearObservador(id: string, extras: Partial<Observador> = {}): Observador {
  return { id, ...extras };
}

function crearGrafo(nodos: Nodo[], aristas: Arista[] = []): Grafo4D {
  return {
    nodos: new Map(nodos.map((nodo) => [nodo.id, nodo])),
    aristas,
    ramas: new Map(),
  };
}

describe('visiblePara', () => {
  it('no muestra lo privado ajeno', () => {
    const nodo = crearNodo('n1', 'privado', 'otra');
    expect(visiblePara(nodo, crearObservador('yo'))).toBe(false);
  });
});

describe('visiblePara por relación', () => {
  const alcances: AlcanceNodo[] = ['privado', 'contactos', 'grupo', 'comunidad', 'publico'];

  it('el dueño ve todo lo suyo, incluso lo privado', () => {
    const observador = crearObservador('yo');
    for (const alcance of alcances) {
      expect(visiblePara(crearNodo('n1', alcance, 'yo'), observador)).toBe(true);
    }
  });

  it('un contacto ve lo compartido con contactos y lo público', () => {
    const observador = crearObservador('yo', { contactos: ['otra'] });
    expect(visiblePara(crearNodo('n1', 'contactos', 'otra'), observador)).toBe(true);
    expect(visiblePara(crearNodo('n2', 'grupo', 'otra'), observador)).toBe(false);
    expect(visiblePara(crearNodo('n3', 'privado', 'otra'), observador)).toBe(false);
    expect(visiblePara(crearNodo('n4', 'publico', 'otra'), observador)).toBe(true);
  });

  it('un miembro del grupo ve el alcance de grupo', () => {
    const observador = crearObservador('yo', { grupos: new Set(['grupo-a']) });
    expect(visiblePara(crearNodo('n1', 'grupo', 'grupo-a'), observador)).toBe(true);
    expect(visiblePara(crearNodo('n2', 'grupo', 'grupo-b'), observador)).toBe(false);
    expect(visiblePara(crearNodo('n3', 'comunidad', 'grupo-a'), observador)).toBe(false);
  });

  it('un miembro de la comunidad ve el alcance de comunidad', () => {
    const observador = crearObservador('yo', { comunidades: ['sangha-a'] });
    expect(visiblePara(crearNodo('n1', 'comunidad', 'sangha-a'), observador)).toBe(true);
    expect(visiblePara(crearNodo('n2', 'comunidad', 'sangha-b'), observador)).toBe(false);
  });

  it('un extraño solo ve lo público', () => {
    const observador = crearObservador('yo');
    expect(visiblePara(crearNodo('n1', 'privado', 'otra'), observador)).toBe(false);
    expect(visiblePara(crearNodo('n2', 'contactos', 'otra'), observador)).toBe(false);
    expect(visiblePara(crearNodo('n3', 'grupo', 'otra'), observador)).toBe(false);
    expect(visiblePara(crearNodo('n4', 'comunidad', 'otra'), observador)).toBe(false);
    expect(visiblePara(crearNodo('n5', 'publico', 'otra'), observador)).toBe(true);
  });
});

describe('podarGrafo', () => {
  it('quita nodos privados ajenos y las aristas que los tocan', () => {
    const grafo = crearGrafo(
      [
        crearNodo('propio', 'privado', 'yo'),
        crearNodo('ajeno', 'privado', 'otra'),
        crearNodo('publico', 'publico', 'otra'),
      ],
      [
        { de: 'propio', a: 'publico', tipo: 'cita', t: 1, intensidad: 1 },
        { de: 'publico', a: 'ajeno', tipo: 'cita', t: 2, intensidad: 1 },
      ]
    );
    grafo.ramas.set('propio', ['ajeno']);

    const resultado = podarGrafo(grafo, crearObservador('yo'));

    expect(Array.from(resultado.nodos.keys())).toEqual(['propio', 'publico']);
    expect(resultado.aristas).toEqual([
      { de: 'propio', a: 'publico', tipo: 'cita', t: 1, intensidad: 1 },
    ]);
    expect(resultado.ramas.has('propio')).toBe(false);
    expect(grafo.nodos.size).toBe(3);
    expect(grafo.aristas.length).toBe(2);
    expect(grafo.ramas.get('propio')).toEqual(['ajeno']);
  });

  it('solo devuelve referencias visibles sin campos de contenido', () => {
    const secreto = { ...crearNodo('contacto', 'contactos', 'otra'), contenido: 'secreto' } as Nodo;
    const nodos = [
      secreto, crearNodo('grupo', 'grupo', 'grupo-a'),
      crearNodo('publico', 'publico', 'otra'), crearNodo('privado', 'privado', 'otra'),
    ];
    const observador = crearObservador('yo', { contactos: ['otra'], grupos: ['grupo-a'] });
    const resultado = podarGrafo(crearGrafo(nodos), observador);
    expect(Array.from(resultado.nodos.keys())).toEqual(['contacto', 'grupo', 'publico']);
    expect(Object.keys(resultado.nodos.get('contacto')!)).not.toContain('contenido');
  });
});

describe('alcance aplicado en el motor de Ramas 4D', () => {
  it('el índice público del motor expone la poda y la regla de visibilidad', () => {
    expect(podarGrafoPublico).toBe(podarGrafo);
    expect(visibleParaPublica).toBe(visiblePara);
  });

  it('el filtro de la quinta dimensión poda lo privado ajeno antes de filtrar por capas', () => {
    const grafo = crearGrafo(
      [
        { ...crearNodo('ajeno', 'privado', 'otra'), capas: ['sistema-educativo'] },
        { ...crearNodo('publico', 'publico', 'otra'), capas: ['sistema-educativo'] },
        { ...crearNodo('propio', 'privado', 'yo'), capas: ['sistema-educativo'] },
      ],
      [{ de: 'publico', a: 'ajeno', tipo: 'cita', t: 1, intensidad: 1 }]
    );
    grafo.ramas.set('propio', ['ajeno']);

    const resultado = filtrarGrafoPorCapasQuintaDimension(
      grafo,
      { sistema: ['educativo'] },
      crearObservador('yo')
    );

    expect(Array.from(resultado.nodos.keys())).toEqual(['publico', 'propio']);
    expect(resultado.aristas).toEqual([]);
    expect(resultado.ramas.has('propio')).toBe(false);
  });

  it('sin observador el filtro de la quinta dimensión solo deja lo público', () => {
    const grafo = crearGrafo([
      { ...crearNodo('ajeno', 'privado', 'otra'), capas: ['sistema-educativo'] },
      { ...crearNodo('publico', 'publico', 'otra'), capas: ['sistema-educativo'] },
    ]);

    const resultado = filtrarGrafoPorCapasQuintaDimension(grafo, { sistema: ['educativo'] });

    expect(Array.from(resultado.nodos.keys())).toEqual(['publico']);
  });
});
