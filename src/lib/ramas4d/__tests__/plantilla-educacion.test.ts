import { describe, it, expect } from 'vitest';
import {
  PREFIJO_EDU,
  anillosDeProgreso,
  brilloDeProgreso,
  construirPlantillaEducacion,
  formatoDeRama,
  idNodoEducativo,
  idOriginalEducativo,
  progresoDeRama,
  type FormatoRamaEducativa,
  type RamaEducativa,
  type RutaEducativa,
} from '../plantillas/educacion';

function rama(id: string, extra: Partial<RamaEducativa> = {}): RamaEducativa {
  return {
    id,
    titulo: `Rama ${id}`,
    formato: 'leccion',
    ref: `/educacion/${id}`,
    ...extra,
  };
}

function ruta(id: string, ramas: RamaEducativa[], extra: Partial<RutaEducativa> = {}): RutaEducativa {
  return { id, titulo: `Ruta ${id}`, ramas, ...extra };
}

describe('anillos y brillo de progreso', () => {
  it('no enciende anillos sin progreso y llega a tres con la rama completa', () => {
    expect(anillosDeProgreso(0)).toBe(0);
    expect(anillosDeProgreso(-1)).toBe(0);
    expect(anillosDeProgreso(0.01)).toBe(1);
    expect(anillosDeProgreso(0.34)).toBe(2);
    expect(anillosDeProgreso(0.67)).toBe(3);
    expect(anillosDeProgreso(1)).toBe(3);
    expect(anillosDeProgreso(4)).toBe(3);
  });

  it('el brillo parte de un cuerpo visible y sube con el progreso propio y del grupo', () => {
    expect(brilloDeProgreso(0, 0)).toBeCloseTo(0.35);
    expect(brilloDeProgreso(1, 0)).toBeCloseTo(0.85);
    expect(brilloDeProgreso(1, 1)).toBeCloseTo(1);
    expect(brilloDeProgreso(2, 2)).toBeCloseTo(1);
    expect(brilloDeProgreso(-1, -1)).toBeCloseTo(0.35);
  });
});

describe('progresoDeRama', () => {
  it('usa hecho como rama completa', () => {
    const avance = progresoDeRama(rama('a', { hecho: true }));
    expect(avance.propio).toBe(1);
    expect(avance.anillosPropio).toBe(3);
    expect(avance.grupo).toBe(0);
    expect(avance.brillo).toBeCloseTo(0.85);
  });

  it('calcula el progreso propio por pasos hechos', () => {
    const avance = progresoDeRama(rama('a', { pasosHechos: 1, pasosTotal: 4 }));
    expect(avance.propio).toBeCloseTo(0.25);
    expect(avance.anillosPropio).toBe(1);
    expect(avance.brillo).toBeCloseTo(0.475);
  });

  it('acepta un progreso directo y el progreso del grupo', () => {
    const avance = progresoDeRama(
      rama('a', { progresoPropio: 0.5, grupoHechos: 3, grupoTotal: 4 }),
    );
    expect(avance.propio).toBeCloseTo(0.5);
    expect(avance.anillosPropio).toBe(2);
    expect(avance.grupo).toBeCloseTo(0.75);
    expect(avance.anillosGrupo).toBe(3);
    expect(avance.brillo).toBeCloseTo(0.35 + 0.25 + 0.1125);
  });

  it('hecho en falso no pisa los pasos ya calculados', () => {
    const avance = progresoDeRama(
      rama('a', { hecho: false, pasosHechos: 2, pasosTotal: 4 }),
    );
    expect(avance.propio).toBeCloseTo(0.5);
  });
});

describe('formato e identificadores', () => {
  it('traduce cada formato educativo a su formato de nodo', () => {
    expect(formatoDeRama('leccion')).toBe('documento');
    expect(formatoDeRama('video')).toBe('video');
    expect(formatoDeRama('ejercicio')).toBe('flujo');
    expect(formatoDeRama('proyecto')).toBe('app');
    expect(formatoDeRama('sesion')).toBe('enlace');
    expect(formatoDeRama('evaluacion')).toBe('tabla');
    expect(formatoDeRama('enlace')).toBe('enlace');
    expect(formatoDeRama('otro' as FormatoRamaEducativa)).toBe('enlace');
  });

  it('antepone y quita el prefijo educativo sin duplicarlo', () => {
    expect(idNodoEducativo('top-fisica')).toBe(`${PREFIJO_EDU}top-fisica`);
    expect(idNodoEducativo(`${PREFIJO_EDU}top-fisica`)).toBe(`${PREFIJO_EDU}top-fisica`);
    expect(idOriginalEducativo(`${PREFIJO_EDU}top-fisica`)).toBe('top-fisica');
    expect(idOriginalEducativo('top-fisica')).toBe('top-fisica');
  });
});

describe('construirPlantillaEducacion: rutas y prerrequisitos', () => {
  const rutas: RutaEducativa[] = [
    ruta('cat-ciencia', [
      rama('top-fisica'),
      rama('sub-cuantica', { formato: 'video', prerequisitos: ['top-fisica'] }),
      rama('proyecto-luz', { formato: 'proyecto', prerequisitos: ['sub-cuantica'] }),
    ]),
  ];

  it('crea la ruta y sus ramas con el formato de cada una', () => {
    const plantilla = construirPlantillaEducacion({ rutas, ahora: 100 });
    expect(plantilla.grafo.nodos.size).toBe(4);
    expect(plantilla.grafo.nodos.has('edu:cat-ciencia')).toBe(true);
    expect(plantilla.grafo.nodos.get('edu:top-fisica')?.formato).toBe('documento');
    expect(plantilla.grafo.nodos.get('edu:sub-cuantica')?.formato).toBe('video');
    expect(plantilla.grafo.nodos.get('edu:proyecto-luz')?.tipo).toBe('proyecto');
    expect(plantilla.grafo.nodos.get('edu:proyecto-luz')?.formato).toBe('app');
  });

  it('une la ruta con contiene y los prerrequisitos como aristas dirigidas', () => {
    const plantilla = construirPlantillaEducacion({ rutas, ahora: 100 });
    expect(plantilla.grafo.aristas).toContainEqual(
      expect.objectContaining({
        de: 'edu:cat-ciencia',
        a: 'edu:top-fisica',
        tipo: 'contiene',
      }),
    );
    expect(plantilla.grafo.aristas).toContainEqual(
      expect.objectContaining({
        de: 'edu:top-fisica',
        a: 'edu:sub-cuantica',
        tipo: 'prerrequisito',
      }),
    );
    expect(plantilla.grafo.aristas).toContainEqual(
      expect.objectContaining({
        de: 'edu:sub-cuantica',
        a: 'edu:proyecto-luz',
        tipo: 'prerrequisito',
      }),
    );
  });

  it('da posiciones finitas, una por nodo y ordenadas por profundidad de prerrequisitos', () => {
    const plantilla = construirPlantillaEducacion({ rutas, ahora: 100 });
    expect(plantilla.posiciones.length).toBe(plantilla.grafo.nodos.size * 3);
    expect(plantilla.posiciones.every(Number.isFinite)).toBe(true);
    const y = (id: string) => {
      const indice = Array.from(plantilla.grafo.nodos.keys()).indexOf(id);
      return plantilla.posiciones[indice * 3 + 1];
    };
    expect(y('edu:sub-cuantica')).toBeGreaterThan(y('edu:top-fisica'));
    expect(y('edu:proyecto-luz')).toBeGreaterThan(y('edu:sub-cuantica'));
  });

  it('es determinista: la misma entrada produce las mismas posiciones', () => {
    const a = construirPlantillaEducacion({ rutas, ahora: 100 });
    const b = construirPlantillaEducacion({ rutas, ahora: 100 });
    expect(Array.from(a.posiciones)).toEqual(Array.from(b.posiciones));
    expect(Array.from(a.grafo.nodos.keys())).toEqual(Array.from(b.grafo.nodos.keys()));
  });

  it('propaga alcance y dueño sin meter contenido privado en el grafo', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [ruta('r1', [rama('privada', { alcance: 'privado', dueno: 'yo' })])],
    });
    const nodo = plantilla.grafo.nodos.get('edu:privada');
    expect(nodo?.alcance).toBe('privado');
    expect(nodo?.dueno).toBe('yo');
    for (const n of plantilla.grafo.nodos.values()) {
      expect(Object.keys(n)).not.toContain('contenido');
      expect(Object.keys(n)).not.toContain('cuerpo');
      expect(n.ref.length).toBeGreaterThan(0);
    }
  });
});

describe('construirPlantillaEducacion: progreso propio y del grupo', () => {
  it('calcula el avance de cada rama y el promedio de la ruta', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [
        ruta('r1', [
          rama('a', { hecho: true }),
          rama('b', { pasosHechos: 1, pasosTotal: 4, grupoHechos: 2, grupoTotal: 4 }),
        ]),
      ],
    });
    expect(plantilla.progreso.get('edu:a')?.propio).toBe(1);
    expect(plantilla.progreso.get('edu:b')?.propio).toBeCloseTo(0.25);
    expect(plantilla.progreso.get('edu:b')?.grupo).toBeCloseTo(0.5);
    expect(plantilla.progreso.get('edu:r1')?.propio).toBeCloseTo(0.625);
    expect(plantilla.progreso.get('edu:r1')?.grupo).toBeCloseTo(0.25);
    expect(plantilla.progreso.get('edu:r1')?.anillosPropio).toBe(2);
  });

  it('el brillo de la rama completa es mayor que el de la rama sin empezar', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [ruta('r1', [rama('hecha', { hecho: true }), rama('nueva')])],
    });
    const hecha = plantilla.grafo.nodos.get('edu:hecha');
    const nueva = plantilla.grafo.nodos.get('edu:nueva');
    expect(hecha?.peso).toBeGreaterThan(nueva?.peso ?? 1);
  });
});

describe('construirPlantillaEducacion: siguiente paso y huecos', () => {
  it('recomienda el primer paso desbloqueado y no uno que espera prerrequisitos', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [
        ruta('r1', [
          rama('base'),
          rama('medio', { prerequisitos: ['base'] }),
          rama('final', { prerequisitos: ['medio'] }),
        ]),
      ],
    });
    expect(plantilla.siguiente).toEqual({
      rutaId: 'r1',
      ramaId: 'base',
      titulo: 'Rama base',
    });
  });

  it('avanza al siguiente paso cuando el anterior ya está hecho', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [
        ruta('r1', [
          rama('base', { hecho: true }),
          rama('medio', { prerequisitos: ['base'] }),
          rama('final', { prerequisitos: ['medio'] }),
        ]),
      ],
    });
    expect(plantilla.siguiente).toEqual({
      rutaId: 'r1',
      ramaId: 'medio',
      titulo: 'Rama medio',
    });
  });

  it('devuelve null cuando la ruta está completa', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [
        ruta('r1', [
          rama('base', { hecho: true }),
          rama('final', { hecho: true, prerequisitos: ['base'] }),
        ]),
      ],
    });
    expect(plantilla.siguiente).toBeNull();
  });

  it('señala rutas vacías, ramas sin referencia y prerrequisitos ausentes', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [
        ruta('vacia', []),
        ruta('r1', [
          rama('sin-ref', { ref: '' }),
          rama('huerfana', { prerequisitos: ['no-existe'] }),
        ]),
      ],
    });
    const tipos = plantilla.huecos.map((hueco) => hueco.tipo);
    expect(tipos).toContain('sin_ramas');
    expect(tipos).toContain('sin_ref');
    expect(tipos).toContain('prerrequisito_ausente');
    expect(plantilla.grafo.nodos.get('edu:sin-ref')?.ref).toContain('sin-ref');
    expect(plantilla.grafo.aristas.some((arista) => arista.de === 'edu:no-existe')).toBe(false);
  });
});

describe('construirPlantillaEducacion: cualquier formato y ciclos', () => {
  it('acepta todas las ramas de cualquier formato', () => {
    const formatos: FormatoRamaEducativa[] = [
      'leccion',
      'video',
      'ejercicio',
      'proyecto',
      'sesion',
      'evaluacion',
      'enlace',
    ];
    const plantilla = construirPlantillaEducacion({
      rutas: [ruta('r1', formatos.map((formato, i) => rama(`f-${i}`, { formato })))],
    });
    const esperados = ['documento', 'video', 'flujo', 'app', 'enlace', 'tabla', 'enlace'];
    formatos.forEach((_, i) => {
      expect(plantilla.grafo.nodos.get(`edu:f-${i}`)?.formato).toBe(esperados[i]);
    });
  });

  it('no se cuelga con prerrequisitos circulares y deja posiciones finitas', () => {
    const plantilla = construirPlantillaEducacion({
      rutas: [
        ruta('r1', [
          rama('a', { prerequisitos: ['b'] }),
          rama('b', { prerequisitos: ['a'] }),
        ]),
      ],
    });
    expect(plantilla.grafo.nodos.size).toBe(3);
    expect(plantilla.posiciones.length).toBe(9);
    expect(plantilla.posiciones.every(Number.isFinite)).toBe(true);
  });
});
