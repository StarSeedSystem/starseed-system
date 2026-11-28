import { describe, it, expect } from 'vitest';
import {
  FORMATOS_RAMA,
  anillosDeProgreso,
  brilloDeProgreso,
  construirGrafoEducacion,
  huecosDeRuta,
  siguientePasoRecomendado,
  tipoDeFormato,
  type EntradaPlantillaEducacion,
  type RamaEducativa,
  type TemaEducativo,
} from '../plantillas/educacion';

function tema(
  parcial: Partial<TemaEducativo> & Pick<TemaEducativo, 'id' | 'titulo'>,
): TemaEducativo {
  return {
    padreId: null,
    progresoPropio: 0,
    ramas: [],
    ...parcial,
  };
}

function rama(id: string, formato: RamaEducativa['formato'] = 'leccion'): RamaEducativa {
  return { id, titulo: `Rama ${id}`, formato, ref: `/ramas/${id}` };
}

describe('brillo y anillos de progreso', () => {
  it('ilumina con el progreso propio y suma el del grupo sin pasar de 1', () => {
    expect(brilloDeProgreso(0)).toBeCloseTo(0.3);
    expect(brilloDeProgreso(0.5)).toBeCloseTo(0.65);
    expect(brilloDeProgreso(1)).toBeCloseTo(1);
    expect(brilloDeProgreso(1, 1)).toBeCloseTo(1);
    expect(brilloDeProgreso(-3)).toBeCloseTo(0.3);
    expect(brilloDeProgreso(2, 2)).toBeCloseTo(1);
  });

  it('dibuja anillos solo cuando hay dato del grupo', () => {
    expect(anillosDeProgreso(undefined)).toBe(0);
    expect(anillosDeProgreso(0)).toBe(0);
    expect(anillosDeProgreso(0.1)).toBe(1);
    expect(anillosDeProgreso(0.5)).toBe(2);
    expect(anillosDeProgreso(1)).toBe(3);
    expect(anillosDeProgreso(4)).toBe(3);
  });
});

describe('siguiente paso recomendado', () => {
  it('elige el primer tema incompleto con prerrequisitos completos', () => {
    const temas = [
      tema({ id: 'cat', titulo: 'Categoría', estructura: true }),
      tema({ id: 'a', titulo: 'A', progresoPropio: 1 }),
      tema({ id: 'b', titulo: 'B', progresoPropio: 0.2 }),
      tema({ id: 'c', titulo: 'C', progresoPropio: 0.1 }),
    ];
    expect(siguientePasoRecomendado(temas, [{ de: 'b', a: 'c' }])).toBe('b');
  });

  it('salta el tema bloqueado y devuelve el que sí puede empezar', () => {
    const temas = [
      tema({ id: 'a', titulo: 'A' }),
      tema({ id: 'b', titulo: 'B' }),
    ];
    expect(siguientePasoRecomendado(temas, [{ de: 'b', a: 'a' }])).toBe('b');
  });

  it('devuelve null cuando la ruta está completa', () => {
    const temas = [tema({ id: 'a', titulo: 'A', progresoPropio: 1 })];
    expect(siguientePasoRecomendado(temas)).toBeNull();
  });
});

describe('huecos de la ruta', () => {
  it('señala temas sin ramas, ramas sin referencia y prerrequisitos fuera', () => {
    const temas = [
      tema({ id: 'cat', titulo: 'Categoría', estructura: true }),
      tema({ id: 'a', titulo: 'A' }),
      tema({
        id: 'b',
        titulo: 'B',
        ramas: [{ id: 'r', titulo: 'Rama rota', formato: 'enlace', ref: '   ' }],
      }),
    ];
    const huecos = huecosDeRuta(temas, [{ de: 'x', a: 'a' }]);
    expect(huecos.some((h) => h.temaId === 'cat' && h.motivo === 'sin-ramas')).toBe(false);
    expect(huecos.some((h) => h.temaId === 'a' && h.motivo === 'sin-ramas')).toBe(true);
    expect(huecos.some((h) => h.temaId === 'b' && h.motivo === 'rama-sin-ref')).toBe(true);
    expect(huecos.some((h) => h.motivo === 'prerrequisito-ausente')).toBe(true);
  });

  it('detecta un tema repetido sin duplicar su nodo', () => {
    const entrada: EntradaPlantillaEducacion = {
      ahora: 10,
      temas: [tema({ id: 'a', titulo: 'A' }), tema({ id: 'a', titulo: 'A otra vez' })],
    };
    const resultado = construirGrafoEducacion(entrada);
    expect(resultado.grafo.nodos.size).toBe(1);
    expect(resultado.huecos.some((h) => h.motivo === 'tema-duplicado')).toBe(true);
  });
});

describe('grafo de la plantilla Educación', () => {
  it('crea nodos de tema y de rama con aristas dirigidas de prerrequisito y contención', () => {
    const entrada: EntradaPlantillaEducacion = {
      ahora: 1000,
      temas: [
        tema({ id: 'a', titulo: 'Álgebra', ramas: [rama('v1', 'video')] }),
        tema({
          id: 'b',
          titulo: 'Cálculo',
          padreId: 'a',
          progresoPropio: 0.4,
          progresoGrupo: 0.8,
          ramas: [
            { id: 'e1', titulo: 'Ejercicio', formato: 'ejercicio', ref: '/e/1', completada: true },
            rama('p1', 'proyecto'),
          ],
        }),
      ],
    };
    const resultado = construirGrafoEducacion(entrada);
    expect(resultado.grafo.nodos.has('edu:a')).toBe(true);
    expect(resultado.grafo.nodos.get('edu:a:v1')?.formato).toBe('video');
    expect(
      resultado.grafo.aristas.some(
        (a) => a.de === 'edu:a' && a.a === 'edu:b' && a.tipo === 'prerrequisito',
      ),
    ).toBe(true);
    expect(
      resultado.grafo.aristas.some(
        (a) => a.de === 'edu:a' && a.a === 'edu:a:v1' && a.tipo === 'contiene',
      ),
    ).toBe(true);
    expect(resultado.grafo.ramas.get('edu:a')).toEqual(
      expect.arrayContaining(['edu:b', 'edu:a:v1']),
    );
    expect(resultado.padres.get('edu:b')).toBe('edu:a');
    expect(resultado.padres.get('edu:a')).toBeNull();
  });

  it('solo guarda referencias y nunca campos de contenido privado', () => {
    const resultado = construirGrafoEducacion({
      ahora: 1,
      temas: [tema({ id: 'a', titulo: 'Tema', ramas: [rama('r', 'enlace')] })],
    });
    for (const nodo of resultado.grafo.nodos.values()) {
      expect(nodo.ref.startsWith('/')).toBe(true);
      for (const clave of ['contenido', 'cuerpo', 'texto_privado', 'secret', 'password', 'token']) {
        expect(Object.prototype.hasOwnProperty.call(nodo, clave)).toBe(false);
      }
    }
  });

  it('refleja el progreso en el peso y en las etiquetas del nodo', () => {
    const resultado = construirGrafoEducacion({
      ahora: 1,
      temas: [tema({ id: 'a', titulo: 'A', progresoPropio: 1, progresoGrupo: 1 })],
    });
    const nodo = resultado.grafo.nodos.get('edu:a');
    expect(nodo?.peso).toBeCloseTo(1);
    expect(nodo?.etiquetas).toContain('propio:1.00');
    expect(nodo?.etiquetas).toContain('grupo:1.00');
    expect(nodo?.etiquetas).toContain('anillos:3');
  });

  it('acepta todos los formatos de rama del contrato', () => {
    const ramas = FORMATOS_RAMA.map((formato, i) => rama(`r${i}`, formato));
    const resultado = construirGrafoEducacion({
      ahora: 5,
      temas: [tema({ id: 'a', titulo: 'A', ramas })],
    });
    for (const formato of FORMATOS_RAMA) {
      const nodo = [...resultado.grafo.nodos.values()].find((n) => n.formato === formato);
      expect(nodo).toBeDefined();
    }
  });

  it('mapea cada formato a su tipo y crea los prerrequisitos explícitos', () => {
    expect(tipoDeFormato('video')).toBe('archivo');
    expect(tipoDeFormato('ejercicio')).toBe('tarea');
    expect(tipoDeFormato('evaluacion')).toBe('tarea');
    expect(tipoDeFormato('proyecto')).toBe('proyecto');
    expect(tipoDeFormato('sesion-en-vivo')).toBe('proceso');
    expect(tipoDeFormato('leccion')).toBe('leccion');
    expect(tipoDeFormato('enlace')).toBe('archivo');

    const resultado = construirGrafoEducacion({
      ahora: 2,
      temas: [
        tema({ id: 'a', titulo: 'A', progresoPropio: 1 }),
        tema({ id: 'c', titulo: 'C' }),
      ],
      prerrequisitos: [{ de: 'a', a: 'c', intensidad: 0.7 }],
    });
    const arista = resultado.grafo.aristas.find(
      (e) => e.de === 'edu:a' && e.a === 'edu:c' && e.tipo === 'prerrequisito',
    );
    expect(arista?.intensidad).toBe(0.7);
  });
});
