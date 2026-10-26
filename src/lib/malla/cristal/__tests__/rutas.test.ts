// Malla cristalina SiO₂ amorfa: pruebas para rutas óptimas
// Módulo puro: sin node:*, sin Supabase, sin window

import { describe, it, expect } from 'vitest';
import { mejoresRutas } from '../rutas';
import type { Cristal, Reticula, Dato, NeuronaReticula } from '../tipos';

describe('rutas', () => {
  const neuronaA: NeuronaReticula = {
    id: 'A',
    cuenta: 'cuenta1',
    capacidad: { ramGb: 4, bateriaPct: 100, cargando: true },
    medios: ['wifi-lan']
  };

  const neuronaB: NeuronaReticula = {
    id: 'B',
    cuenta: 'cuenta1',
    capacidad: { ramGb: 4, bateriaPct: 100, cargando: true },
    medios: ['wifi-lan', 'lora']
  };

  const neuronaC: NeuronaReticula = {
    id: 'C',
    cuenta: 'cuenta1',
    capacidad: { ramGb: 4, bateriaPct: 100, cargando: true },
    medios: ['wifi-lan']
  };

  const neuronaD: NeuronaReticula = {
    id: 'D',
    cuenta: 'cuenta1',
    capacidad: { ramGb: 4, bateriaPct: 100, cargando: true },
    medios: ['wifi-lan']
  };

  const reticula: Reticula = {
    teselas: {
      A: { origen: 'A', reloj: 1, neurona: neuronaA, senales: [] },
      B: { origen: 'B', reloj: 1, neurona: neuronaB, senales: [] },
      C: { origen: 'C', reloj: 1, neurona: neuronaC, senales: [] },
      D: { origen: 'D', reloj: 1, neurona: neuronaD, senales: [] },
    }
  };

  const cristal: Cristal = {
    puentes: [
      { a: 'A', b: 'B', medio: 'wifi-lan', coste: 0.1 },
      { a: 'B', b: 'C', medio: 'wifi-lan', coste: 0.2 },
      { a: 'A', b: 'D', medio: 'wifi-lan', coste: 0.8 },
      { a: 'D', b: 'C', medio: 'wifi-lan', coste: 0.1 },
    ],
    estado: 'vitreo',
    temperatura: { A: 0.1, B: 0.1, C: 0.1, D: 0.1 },
    huella: 'test',
    coordinacion: { A: 2, B: 2, C: 2, D: 2 }
  };

  const ctx = {
    cuentaDe: (id: string) => 'cuenta1',
    bateriaPct: 100,
    cifradoE2E: true
  };

  it('debe encontrar ruta directa si existe', () => {
    const dato: Dato = {
      id: 'd1',
      clase: 'privado',
      tipo: 'mensaje',
      bytes: 100,
      prioridad: 0,
      origen: 'A',
      destino: 'B'
    };

    const rutas = mejoresRutas(cristal, reticula, dato, ctx, 3);
    expect(rutas.length).toBeGreaterThan(0);
    expect(rutas[0].saltos).toEqual(['A', 'B']);
    expect(rutas[0].medios).toEqual(['wifi-lan']);
  });

  it('debe hacer rodeo cuando el directo está vetado por privacidad', () => {
    const dato: Dato = {
      id: 'd2',
      clase: 'privado',
      tipo: 'mensaje',
      bytes: 100,
      prioridad: 0,
      origen: 'A',
      destino: 'C'
    };

    // Vetar la ruta directa A-B modificando el cristal o haciendo B de otra cuenta
    const ctxPrivacidad = {
      cuentaDe: (id: string) => (id === 'B' ? 'cuentaAjena' : 'cuenta1'),
      bateriaPct: 100,
      cifradoE2E: false // sin cifrado E2E, se veta todo lo privado
    };

    const rutas = mejoresRutas(cristal, reticula, dato, ctxPrivacidad, 3);
    expect(rutas.length).toBe(0);
  });

  it('debe encontrar k rutas distintas', () => {
    const dato: Dato = {
      id: 'd3',
      clase: 'privado',
      tipo: 'mensaje',
      bytes: 100,
      prioridad: 0,
      origen: 'A',
      destino: 'C'
    };

    const rutas = mejoresRutas(cristal, reticula, dato, ctx, 2);
    expect(rutas.length).toBe(2);
    expect(rutas[0].saltos).toEqual(['A', 'B', 'C']); // A-B (0.1) + B-C (0.2) = 0.3
    expect(rutas[1].saltos).toEqual(['A', 'D', 'C']); // A-D (0.8) + D-C (0.1) = 0.9
  });

  it('debe retornar array vacío si no hay ruta', () => {
    const cristalAislado: Cristal = {
      puentes: [{ a: 'A', b: 'B', medio: 'wifi-lan', coste: 0.1 }],
      estado: 'vitreo',
      temperatura: { A: 0.1, B: 0.1, C: 0.1 },
      huella: 'test',
      coordinacion: { A: 1, B: 1 }
    };

    const dato: Dato = {
      id: 'd4',
      clase: 'privado',
      tipo: 'mensaje',
      bytes: 100,
      prioridad: 0,
      origen: 'A',
      destino: 'C'
    };

    const rutas = mejoresRutas(cristalAislado, reticula, dato, ctx, 3);
    expect(rutas).toEqual([]);
  });
});
