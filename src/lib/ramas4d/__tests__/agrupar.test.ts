import { describe, expect, it } from 'vitest';
import {
  tipoAgrupacion,
  agruparNodos,
  nivelDeDetalle,
  colapsarGrupos,
  expandirGrupos,
  topeCuerposVisibles,
  type Grupo,
  type AgrupacionResultado,
  type OpcionesAgrupacion,
  type OpcionesNivelDetalle,
} from '../agrupar';
import { Nodo, Grafo4D, crearGrafo, anadirNodo } from '../modelo';

function nodoBase(overrides: Partial<Nodo> = {}): Nodo {
  return {
    id: 'n1',
    tipo: 'archivo',
    titulo: 'Test',
    formato: 'texto',
    ref: '/test',
    alcance: 'privado',
    dueno: 'user1',
    capas: ['general'],
    t_creado: 1000,
    t_actividad: 1000,
    peso: 1.0,
    etiquetas: [],
    ...overrides,
  };
}

function grafoConNodos(nodos: Nodo[]): Grafo4D {
  const grafo = crearGrafo();
  for (const nodo of nodos) {
    anadirNodo(grafo, nodo);
  }
  return grafo;
}

describe('tipoAgrupacion', () => {
  it('devuelve los tipos de agrupación válidos', () => {
    const tipos = tipoAgrupacion();
    expect(tipos).toContain('dueno');
    expect(tipos).toContain('cerebro');
    expect(tipos).toContain('entidad');
    expect(tipos).toContain('carpeta');
    expect(tipos).toContain('comunidad');
  });

  it('es inmutable (devuelve copia)', () => {
    const a = tipoAgrupacion();
    const b = tipoAgrupacion();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('agruparNodos', () => {
  it('agrupa por dueño', () => {
    const nodos = [
      nodoBase({ id: 'n1', dueno: 'user1', peso: 2 }),
      nodoBase({ id: 'n2', dueno: 'user1', peso: 3 }),
      nodoBase({ id: 'n3', dueno: 'user2', peso: 1 }),
    ];
    const grafo = grafoConNodos(nodos);
    const resultado = agruparNodos(grafo, { tipo: 'dueno' });

    expect(resultado.grupos.size).toBe(2);
    const g1 = resultado.grupos.get('user1')!;
    const g2 = resultado.grupos.get('user2')!;
    expect(g1.nodosIds).toEqual(['n1', 'n2']);
    expect(g1.pesoTotal).toBe(5);
    expect(g2.nodosIds).toEqual(['n3']);
    expect(g2.pesoTotal).toBe(1);
  });

  it('agrupa por cerebro (capas[0])', () => {
    const nodos = [
      nodoBase({ id: 'n1', capas: ['cerebroA'], peso: 2 }),
      nodoBase({ id: 'n2', capas: ['cerebroA'], peso: 3 }),
      nodoBase({ id: 'n3', capas: ['cerebroB'], peso: 1 }),
    ];
    const grafo = grafoConNodos(nodos);
    const resultado = agruparNodos(grafo, { tipo: 'cerebro' });

    expect(resultado.grupos.size).toBe(2);
    expect(resultado.grupos.get('cerebroA')!.pesoTotal).toBe(5);
    expect(resultado.grupos.get('cerebroB')!.pesoTotal).toBe(1);
  });

  it('agrupa por entidad (tema)', () => {
    const nodos = [
      nodoBase({ id: 'n1', tema: 'diseño', peso: 2 }),
      nodoBase({ id: 'n2', tema: 'diseño', peso: 3 }),
      nodoBase({ id: 'n3', tema: 'codigo', peso: 1 }),
    ];
    const grafo = grafoConNodos(nodos);
    const resultado = agruparNodos(grafo, { tipo: 'entidad' });

    expect(resultado.grupos.size).toBe(2);
    expect(resultado.grupos.get('diseño')!.pesoTotal).toBe(5);
    expect(resultado.grupos.get('codigo')!.pesoTotal).toBe(1);
  });

  it('agrupa por carpeta (tipo carpeta como padre)', () => {
    const nodos = [
      nodoBase({ id: 'carpeta1', tipo: 'carpeta', titulo: 'Proyecto', peso: 0 }),
      nodoBase({ id: 'n1', tipo: 'archivo', capas: ['carpeta1'], peso: 2 }),
      nodoBase({ id: 'n2', tipo: 'archivo', capas: ['carpeta1'], peso: 3 }),
      nodoBase({ id: 'carpeta2', tipo: 'carpeta', titulo: 'Otro', peso: 0 }),
      nodoBase({ id: 'n3', tipo: 'archivo', capas: ['carpeta2'], peso: 1 }),
    ];
    const grafo = grafoConNodos(nodos);
    const resultado = agruparNodos(grafo, { tipo: 'carpeta' });

    expect(resultado.grupos.size).toBe(2);
    expect(resultado.grupos.get('carpeta1')!.pesoTotal).toBe(5);
    expect(resultado.grupos.get('carpeta2')!.pesoTotal).toBe(1);
  });

  it('agrupa por comunidad (alcance comunidad)', () => {
    const nodos = [
      nodoBase({ id: 'n1', alcance: 'comunidad', peso: 2 }),
      nodoBase({ id: 'n2', alcance: 'comunidad', peso: 3 }),
      nodoBase({ id: 'n3', alcance: 'publico', peso: 1 }),
    ];
    const grafo = grafoConNodos(nodos);
    const resultado = agruparNodos(grafo, { tipo: 'comunidad' });

    expect(resultado.grupos.size).toBe(2);
    expect(resultado.grupos.get('comunidad')!.pesoTotal).toBe(5);
    expect(resultado.grupos.get('publico')!.pesoTotal).toBe(1);
  });

  it('respeta filtro de alcance en opciones', () => {
    const nodos = [
      nodoBase({ id: 'n1', alcance: 'privado', peso: 2 }),
      nodoBase({ id: 'n2', alcance: 'grupo', peso: 3 }),
      nodoBase({ id: 'n3', alcance: 'publico', peso: 1 }),
    ];
    const grafo = grafoConNodos(nodos);
    const resultado = agruparNodos(grafo, { tipo: 'dueno', alcancePermitido: ['privado', 'grupo'] });

    expect(resultado.grupos.size).toBe(1);
    expect(resultado.grupos.get('user1')!.pesoTotal).toBe(5);
  });

  it('es determinista: misma entrada produce mismo resultado', () => {
    const nodos = [
      nodoBase({ id: 'n1', dueno: 'user1', peso: 2 }),
      nodoBase({ id: 'n2', dueno: 'user2', peso: 3 }),
    ];
    const grafo = grafoConNodos(nodos);
    const a = agruparNodos(grafo, { tipo: 'dueno' });
    const b = agruparNodos(grafo, { tipo: 'dueno' });

    expect(a.grupos.size).toBe(b.grupos.size);
    for (const [clave, grupo] of a.grupos) {
      expect(b.grupos.get(clave)).toEqual(grupo);
    }
  });

  it('devuelve mapa vacío para grafo sin nodos', () => {
    const grafo = crearGrafo();
    const resultado = agruparNodos(grafo, { tipo: 'dueno' });
    expect(resultado.grupos.size).toBe(0);
    expect(resultado.nodosProcesados).toBe(0);
  });
});

describe('nivelDeDetalle', () => {
  it('colapsa grupos lejanos y expande cercanos', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1', 'n2'], pesoTotal: 5, centro: [0, 0, 0], radio: 1 }],
      ['g2', { id: 'g2', nodosIds: ['n3'], pesoTotal: 1, centro: [100, 0, 0], radio: 0.5 }],
    ]);
    const opciones: OpcionesNivelDetalle = {
      distancia: 50,
      umbralColapso: 10,
      topeVisibles: 100,
    };
    const resultado = nivelDeDetalle(grupos, opciones);

    expect(resultado.colapsados.has('g1')).toBe(false);
    expect(resultado.colapsados.has('g2')).toBe(true);
    expect(resultado.expandidas.has('g1')).toBe(true);
    expect(resultado.expandidas.has('g2')).toBe(false);
  });

  it('respeta tope de cuerpos visibles', () => {
    const grupos = new Map<string, Grupo>();
    for (let i = 0; i < 150; i++) {
      grupos.set(`g${i}`, {
        id: `g${i}`,
        nodosIds: [`n${i}`],
        pesoTotal: 1,
        centro: [i * 10, 0, 0],
        radio: 0.5,
      });
    }
    const opciones: OpcionesNivelDetalle = {
      distancia: 1000,
      umbralColapso: 10,
      topeVisibles: 100,
    };
    const resultado = nivelDeDetalle(grupos, opciones);

    expect(resultado.visibles.size).toBeLessThanOrEqual(100);
  });

  it('prioriza grupos con mayor peso al aplicar tope', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1'], pesoTotal: 10, centro: [0, 0, 0], radio: 1 }],
      ['g2', { id: 'g2', nodosIds: ['n2'], pesoTotal: 5, centro: [10, 0, 0], radio: 0.5 }],
      ['g3', { id: 'g3', nodosIds: ['n3'], pesoTotal: 1, centro: [20, 0, 0], radio: 0.5 }],
    ]);
    const opciones: OpcionesNivelDetalle = {
      distancia: 100,
      umbralColapso: 5,
      topeVisibles: 2,
    };
    const resultado = nivelDeDetalle(grupos, opciones);

    expect(resultado.visibles.has('g1')).toBe(true);
    expect(resultado.visibles.has('g2')).toBe(true);
    expect(resultado.visibles.has('g3')).toBe(false);
  });

  it('distancia 0 expande todo (sin tope)', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1'], pesoTotal: 1, centro: [0, 0, 0], radio: 1 }],
      ['g2', { id: 'g2', nodosIds: ['n2'], pesoTotal: 1, centro: [1000, 0, 0], radio: 0.5 }],
    ]);
    const opciones: OpcionesNivelDetalle = {
      distancia: 0,
      umbralColapso: 10,
      topeVisibles: 100,
    };
    const resultado = nivelDeDetalle(grupos, opciones);

    expect(resultado.expandidas.size).toBe(2);
    expect(resultado.colapsados.size).toBe(0);
  });

  it('es determinista', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1'], pesoTotal: 1, centro: [0, 0, 0], radio: 1 }],
    ]);
    const opciones: OpcionesNivelDetalle = {
      distancia: 50,
      umbralColapso: 10,
      topeVisibles: 100,
    };
    const a = nivelDeDetalle(grupos, opciones);
    const b = nivelDeDetalle(grupos, opciones);

    expect(a.colapsados).toEqual(b.colapsados);
    expect(a.expandidas).toEqual(b.expandidas);
    expect(a.visibles).toEqual(b.visibles);
  });
});

describe('colapsarGrupos', () => {
  it('colapsa grupos seleccionados y suma sus pesos', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1', 'n2'], pesoTotal: 5, centro: [0, 0, 0], radio: 1 }],
      ['g2', { id: 'g2', nodosIds: ['n3'], pesoTotal: 1, centro: [10, 0, 0], radio: 0.5 }],
    ]);
    const colapsados = new Set(['g2']);
    const resultado = colapsarGrupos(grupos, colapsados);

    expect(resultado.get('g1')!.pesoTotal).toBe(5);
    expect(resultado.get('g2')!.pesoTotal).toBe(1);
    expect(resultado.get('g2')!.colapsado).toBe(true);
    expect(resultado.get('g1')!.colapsado).toBe(false);
  });

  it('no muta el mapa original', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1'], pesoTotal: 1, centro: [0, 0, 0], radio: 1 }],
    ]);
    colapsarGrupos(grupos, new Set(['g1']));
    expect(grupos.get('g1')!.colapsado).toBeUndefined();
  });
});

describe('expandirGrupos', () => {
  it('expande grupos colapsados devolviendo sus nodos hijos', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1', 'n2'], pesoTotal: 5, centro: [0, 0, 0], radio: 1, colapsado: true }],
    ]);
    const expandidas = new Set(['g1']);
    const resultado = expandirGrupos(grupos, expandidas);

    expect(resultado.get('g1')!.colapsado).toBe(false);
    expect(resultado.get('g1')!.nodosIds).toEqual(['n1', 'n2']);
  });
});

describe('topeCuerposVisibles', () => {
  it('limita el número de grupos visibles por peso descendente', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1'], pesoTotal: 10, centro: [0, 0, 0], radio: 1 }],
      ['g2', { id: 'g2', nodosIds: ['n2'], pesoTotal: 5, centro: [10, 0, 0], radio: 0.5 }],
      ['g3', { id: 'g3', nodosIds: ['n3'], pesoTotal: 1, centro: [20, 0, 0], radio: 0.5 }],
    ]);
    const visibles = topeCuerposVisibles(grupos, 2);

    expect(visibles.size).toBe(2);
    expect(visibles.has('g1')).toBe(true);
    expect(visibles.has('g2')).toBe(true);
    expect(visibles.has('g3')).toBe(false);
  });

  it('devuelve todos si tope >= total', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1'], pesoTotal: 1, centro: [0, 0, 0], radio: 1 }],
    ]);
    const visibles = topeCuerposVisibles(grupos, 10);
    expect(visibles.size).toBe(1);
  });

  it('devuelve conjunto vacío para tope 0', () => {
    const grupos = new Map<string, Grupo>([
      ['g1', { id: 'g1', nodosIds: ['n1'], pesoTotal: 1, centro: [0, 0, 0], radio: 1 }],
    ]);
    const visibles = topeCuerposVisibles(grupos, 0);
    expect(visibles.size).toBe(0);
  });
});

describe('integración: grafos de diferentes tamaños', () => {
  function crearGrafoAleatorio(n: number, semilla = 42): Grafo4D {
    const grafo = crearGrafo();
    let estado = semilla;
    const aleatorio = () => {
      estado = (estado * 1664525 + 1013904223) >>> 0;
      return estado / 4294967296;
    };
    const duenos = ['user1', 'user2', 'user3', 'user4', 'user5'];
    const cerebros = ['cerebroA', 'cerebroB', 'cerebroC'];
    const temas = ['diseño', 'codigo', 'documentacion', 'tests', 'infra'];

    for (let i = 0; i < n; i++) {
      anadirNodo(grafo, nodoBase({
        id: `n${i}`,
        dueno: duenos[Math.floor(aleatorio() * duenos.length)],
        capas: [cerebros[Math.floor(aleatorio() * cerebros.length)]],
        tema: temas[Math.floor(aleatorio() * temas.length)],
        peso: 0.5 + aleatorio() * 2,
      }));
    }
    return grafo;
  }

  it('agrupa grafo de 10 nodos correctamente', () => {
    const grafo = crearGrafoAleatorio(10);
    const resultado = agruparNodos(grafo, { tipo: 'dueno' });

    expect(resultado.nodosProcesados).toBe(10);
    expect(resultado.grupos.size).toBeLessThanOrEqual(5);
    let sumaPesos = 0;
    for (const grupo of resultado.grupos.values()) {
      sumaPesos += grupo.pesoTotal;
    }
    expect(sumaPesos).toBeGreaterThan(0);
  });

  it('agrupa grafo de 1000 nodos en tiempo razonable', () => {
    const grafo = crearGrafoAleatorio(1000);
    const inicio = performance.now();
    const resultado = agruparNodos(grafo, { tipo: 'cerebro' });
    const ms = performance.now() - inicio;

    expect(resultado.nodosProcesados).toBe(1000);
    expect(resultado.grupos.size).toBeLessThanOrEqual(3);
    expect(ms).toBeLessThan(100);
  });

  it('agrupa grafo de 20000 nodos en tiempo razonable', () => {
    const grafo = crearGrafoAleatorio(20000);
    const inicio = performance.now();
    const resultado = agruparNodos(grafo, { tipo: 'entidad' });
    const ms = performance.now() - inicio;

    expect(resultado.nodosProcesados).toBe(20000);
    expect(resultado.grupos.size).toBeLessThanOrEqual(5);
    expect(ms).toBeLessThan(500);
  });

  it('nivelDeDetalle funciona con 20000 grupos simulados', () => {
    const grupos = new Map<string, Grupo>();
    for (let i = 0; i < 20000; i++) {
      grupos.set(`g${i}`, {
        id: `g${i}`,
        nodosIds: [`n${i}`],
        pesoTotal: Math.random() * 10 + 0.1,
        centro: [Math.random() * 1000, Math.random() * 1000, Math.random() * 1000],
        radio: 0.5 + Math.random(),
      });
    }
    const opciones: OpcionesNivelDetalle = {
      distancia: 500,
      umbralColapso: 50,
      topeVisibles: 5000,
    };
    const inicio = performance.now();
    const resultado = nivelDeDetalle(grupos, opciones);
    const ms = performance.now() - inicio;

    expect(resultado.visibles.size).toBeLessThanOrEqual(5000);
    expect(ms).toBeLessThan(200);
  });
});

describe('tipos y validaciones', () => {
  it('Grupo tiene la estructura esperada', () => {
    const grupo: Grupo = {
      id: 'g1',
      nodosIds: ['n1', 'n2'],
      pesoTotal: 5,
      centro: [0, 0, 0],
      radio: 1,
      colapsado: false,
    };
    expect(grupo.nodosIds).toHaveLength(2);
    expect(typeof grupo.pesoTotal).toBe('number');
    expect(grupo.centro).toHaveLength(3);
  });

  it('AgrupacionResultado contiene grupos y metadatos', () => {
    const grafo = grafoConNodos([nodoBase({ id: 'n1' })]);
    const resultado = agruparNodos(grafo, { tipo: 'dueno' });

    expect(resultado.grupos).toBeInstanceOf(Map);
    expect(typeof resultado.nodosProcesados).toBe('number');
    expect(typeof resultado.tipoAgrupacion).toBe('string');
  });

  it('OpcionesAgrupacion valida tipo requerido', () => {
    const grafo = grafoConNodos([nodoBase({ id: 'n1' })]);
    // @ts-expect-error: tipo es requerido
    expect(() => agruparNodos(grafo, {})).toThrow();
  });
});