import { describe, it, expect } from 'vitest';
import {
  validarNodo,
  facetasDe,
  crearGrafo,
  anadirNodo,
  anadirArista,
  aplicarEvento,
  hijosDeRama,
  ancestrosDeRama,
  Nodo,
  Arista,
  Evento,
} from '../modelo';

describe('validarNodo', () => {
  it('rechaza nodos sin id', () => {
    const resultado = validarNodo({ titulo: 'Test', ref: '/test' });
    expect(resultado.valido).toBe(false);
    expect(resultado.error).toBe('El nodo requiere un id válido');
  });

  it('rechaza nodos sin titulo', () => {
    const resultado = validarNodo({ id: 'n1', ref: '/test' });
    expect(resultado.valido).toBe(false);
    expect(resultado.error).toBe('El nodo requiere un título válido');
  });

  it('rechaza nodos sin ref', () => {
    const resultado = validarNodo({ id: 'n1', titulo: 'Test' });
    expect(resultado.valido).toBe(false);
    expect(resultado.error).toBe('El nodo requiere una referencia (ref) obligatoria');
  });

  it('rechaza campos de contenido privado', () => {
    const resultado = validarNodo({
      id: 'n1',
      titulo: 'Test',
      ref: '/test',
      contenido: 'privado',
    } as any);
    expect(resultado.valido).toBe(false);
    expect(resultado.error).toContain('contenido privado');
  });

  it('rechaza texto_privado', () => {
    const resultado = validarNodo({
      id: 'n1',
      titulo: 'Test',
      ref: '/test',
      texto_privado: 'secreto',
    } as any);
    expect(resultado.valido).toBe(false);
  });

  it('acepta un nodo válido completo', () => {
    const resultado = validarNodo({
      id: 'n1',
      titulo: 'Test',
      ref: '/test',
      tipo: 'archivo',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: ['general'],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: ['tag1'],
    });
    expect(resultado.valido).toBe(true);
  });
});

describe('facetasDe', () => {
  it('devuelve facetas con valor por defecto para campos opcionales', () => {
    const nodo: Nodo = {
      id: 'n1',
      titulo: 'Test',
      tipo: 'archivo',
      formato: 'texto',
      ref: '/test',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: [],
    };
    const facetas = facetasDe(nodo);
    expect(facetas.tema).toBe('');
    expect(facetas.categoria).toBe('');
    expect(facetas.etiquetas).toEqual([]);
    expect(facetas.tipo).toBe('archivo');
    expect(facetas.formato).toBe('texto');
    expect(facetas.sistema).toBe('general');
  });

  it('incluir valores definidos', () => {
    const nodo: Nodo = {
      id: 'n1',
      titulo: 'Test',
      tipo: 'archivo',
      formato: 'texto',
      ref: '/test',
      alcance: 'grupo',
      dueno: 'user2',
      capas: ['proyecto', 'actividad'],
      t_creado: 2000,
      t_actividad: 2000,
      peso: 0.8,
      tema: 'diseño',
      categoria: 'creacion',
      etiquetas: ['ui', 'react'],
    };
    const facetas = facetasDe(nodo);
    expect(facetas.tema).toBe('diseño');
    expect(facetas.categoria).toBe('creacion');
    expect(facetas.etiquetas).toEqual(['ui', 'react']);
    expect(facetas.sistema).toBe('proyecto');
    expect(facetas.estado).toBe('activo');
  });
});

describe('crearGrafo', () => {
  it('crea un grafo vacío', () => {
    const grafo = crearGrafo();
    expect(grafo.nodos.size).toBe(0);
    expect(grafo.aristas).toEqual([]);
    expect(grafo.ramas.size).toBe(0);
  });
});

describe('anadirNodo', () => {
  it('añade un nodo válido', () => {
    const grafo = crearGrafo();
    const nodo: Nodo = {
      id: 'n1',
      titulo: 'Test',
      ref: '/test',
      tipo: 'archivo',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: [],
    };
    const resultado = anadirNodo(grafo, nodo);
    expect(resultado).toBe(true);
    expect(grafo.nodos.has('n1')).toBe(true);
  });

  it('rechaza nodos duplicados', () => {
    const grafo = crearGrafo();
    const nodo: Nodo = {
      id: 'n1',
      titulo: 'Test',
      ref: '/test',
      tipo: 'archivo',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: [],
    };
    expect(anadirNodo(grafo, nodo)).toBe(true);
    expect(anadirNodo(grafo, nodo)).toBe(false);
  });

  it('rechaza nodos inválidos', () => {
    const grafo = crearGrafo();
    const resultado = anadirNodo(grafo, { titulo: 'Test' } as Nodo);
    expect(resultado).toBe(false);
  });
});

describe('anadirArista', () => {
  it('añade una arista entre nodos existentes', () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, {
      id: 'n1',
      titulo: 'Padre',
      ref: '/p1',
      tipo: 'carpeta',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: [],
    });
    anadirNodo(grafo, {
      id: 'n2',
      titulo: 'Hijo',
      ref: '/p2',
      tipo: 'archivo',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: [],
    });
    const arista: Arista = { de: 'n1', a: 'n2', tipo: 'contiene', t: 2000, intensidad: 1.0 };
    const resultado = anadirArista(grafo, arista);
    expect(resultado).toBe(true);
    expect(grafo.aristas.length).toBe(1);
  });

  it('rechaza aristas a nodos inexistentes', () => {
    const grafo = crearGrafo();
    const arista: Arista = { de: 'n1', a: 'n2', tipo: 'contiene', t: 2000, intensidad: 1.0 };
    const resultado = anadirArista(grafo, arista);
    expect(resultado).toBe(false);
  });

  it('rechaza aristas duplicadas', () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, {
      id: 'n1',
      titulo: 'N1',
      ref: '/n1',
      tipo: 'archivo',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: [],
    });
    anadirNodo(grafo, {
      id: 'n2',
      titulo: 'N2',
      ref: '/n2',
      tipo: 'archivo',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 1.0,
      etiquetas: [],
    });
    const arista: Arista = { de: 'n1', a: 'n2', tipo: 'contiene', t: 2000, intensidad: 1.0 };
    expect(anadirArista(grafo, arista)).toBe(true);
    expect(anadirArista(grafo, arista)).toBe(false);
  });
});

describe('aplicarEvento', () => {
  it('actualiza t_actividad y peso de un nodo', () => {
    const grafo = crearGrafo();
    anadirNodo(grafo, {
      id: 'n1',
      titulo: 'Test',
      ref: '/test',
      tipo: 'archivo',
      formato: 'texto',
      alcance: 'privado',
      dueno: 'user1',
      capas: [],
      t_creado: 1000,
      t_actividad: 1000,
      peso: 0.5,
      etiquetas: [],
    });
    const evento: Evento = {
      t: 3000,
      tipo: 'actividad',
      objetivo_id: 'n1',
      es_arista: false,
      alcance: 'privado',
    };
    const resultado = aplicarEvento(grafo, evento);
    expect(resultado).toBe(true);
    const nodo = grafo.nodos.get('n1')!;
    expect(nodo.t_actividad).toBe(3000);
    expect(nodo.peso).toBe(0.6);
  });

  it('no actualiza aristas', () => {
    const grafo = crearGrafo();
    const evento: Evento = {
      t: 3000,
      tipo: 'actividad',
      objetivo_id: 'n1',
      es_arista: true,
      alcance: 'privado',
    };
    const resultado = aplicarEvento(grafo, evento);
    expect(resultado).toBe(false);
  });

  it('rechaza evento para nodo inexistente', () => {
    const grafo = crearGrafo();
    const evento: Evento = {
      t: 3000,
      tipo: 'actividad',
      objetivo_id: 'noexiste',
      es_arista: false,
      alcance: 'privado',
    };
    const resultado = aplicarEvento(grafo, evento);
    expect(resultado).toBe(false);
  });
});

describe('hijosDeRama', () => {
  it('devuelve los hijos de una rama existente', () => {
    const grafo = crearGrafo();
    grafo.ramas.set('n1', ['n2', 'n3']);
    expect(hijosDeRama(grafo, 'n1')).toEqual(['n2', 'n3']);
  });

  it('devuelve array vacío para rama no existente', () => {
    const grafo = crearGrafo();
    expect(hijosDeRama(grafo, 'noexiste')).toEqual([]);
  });
});

describe('ancestrosDeRama', () => {
  it('encuentra ancestros directos', () => {
    const grafo = crearGrafo();
    grafo.ramas.set('n1', ['n2']);
    grafo.ramas.set('n2', ['n3']);
    expect(ancestrosDeRama(grafo, 'n3')).toContain('n2');
  });

  it('devuelve array vacío para nodo sin ancestros', () => {
    const grafo = crearGrafo();
    expect(ancestrosDeRama(grafo, 'n1')).toEqual([]);
  });
});