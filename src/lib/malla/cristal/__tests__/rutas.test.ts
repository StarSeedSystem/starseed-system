import { describe, it, expect } from 'vitest';
import { mejoresRutas, type Ruta } from '../rutas';
import type { Cristal, Reticula, Dato } from '../tipos';

function cristalBase(): Cristal {
  return {
    puentes: [
      { a: 'n1', b: 'n2', medio: 'wifi-lan', coste: 0.05 },
      { a: 'n2', b: 'n3', medio: 'wifi-lan', coste: 0.05 },
      { a: 'n1', b: 'n3', medio: 'wifi-lan', coste: 0.4 },
    ],
    estado: 'vitreo',
    temperatura: {},
    huella: 'h',
    coordinacion: {},
  };
}

function reticulaBase(): Reticula {
  return {
    teselas: {
      n1: {
        origen: 'n1',
        reloj: 1,
        neurona: { id: 'n1', cuenta: 'c1', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: ['wifi-lan'] },
        senales: [{ de: 'n1', a: 'n2', medio: 'wifi-lan', rssiDbm: -40, snrDb: 15, rttMs: 10, anchoBandaKbps: 50000, perdidaPct: 0, vistaEn: 1 }],
      },
      n2: {
        origen: 'n2',
        reloj: 1,
        neurona: { id: 'n2', cuenta: 'c1', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: ['wifi-lan'] },
        senales: [{ de: 'n2', a: 'n3', medio: 'wifi-lan', rssiDbm: -40, snrDb: 15, rttMs: 10, anchoBandaKbps: 50000, perdidaPct: 0, vistaEn: 1 }],
      },
      n3: {
        origen: 'n3',
        reloj: 1,
        neurona: { id: 'n3', cuenta: 'c1', capacidad: { ramGb: 4, bateriaPct: 100, cargando: false }, medios: ['wifi-lan'] },
        senales: [],
      },
    },
  };
}

function datoBase(origen: string, destino: string | null): Dato {
  return { id: 'd1', clase: 'publico', tipo: 'mensaje', bytes: 100, prioridad: 1, origen, destino };
}

function ctxBase() {
  return {
    cuentaDe: (id: string) => (id.startsWith('n') ? 'c1' : null),
    bateriaPct: 100,
    cifradoE2E: true,
  };
}

describe('mejoresRutas', () => {
  it('devuelve rutas directas cuando existen', () => {
    const rutas = mejoresRutas(cristalBase(), reticulaBase(), datoBase('n1', 'n2'), ctxBase(), 3);
    expect(rutas.length).toBeGreaterThan(0);
    const directa = rutas.find(r => r.saltos.length === 1 && r.saltos[0] === 'n2');
    expect(directa).toBeDefined();
    expect(directa!.coste).toBeGreaterThanOrEqual(0);
    expect(directa!.coste).toBeLessThanOrEqual(1);
  });

  it('excluye saltos no aptos por viabilidad', () => {
    const c = cristalBase();
    const r = reticulaBase();
    // Veto por privacidad: clase 'interno' con cuenta distinta
    const rutas = mejoresRutas(c, r, { ...datoBase('n1', 'n2'), clase: 'interno' }, { cuentaDe: () => null, cifradoE2E: false }, 3);
    // Al no poder validar cuentas, debe excluir
    expect(rutas.some(r => r.saltos.includes('n2'))).toBe(false);
  });

  it('devuelve k rutas distintas', () => {
    const rutas = mejoresRutas(cristalBase(), reticulaBase(), datoBase('n1', 'n3'), ctxBase(), 3);
    const diferentes = new Set(rutas.map(r => r.saltos.join('|')));
    expect(diferentes.size).toBeGreaterThanOrEqual(Math.min(3, rutas.length));
    expect(rutas.length).toBeGreaterThanOrEqual(1);
  });

  it('devuelve [] cuando no hay ruta', () => {
    const c: Cristal = { puentes: [], estado: 'vitreo', temperatura: {}, huella: 'h', coordinacion: {} };
    const rutas = mejoresRutas(c, reticulaBase(), datoBase('n1', 'n2'), ctxBase(), 3);
    expect(rutas).toEqual([]);
  });

  it('difusión (destino null) da rutas de un salto', () => {
    const rutas = mejoresRutas(cristalBase(), reticulaBase(), datoBase('n1', null), ctxBase(), 3);
    expect(rutas.every(r => r.saltos.length === 1)).toBe(true);
    const vecinos = rutas.map(r => r.saltos[0]);
    expect(vecinos).toContain('n2');
  });
});
