import { describe, it, expect } from 'vitest';
import { planCuerpo } from '../cuerpo';
import type { Cuerpo, Medio, FormaCuerpo } from '../tipos';

describe('planCuerpo', () => {
  const baseCuerpo: Omit<Cuerpo, 'forma' | 'avatarRef'> = {
    tono: 0,
    escala: 1,
  };
  const baseCtx = { xrDisponible: false, vrmDisponible: false };

  it('devuelve orbe por defecto', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'orbe' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result).toEqual({ render: 'orbe' });
  });

  it('devuelve imagen para referencia de biblioteca válida', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'avatar-2d', avatarRef: 'lib:123' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result).toEqual({ render: 'imagen', ref: 'lib:123' });
  });

  it('devuelve imagen para referencia de biblioteca con prefijo biblioteca:', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'avatar-2d', avatarRef: 'biblioteca:456' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result).toEqual({ render: 'imagen', ref: 'biblioteca:456' });
  });

  it('devuelve imagen para referencia de ADN', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'avatar-2d', avatarRef: 'adn:789' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result).toEqual({ render: 'imagen', ref: 'adn:789' });
  });

  it('devuelve orbe con motivo para URL suelta en avatar-2d', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'avatar-2d', avatarRef: 'https://example.com/avatar.png' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result.render).toBe('orbe');
    expect(result.motivo).toContain('Referencia de avatar no válida');
  });

  it('devuelve ser para forma ser-genesis', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'ser-genesis' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result).toEqual({ render: 'ser' });
  });

  it('devuelve modelo-3d para avatar-3d en medio xr con vrm disponible', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'avatar-3d' };
    const ctx = { ...baseCtx, xrDisponible: true, vrmDisponible: true };
    const result = planCuerpo(cuerpo, 'xr', ctx);
    expect(result).toEqual({ render: 'modelo-3d' });
  });

  it('devuelve orbe con motivo para avatar-3d sin medio xr', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'avatar-3d' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result.render).toBe('orbe');
    expect(result.motivo).toBe('próximamente: llega con StarSeed XR (XR1010A)');
  });

  it('devuelve orbe con motivo para avatar-3d sin vrm disponible', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'avatar-3d' };
    const ctx = { ...baseCtx, xrDisponible: true, vrmDisponible: false };
    const result = planCuerpo(cuerpo, 'xr', ctx);
    expect(result.render).toBe('orbe');
    expect(result.motivo).toBe('próximamente: llega con StarSeed XR (XR1010A)');
  });

  it('devuelve orbe con motivo para vrm sin medio xr', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'vrm' };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result.render).toBe('orbe');
    expect(result.motivo).toBe('próximamente: llega con StarSeed XR (XR1010A)');
  });

  it('devuelve orbe con motivo para forma desconocida', () => {
    const cuerpo: Cuerpo = { ...baseCuerpo, forma: 'desconocida' as FormaCuerpo };
    const result = planCuerpo(cuerpo, 'web', baseCtx);
    expect(result.render).toBe('orbe');
    expect(result.motivo).toContain('Forma de cuerpo no soportado');
  });
});
