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

type Rol = 'dueno' | 'contacto' | 'grupo' | 'comunidad' | 'extrano';

interface CasoPrivacidad {
  alcance: AlcanceNodo;
  dueno: string;
  esperado: Record<Rol, boolean>;
}

const CASOS: CasoPrivacidad[] = [
  {
    alcance: 'privado',
    dueno: 'ajeno',
    esperado: { dueno: true, contacto: false, grupo: false, comunidad: false, extrano: false },
  },
  {
    alcance: 'contactos',
    dueno: 'ajeno',
    esperado: { dueno: true, contacto: true, grupo: false, comunidad: false, extrano: false },
  },
  {
    alcance: 'grupo',
    dueno: 'grupo-a',
    esperado: { dueno: true, contacto: false, grupo: true, comunidad: false, extrano: false },
  },
  {
    alcance: 'comunidad',
    dueno: 'comunidad-a',
    esperado: { dueno: true, contacto: false, grupo: false, comunidad: true, extrano: false },
  },
  {
    alcance: 'publico',
    dueno: 'ajeno',
    esperado: { dueno: true, contacto: true, grupo: true, comunidad: true, extrano: true },
  },
];

const OBSERVADORES: Record<Exclude<Rol, 'dueno'>, Observador> = {
  contacto: crearObservador('yo', { contactos: ['ajeno'] }),
  grupo: crearObservador('yo', { grupos: new Set(['grupo-a']) }),
  comunidad: crearObservador('yo', { comunidades: ['comunidad-a'] }),
  extrano: crearObservador('yo'),
};

describe('visiblePara: regla de privacidad', () => {
  it('cada alcance se abre solo a quien le corresponde (dueño, contacto, grupo, comunidad, extraño)', () => {
    for (const caso of CASOS) {
      const nodo = crearNodo('n1', caso.alcance, caso.dueno);
      expect(visiblePara(nodo, crearObservador(caso.dueno))).toBe(caso.esperado.dueno);
      expect(visiblePara(nodo, OBSERVADORES.contacto)).toBe(caso.esperado.contacto);
      expect(visiblePara(nodo, OBSERVADORES.grupo)).toBe(caso.esperado.grupo);
      expect(visiblePara(nodo, OBSERVADORES.comunidad)).toBe(caso.esperado.comunidad);
      expect(visiblePara(nodo, OBSERVADORES.extrano)).toBe(caso.esperado.extrano);
    }
  });

  it('lo privado ajeno no aparece ni para sus contactos', () => {
    const nodo = crearNodo('n1', 'privado', 'ajeno');
    expect(visiblePara(nodo, OBSERVADORES.contacto)).toBe(false);
    expect(visiblePara(nodo, OBSERVADORES.extrano)).toBe(false);
  });

  it('el dueño ve lo suyo en cualquier alcance', () => {
    const alcances: AlcanceNodo[] = ['privado', 'contactos', 'grupo', 'comunidad', 'publico'];
    for (const alcance of alcances) {
      expect(visiblePara(crearNodo('n1', alcance, 'yo'), crearObservador('yo'))).toBe(true);
    }
  });

  it('acepta los identificadores del observador como lista o como conjunto', () => {
    const nodo = crearNodo('n1', 'contactos', 'ajeno');
    expect(visiblePara(nodo, crearObservador('yo', { contactos: new Set(['ajeno']) }))).toBe(true);
    expect(visiblePara(nodo, crearObservador('yo', { contactos: ['otro'] }))).toBe(false);
  });

  it('un observador anónimo solo ve lo público', () => {
    const anonimo = crearObservador('');
    expect(visiblePara(crearNodo('n1', 'publico', 'ajeno'), anonimo)).toBe(true);
    expect(visiblePara(crearNodo('n2', 'privado', 'ajeno'), anonimo)).toBe(false);
    expect(visiblePara(crearNodo('n3', 'contactos', 'ajeno'), anonimo)).toBe(false);
    expect(visiblePara(crearNodo('n4', 'grupo', 'grupo-a'), anonimo)).toBe(false);
    expect(visiblePara(crearNodo('n5', 'comunidad', 'comunidad-a'), anonimo)).toBe(false);
  });
});

describe('podarGrafo: poda por alcance', () => {
  const observador = crearObservador('yo', {
    contactos: ['ajeno'],
    grupos: new Set(['grupo-a']),
    comunidades: ['comunidad-a'],
  });

  it('quita lo privado ajeno y no lo cuenta', () => {
    const grafo = crearGrafo([
      crearNodo('propio', 'privado', 'yo'),
      crearNodo('privado-ajeno', 'privado', 'ajeno'),
      crearNodo('contacto', 'contactos', 'ajeno'),
      crearNodo('grupo', 'grupo', 'grupo-a'),
      crearNodo('comunidad', 'comunidad', 'comunidad-a'),
      crearNodo('publico', 'publico', 'ajeno'),
    ]);

    const resultado = podarGrafo(grafo, observador);

    expect(Array.from(resultado.nodos.keys())).toEqual([
      'propio',
      'contacto',
      'grupo',
      'comunidad',
      'publico',
    ]);
    expect(resultado.nodos.size).toBe(5);
    expect(resultado.nodos.has('privado-ajeno')).toBe(false);
  });

  it('una arista visible nunca revela un nodo invisible', () => {
    const grafo = crearGrafo(
      [
        crearNodo('publico', 'publico', 'ajeno'),
        crearNodo('privado-ajeno', 'privado', 'ajeno'),
        crearNodo('contacto', 'contactos', 'ajeno'),
      ],
      [
        { de: 'publico', a: 'privado-ajeno', tipo: 'cita', t: 1, intensidad: 1 },
        { de: 'publico', a: 'contacto', tipo: 'cita', t: 2, intensidad: 1 },
      ]
    );

    const resultado = podarGrafo(grafo, observador);

    expect(resultado.aristas).toEqual([
      { de: 'publico', a: 'contacto', tipo: 'cita', t: 2, intensidad: 1 },
    ]);
    for (const arista of resultado.aristas) {
      expect(resultado.nodos.has(arista.de)).toBe(true);
      expect(resultado.nodos.has(arista.a)).toBe(true);
    }
  });

  it('las ramas conservan solo los hijos visibles y jamás un padre invisible', () => {
    const grafo = crearGrafo([
      crearNodo('propio', 'privado', 'yo'),
      crearNodo('contacto', 'contactos', 'ajeno'),
      crearNodo('privado-ajeno', 'privado', 'ajeno'),
    ]);
    grafo.ramas.set('propio', ['contacto', 'privado-ajeno']);
    grafo.ramas.set('privado-ajeno', ['contacto']);

    const resultado = podarGrafo(grafo, observador);

    expect(resultado.ramas.get('propio')).toEqual(['contacto']);
    expect(resultado.ramas.has('privado-ajeno')).toBe(false);
    expect(grafo.ramas.get('propio')).toEqual(['contacto', 'privado-ajeno']);
  });
});
