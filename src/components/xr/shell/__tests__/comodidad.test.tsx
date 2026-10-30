import { describe, it, expect } from 'vitest';
import { CONFORT_DEFECTO, opacidadVineta, siguienteGiro, type PreferenciasConfort } from '@/lib/xr/confort';
import { puedeMostrarSubtitulos, posturaActual, opacidadParaMovimiento, yawTrasSaltos } from '../comodidad';
const c = { ...CONFORT_DEFECTO } as PreferenciasConfort;
describe('viñeta',()=>{
  it('sube con velocidad y nunca pasa de 0,85',()=>{
    const o = opacidadParaMovimiento(c,2.5,80);
    expect(o).toBeGreaterThan(0);
    expect(o).toBeLessThanOrEqual(0.85);
  });
  it('con nunca es 0 salvo movimiento reducido',()=>{
    const cn = { ...c, vineta:'nunca', movimientoReducido:false } as PreferenciasConfort;
    expect(opacidadVineta(cn,{lineal:0,angularGradosS:0})).toBe(0);
    const cr = { ...c, vineta:'nunca', movimientoReducido:true } as PreferenciasConfort;
    expect(opacidadVineta(cr,{lineal:0,angularGradosS:0})).toBeGreaterThan(0);
  });
});
describe('giro por saltos',()=>{
  it('ocho saltos de 45° dan la vuelta',()=>{
    const cc = { ...c, anguloSalto:45 as const } as PreferenciasConfort;
    const y = yawTrasSaltos(0,8,1,cc);
    expect(Math.abs(((y % (Math.PI*2))+Math.PI*2)%(Math.PI*2))).toBeCloseTo(0,5);
  });
});
describe('subtítulos',()=>{
  it('se muestran y ocultan con la preferencia',()=>{
    expect(puedeMostrarSubtitulos(c)).toBe(true);
    expect(puedeMostrarSubtitulos({ ...c, subtitulos:false } as PreferenciasConfort)).toBe(false);
  });
});
describe('una mano',()=>{
  it('cambia la postura',()=>{
    expect(posturaActual(c)).toBe('de-pie');
    expect(posturaActual({ ...c, postura:'una-mano' } as PreferenciasConfort)).toBe('una-mano');
  });
});
describe('movimiento reducido',()=>{
  it('fuerza saltos',()=>{
    const cr = { ...c, movimientoReducido:true, giro:'continuo' as const } as PreferenciasConfort;
    const y = siguienteGiro(0,1,cr);
    expect(y).not.toBe(0);
  });
});

