import { describe, it, expect } from 'vitest';
import {
  grafoEnInstante,
  crearVentana,
  filtrarPorVentana,
  ReproductorAccion,
  crearReproductor,
  reducirReproductor,
  enfriarNodos,
  crearBrilloConfig,
} from '../tiempo';
import { Grafo4D, Nodo, Evento } from '../modelo';

describe('grafoEnInstante', () => {
  it('devuelve grafo vacío si no hay eventos', () => {
    const grafoInicial: Grafo4D = { nodos: new Map(), aristas: [], ramas: new Map() };
    const eventos: Evento[] = [];
    const resultado = grafoEnInstante(grafoInicial, eventos, 1000);
    expect(resultado.nodos.size).toBe(0);
    expect(resultado.aristas).toEqual([]);
  });

  it('aplica eventos en orden cronológico hasta el instante t', () => {
    const grafoInicial: Grafo4D = { nodos: new Map(), aristas: [], ramas: new Map() };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 2000, tipo: 'actividad', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 3000, tipo: 'actividad', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 2500);
    const nodo = resultado.nodos.get('n1');
    expect(nodo).toBeDefined();
    expect(nodo!.t_actividad).toBe(2000);
    expect(nodo!.peso).toBe(0.6);
  });

  it('ignora eventos posteriores al instante t', () => {
    const grafoInicial: Grafo4D = { nodos: new Map(), aristas: [], ramas: new Map() };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 3000, tipo: 'actividad', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 2000);
    const nodo = resultado.nodos.get('n1');
    expect(nodo).toBeDefined();
    expect(nodo!.t_actividad).toBe(1000);
    expect(nodo!.peso).toBe(1.0);
  });

  it('no modifica el grafo original', () => {
    const grafoInicial: Grafo4D = { nodos: new Map(), aristas: [], ramas: new Map() };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    grafoEnInstante(grafoInicial, eventos, 2000);
    expect(grafoInicial.nodos.size).toBe(0);
  });

  it('ignora los eventos de arista al reconstruir el instante', () => {
    const grafoInicial: Grafo4D = {
      nodos: new Map(),
      aristas: [{ de: 'n1', a: 'n2', tipo: 'usa', t: 500, intensidad: 1 }],
      ramas: new Map(),
    };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 1500, tipo: 'crear', objetivo_id: 'n2', es_arista: false, alcance: 'privado' },
      { t: 1800, tipo: 'nueva_arista', objetivo_id: 'n1', es_arista: true, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 2000);
    expect(resultado.aristas).toHaveLength(1);
    expect(resultado.aristas[0].de).toBe('n1');
  });

  it('aplica eventos sobre un grafo inicial que ya tiene nodos', () => {
    const nodo: Nodo = {
      id: 'n1', titulo: 'Existente', tipo: 'archivo', formato: 'texto', ref: '/1',
      alcance: 'privado', dueno: 'u1', capas: [], t_creado: 0, t_actividad: 0,
      peso: 1.0, etiquetas: [],
    };
    const grafoInicial: Grafo4D = {
      nodos: new Map([['n1', nodo]]), aristas: [], ramas: new Map(),
    };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'actividad', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 1000);
    const actualizado = resultado.nodos.get('n1')!;
    expect(actualizado.t_actividad).toBe(1000);
    expect(actualizado.peso).toBe(0.6);
    expect(resultado.nodos).not.toBe(grafoInicial.nodos);
  });

  it('no añade al mapa original los nodos creados por eventos', () => {
    const nodo: Nodo = {
      id: 'n1', titulo: 'Existente', tipo: 'archivo', formato: 'texto', ref: '/1',
      alcance: 'privado', dueno: 'u1', capas: [], t_creado: 0, t_actividad: 0,
      peso: 1.0, etiquetas: [],
    };
    const grafoInicial: Grafo4D = {
      nodos: new Map([['n1', nodo]]), aristas: [], ramas: new Map(),
    };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n2', es_arista: false, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 1000);
    expect(resultado.nodos.has('n2')).toBe(true);
    expect(grafoInicial.nodos.has('n2')).toBe(false);
    expect(grafoInicial.nodos.size).toBe(1);
  });

  it('devuelve una copia con el grafo inicial cuando el instante es anterior a todo', () => {
    const nodo: Nodo = {
      id: 'n1', titulo: 'Existente', tipo: 'archivo', formato: 'texto', ref: '/1',
      alcance: 'privado', dueno: 'u1', capas: [], t_creado: 0, t_actividad: 0,
      peso: 1.0, etiquetas: [],
    };
    const grafoInicial: Grafo4D = {
      nodos: new Map([['n1', nodo]]), aristas: [], ramas: new Map([['n1', ['n2']]]),
    };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n2', es_arista: false, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 500);
    expect(resultado.nodos.size).toBe(1);
    expect(resultado.nodos.has('n2')).toBe(false);
    expect(resultado.ramas.get('n1')).toEqual(['n2']);
    expect(resultado).not.toBe(grafoInicial);
  });
});

describe('VentanaTiempo', () => {
  it('crea una ventana con t0 y t1', () => {
    const ventana = crearVentana(1000, 2000);
    expect(ventana.t0).toBe(1000);
    expect(ventana.t1).toBe(2000);
  });

  it('lanza error si t1 < t0', () => {
    expect(() => crearVentana(2000, 1000)).toThrow('t1 debe ser mayor o igual que t0');
  });

  it('contiene un instante dentro de la ventana', () => {
    const ventana = crearVentana(1000, 2000);
    expect(ventana.contiene(1500)).toBe(true);
    expect(ventana.contiene(1000)).toBe(true);
    expect(ventana.contiene(2000)).toBe(true);
  });

  it('no contiene instantes fuera de la ventana', () => {
    const ventana = crearVentana(1000, 2000);
    expect(ventana.contiene(500)).toBe(false);
    expect(ventana.contiene(2500)).toBe(false);
  });

  it('calcula la duración', () => {
    const ventana = crearVentana(1000, 2000);
    expect(ventana.duracion()).toBe(1000);
  });

  it('admite una ventana de duración cero en un único instante', () => {
    const ventana = crearVentana(1500, 1500);
    expect(ventana.duracion()).toBe(0);
    expect(ventana.contiene(1500)).toBe(true);
    expect(ventana.contiene(1501)).toBe(false);
  });
});

describe('filtrarPorVentana', () => {
  it('filtra eventos dentro de la ventana', () => {
    const eventos: Evento[] = [
      { t: 500, tipo: 'a', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 1500, tipo: 'b', objetivo_id: 'n2', es_arista: false, alcance: 'privado' },
      { t: 2500, tipo: 'c', objetivo_id: 'n3', es_arista: false, alcance: 'privado' },
    ];
    const ventana = crearVentana(1000, 2000);
    const filtrados = filtrarPorVentana(eventos, ventana);
    expect(filtrados.length).toBe(1);
    expect(filtrados[0].t).toBe(1500);
  });

  it('devuelve array vacío si no hay eventos en la ventana', () => {
    const eventos: Evento[] = [
      { t: 500, tipo: 'a', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    const ventana = crearVentana(1000, 2000);
    const filtrados = filtrarPorVentana(eventos, ventana);
    expect(filtrados).toEqual([]);
  });

  it('incluye los extremos de la ventana', () => {
    const eventos: Evento[] = [
      { t: 1000, tipo: 'a', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 2000, tipo: 'b', objetivo_id: 'n2', es_arista: false, alcance: 'privado' },
    ];
    const ventana = crearVentana(1000, 2000);
    expect(filtrarPorVentana(eventos, ventana).map((e) => e.t)).toEqual([1000, 2000]);
  });

  it('no muta el array original de eventos', () => {
    const eventos: Evento[] = [
      { t: 500, tipo: 'a', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 1500, tipo: 'b', objetivo_id: 'n2', es_arista: false, alcance: 'privado' },
    ];
    const ventana = crearVentana(1000, 2000);
    filtrarPorVentana(eventos, ventana);
    expect(eventos).toHaveLength(2);
  });
});

describe('Reproductor (máquina de estados)', () => {
  it('crea reproductor en estado pausado por defecto', () => {
    const rep = crearReproductor();
    expect(rep.estado).toBe('pausado');
    expect(rep.velocidad).toBe(1);
    expect(rep.enVivo).toBe(false);
    expect(rep.tiempoActual).toBe(0);
  });

  it('transiciona play -> reproduciendo', () => {
    const rep = crearReproductor();
    const rep2 = reducirReproductor(rep, { tipo: 'PLAY' });
    expect(rep2.estado).toBe('reproduciendo');
  });

  it('transiciona pause -> pausado', () => {
    const rep = crearReproductor({ estado: 'reproduciendo' });
    const rep2 = reducirReproductor(rep, { tipo: 'PAUSE' });
    expect(rep2.estado).toBe('pausado');
  });

  it('cambia velocidad en rango permitido (0.25 a 64)', () => {
    const rep = crearReproductor();
    const rep2 = reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 4 });
    expect(rep2.velocidad).toBe(4);
  });

  it('acepta exactamente los extremos de velocidad 0.25 y 64', () => {
    const rep = crearReproductor();
    const lento = reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 0.25 });
    const rapido = reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 64 });
    expect(lento.velocidad).toBe(0.25);
    expect(rapido.velocidad).toBe(64);
  });

  it('limita velocidad al mínimo 0.25', () => {
    const rep = crearReproductor();
    const rep2 = reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 0.1 });
    expect(rep2.velocidad).toBe(0.25);
  });

  it('limita velocidad al máximo 64', () => {
    const rep = crearReproductor();
    const rep2 = reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 100 });
    expect(rep2.velocidad).toBe(64);
  });

  it('alterna modo en vivo', () => {
    const rep = crearReproductor();
    const rep2 = reducirReproductor(rep, { tipo: 'TOGGLE_EN_VIVO' });
    expect(rep2.enVivo).toBe(true);
    const rep3 = reducirReproductor(rep2, { tipo: 'TOGGLE_EN_VIVO' });
    expect(rep3.enVivo).toBe(false);
  });

  it('establece tiempo actual', () => {
    const rep = crearReproductor();
    const rep2 = reducirReproductor(rep, { tipo: 'SET_TIEMPO', tiempo: 5000 });
    expect(rep2.tiempoActual).toBe(5000);
  });

  it('no permite tiempo negativo', () => {
    const rep = crearReproductor();
    const rep2 = reducirReproductor(rep, { tipo: 'SET_TIEMPO', tiempo: -100 });
    expect(rep2.tiempoActual).toBe(0);
  });

  it('reinicia el reproductor', () => {
    const rep = crearReproductor({ estado: 'reproduciendo', velocidad: 4, enVivo: true, tiempoActual: 5000 });
    const rep2 = reducirReproductor(rep, { tipo: 'RESET' });
    expect(rep2.estado).toBe('pausado');
    expect(rep2.velocidad).toBe(1);
    expect(rep2.enVivo).toBe(false);
    expect(rep2.tiempoActual).toBe(0);
  });

  it('es idempotente al reproducir estando ya en reproducción', () => {
    const rep = crearReproductor({ estado: 'reproduciendo', tiempoActual: 300 });
    const rep2 = reducirReproductor(rep, { tipo: 'PLAY' });
    expect(rep2.estado).toBe('reproduciendo');
    expect(rep2.tiempoActual).toBe(300);
  });

  it('no muta el estado anterior al reducir una acción', () => {
    const rep = crearReproductor({ tiempoActual: 100 });
    const rep2 = reducirReproductor(rep, { tipo: 'SET_TIEMPO', tiempo: 900 });
    expect(rep.tiempoActual).toBe(100);
    expect(rep2.tiempoActual).toBe(900);
    expect(rep2).not.toBe(rep);
  });

  it('acepta un estado parcial al crear el reproductor', () => {
    const rep = crearReproductor({ enVivo: true, velocidad: 2 });
    expect(rep.enVivo).toBe(true);
    expect(rep.velocidad).toBe(2);
    expect(rep.estado).toBe('pausado');
  });

  it('responde con el mismo objeto ante una acción desconocida', () => {
    const rep = crearReproductor();
    const accion = { tipo: 'DESCONOCIDA' } as unknown as ReproductorAccion;
    expect(reducirReproductor(rep, accion)).toBe(rep);
  });
});

describe('enfriarNodos (enfriamiento de recuerdos)', () => {
  it('reduce el brillo de nodos sin actividad reciente', () => {
    const ahora = Date.now();
    const haceMucho = ahora - 1000 * 60 * 60 * 24 * 7;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Activo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceMucho, t_actividad: ahora - 1000, peso: 1.0, etiquetas: [] }],
      ['n2', { id: 'n2', titulo: 'Inactivo', tipo: 'archivo', formato: 'texto', ref: '/2', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceMucho, t_actividad: haceMucho, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000 * 60 * 60 * 24, factorEnfriamiento: 0.9 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('n1')!.peso).toBe(1.0);
    expect(resultado.get('n2')!.peso).toBeLessThan(1.0);
    expect(resultado.get('n2')!.peso).toBeGreaterThan(0);
  });

  it('nunca reduce el brillo por debajo de un mínimo', () => {
    const ahora = Date.now();
    const haceMuchisimo = ahora - 1000 * 60 * 60 * 24 * 365;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Antiguo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceMuchisimo, t_actividad: haceMuchisimo, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000, factorEnfriamiento: 0.5, brilloMinimo: 0.1 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('n1')!.peso).toBeGreaterThanOrEqual(0.1);
  });

  it('no modifica el mapa original', () => {
    const ahora = Date.now();
    const haceMucho = ahora - 1000 * 60 * 60 * 24 * 7;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Inactivo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceMucho, t_actividad: haceMucho, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000, factorEnfriamiento: 0.9 });
    enfriarNodos(nodos, ahora, config);
    expect(nodos.get('n1')!.peso).toBe(1.0);
  });

  it('usa configuración por defecto si no se provee', () => {
    const ahora = Date.now();
    const haceMucho = ahora - 1000 * 60 * 60 * 24 * 7;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Inactivo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceMucho, t_actividad: haceMucho, peso: 1.0, etiquetas: [] }],
    ]);
    const resultado = enfriarNodos(nodos, ahora);
    expect(resultado.get('n1')!.peso).toBeLessThan(1.0);
  });

  it('nunca borra nodos: conserva todos los identificadores', () => {
    const ahora = 10_000_000;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Uno', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: 0, t_actividad: 0, peso: 1.0, etiquetas: [] }],
      ['n2', { id: 'n2', titulo: 'Dos', tipo: 'memoria', formato: 'audio', ref: '/2', alcance: 'publico', dueno: 'u2', capas: ['c1'], t_creado: 0, t_actividad: 0, peso: 1.0, etiquetas: ['x'] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000, factorEnfriamiento: 0.5, brilloMinimo: 0.01 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.size).toBe(2);
    expect(Array.from(resultado.keys()).sort()).toEqual(['n1', 'n2']);
  });

  it('enfría más cuanto más tiempo lleva sin uso', () => {
    const ahora = 10_000_000;
    const nodos = new Map<string, Nodo>([
      ['poco', { id: 'poco', titulo: 'Poco', tipo: 'archivo', formato: 'texto', ref: '/p', alcance: 'privado', dueno: 'u1', capas: [], t_creado: 0, t_actividad: ahora - 2000, peso: 1.0, etiquetas: [] }],
      ['mucho', { id: 'mucho', titulo: 'Mucho', tipo: 'archivo', formato: 'texto', ref: '/m', alcance: 'privado', dueno: 'u1', capas: [], t_creado: 0, t_actividad: ahora - 4000, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000, factorEnfriamiento: 0.9, brilloMinimo: 0.01 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('mucho')!.peso).toBeLessThan(resultado.get('poco')!.peso);
  });

  it('mantiene igual el nodo justo en el umbral de inactividad', () => {
    const ahora = 10_000_000;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Justo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: 0, t_actividad: ahora - 1000, peso: 0.8, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000, factorEnfriamiento: 0.5 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('n1')!.peso).toBe(0.8);
  });

  it('expone los valores por defecto de la configuración de brillo', () => {
    const config = crearBrilloConfig();
    expect(config.umbralInactividadMs).toBe(1000 * 60 * 60 * 24);
    expect(config.factorEnfriamiento).toBe(0.95);
    expect(config.brilloMinimo).toBe(0.05);
  });
});