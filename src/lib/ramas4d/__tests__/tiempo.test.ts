import { describe, it, expect } from 'vitest';
import {
  grafoEnInstante,
  VentanaTiempo,
  crearVentana,
  filtrarPorVentana,
  ReproductorEstado,
  ReproductorAccion,
  crearReproductor,
  reducirReproductor,
  enfriarNodos,
  BrilloConfig,
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

  it('ignora eventos de arista (es_arista: true)', () => {
    const grafoInicial: Grafo4D = { nodos: new Map(), aristas: [], ramas: new Map() };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 2000, tipo: 'contiene', objetivo_id: 'n1', es_arista: true, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 3000);
    expect(resultado.nodos.size).toBe(1);
    expect(resultado.aristas).toEqual([]);
  });

  it('aplica el último evento de actividad para un nodo', () => {
    const grafoInicial: Grafo4D = { nodos: new Map(), aristas: [], ramas: new Map() };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 2000, tipo: 'actividad', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 1500, tipo: 'actividad', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 3000);
    const nodo = resultado.nodos.get('n1');
    expect(nodo).toBeDefined();
    expect(nodo!.t_actividad).toBe(2000);
  });

  it('preserva aristas y ramas del grafo inicial', () => {
    const aristaInicial = { de: 'n1', a: 'n2', tipo: 'contiene' as const, t: 500, intensidad: 1.0 };
    const grafoInicial: Grafo4D = {
      nodos: new Map(),
      aristas: [aristaInicial],
      ramas: new Map([['raiz', ['n1']]]),
    };
    const eventos: Evento[] = [
      { t: 1000, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    const resultado = grafoEnInstante(grafoInicial, eventos, 2000);
    expect(resultado.aristas).toEqual([aristaInicial]);
    expect(resultado.ramas.get('raiz')).toEqual(['n1']);
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

  it('permite ventana de duración cero (t0 === t1)', () => {
    const ventana = crearVentana(1000, 1000);
    expect(ventana.duracion()).toBe(0);
    expect(ventana.contiene(1000)).toBe(true);
    expect(ventana.contiene(999)).toBe(false);
    expect(ventana.contiene(1001)).toBe(false);
  });

  it('métodos no mutan la ventana', () => {
    const ventana = crearVentana(1000, 2000);
    const t0Original = ventana.t0;
    const t1Original = ventana.t1;
    ventana.contiene(1500);
    ventana.duracion();
    expect(ventana.t0).toBe(t0Original);
    expect(ventana.t1).toBe(t1Original);
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

  it('filtra tanto eventos de nodo como de arista', () => {
    const eventos: Evento[] = [
      { t: 500, tipo: 'crear', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
      { t: 1500, tipo: 'contiene', objetivo_id: 'n1', es_arista: true, alcance: 'privado' },
      { t: 2500, tipo: 'actividad', objetivo_id: 'n2', es_arista: false, alcance: 'privado' },
    ];
    const ventana = crearVentana(1000, 2000);
    const filtrados = filtrarPorVentana(eventos, ventana);
    expect(filtrados.length).toBe(1);
    expect(filtrados[0].es_arista).toBe(true);
  });

  it('devuelve array vacío para array de eventos vacío', () => {
    const eventos: Evento[] = [];
    const ventana = crearVentana(1000, 2000);
    const filtrados = filtrarPorVentana(eventos, ventana);
    expect(filtrados).toEqual([]);
  });

  it('no modifica el array original de eventos', () => {
    const eventos: Evento[] = [
      { t: 1500, tipo: 'a', objetivo_id: 'n1', es_arista: false, alcance: 'privado' },
    ];
    const ventana = crearVentana(1000, 2000);
    filtrarPorVentana(eventos, ventana);
    expect(eventos.length).toBe(1);
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

  it('PLAY en estado reproduciendo no cambia el estado', () => {
    const rep = crearReproductor({ estado: 'reproduciendo' });
    const rep2 = reducirReproductor(rep, { tipo: 'PLAY' });
    expect(rep2.estado).toBe('reproduciendo');
    expect(rep2).not.toBe(rep);
  });

  it('PAUSE en estado pausado no cambia el estado', () => {
    const rep = crearReproductor({ estado: 'pausado' });
    const rep2 = reducirReproductor(rep, { tipo: 'PAUSE' });
    expect(rep2.estado).toBe('pausado');
    expect(rep2).not.toBe(rep);
  });

  it('SET_VELOCIDAD al mismo valor retorna nueva instancia', () => {
    const rep = crearReproductor({ velocidad: 2 });
    const rep2 = reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 2 });
    expect(rep2.velocidad).toBe(2);
    expect(rep2).not.toBe(rep);
  });

  it('secuencia de acciones múltiples', () => {
    let rep = crearReproductor();
    rep = reducirReproductor(rep, { tipo: 'PLAY' });
    rep = reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 2 });
    rep = reducirReproductor(rep, { tipo: 'SET_TIEMPO', tiempo: 1000 });
    rep = reducirReproductor(rep, { tipo: 'TOGGLE_EN_VIVO' });
    expect(rep.estado).toBe('reproduciendo');
    expect(rep.velocidad).toBe(2);
    expect(rep.tiempoActual).toBe(1000);
    expect(rep.enVivo).toBe(true);
  });

  it('no muta el reproductor original', () => {
    const rep = crearReproductor({ estado: 'reproduciendo', velocidad: 4 });
    const repOriginalEstado = rep.estado;
    const repOriginalVelocidad = rep.velocidad;
    reducirReproductor(rep, { tipo: 'PAUSE' });
    reducirReproductor(rep, { tipo: 'SET_VELOCIDAD', velocidad: 1 });
    expect(rep.estado).toBe(repOriginalEstado);
    expect(rep.velocidad).toBe(repOriginalVelocidad);
  });

  it('SET_TIEMPO en estado reproduciendo actualiza tiempo', () => {
    const rep = crearReproductor({ estado: 'reproduciendo', tiempoActual: 100 });
    const rep2 = reducirReproductor(rep, { tipo: 'SET_TIEMPO', tiempo: 5000 });
    expect(rep2.tiempoActual).toBe(5000);
    expect(rep2.estado).toBe('reproduciendo');
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

  it('no enfría nodo exactamente en el umbral de inactividad', () => {
    const ahora = Date.now();
    const umbral = 1000 * 60 * 60 * 24;
    const enUmbral = ahora - umbral;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'En umbral', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: enUmbral, t_actividad: enUmbral, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: umbral, factorEnfriamiento: 0.5 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('n1')!.peso).toBe(1.0);
  });

  it('enfría múltiples nodos con diferentes periodos de inactividad', () => {
    const ahora = Date.now();
    const hacePoco = ahora - 1000;
    const haceDia = ahora - 1000 * 60 * 60 * 24;
    const haceSemana = ahora - 1000 * 60 * 60 * 24 * 7;
    const nodos = new Map<string, Nodo>([
      ['reciente', { id: 'reciente', titulo: 'Reciente', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: hacePoco, t_actividad: hacePoco, peso: 1.0, etiquetas: [] }],
      ['dia', { id: 'dia', titulo: 'Un día', tipo: 'archivo', formato: 'texto', ref: '/2', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceDia, t_actividad: haceDia, peso: 1.0, etiquetas: [] }],
      ['semana', { id: 'semana', titulo: 'Una semana', tipo: 'archivo', formato: 'texto', ref: '/3', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceSemana, t_actividad: haceSemana, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000 * 60 * 60 * 12, factorEnfriamiento: 0.5 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('reciente')!.peso).toBe(1.0);
    expect(resultado.get('dia')!.peso).toBeLessThan(1.0);
    expect(resultado.get('semana')!.peso).toBeLessThan(resultado.get('dia')!.peso!);
  });

  it('factorEnfriamiento 1.0 no reduce el brillo', () => {
    const ahora = Date.now();
    const haceMucho = ahora - 1000 * 60 * 60 * 24 * 7;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Inactivo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceMucho, t_actividad: haceMucho, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000, factorEnfriamiento: 1.0 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('n1')!.peso).toBe(1.0);
  });

  it('factorEnfriamiento 0.0 lleva al mínimo inmediato', () => {
    const ahora = Date.now();
    const haceMucho = ahora - 1000 * 60 * 60 * 24 * 7;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Inactivo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceMucho, t_actividad: haceMucho, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000, factorEnfriamiento: 0.0, brilloMinimo: 0.1 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('n1')!.peso).toBe(0.1);
  });

  it('nodo con actividad reciente no se enfría aunque sea antiguo', () => {
    const ahora = Date.now();
    const haceAño = ahora - 1000 * 60 * 60 * 24 * 365;
    const haceMinuto = ahora - 1000 * 60;
    const nodos = new Map<string, Nodo>([
      ['n1', { id: 'n1', titulo: 'Antiguo pero activo', tipo: 'archivo', formato: 'texto', ref: '/1', alcance: 'privado', dueno: 'u1', capas: [], t_creado: haceAño, t_actividad: haceMinuto, peso: 1.0, etiquetas: [] }],
    ]);
    const config = crearBrilloConfig({ umbralInactividadMs: 1000 * 60 * 60, factorEnfriamiento: 0.5 });
    const resultado = enfriarNodos(nodos, ahora, config);
    expect(resultado.get('n1')!.peso).toBe(1.0);
  });

  it('crearBrilloConfig usa valores por defecto correctos', () => {
    const config = crearBrilloConfig({});
    expect(config.umbralInactividadMs).toBe(1000 * 60 * 60 * 24);
    expect(config.factorEnfriamiento).toBe(0.95);
    expect(config.brilloMinimo).toBe(0.05);
  });

  it('crearBrilloConfig permite sobrescribir valores individuales', () => {
    const config = crearBrilloConfig({ factorEnfriamiento: 0.8 });
    expect(config.umbralInactividadMs).toBe(1000 * 60 * 60 * 24);
    expect(config.factorEnfriamiento).toBe(0.8);
    expect(config.brilloMinimo).toBe(0.05);
  });
});