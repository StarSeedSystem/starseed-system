import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sanearPreferenciasRed, PREFERENCIAS_POR_DEFECTO, guardarPreferenciasRed } from '../preferencias-red-compartida';

describe('preferencias-red-compartida', () => {
  beforeEach(() => {
    // mock localStorage
    const storage = new Map<string, string>();
    const mock = {
      getItem: (k:string)=>storage.get(k) ?? null,
      setItem: (k:string,v:string)=>{storage.set(k,v);},
      clear: ()=>storage.clear(),
    } as unknown as Storage;
    (globalThis as any).localStorage = mock;
  });

  it('debería retornar valores por defecto si no hay nada', () => {
    expect(sanearPreferenciasRed({})).toEqual(PREFERENCIAS_POR_DEFECTO);
  });

  it('debería sanear valores basura', () => {
    const basura = {
      maximoCon: 'invalido',
      kbpsSubidaMax: 99999,
      reservaBateriaPct: -5,
    };
    const saneado = sanearPreferenciasRed(basura);
    expect(saneado.maximoCon).toBe('nadie');
    expect(saneado.kbpsSubidaMax).toBe(10000);
    expect(saneado.reservaBateriaPct).toBe(0);
  });

  it('debería avisar al subir el nivel de apertura', () => {
    const p1 = { ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'nadie' };
    guardarPreferenciasRed(p1);
    
    const p2 = { ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'mi-cuenta' };
    const resultado = guardarPreferenciasRed(p2);
    expect(resultado.aviso).toBe(true);
  });

  it('no debería avisar al bajar el nivel de apertura', () => {
    const p1 = { ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'publico' };
    guardarPreferenciasRed(p1);
    
    const p2 = { ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'nadie' };
    const resultado = guardarPreferenciasRed(p2);
    expect(resultado.aviso).toBeUndefined();
  });
});
