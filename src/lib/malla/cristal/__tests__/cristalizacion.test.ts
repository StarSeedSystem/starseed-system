import { describe, it, expect } from 'vitest';
import { temperaturaDe, estadoDe, cristalizar } from '../cristalizacion';
import type { NeuronaReticula, SenalMedida, Tesela, Reticula } from '../tipos';

describe('temperaturaDe', () => {
  it('devuelve 0.5 para neurona sin historial', () => {
    const h: Array<{clave: string; t: number; calidad: number}> = [];
    const r = temperaturaDe(h, 120000, 1000);
    expect(r).toEqual({});
  });

  it('calcula temperatura basada en desviación típica', () => {
    const ahora = 1000;
    const h: Array<{clave: string; t: number; calidad: number}> = [
      {clave: 'n1', t: 0, calidad: 1.0},
      {clave: 'n1', t: 500, calidad: 1.0},
      {clave: 'n1', t: 1000, calidad: 1.0},
    ];
    const r = temperaturaDe(h, 120000, ahora);
    expect(r['n1']).toBeCloseTo(0);
  });

  it('devuelve 0.5 cuando no hay entradas en la ventana', () => {
    const ahora = 1000;
    const h: Array<{clave: string; t: number; calidad: number}> = [
      {clave: 'n1', t: 0, calidad: 1.0},
    ];
    const r = temperaturaDe(h, 100, ahora);
    expect(r['n1']).toBeCloseTo(0.5);
  });
});

describe('estadoDe', () => {
  it('devuelve fundido para temperatura >= 0.6', () => {
    expect(estadoDe(0.6)).toBe('fundido');
    expect(estadoDe(0.7)).toBe('fundido');
  });

  it('devuelve subenfriado para temperatura >= 0.25 y < 0.6', () => {
    expect(estadoDe(0.25)).toBe('subenfriado');
    expect(estadoDe(0.5)).toBe('subenfriado');
  });

  it('devuelve vitreo para temperatura < 0.25', () => {
    expect(estadoDe(0.0)).toBe('vitreo');
    expect(estadoDe(0.24)).toBe('vitreo');
  });
});

describe('cristalizar', () => {
  function n(id: string, p?: {x: number; y: number; precisionM: number}): NeuronaReticula {
    return {
      id,
      cuenta: 'cue',
      capacidad: {ramGb: 4, bateriaPct: 100, cargando: false},
      medios: ['wifi-lan', 'ble'],
      posicion: p ?? undefined
    };
  }
  function t(neur: NeuronaReticula): Tesela {
    return {origen: neur.id, reloj: 0, neurona: neur, senales: []};
  }
  function r(neuros: NeuronaReticula[]): Reticula {
    const tes: Record<string, Tesela> = {};
    for (const n of neuros) tes[n.id] = t(n);
    return {teselas: tes};
  }

  it('5 neuronas en línea quedan conectadas', () => {
    const neuro: NeuronaReticula[] = [];
    for (let i = 0; i < 5; i++) neuro.push(n(`${i}`, {x: i * 100, y: 0, precisionM: 0}));
    const res = cristalizar(r(neuro));
    const puentes = res.puentes;
    const adj: Record<string, string[]> = {};
    for (const p of puentes) {
      if (!adj[p.a]) adj[p.a] = [];
      if (!adj[p.b]) adj[p.b] = [];
      adj[p.a].push(p.b);
      adj[p.b].push(p.a);
    }
    const visitado = new Set<string>();
    const stack = [neuro[0].id];
    while (stack.length) {
      const node = stack.pop()!;
      if (visitado.has(node)) continue;
      visitado.add(node);
      for (const v of adj[node] || []) {
        if (!visitado.has(v)) stack.push(v);
      }
    }
    for (const n of neuro) {
      expect(visitado.has(n.id)).toBe(true);
    }
  });

  it('una neurona aislada sin puentes no rompe nada', () => {
    const neuro = n('solo', {x: 0, y: 0, precisionM: 0});
    const res = cristalizar(r([neuro]));
    expect(res.puentes.length).toBe(0);
    expect(res.estado).toBe('subenfriado');
    expect(res.coordinacion['solo']).toBe(0);
  });
});