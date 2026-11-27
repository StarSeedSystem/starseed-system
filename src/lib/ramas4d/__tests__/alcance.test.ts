import { describe, it, expect } from 'vitest';
import { visiblePara, podarGrafo } from '../alcance';
import { crearGrafo, anadirNodo, anadirArista, Nodo, Arista, Grafo4D } from '../modelo';

type Observador = Parameters<typeof visiblePara>[1];

/** Lista de ids que también responde a la forma de un conjunto (.has / .size). */
function miembros(ids: string[] = []): string[] {
  const lista = [...ids];
  Object.defineProperty(lista, 'has', { value: (id: string) => lista.includes(id) });
  Object.defineProperty(lista, 'size', { get: () => lista.length });
  return lista;
}

function observador(datos: {
  id: string;
  contactos?: string[];
  grupos?: string[];
  comunidades?: string[];
}): Observador {
  return {
    id: datos.id,
    contactos: miembros(datos.contactos),
    grupos: miembros(datos.grupos),
    comunidades: miembros(datos.comunidades),
  } as unknown as Observador;
}

function nodo(datos: Partial<Nodo> & { id: string }): Nodo {
  return {
    tipo: 'archivo',
    titulo: datos.id,
    formato: 'texto',
    ref: `/ref/${datos.id}`,
    alcance: 'privado',
    dueno: 'ana',
    capas: [],
    t_creado: 1000,
    t_actividad: 1000,
    peso: 1,
    etiquetas: [],
    ...datos,
  };
}

function grafoDe(nodos: Nodo[], aristas: Arista[] = []): Grafo4D {
  const grafo = crearGrafo();
  for (const n of nodos) anadirNodo(grafo, n);
  for (const a of aristas) anadirArista(grafo, a);
  return grafo;
}

const arista = (de: string, a: string): Arista => ({
  de,
  a,
  tipo: 'contiene',
  t: 1000,
  intensidad: 1,
});

describe('visiblePara · lo privado ajeno no aparece', () => {
  it('lo público lo ve cualquiera, incluso quien no tiene relación', () => {
    const publicacion = nodo({ id: 'pub', alcance: 'publico', dueno: 'bea' });
    expect(visiblePara(publicacion, observador({ id: 'eve' }))).toBe(true);
  });

  it('lo privado solo lo ve su dueño', () => {
    const privado = nodo({ id: 'mio', alcance: 'privado', dueno: 'ana' });
    expect(visiblePara(privado, observador({ id: 'ana' }))).toBe(true);
    expect(visiblePara(privado, observador({ id: 'bea', contactos: ['ana'] }))).toBe(false);
    expect(visiblePara(privado, observador({ id: 'eve' }))).toBe(false);
  });
});

describe('visiblePara · relaciones de alcance', () => {
  it('lo de contactos lo ve el dueño y quien es su contacto', () => {
    const deBea = nodo({ id: 'contacto', alcance: 'contactos', dueno: 'bea' });
    expect(visiblePara(deBea, observador({ id: 'bea' }))).toBe(true);
    expect(visiblePara(deBea, observador({ id: 'ana', contactos: ['bea'] }))).toBe(true);
    expect(visiblePara(deBea, observador({ id: 'eve' }))).toBe(false);
  });

  it('lo de grupo solo lo ve quien pertenece a ese grupo', () => {
    const delGrupo = nodo({ id: 'grupo', alcance: 'grupo', dueno: 'grupo-astro' });
    expect(visiblePara(delGrupo, observador({ id: 'ana', grupos: ['grupo-astro'] }))).toBe(true);
    expect(visiblePara(delGrupo, observador({ id: 'bea', grupos: ['otro-grupo'] }))).toBe(false);
    expect(visiblePara(delGrupo, observador({ id: 'eve' }))).toBe(false);
  });

  it('lo de comunidad solo lo ve quien pertenece a esa comunidad', () => {
    const deLaComunidad = nodo({
      id: 'comunidad',
      alcance: 'comunidad',
      dueno: 'comunidad-astro',
    });
    expect(
      visiblePara(deLaComunidad, observador({ id: 'ana', comunidades: ['comunidad-astro'] }))
    ).toBe(true);
    expect(
      visiblePara(deLaComunidad, observador({ id: 'bea', comunidades: ['otra-comunidad'] }))
    ).toBe(false);
    expect(visiblePara(deLaComunidad, observador({ id: 'eve' }))).toBe(false);
  });

  it('el dueño siempre ve lo suyo, sea cual sea el alcance', () => {
    for (const alcance of ['privado', 'contactos', 'grupo', 'comunidad'] as const) {
      const suyo = nodo({ id: `de-ana-${alcance}`, alcance, dueno: 'ana' });
      expect(visiblePara(suyo, observador({ id: 'ana' }))).toBe(true);
    }
  });

  it('pertenecer a un grupo no abre una comunidad ni al revés', () => {
    const delGrupo = nodo({ id: 'g', alcance: 'grupo', dueno: 'grupo-astro' });
    const deLaComunidad = nodo({ id: 'c', alcance: 'comunidad', dueno: 'comunidad-astro' });
    const mixto = observador({
      id: 'ana',
      grupos: ['comunidad-astro'],
      comunidades: ['grupo-astro'],
    });
    expect(visiblePara(delGrupo, mixto)).toBe(false);
    expect(visiblePara(deLaComunidad, mixto)).toBe(false);
  });
});

describe('podarGrafo · quita lo que el observador no puede ver', () => {
  const ana = observador({
    id: 'ana',
    contactos: ['bea'],
    grupos: ['grupo-astro'],
    comunidades: ['comunidad-astro'],
  });

  function grafoMixto(): Grafo4D {
    return grafoDe(
      [
        nodo({ id: 'mio', alcance: 'privado', dueno: 'ana' }),
        nodo({ id: 'publico', alcance: 'publico', dueno: 'bea' }),
        nodo({ id: 'contacto', alcance: 'contactos', dueno: 'bea' }),
        nodo({ id: 'grupo', alcance: 'grupo', dueno: 'grupo-astro' }),
        nodo({ id: 'comunidad', alcance: 'comunidad', dueno: 'comunidad-astro' }),
        nodo({ id: 'ajeno', alcance: 'privado', dueno: 'bea' }),
      ],
      [
        arista('publico', 'mio'),
        arista('publico', 'ajeno'),
        arista('mio', 'grupo'),
        arista('ajeno', 'mio'),
        arista('contacto', 'comunidad'),
      ]
    );
  }

  it('conserva lo visible y descarta por completo lo privado ajeno', () => {
    const podado = podarGrafo(grafoMixto(), ana);
    expect([...podado.nodos.keys()].sort()).toEqual([
      'comunidad',
      'contacto',
      'grupo',
      'mio',
      'publico',
    ]);
    expect(podado.nodos.has('ajeno')).toBe(false);
  });

  it('quita las aristas que tocan un nodo invisible, en cualquier sentido', () => {
    const podado = podarGrafo(grafoMixto(), ana);
    const pares = podado.aristas.map((a) => `${a.de}->${a.a}`).sort();
    expect(pares).toEqual(['contacto->comunidad', 'mio->grupo', 'publico->mio']);
    expect(podado.aristas.some((a) => a.de === 'ajeno' || a.a === 'ajeno')).toBe(false);
  });

  it('un extraño solo recibe lo público y ninguna arista hacia lo invisible', () => {
    const podado = podarGrafo(grafoMixto(), observador({ id: 'eve' }));
    expect([...podado.nodos.keys()]).toEqual(['publico']);
    expect(podado.aristas).toEqual([]);
  });

  it('no muta el grafo original ni inventa nodos ni aristas', () => {
    const original = grafoMixto();
    const podado = podarGrafo(original, ana);
    expect(original.nodos.size).toBe(6);
    expect(original.aristas.length).toBe(5);
    expect(podado).not.toBe(original);
    for (const id of podado.nodos.keys()) {
      expect(original.nodos.has(id)).toBe(true);
    }
    for (const a of podado.aristas) {
      expect(original.aristas).toContainEqual(a);
    }
  });

  it('las ramas no revelan hijos invisibles', () => {
    const grafo = grafoMixto();
    grafo.ramas.set('mio', ['publico', 'ajeno']);
    grafo.ramas.set('ajeno', ['mio']);
    const podado = podarGrafo(grafo, ana);
    expect(podado.ramas.has('ajeno')).toBe(false);
    expect(podado.ramas.get('mio')).toEqual(['publico']);
    const idsVisibles = new Set(podado.nodos.keys());
    for (const hijos of podado.ramas.values()) {
      for (const hijo of hijos) {
        expect(idsVisibles.has(hijo)).toBe(true);
      }
    }
  });

  it('con un grafo vacío devuelve un grafo vacío', () => {
    const podado = podarGrafo(crearGrafo(), ana);
    expect(podado.nodos.size).toBe(0);
    expect(podado.aristas).toEqual([]);
    expect(podado.ramas.size).toBe(0);
  });
});
