import { describe, expect, it } from 'vitest';
import type { OfertaNeurona } from '../oferta';
import { planificar, type Peticion } from '../bolsa';

const con = (nodoId: string, cambio: Partial<OfertaNeurona> = {}): OfertaNeurona => {
  const base: OfertaNeurona = {
    nodoId,
    cuentaId: 'cuentaA',
    medio: 'portatil',
    computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, vramMb: 4096, motores: ['voz'] },
    almacen: { prestaMb: 5120, volumenes: ['app-3d'] },
    apps: [{ id: 'app-3d', version: '1.0.0' }],
    enlaces: { subidaKbps: 800, bajadaKbps: 2000 },
    energia: { enUso: false },
    presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 4096, discoMb: 8192, soloCargando: false } },
    t: 0,
  };
  return {
    ...base,
    ...cambio,
    computo: { ...base.computo, ...(cambio.computo ?? {}) },
    almacen: { ...base.almacen, ...(cambio.almacen ?? {}) },
    enlaces: { ...base.enlaces, ...(cambio.enlaces ?? {}) },
    energia: { ...base.energia, ...(cambio.energia ?? {}) },
    presta: {
      ...base.presta,
      ...(cambio.presta ?? {}),
      topes: { ...base.presta.topes, ...(cambio.presta?.topes ?? {}) },
    },
  };
};

const pide = (cambio: Partial<Peticion> = {}): Peticion => ({
  id: 'p-1',
  cuentaId: 'cuentaA',
  grupos: [],
  contexto: { tipo: 'cuenta', id: 'cuentaA', privado: false },
  partes: [{ clase: 'computo', necesita: { ramMb: 1024 } }],
  ...cambio,
});

describe('Bolsa · regla 1: permisos y privacidad', () => {
  it('lo privado no usa vecinos públicos ni sale de la cuenta', () => {
    const r = planificar(pide({ contexto: { tipo: 'publicacion', id: 'x', privado: true } }), [con('n1', { cuentaId: 'otra', presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 100, ramMb: 4096, discoMb: 8192, soloCargando: false } } })]);
    expect(r[0].destino).toBe('local');
    expect(r[0].motivo).toContain('privado');
  });
  it('privado sí usa una neurona de la misma cuenta', () => {
    const r = planificar(pide({ contexto: { tipo: 'cuenta', id: 'cuentaA', privado: true } }), [con('n1')]);
    expect(r[0].destino).toBe('n1');
  });
  it('lo público acepta vecinos del grupo', () => {
    const r = planificar(pide({ grupos: ['G1'] }), [con('n2', { cuentaId: 'otra', presta: { cuenta: false, grupos: ['G1'], publico: false, topes: { cpuPct: 100, ramMb: 4096, discoMb: 8192, soloCargando: false } } })]);
    expect(r[0].destino).toBe('n2');
  });
});

describe('Bolsa · regla 2: latencia en tiempo real', () => {
  it('con latencia medida bajo el tope sirve', () => {
    const r = planificar(pide({ partes: [{ clase: 'ventana', necesita: { appId: 'app-3d' }, latenciaMaxMs: 50 }] }), [con('n1', { enlaces: { latenciaMs: { n1: 20 } } })]);
    expect(r[0].destino).toBe('n1');
  });
  it('sin latencia medida no se inventa: suelo con el motivo de lo que falta', () => {
    const r = planificar(pide({ partes: [{ clase: 'ventana', necesita: { appId: 'app-3d' }, latenciaMaxMs: 50 }] }), [con('n1')]);
    expect(r[0].destino).toBe('nube');
    expect(r[0].motivo).toContain('app-3d');
  });
});

describe('Bolsa · regla 3: energía', () => {
  it('batería baja sin cargador no presta cómputo', () => {
    const r = planificar(pide(), [con('n1', { energia: { bateriaPct: 15, cargando: false, enUso: false } })]);
    expect(r[0].destino).toBe('nube');
  });
  it('una que su dueño está usando a fondo tampoco', () => {
    const r = planificar(pide(), [con('n1', { energia: { enUso: true } })]);
    expect(r[0].destino).toBe('nube');
  });
  it('cargando vuelve a prestar', () => {
    const r = planificar(pide(), [con('n1', { energia: { bateriaPct: 15, cargando: true, enUso: false } })]);
    expect(r[0].destino).toBe('n1');
  });
});

describe('Bolsa · regla 4: capacidad prestable', () => {
  it('cabe en lo que presta, no en lo que tiene', () => {
    const r = planificar(pide({ partes: [{ clase: 'computo', necesita: { ramMb: 2048 } }] }), [con('n1', { presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 1024, discoMb: 8192, soloCargando: false } } })]);
    expect(r[0].destino).toBe('nube');
  });
  it('si cabe en el tope prestable, sirve', () => {
    const r = planificar(pide({ partes: [{ clase: 'computo', necesita: { ramMb: 900 } }] }), [con('n1', { presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 1024, discoMb: 8192, soloCargando: false } } })]);
    expect(r[0].destino).toBe('n1');
  });
  it('pide un motor que la neurona no tiene: suelo', () => {
    const r = planificar(pide({ partes: [{ clase: 'computo', necesita: { motor: 'ojo' } }] }), [con('n1')]);
    expect(r[0].destino).toBe('nube');
    expect(r[0].motivo).toContain('motor ojo');
  });
});

describe('Bolsa · regla 5: primero lo gratuito y propio', () => {
  it('la oferta propia va antes que la del grupo y que la pública', () => {
    const ajena = con('n2', { cuentaId: 'otra', presta: { cuenta: false, grupos: [], publico: true, topes: { cpuPct: 100, ramMb: 4096, discoMb: 8192, soloCargando: false } } });
    const r = planificar(pide(), [ajena, con('n1')]);
    expect(r[0].destino).toBe('n1');
    expect(r[0].respaldo).toBe('n2');
  });
});

describe('Bolsa · regla 6: reparto en varias fuentes', () => {
  it('ninguna cubre sola el cómputo, entre dos sí: se ramifica', () => {
    const r = planificar(pide({ partes: [{ clase: 'computo', necesita: { ramMb: 3072 } }] }), [con('n1', { computo: { ramLibreMb: 2048 } }), con('n2', { computo: { ramLibreMb: 1536 } })]);
    expect(r[0].fuentes).toEqual(['n1', 'n2']);
    expect(r[0].destino).toBe('n1');
  });
  it('un volumen guardado por dos neuronas sale de las dos, con respaldo', () => {
    const r = planificar(pide({ partes: [{ clase: 'bytes', necesita: { volumen: 'app-3d' } }] }), [con('n1'), con('n2')]);
    expect(r[0].fuentes).toEqual(['n1', 'n2']);
    expect(r[0].respaldo).toBe('n2');
  });
});

describe('Bolsa · regla 7: suelo', () => {
  it('móvil sin recursos abre una app pesada en local, referenciando el volumen, y dice qué falta', () => {
    const movil = con('n1', { computo: { nucleos: 0, ramLibreMb: 0, gpu: false, motores: [] }, almacen: { prestaMb: 0, volumenes: [] } });
    const r = planificar(pide({ contexto: { tipo: 'cuenta', id: 'cuentaA', privado: true }, partes: [{ clase: 'bytes', necesita: { appId: 'app-3d' } }] }), [movil]);
    expect(r[0].destino).toBe('local');
    expect(r[0].motivo).toContain('app-3d');
    expect(r[0].fuentes).toBeUndefined();
  });
  it('sin recursos y contexto público el suelo es la nube como último recurso', () => {
    const r = planificar(pide(), []);
    expect(r[0].destino).toBe('nube');
    expect(r[0].motivo).toContain('cómputo');
  });
});

describe('Bolsa · determinismo', () => {
  it('empate entre dos ofertas propias: decide el nodoId menor y siempre igual', () => {
    const p = pide();
    const ofertas = [con('nB'), con('nA')];
    expect(planificar(p, ofertas)[0].destino).toBe('nA');
    expect(planificar(p, ofertas)).toEqual(planificar(p, ofertas));
  });
  it('una parte por petición: el plan alineado nunca queda vacío', () => {
    const r = planificar(pide({ partes: [{ clase: 'relevo', necesita: { kbps: 500 } }] }), [con('n1', { enlaces: { subidaKbps: 800, bajadaKbps: 2000 } })]);
    expect(r).toHaveLength(1);
    expect(r[0].destino).toBe('n1');
  });
});
