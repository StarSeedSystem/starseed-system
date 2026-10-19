// src/lib/aurora/voz-starseed/__tests__/licencia-voz.test.ts
import { describe, it, expect } from 'vitest';
import { motoresPermitidos, Motor, ResultadoLicencia } from '../licencia-voz';

describe('motoresPermitidos', () => {
  const capasVacias: any = {};

  it('allows libre in all contexts', () => {
    const motores: Motor[] = [{ id: 'm1', claseLicencia: 'libre' }];
    const contexts = ['personal', 'grupo', 'comunidad', 'publico', 'comercial'] as const;
    contexts.forEach(ctx => {
      const { permitidos, excluidos } = motoresPermitidos(motores, ctx, capasVacias);
      expect(permitidos).toEqual(motores);
      expect(excluidos).toEqual([]);
    });
  });

  it('allows personal only in personal context with persona layer', () => {
    const motores: Motor[] = [{ id: 'm1', claseLicencia: 'personal' }];
    const capasConPersona: any = { persona: 'personal' };
    // Allow in personal context with persona layer
    let res = motoresPermitidos(motores, 'personal', capasConPersona);
    expect(res.permitidos).toEqual(motores);
    expect(res.excluidos).toEqual([]);
    // Disallow in personal context without persona layer
    res = motoresPermitidos(motores, 'personal', capasVacias);
    expect(res.permitidos).toEqual([]);
    expect(res.excluidos).toEqual([{ id: 'm1', motivo: 'licencia personal no permitida en contexto personal' }]);
    // Disallow in other contexts
    const otherContexts = ['grupo', 'comunidad', 'publico', 'comercial'] as const;
    otherContexts.forEach(ctx => {
      res = motoresPermitidos(motores, ctx, capasConPersona);
      expect(res.permitidos).toEqual([]);
      expect(res.excluidos).toEqual([{ id: 'm1', motivo: `licencia personal no permitida en contexto ${ctx}` }]);
    });
  });

  it('allows condicionada when condition met and layer allows', () => {
    const motores: Motor[] = [{ id: 'm1', claseLicencia: 'condicionada', condicionCumplida: true }];
    // Disallow without community/group layer
    let res = motoresPermitidos(motores, 'personal', capasVacias);
    expect(res.permitidos).toEqual([]);
    expect(res.excluidos).toEqual([{ id: 'm1', motivo: 'licencia condicionada no permitida en contexto personal' }]);
    // Allow with community layer set to condicionada
    const capasConComunidadCondicionada: any = { comunidad: 'condicionada' };
    const contexts = ['personal', 'grupo', 'comunidad', 'publico', 'comercial'] as const;
    contexts.forEach(ctx => {
      res = motoresPermitidos(motores, ctx, capasConComunidadCondicionada);
      expect(res.permitidos).toEqual(motores);
      expect(res.excluidos).toEqual([]);
    });
  });

  it('excludes condicionada when condition not met', () => {
    const motores: Motor[] = [{ id: 'm1', claseLicencia: 'condicionada', condicionCumplida: false }];
    const capasConComunidadCondicionada: any = { comunidad: 'condicionada' };
    const contexts = ['personal', 'grupo', 'comunidad', 'publico', 'comercial'] as const;
    contexts.forEach(ctx => {
      const res = motoresPermitidos(motores, ctx, capasConComunidadCondicionada);
      expect(res.permitidos).toEqual([]);
      expect(res.excluidos).toEqual([{ id: 'm1', motivo: 'condición no cumplida para licencia condicionada' }]);
    });
  });

  it('respects capa restrictions', () => {
    const capasConCondicionada: any = { comunidad: 'condicionada' };
    const motores: Motor[] = [
      { id: 'm1', claseLicencia: 'libre' },
      { id: 'm2', claseLicencia: 'condicionada', condicionCumplida: true },
      { id: 'm3', claseLicencia: 'personal' }
    ];
    const capasConPersona: any = { persona: 'personal' };
    // Personal context with persona layer: libre and personal allowed, condicionada not
    let res = motoresPermitidos(motores, 'personal', capasConPersona);
    expect(res.permitidos.map(m => m.id)).toEqual(['m1', 'm3']);
    expect(res.excluidos.map(e => e.id)).toEqual(['m2']);
    // Personal context with community and persona layers: all allowed
    const capasAmbas: any = { comunidad: 'condicionada', persona: 'personal' };
    res = motoresPermitidos(motores, 'personal', capasAmbas);
    expect(res.permitidos).toHaveLength(3);
    expect(res.excluidos).toEqual([]);
    // Public context: personal not allowed even with persona layer
    res = motoresPermitidos(motores, 'publico', capasConPersona);
    expect(res.permitidos).toEqual([motores[0]]);
    expect(res.excluidos.map(e => e.id)).toEqual(['m2', 'm3']);
  });

  it('comercial context same as publico for license outcome', () => {
    const motores: Motor[] = [
      { id: 'm1', claseLicencia: 'libre' },
      { id: 'm2', claseLicencia: 'condicionada', condicionCumplida: true },
      { id: 'm3', claseLicencia: 'personal' }
    ];
    const resCom = motoresPermitidos(motores, 'comercial', {});
    const resPub = motoresPermitidos(motores, 'publico', {});
    expect(resCom.permitidos.map(m => m.id)).toEqual(resPub.permitidos.map(m => m.id));
    expect(resCom.excluidos.map(e => e.id)).toEqual(resPub.excluidos.map(e => e.id));
  });
});