import { describe, it, expect } from 'vitest';
import { analizarConvergencia, Arista } from '../grafo-convergencia';
import type { DefinicionAtomo } from './registro-atomos';

const def = (h: string, e: string[], s: string[]): DefinicionAtomo => ({
  herramientaId: h,
  nombre: '',
  categoria: 'imagen',
  integracion: 'libreria-js',
  control: 'total',
  parametros: [],
  entradas: e,
  salidas: s,
});

describe('analizarConvergencia', () => {
  it('empty', () => {
    const r = analizarConvergencia([], [], () => null, () => null);
    expect(r).toEqual({ ok: true, orden: [], ciclos: [], incompatibles: [], conversiones: [], avisos: [] });
  });

  it('linear', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }, { id: 'C', h: 'tC' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }, { de: 'B', a: 'C' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : h === 'tB' ? def('tB', ['f1'], ['f2']) : h === 'tC' ? def('tC', ['f2'], []) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0 && r.orden.join() === 'A,B,C').toBe(true);
  });

  it('diamond', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }, { id: 'C', h: 'tC' }, { id: 'D', h: 'tD' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }, { de: 'A', a: 'C' }, { de: 'B', a: 'D' }, { de: 'C', a: 'D' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : h === 'tB' ? def('tB', ['f1'], ['f2']) : h === 'tC' ? def('tC', ['f1'], ['f2']) : h === 'tD' ? def('tD', ['f2'], []) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0 && r.orden.join() === 'A,B,C,D').toBe(true);
  });

  it('simple cycle', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }, { id: 'C', h: 'tC' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }, { de: 'B', a: 'C' }, { de: 'C', a: 'A' }];
    const d = (h: string) => h === 'tA' ? def('tA', ['f3'], ['f1']) : h === 'tB' ? def('tB', ['f1'], ['f2']) : h === 'tC' ? def('tC', ['f2'], ['f3']) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(!r.ok && r.ciclos.length === 1 && r.ciclos[0].length === 3 && new Set(r.ciclos[0]).has('A') && new Set(r.ciclos[0]).has('B') && new Set(r.ciclos[0]).has('C') && r.orden.length === 0 && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0).toBe(true);
  });

  it('cycle with tail', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }, { id: 'C', h: 'tC' }, { id: 'D', h: 'tD' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }, { de: 'B', a: 'C' }, { de: 'C', a: 'B' }, { de: 'C', a: 'D' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : h === 'tB' ? def('tB', ['f1'], ['f2']) : h === 'tC' ? def('tC', ['f2'], ['f1', 'f3']) : h === 'tD' ? def('tD', ['f3'], []) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(!r.ok && r.ciclos.length >= 1 && r.ciclos.some(c => new Set(c).has('B') && new Set(c).has('C')) && r.orden.join() === 'A,D' && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0).toBe(true);
  });

  it('direct match', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : h === 'tB' ? def('tB', ['f1'], []) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0 && r.orden.join() === 'A,B').toBe(true);
  });

  it('two-step conversion', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : h === 'tB' ? def('tB', ['f3'], []) : null;
    const r = (de: string, arr: string) => de === 'f1' && arr === 'f3' ? ['f2'] : null;
    const rs = analizarConvergencia(a, e, d, r);
    expect(rs.ok && rs.ciclos.length === 0 && rs.incompatibles.length === 0 && rs.conversiones.length === 1 && rs.conversiones[0].arista.de === 'A' && rs.conversiones[0].arista.a === 'B' && rs.conversiones[0].ruta.join() === 'f2' && rs.avisos.length === 0 && rs.orden.join() === 'A,B').toBe(true);
  });

  it('incompatible', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : h === 'tB' ? def('tB', ['f2'], []) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 1 && r.incompatibles[0].arista.de === 'A' && r.incompatibles[0].arista.a === 'B' && r.incompatibles[0].salidas.join() === 'f1' && r.incompatibles[0].entradas.join() === 'f2' && r.conversiones.length === 0 && r.avisos.length === 0 && r.orden.join() === 'A,B').toBe(true);
  });

  it('unknown tool', () => {
    const a = [{ id: 'A', h: 'unknown' }];
    const e: Arista[] = [];
    const d = () => null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0 && r.orden.join() === 'A').toBe(true);
  });

  it('destino no entradas', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : h === 'tB' ? def('tB', [], []) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 1 && r.incompatibles[0].arista.de === 'A' && r.incompatibles[0].arista.a === 'B' && r.incompatibles[0].salidas.join() === 'f1' && r.incompatibles[0].entradas.length === 0 && r.conversiones.length === 0 && r.avisos.length === 1 && r.avisos[0] === 'La herramienta tB no recibe archivos' && r.orden.join() === 'A,B').toBe(true);
  });

  it('stable order', () => {
    const a = [{ id: 'A', h: 'tA' }, { id: 'B', h: 'tB' }, { id: 'C', h: 'tC' }];
    const e: Arista[] = [];
    const d = (h: string) => h === 'tA' ? def('tA', [], []) : h === 'tB' ? def('tB', [], []) : h === 'tC' ? def('tC', [], []) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0 && r.orden.join() === 'A,B,C').toBe(true);
  });

  it('ignore edges to unknown atoms', () => {
    const a = [{ id: 'A', h: 'tA' }];
    const e: Arista[] = [{ de: 'A', a: 'B' }];
    const d = (h: string) => h === 'tA' ? def('tA', [], ['f1']) : null;
    const r = analizarConvergencia(a, e, d, () => null);
    expect(r.ok && r.ciclos.length === 0 && r.incompatibles.length === 0 && r.conversiones.length === 0 && r.avisos.length === 0 && r.orden.join() === 'A').toBe(true);
  });
});