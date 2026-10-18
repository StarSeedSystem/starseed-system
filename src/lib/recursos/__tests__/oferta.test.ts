import { describe, it, expect } from 'vitest';
import { OfertaNeurona, capacidadPrestable, ofertaVisiblePara } from '../oferta';

const base = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: 'nodo1',
  cuentaId: 'cuentaA',
  medio: 'wifi',
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, vramMb: 4096, motores: ['imagen', 'voz'] },
  almacen: { prestaMb: 1024, volumenes: ['vol1', 'vol2'] },
  apps: [{ id: 'app1', version: '1.0' }],
  enlaces: { subidaKbps: 1000, bajadaKbps: 2000, latenciaMs: { nodo2: 10, nodo3: 20 } },
  energia: { bateriaPct: 80, cargando: false, enUso: false },
  presta: {
    cuenta: true,
    grupos: ['grupo1', 'grupo2'],
    publico: false,
    topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, horas: { inicio: 8, fin: 18 }, soloCargando: false },
  },
  t: Date.now(),
  ...o,
});

describe('ofertaVisiblePara', () => {
  it('null when no access', () => {
    const o = base();
    const q = { cuentaId: 'cuentaB', grupos: ['grupo3'] };
    expect(ofertaVisiblePara(o, q)).toBeNull();
  });
  it('account access', () => {
    const o = base();
    const q = { cuentaId: 'cuentaA', grupos: [] };
    const r = ofertaVisiblePara(o, q);
    expect(r).not.toBeNull();
    expect(r).toEqual(o);
  });
  it('public access', () => {
    const o = base({ presta: { ...base().presta, publico: true } });
    const q = { cuentaId: 'cuentaB', grupos: [] };
    const r = ofertaVisiblePara(o, q);
    expect(r).not.toBeNull();
    expect(r).toEqual(o);
  });
  it('group access', () => {
    const o = base();
    const q = { cuentaId: 'cuentaB', grupos: ['grupo1'] };
    const r = ofertaVisiblePara(o, q);
    expect(r).not.toBeNull();
    expect(r).toEqual(o);
  });
});

describe('capacidadPrestable', () => {
  const baseCap = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => base({ ...o, t: new Date(2026, 9, 18, 10, 0, 0).getTime() });

  it('battery <20% no charge -> zero comp', () => {
    const o = baseCap({ energia: { bateriaPct: 10, cargando: false, enUso: false } });
    const r = capacidadPrestable(o);
    expect(r.computo).toEqual({ nucleos: 0, ramLibreMb: 0, gpu: false, vramMb: undefined, motores: [] });
    expect(r.almacen.prestaMb).toBe(512);
    expect(r.almacen.volumenes).toEqual(['vol1', 'vol2']);
  });
  it('enUso true -> zero comp', () => {
    const o = baseCap({ energia: { enUso: true } });
    const r = capacidadPrestable(o);
    expect(r.computo).toEqual({ nucleos: 0, ramLibreMb: 0, gpu: false, vramMb: undefined, motores: [] });
    expect(r.almacen.prestaMb).toBe(512);
    expect(r.almacen.volumenes).toEqual(['vol1', 'vol2']);
  });
  it('topes applied', () => {
    const r = capacidadPrestable(baseCap());
    expect(r.computo.nucleos).toBe(2);
    expect(r.computo.ramLibreMb).toBe(1024);
    expect(r.computo.gpu).toBe(true);
    expect(r.computo.vramMb).toBe(4096);
    expect(r.computo.motores).toEqual(['imagen', 'voz']);
    expect(r.almacen.prestaMb).toBe(512);
    expect(r.almacen.volumenes).toEqual(['vol1', 'vol2']);
  });
  it('soloCargando true no charge -> zero', () => {
    const o = baseCap({ presta: { ...baseCap().presta, topes: { ...baseCap().presta.topes, soloCargando: true } } });
    const r = capacidadPrestable(o);
    expect(r.computo.nucleos).toBe(0);
    expect(r.computo.ramLibreMb).toBe(0);
    expect(r.computo.gpu).toBe(false);
    expect(r.computo.vramMb).toBeUndefined();
    expect(r.computo.motores).toEqual([]);
    expect(r.almacen.prestaMb).toBe(0);
    expect(r.almacen.volumenes).toEqual([]);
  });
  it('outside hours -> zero', () => {
    const o = { ...baseCap(), t: new Date(2026, 9, 18, 22, 0, 0).getTime() };
    const r = capacidadPrestable(o);
    expect(r.computo.nucleos).toBe(0);
    expect(r.computo.ramLibreMb).toBe(0);
    expect(r.computo.gpu).toBe(false);
    expect(r.computo.vramMb).toBeUndefined();
    expect(r.computo.motores).toEqual([]);
    expect(r.almacen.prestaMb).toBe(0);
    expect(r.almacen.volumenes).toEqual([]);
  });
  it('other fields unchanged', () => {
    const o = baseCap();
    const r = capacidadPrestable(o);
    expect(r.nodoId).toBe(o.nodoId);
    expect(r.cuentaId).toBe(o.cuentaId);
    expect(r.medio).toBe(o.medio);
    expect(r.apps).toEqual(o.apps);
    expect(r.enlaces).toEqual(o.enlaces);
    expect(r.energia).toEqual(o.energia);
    expect(r.presta).toEqual(o.presta);
    expect(r.t).toBe(o.t);
  });
});