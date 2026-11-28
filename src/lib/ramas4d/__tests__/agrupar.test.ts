import { describe, it, expect } from 'vitest';
import {
  agruparPorFaceta,
  nivelDeDetalle,
  colapsarGruposLejanos,
  TOPE_CUERPOS_VISIBLES,
} from '../agrupar';
import { Nodo, Grafo4D, crearGrafo, anadirNodo } from '../modelo';

function crearNodoBase(overrides: Partial<Nodo> = {}): Nodo {
  return {
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
    ...overrides,
  };
}

function crearGrafoDePrueba(nodos: Nodo[]): Grafo4D {
  const grafo = crearGrafo();
  for (const nodo of nodos) {
    anadirNodo(grafo, nodo);
  }
  return grafo;
}

describe('agruparPorFaceta', () => {
  it('agrupa por dueño', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'n1', dueno: 'user1', titulo: 'A' }),
      crearNodoBase({ id: 'n2', dueno: 'user1', titulo: 'B' }),
      crearNodoBase({ id: 'n3', dueno: 'user2', titulo: 'C' }),
    ]);
    const grupos = agruparPorFaceta(grafo, 'dueno');
    expect(grupos.size).toBe(2);
    expect(grupos.get('user1')?.length).toBe(2);
    expect(grupos.get('user2')?.length).toBe(1);
  });

  it('agrupa por cerebro (capas[0])', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'n1', capas: ['cerebro1'], titulo: 'A' }),
      crearNodoBase({ id: 'n2', capas: ['cerebro1'], titulo: 'B' }),
      crearNodoBase({ id: 'n3', capas: ['cerebro2'], titulo: 'C' }),
    ]);
    const grupos = agruparPorFaceta(grafo, 'cerebro');
    expect(grupos.size).toBe(2);
    expect(grupos.get('cerebro1')?.length).toBe(2);
    expect(grupos.get('cerebro2')?.length).toBe(1);
  });

  it('agrupa por entidad', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'n1', tipo: 'entidad', titulo: 'Entidad A' }),
      crearNodoBase({ id: 'n2', tipo: 'entidad', titulo: 'Entidad A' }),
      crearNodoBase({ id: 'n3', tipo: 'entidad', titulo: 'Entidad B' }),
    ]);
    const grupos = agruparPorFaceta(grafo, 'entidad');
    expect(grupos.size).toBe(2);
  });

  it('agrupa por carpeta (tipo carpeta como padre)', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'c1', tipo: 'carpeta', titulo: 'Carpeta 1' }),
      crearNodoBase({ id: 'n1', tipo: 'archivo', titulo: 'Archivo 1' }),
      crearNodoBase({ id: 'n2', tipo: 'archivo', titulo: 'Archivo 2' }),
    ]);
    grafo.ramas.set('c1', ['n1', 'n2']);
    const grupos = agruparPorFaceta(grafo, 'carpeta');
    expect(grupos.size).toBe(1);
    expect(grupos.get('c1')?.length).toBe(2);
  });

  it('agrupa por comunidad (alcance comunidad)', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'n1', alcance: 'comunidad', dueno: 'comm1', titulo: 'A' }),
      crearNodoBase({ id: 'n2', alcance: 'comunidad', dueno: 'comm1', titulo: 'B' }),
      crearNodoBase({ id: 'n3', alcance: 'comunidad', dueno: 'comm2', titulo: 'C' }),
    ]);
    const grupos = agruparPorFaceta(grafo, 'comunidad');
    expect(grupos.size).toBe(2);
  });

  it('devuelve Map vacío para grafo sin nodos', () => {
    const grafo = crearGrafo();
    const grupos = agruparPorFaceta(grafo, 'dueno');
    expect(grupos.size).toBe(0);
  });
});

describe('nivelDeDetalle', () => {
  it('distancia 0 → todo abierto (sin colapsar)', () => {
    const grupos = new Map([
      ['g1', ['n1', 'n2', 'n3']],
      ['g2', ['n4', 'n5']],
    ]);
    const resultado = nivelDeDetalle(0, grupos, 100);
    expect(resultado.colapsados.size).toBe(0);
    expect(resultado.abiertos.size).toBe(2);
  });

  it('distancia alta → todo colapsado', () => {
    const grupos = new Map([
      ['g1', ['n1', 'n2']],
      ['g2', ['n3', 'n4']],
    ]);
    const resultado = nivelDeDetalle(1000, grupos, 100);
    expect(resultado.abiertos.size).toBe(0);
    expect(resultado.colapsados.size).toBe(2);
  });

  it('respeta TOPE_CUERPOS_VISIBLES', () => {
    const grupos = new Map<string, string[]>();
    for (let i = 0; i < 150; i++) {
      grupos.set(`g${i}`, [`n${i}`]);
    }
    const resultado = nivelDeDetalle(10, grupos, TOPE_CUERPOS_VISIBLES);
    const totalCuerpos = resultado.abiertos.size + resultado.colapsados.size;
    expect(totalCuerpos).toBeLessThanOrEqual(TOPE_CUERPOS_VISIBLES);
  });

  it('prioriza grupos con mayor peso total al abrir', () => {
    const grupos = new Map([
      ['pesado', Array(50).fill(0).map((_, i) => `n${i}`)],
      ['ligero', ['n1']],
    ]);
    const nodosPeso = new Map<string, number>();
    for (let i = 0; i < 50; i++) nodosPeso.set(`n${i}`, 2.0);
    nodosPeso.set('n1', 1.0);
    const resultado = nivelDeDetalle(50, grupos, 10, nodosPeso);
    expect(resultado.abiertos.has('pesado')).toBe(true);
  });
});

describe('colapsarGruposLejanos', () => {
  it('colapsa grupos cuya distancia al centro supera el umbral', () => {
    const grupos = new Map([
      ['cerca', ['n1', 'n2']],
      ['lejos', ['n3', 'n4']],
    ]);
    const distancias = new Map([['cerca', 10], ['lejos', 500]]);
    const resultado = colapsarGruposLejanos(grupos, distancias, 100);
    expect(resultado.colapsados.has('lejos')).toBe(true);
    expect(resultado.abiertos.has('cerca')).toBe(true);
  });

  it('calcula tamaño de cuerpo colapsado como suma de pesos', () => {
    const grupos = new Map([['g1', ['n1', 'n2', 'n3']]]);
    const nodosPeso = new Map([
      ['n1', 1.0],
      ['n2', 2.0],
      ['n3', 3.0],
    ]);
    const distancias = new Map([['g1', 500]]);
    const resultado = colapsarGruposLejanos(grupos, distancias, 100, nodosPeso);
    expect(resultado.colapsados.get('g1')?.tamano).toBe(6.0);
  });
});

describe('rendimiento con grafos grandes', () => {
  it('agrupar 10 nodos en < 5ms', () => {
    const nodos = Array.from({ length: 10 }, (_, i) =>
      crearNodoBase({ id: `n${i}`, dueno: `user${i % 3}` })
    );
    const grafo = crearGrafoDePrueba(nodos);
    const inicio = performance.now();
    agruparPorFaceta(grafo, 'dueno');
    const duracion = performance.now() - inicio;
    expect(duracion).toBeLessThan(5);
  });

  it('agrupar 1000 nodos en < 50ms', () => {
    const nodos = Array.from({ length: 1000 }, (_, i) =>
      crearNodoBase({ id: `n${i}`, dueno: `user${i % 10}`, capas: [`cerebro${i % 5}`] })
    );
    const grafo = crearGrafoDePrueba(nodos);
    const inicio = performance.now();
    agruparPorFaceta(grafo, 'dueno');
    agruparPorFaceta(grafo, 'cerebro');
    const duracion = performance.now() - inicio;
    expect(duracion).toBeLessThan(50);
  });

  it('agrupar 20000 nodos en < 500ms', () => {
    const nodos = Array.from({ length: 20000 }, (_, i) =>
      crearNodoBase({
        id: `n${i}`,
        dueno: `user${i % 50}`,
        capas: [`cerebro${i % 20}`],
        alcance: i % 3 === 0 ? 'comunidad' : 'privado',
      })
    );
    const grafo = crearGrafoDePrueba(nodos);
    const inicio = performance.now();
    agruparPorFaceta(grafo, 'dueno');
    agruparPorFaceta(grafo, 'cerebro');
    agruparPorFaceta(grafo, 'comunidad');
    const duracion = performance.now() - inicio;
    expect(duracion).toBeLessThan(500);
  });

  it('nivelDeDetalle con 20000 grupos respeta tope y termina en < 100ms', () => {
    const grupos = new Map<string, string[]>();
    for (let i = 0; i < 20000; i++) {
      grupos.set(`g${i}`, [`n${i}`]);
    }
    const inicio = performance.now();
    nivelDeDetalle(100, grupos, TOPE_CUERPOS_VISIBLES);
    const duracion = performance.now() - inicio;
    expect(duracion).toBeLessThan(100);
  });
});

describe('agrupar por entidad y comunidad con capas', () => {
  it('agrupa el contenido de una entidad con la entidad por su capa', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'e1', tipo: 'entidad', titulo: 'Aurora' }),
      crearNodoBase({ id: 'n1', tipo: 'archivo', capas: ['entidad-Aurora'] }),
      crearNodoBase({ id: 'n2', tipo: 'memoria', capas: ['entidad-Aurora'] }),
    ]);
    const grupos = agruparPorFaceta(grafo, 'entidad');
    expect(grupos.get('Aurora')?.length).toBe(3);
    expect(grupos.get('Aurora')).toEqual(expect.arrayContaining(['e1', 'n1', 'n2']));
  });

  it('usa la capa comunidad- como clave de comunidad', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'n1', alcance: 'comunidad', dueno: 'u1', capas: ['comunidad-luna'] }),
      crearNodoBase({ id: 'n2', alcance: 'comunidad', dueno: 'u1', capas: ['comunidad-luna'] }),
      crearNodoBase({ id: 'n3', alcance: 'comunidad', dueno: 'u2', capas: ['comunidad-sol'] }),
    ]);
    const grupos = agruparPorFaceta(grafo, 'comunidad');
    expect(grupos.get('luna')?.length).toBe(2);
    expect(grupos.get('sol')?.length).toBe(1);
  });

  it('incluye en comunidad los nodos con capa comunidad- aunque su alcance no sea comunidad', () => {
    const grafo = crearGrafoDePrueba([
      crearNodoBase({ id: 'n1', alcance: 'grupo', capas: ['comunidad-luna'] }),
    ]);
    const grupos = agruparPorFaceta(grafo, 'comunidad');
    expect(grupos.get('luna')).toEqual(['n1']);
  });

  it('agrupa 20000 nodos por entidad sin perder el tope de cuerpos', () => {
    const nodos = Array.from({ length: 20000 }, (_, i) =>
      crearNodoBase({ id: `n${i}`, capas: [`entidad-e${i % 40}`] })
    );
    const grafo = crearGrafoDePrueba(nodos);
    const grupos = agruparPorFaceta(grafo, 'entidad');
    expect(grupos.size).toBe(40);
    const resultado = nivelDeDetalle(0, grupos, TOPE_CUERPOS_VISIBLES);
    expect(resultado.abiertos.size + resultado.colapsados.size).toBeLessThanOrEqual(
      TOPE_CUERPOS_VISIBLES
    );
  });
});

describe('nivelDeDetalle progresivo', () => {
  it('a media distancia abre los grupos más pesados y colapsa los ligeros', () => {
    const grupos = new Map([
      ['pesado', ['a', 'b', 'c', 'd']],
      ['ligero', ['e']],
    ]);
    const pesos = new Map([
      ['a', 10],
      ['b', 10],
      ['c', 10],
      ['d', 10],
      ['e', 1],
    ]);
    const resultado = nivelDeDetalle(50, grupos, 10, pesos);
    expect(resultado.abiertos.has('pesado')).toBe(true);
    expect(resultado.colapsados.has('ligero')).toBe(true);
    expect(resultado.colapsados.get('ligero')?.tamano).toBe(1);
  });

  it('el tamaño del cuerpo colapsado es la suma de pesos de sus miembros', () => {
    const grupos = new Map([
      ['g1', ['a', 'b']],
      ['g2', ['c', 'd']],
    ]);
    const pesos = new Map([
      ['a', 4],
      ['b', 6],
      ['c', 1],
      ['d', 1],
    ]);
    const resultado = nivelDeDetalle(50, grupos, 10, pesos);
    expect(resultado.abiertos.has('g1')).toBe(true);
    expect(resultado.colapsados.get('g2')?.tamano).toBe(2);
  });

  it('con tope 0 no muestra ningún cuerpo', () => {
    const grupos = new Map([['g1', ['a']]]);
    const resultado = nivelDeDetalle(0, grupos, 0);
    expect(resultado.abiertos.size).toBe(0);
    expect(resultado.colapsados.size).toBe(0);
  });

  it('respeta un umbral de distancia propio', () => {
    const grupos = new Map([['g1', ['a']]]);
    const resultado = nivelDeDetalle(30, grupos, 10, undefined, 30);
    expect(resultado.colapsados.has('g1')).toBe(true);
  });

  it('desempata por clave para ser determinista', () => {
    const grupos = new Map([
      ['zeta', ['a']],
      ['alfa', ['b']],
    ]);
    const uno = nivelDeDetalle(50, grupos, 10);
    const dos = nivelDeDetalle(50, grupos, 10);
    expect(Array.from(uno.abiertos.keys())).toEqual(['alfa']);
    expect(Array.from(uno.abiertos.keys())).toEqual(Array.from(dos.abiertos.keys()));
  });
});