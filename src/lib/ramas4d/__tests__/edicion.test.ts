import { describe, it, expect } from 'vitest';
import { crearGrafo, anadirNodo } from '../modelo';
import type { Nodo } from '../modelo';
import {
  agregarRamaHija,
  crearHistorial,
  deshacer,
  moverNodo,
  nodosEditables,
  padresDeRama,
  puedeEditar,
  vincularNodos,
  type PermisoEdicion,
} from '../edicion';
import {
  aplicarTransmutacion,
  planearTransmutacion,
  type FormaDisponible,
} from '../transmutar';

function nodo(id: string, extra: Partial<Nodo> = {}): Nodo {
  return {
    id,
    tipo: 'archivo',
    titulo: `Nodo ${id}`,
    formato: 'texto',
    ref: `/nodos/${id}`,
    alcance: 'privado',
    dueno: 'ana',
    capas: ['general'],
    t_creado: 1,
    t_actividad: 1,
    peso: 1,
    etiquetas: [],
    ...extra,
  };
}

function grafoCon(...nodos: Nodo[]) {
  const grafo = crearGrafo();
  for (const n of nodos) anadirNodo(grafo, n);
  return grafo;
}

const ANA: PermisoEdicion = { editor: 'ana' };
const BETO: PermisoEdicion = { editor: 'beto' };

describe('puedeEditar', () => {
  it('deja editar lo propio', () => {
    expect(puedeEditar(nodo('a'), ANA)).toBe(true);
  });

  it('no deja editar lo privado ajeno', () => {
    expect(puedeEditar(nodo('a'), BETO)).toBe(false);
  });

  it('deja editar lo de un grupo solo con su permiso', () => {
    const delGrupo = nodo('a', { dueno: 'grupo-1', alcance: 'grupo' });
    expect(puedeEditar(delGrupo, { editor: 'beto', gruposEdicion: ['grupo-1'] })).toBe(true);
    expect(puedeEditar(delGrupo, BETO)).toBe(false);
  });
});

describe('nodosEditables', () => {
  it('solo devuelve lo propio o lo de grupos permitidos', () => {
    const grafo = grafoCon(
      nodo('a'),
      nodo('b', { dueno: 'beto' }),
      nodo('c', { dueno: 'grupo-1', alcance: 'grupo' }),
    );
    const ids = nodosEditables(grafo, { editor: 'ana', gruposEdicion: ['grupo-1'] }).map((n) => n.id);
    expect(ids).toEqual(['a', 'c']);
  });
});

describe('agregarRamaHija', () => {
  it('añade una rama de cualquier formato con arista contiene', () => {
    const grafo = grafoCon(nodo('raiz'));
    const r = agregarRamaHija(grafo, crearHistorial(), ANA, 'raiz', {
      id: 'video-1',
      titulo: 'Clase',
      formato: 'video',
      ref: '/v/1',
    });
    expect(r.ok).toBe(true);
    expect(grafo.nodos.get('video-1')?.formato).toBe('video');
    expect(grafo.ramas.get('raiz')).toEqual(['video-1']);
    expect(grafo.aristas.some((a) => a.de === 'raiz' && a.a === 'video-1' && a.tipo === 'contiene')).toBe(true);
  });

  it('hereda dueño, alcance y capas del padre', () => {
    const grafo = grafoCon(nodo('raiz', { dueno: 'grupo-1', alcance: 'grupo', capas: ['educacion'] }));
    const r = agregarRamaHija(
      grafo,
      crearHistorial(),
      { editor: 'beto', gruposEdicion: ['grupo-1'] },
      'raiz',
      { id: 'leccion-1', titulo: 'Lección', formato: 'leccion', ref: '/l/1' },
    );
    expect(r.ok).toBe(true);
    const hija = grafo.nodos.get('leccion-1');
    expect(hija?.dueno).toBe('grupo-1');
    expect(hija?.alcance).toBe('grupo');
    expect(hija?.capas).toEqual(['educacion']);
  });

  it('no deja ramificar lo ajeno sin permiso', () => {
    const grafo = grafoCon(nodo('raiz'));
    const r = agregarRamaHija(grafo, crearHistorial(), BETO, 'raiz', {
      id: 'x',
      titulo: 'X',
      formato: 'texto',
      ref: '/x',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('puedas editar');
    expect(grafo.nodos.has('x')).toBe(false);
  });

  it('rechaza identificadores repetidos', () => {
    const grafo = grafoCon(nodo('raiz'), nodo('hija'));
    const r = agregarRamaHija(grafo, crearHistorial(), ANA, 'raiz', {
      id: 'hija',
      titulo: 'Otra',
      formato: 'texto',
      ref: '/h',
    });
    expect(r.ok).toBe(false);
  });
});

describe('vincularNodos', () => {
  it('crea la arista con el tipo pedido', () => {
    const grafo = grafoCon(nodo('a'), nodo('b'));
    const r = vincularNodos(grafo, crearHistorial(), ANA, { de: 'a', a: 'b', tipo: 'cita' });
    expect(r.ok).toBe(true);
    expect(grafo.aristas.some((x) => x.de === 'a' && x.a === 'b' && x.tipo === 'cita')).toBe(true);
  });

  it('no vincula si un nodo es ajeno', () => {
    const grafo = grafoCon(nodo('a'), nodo('b', { dueno: 'beto' }));
    const r = vincularNodos(grafo, crearHistorial(), ANA, { de: 'a', a: 'b', tipo: 'usa' });
    expect(r.ok).toBe(false);
    expect(grafo.aristas).toEqual([]);
  });
});

describe('moverNodo', () => {
  it('mueve una rama a otro padre', () => {
    const grafo = grafoCon(nodo('raiz'), nodo('hija'), nodo('otra'));
    grafo.ramas.set('raiz', ['hija']);
    const r = moverNodo(grafo, crearHistorial(), ANA, { nodoId: 'hija', aPadreId: 'otra' });
    expect(r.ok).toBe(true);
    expect(grafo.ramas.get('raiz')).toBeUndefined();
    expect(grafo.ramas.get('otra')).toEqual(['hija']);
  });

  it('impide mover una rama dentro de una de sus ramas', () => {
    const grafo = grafoCon(nodo('raiz'), nodo('hija'));
    grafo.ramas.set('raiz', ['hija']);
    const r = moverNodo(grafo, crearHistorial(), ANA, { nodoId: 'raiz', aPadreId: 'hija' });
    expect(r.ok).toBe(false);
    expect(padresDeRama(grafo, 'hija')).toEqual(['raiz']);
  });
});

describe('deshacer', () => {
  it('revierte la última edición', () => {
    const grafo = grafoCon(nodo('raiz'));
    const historial = crearHistorial();
    const alta = agregarRamaHija(grafo, historial, ANA, 'raiz', {
      id: 'x',
      titulo: 'X',
      formato: 'texto',
      ref: '/x',
    });
    expect(alta.ok).toBe(true);
    expect(deshacer(grafo, historial)).toBe(true);
    expect(grafo.nodos.has('x')).toBe(false);
    expect(grafo.ramas.get('raiz')).toBeUndefined();
    expect(grafo.aristas).toEqual([]);
  });

  it('sin historial no hace nada', () => {
    expect(deshacer(grafoCon(nodo('raiz')), crearHistorial())).toBe(false);
  });

  it('respeta el máximo del historial', () => {
    const grafo = grafoCon(nodo('raiz'));
    const historial = crearHistorial(1);
    agregarRamaHija(grafo, historial, ANA, 'raiz', { id: 'x', titulo: 'X', formato: 'texto', ref: '/x' });
    agregarRamaHija(grafo, historial, ANA, 'raiz', { id: 'y', titulo: 'Y', formato: 'texto', ref: '/y' });
    expect(deshacer(grafo, historial)).toBe(true);
    expect(deshacer(grafo, historial)).toBe(false);
  });
});

const FORMAS: FormaDisponible = {
  disponible: true,
  destinos: { nombre: 'Markdown', ids: ['md'], destinos: ['pdf', 'pptx'], conMotor: ['epub'] },
};

describe('planearTransmutacion', () => {
  it('planea una forma hermana cuando el conversor la admite', () => {
    const r = planearTransmutacion(nodo('a'), 'pdf', FORMAS);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.plan.destino).toBe('pdf');
      expect(r.plan.titulo).toContain('PDF');
      expect(r.plan.ref).toContain('transmuta-pdf');
    }
  });

  it('lo dice y no inventa si el formato no se puede convertir', () => {
    const r = planearTransmutacion(nodo('a'), 'glb', FORMAS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('no me lo invento');
  });

  it('avisa si hace falta un motor opcional', () => {
    const r = planearTransmutacion(nodo('a'), 'epub', FORMAS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('motor opcional');
  });

  it('no transmuta sin conversor disponible', () => {
    const r = planearTransmutacion(nodo('a'), 'pdf', {
      disponible: false,
      destinos: null,
      motivo: 'Sin Filee.',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('Sin Filee.');
  });
});

describe('aplicarTransmutacion', () => {
  it('cuelga la hermana con arista transmuta', () => {
    const grafo = grafoCon(nodo('raiz'), nodo('origen'));
    grafo.ramas.set('raiz', ['origen']);
    const plan = planearTransmutacion(nodo('origen'), 'pdf', FORMAS);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const r = aplicarTransmutacion(grafo, crearHistorial(), ANA, plan.plan, 'origen-pdf');
    expect(r.ok).toBe(true);
    expect(grafo.ramas.get('raiz')).toEqual(['origen', 'origen-pdf']);
    expect(
      grafo.aristas.some((a) => a.de === 'origen' && a.a === 'origen-pdf' && a.tipo === 'transmuta'),
    ).toBe(true);
  });

  it('no transmuta lo ajeno', () => {
    const ajeno = nodo('origen', { dueno: 'beto' });
    const grafo = grafoCon(ajeno);
    const plan = planearTransmutacion(ajeno, 'pdf', FORMAS);
    if (!plan.ok) throw new Error('El plan de prueba debería ser válido');
    const r = aplicarTransmutacion(grafo, crearHistorial(), ANA, plan.plan, 'x');
    expect(r.ok).toBe(false);
  });
});

