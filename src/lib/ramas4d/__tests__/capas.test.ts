import { describe, it, expect } from 'vitest';
import {
  CAPAS_QUINTA_DIMENSION,
  CapaQuintaDimension,
  filtrarPorCapas,
} from '../capas';
import { Nodo, Grafo4D } from '../modelo';

describe('CAPAS_QUINTA_DIMENSION', () => {
  it('contiene las capas de conciencia', () => {
    const capasConciencia = CAPAS_QUINTA_DIMENSION.conciencia;
    expect(capasConciencia).toContain('individual');
    expect(capasConciencia).toContain('colectiva');
    expect(capasConciencia).toContain('universal');
  });

  it('contiene las capas de capacidades', () => {
    const capasCapacidades = CAPAS_QUINTA_DIMENSION.capacidades;
    expect(capasCapacidades).toContain('cognitivas');
    expect(capasCapacidades).toContain('creativas');
    expect(capasCapacidades).toContain('tecnicas');
    expect(capasCapacidades).toContain('sociales');
  });

  it('contiene las capas de señales', () => {
    const capasSenales = CAPAS_QUINTA_DIMENSION.senales;
    expect(capasSenales).toContain('internas');
    expect(capasSenales).toContain('externas');
    expect(capasSenales).toContain('sincronizacion');
  });

  it('contiene las capas de alcance (privacidad)', () => {
    const capasAlcance = CAPAS_QUINTA_DIMENSION.alcance;
    expect(capasAlcance).toContain('privado');
    expect(capasAlcance).toContain('contactos');
    expect(capasAlcance).toContain('grupo');
    expect(capasAlcance).toContain('comunidad');
    expect(capasAlcance).toContain('publico');
  });

  it('contiene las capas de sistema', () => {
    const capasSistema = CAPAS_QUINTA_DIMENSION.sistema;
    expect(capasSistema).toContain('politico');
    expect(capasSistema).toContain('educativo');
    expect(capasSistema).toContain('cultural');
    expect(capasSistema).toContain('social');
    expect(capasSistema).toContain('ia');
    expect(capasSistema).toContain('creacion');
    expect(capasSistema).toContain('metagenesis');
  });

  it('contiene las capas de universos paralelos', () => {
    const capasUniversos = CAPAS_QUINTA_DIMENSION.universosParalelos;
    expect(capasUniversos).toContain('variaciones');
    expect(capasUniversos).toContain('versiones');
  });
});

describe('filtrarPorCapas', () => {
  const nodoBase: Partial<Nodo> = {
    id: 'n1',
    titulo: 'Test',
    tipo: 'archivo',
    formato: 'texto',
    ref: '/test',
    alcance: 'privado',
    dueno: 'user1',
    t_creado: 1000,
    t_actividad: 1000,
    peso: 1.0,
    etiquetas: [],
  };

  const crearNodo = (capas: string[], overrides: Partial<Nodo> = {}): Nodo => ({
    ...nodoBase,
    capas,
    ...overrides,
  } as Nodo);

  const crearGrafo = (nodos: Nodo[]): Grafo4D => {
    const grafo: Grafo4D = {
      nodos: new Map<string, Nodo>(),
      aristas: [],
      ramas: new Map<string, string[]>(),
    };
    for (const nodo of nodos) {
      grafo.nodos.set(nodo.id, nodo);
    }
    return grafo;
  };

  it('filtra nodos que tienen al menos una de las capas especificadas', () => {
    const grafo = crearGrafo([
      crearNodo(['conciencia', 'individual'], { id: 'n1' }),
      crearNodo(['capacidades', 'cognitivas'], { id: 'n2' }),
      crearNodo(['sistema', 'politico'], { id: 'n3' }),
    ]);

    const resultado = filtrarPorCapas(grafo, ['conciencia']);
    expect(resultado.nodos.size).toBe(1);
    expect(resultado.nodos.has('n1')).toBe(true);
  });

  it('filtra nodos que tienen cualquiera de varias capas (OR)', () => {
    const grafo = crearGrafo([
      crearNodo(['conciencia', 'individual'], { id: 'n1' }),
      crearNodo(['capacidades', 'cognitivas'], { id: 'n2' }),
      crearNodo(['sistema', 'politico'], { id: 'n3' }),
    ]);

    const resultado = filtrarPorCapas(grafo, ['conciencia', 'capacidades']);
    expect(resultado.nodos.size).toBe(2);
    expect(resultado.nodos.has('n1')).toBe(true);
    expect(resultado.nodos.has('n2')).toBe(true);
    expect(resultado.nodos.has('n3')).toBe(false);
  });

  it('devuelve grafo vacío si ningún nodo coincide', () => {
    const grafo = crearGrafo([
      crearNodo(['sistema', 'politico'], { id: 'n1' }),
      crearNodo(['sistema', 'educativo'], { id: 'n2' }),
    ]);

    const resultado = filtrarPorCapas(grafo, ['conciencia']);
    expect(resultado.nodos.size).toBe(0);
  });

  it('conserva las aristas entre nodos filtrados', () => {
    const grafo = crearGrafo([
      crearNodo(['conciencia', 'individual'], { id: 'n1' }),
      crearNodo(['conciencia', 'colectiva'], { id: 'n2' }),
      crearNodo(['capacidades', 'cognitivas'], { id: 'n3' }),
    ]);
    grafo.aristas = [
      { de: 'n1', a: 'n2', tipo: 'contiene', t: 1000, intensidad: 1.0 },
      { de: 'n1', a: 'n3', tipo: 'deriva', t: 1000, intensidad: 1.0 },
    ];

    const resultado = filtrarPorCapas(grafo, ['conciencia']);
    expect(resultado.aristas.length).toBe(1);
    expect(resultado.aristas[0].de).toBe('n1');
    expect(resultado.aristas[0].a).toBe('n2');
  });

  it('elimina aristas que conectan a nodos filtrados fuera', () => {
    const grafo = crearGrafo([
      crearNodo(['conciencia', 'individual'], { id: 'n1' }),
      crearNodo(['capacidades', 'cognitivas'], { id: 'n2' }),
    ]);
    grafo.aristas = [
      { de: 'n1', a: 'n2', tipo: 'contiene', t: 1000, intensidad: 1.0 },
    ];

    const resultado = filtrarPorCapas(grafo, ['conciencia']);
    expect(resultado.aristas.length).toBe(0);
  });

  it('conserva las ramas de nodos filtrados', () => {
    const grafo = crearGrafo([
      crearNodo(['conciencia', 'individual'], { id: 'n1' }),
      crearNodo(['conciencia', 'colectiva'], { id: 'n2' }),
      crearNodo(['capacidades', 'cognitivas'], { id: 'n3' }),
    ]);
    grafo.ramas.set('n1', ['n2', 'n3']);

    const resultado = filtrarPorCapas(grafo, ['conciencia']);
    expect(resultado.ramas.has('n1')).toBe(true);
    expect(resultado.ramas.get('n1')).toEqual(['n2']);
  });

  it('con capas vacías devuelve el grafo original', () => {
    const grafo = crearGrafo([
      crearNodo(['conciencia', 'individual'], { id: 'n1' }),
      crearNodo(['capacidades', 'cognitivas'], { id: 'n2' }),
    ]);

    const resultado = filtrarPorCapas(grafo, []);
    expect(resultado.nodos.size).toBe(2);
  });

  it('funciona con coincidencia parcial de capas (prefijo)', () => {
    const grafo = crearGrafo([
      crearNodo(['conciencia-individual', 'capacidades-cognitivas'], { id: 'n1' }),
      crearNodo(['sistema-politico'], { id: 'n2' }),
    ]);

    const resultado = filtrarPorCapas(grafo, ['conciencia']);
    expect(resultado.nodos.size).toBe(1);
    expect(resultado.nodos.has('n1')).toBe(true);
  });
});

describe('CapaQuintaDimension type', () => {
  it('permite todas las categorías de capas definidas', () => {
    const capas: CapaQuintaDimension[] = [
      'conciencia',
      'capacidades',
      'senales',
      'alcance',
      'sistema',
      'universosParalelos',
    ];
    expect(capas.length).toBe(6);
  });
});