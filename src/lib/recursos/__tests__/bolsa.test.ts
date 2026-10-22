import { describe, expect, it } from 'vitest';
import { planificar, type Parte, type Peticion } from '../bolsa';
import type { OfertaNeurona } from '../oferta';

const presta = (over: Partial<OfertaNeurona['presta']> = {}): OfertaNeurona['presta'] => ({
  cuenta: true, grupos: ['g1'], publico: false,
  topes: { cpuPct: 100, ramMb: 8192, discoMb: 4096, soloCargando: false },
  ...over,
});
const oferta = (nodoId: string, over: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId, cuentaId: 'yo', medio: 'mac',
  computo: { nucleos: 8, ramLibreMb: 8192, gpu: true, vramMb: 8192, motores: ['imagen', 'voz'] },
  almacen: { prestaMb: 4096, volumenes: ['vol-app', 'vol-peli'] },
  apps: [{ id: 'editor', version: '1' }],
  enlaces: { subidaKbps: 2000, bajadaKbps: 4000, latenciaMs: { vecino: 5 } },
  energia: { bateriaPct: 90, cargando: true, enUso: false },
  presta: presta(), t: 0,
  ...over,
});
const peticion = (partes: Peticion['partes'], contexto: Partial<Peticion['contexto']> = {}): Peticion => ({
  id: 'p1', contexto: { tipo: 'cuenta', id: 'yo', privado: false, ...contexto }, partes,
});
const parte = (clase: Parte['clase'], necesita: Parte['necesita'], latenciaMaxMs?: number): Parte => ({ clase, necesita, latenciaMaxMs });

describe('bolsa · privacidad', () => {
  it('lo privado no sale a vecinos públicos ni a otra cuenta', () => {
    const ajeno = oferta('ajeno', { cuentaId: 'otro', medio: 'nube', presta: presta({ cuenta: false, publico: true }) });
    const r = planificar(peticion([parte('computo', { ramMb: 256 })], { privado: true }), [ajeno]);
    expect(r[0].resultado.destino).toBe('local');
  });
  it('lo privado sí usa los servidores del cerebro', () => {
    const cerebro = oferta('a1', { cuentaId: 'otro', medio: 'cerebro' });
    expect(planificar(peticion([parte('computo', { ramMb: 256 })], { privado: true }), [cerebro])[0].resultado.destino).toBe('a1');
  });
  it('un contexto de grupo usa a sus miembros y no a los ajenos', () => {
    const miembro = oferta('deGrupo', { cuentaId: 'otro', presta: presta({ cuenta: false, grupos: ['g1'] }) });
    const ajeno = oferta('ajeno', { cuentaId: 'otro', presta: presta({ cuenta: false, grupos: ['g2'] }) });
    const r = planificar(peticion([parte('computo', { ramMb: 256 })], { tipo: 'grupo', id: 'g1' }), [ajeno, miembro]);
    expect(r[0].resultado.destino).toBe('deGrupo');
  });
  it('una neurona de la cuenta que no presta a su cuenta no se usa', () => {
    const cerrada = oferta('cerrada', { presta: presta({ cuenta: false }) });
    const r = planificar(peticion([parte('computo', { ramMb: 256 })]), [cerrada]);
    expect(r[0].resultado.destino).toBe('local');
  });
});

describe('bolsa · latencia', () => {
  it('descarta el enlace por encima del tope', () => {
    const lento = oferta('lento', { enlaces: { latenciaMs: { vecino: 90 } } });
    expect(planificar(peticion([parte('ventana', { appId: 'editor' }, 30)]), [lento])[0].resultado.destino).not.toBe('lento');
  });
  it('elige el medido bajo el tope y desconfía del no medido', () => {
    const rapido = oferta('rapido', { enlaces: { latenciaMs: { vecino: 9 } } });
    const sinMedir = oferta('sinMedir', { enlaces: {} });
    const r = planificar(peticion([parte('ventana', { appId: 'editor' }, 30)]), [sinMedir, rapido]);
    expect(r[0].resultado.destino).toBe('rapido');
    expect(r[0].resultado.enlace).toBe('cuenta');
  });
});

describe('bolsa · energía', () => {
  it('ni batería baja sin cargador ni una neurona en uso prestan', () => {
    const cansada = oferta('cansada', { energia: { bateriaPct: 5, cargando: false, enUso: false } });
    const ocupada = oferta('ocupada', { energia: { bateriaPct: 90, cargando: true, enUso: true } });
    const r = planificar(peticion([parte('computo', { ramMb: 256 })]), [cansada, ocupada]);
    expect(r[0].resultado.destino).toBe('local');
  });
  it('una neurona con la batería baja tampoco presta su almacenamiento', () => {
    const cansada = oferta('cansada', { energia: { bateriaPct: 5, cargando: false, enUso: false } });
    const r = planificar(peticion([parte('bytes', { volumen: 'vol-peli' })]), [cansada]);
    expect(r[0].resultado.destino).toBe('nube');
  });
});

describe('bolsa · capacidad prestable', () => {
  it('mira lo que se presta, no lo que la neurona tiene', () => {
    const tacaña = oferta('tacana', { presta: presta({ topes: { cpuPct: 100, ramMb: 256, discoMb: 4096, soloCargando: false } }) });
    expect(planificar(peticion([parte('computo', { ramMb: 1024 })]), [tacaña])[0].resultado.destino).toBe('local');
  });
  it('exige el motor pedido', () => {
    const sinMotor = oferta('sinMotor', { computo: { nucleos: 8, ramLibreMb: 8192, gpu: false, motores: ['voz'] } });
    expect(planificar(peticion([parte('relevo', { ramMb: 128, motor: 'imagen' })]), [sinMotor])[0].resultado.destino).toBe('local');
  });
  it('una app más pesada que la RAM prestada no se abre en ese nodo', () => {
    const pequeno = oferta('pequeno', {
      computo: { nucleos: 2, ramLibreMb: 2048, gpu: false, motores: [] },
      presta: presta({ topes: { cpuPct: 100, ramMb: 2048, discoMb: 4096, soloCargando: false } }),
    });
    const r = planificar(peticion([parte('ventana', { appId: 'editor', ramMb: 8000 })]), [pequeno]);
    expect(r[0].resultado.destino).toBe('nube');
    expect(r[0].resultado.suelo?.falta.join(' ')).toContain('app editor');
  });
});

describe('bolsa · relevo', () => {
  it('un nodo con menos subida de la pedida no hace el relevo', () => {
    const corto = oferta('corto', { enlaces: { subidaKbps: 100, latenciaMs: { vecino: 5 } } });
    const r = planificar(peticion([parte('relevo', { kbps: 1000 })]), [corto]);
    expect(r[0].resultado.destino).toBe('local');
  });
  it('el relevo se reparte entre las fuentes que suben', () => {
    const medio = (nodoId: string): OfertaNeurona => oferta(nodoId, { enlaces: { subidaKbps: 600, latenciaMs: { vecino: 5 } } });
    const r = planificar(peticion([parte('relevo', { kbps: 1000 })]), [medio('nodoB'), medio('nodoA')]);
    expect(r[0].resultado.fuentes).toEqual(['nodoA', 'nodoB']);
    expect(r[0].resultado.motivo).toContain('Reparto');
  });
});

describe('bolsa · coste', () => {
  it('prefiere lo propio aunque el vecino tenga menos latencia', () => {
    const propio = oferta('propio', { enlaces: { latenciaMs: { vecino: 50 } } });
    const vecino = oferta('vecino', { cuentaId: 'otro', presta: presta({ cuenta: false, publico: true }), enlaces: { latenciaMs: { vecino: 5 } } });
    const r = planificar(peticion([parte('computo', { ramMb: 256 })]), [vecino, propio]);
    expect(r[0].resultado.destino).toBe('propio');
    expect(r[0].resultado.respaldo).toBe('vecino');
  });
});

describe('bolsa · reparto', () => {
  const mini = (nodoId: string, ramMb: number, subidaKbps = 2000): OfertaNeurona => oferta(nodoId, {
    computo: { nucleos: 4, ramLibreMb: ramMb, gpu: false, motores: [] },
    presta: presta({ topes: { cpuPct: 100, ramMb, discoMb: 4096, soloCargando: false } }),
    enlaces: { subidaKbps, latenciaMs: { vecino: 5 } },
  });

  it('reparte cómputo cuando ninguna sola alcanza', () => {
    const r = planificar(peticion([parte('computo', { ramMb: 1000 })]), [mini('nodoB', 700), mini('nodoA', 600)]);
    expect(r[0].resultado.destino).toBe('nodoA');
    expect(r[0].resultado.fuentes).toEqual(['nodoA', 'nodoB']);
  });
  it('reparte bytes entre varias fuentes por ancho', () => {
    const r = planificar(peticion([parte('bytes', { volumen: 'vol-peli', kbps: 1000 })]), [mini('nodoA', 0, 600), mini('nodoB', 0, 600)]);
    expect(r[0].resultado.fuentes).toEqual(['nodoA', 'nodoB']);
    expect(r[0].resultado.motivo).toContain('Reparto');
  });
  it('el respaldo es una neurona que no se está usando ya', () => {
    const r = planificar(peticion([parte('bytes', { volumen: 'vol-peli', kbps: 1000 })]), [mini('nodoA', 0, 600), mini('nodoB', 0, 600), mini('nodoC', 0, 600)]);
    expect(r[0].resultado.fuentes).toEqual(['nodoA', 'nodoB']);
    expect(r[0].resultado.respaldo).toBe('nodoC');
  });
});

describe('bolsa · suelo', () => {
  it('un móvil sin recursos abre una app pesada en la web y dice qué falta', () => {
    const r = planificar(peticion([parte('ventana', { appId: 'editor', ramMb: 16000 })]), []);
    expect(r[0].resultado.destino).toBe('nube');
    expect(r[0].resultado.motivo).toContain('app editor');
  });
  it('el suelo nunca va vacío y dice qué falta', () => {
    const r = planificar(peticion([parte('computo', { ramMb: 1024, gpu: true })]), []);
    expect(r[0].resultado.suelo?.abrir).toBe('local');
    expect(r[0].resultado.suelo?.falta.length).toBeGreaterThan(0);
    expect(r[0].resultado.suelo?.falta.join(' ')).toContain('GPU');
  });
  it('el suelo también dice el tope de latencia que no se pudo cumplir', () => {
    const r = planificar(peticion([parte('ventana', { appId: 'editor' }, 30)]), []);
    expect(r[0].resultado.suelo?.falta.join(' ')).toContain('latencia');
  });
  it('lo privado nunca cae en la nube compartida', () => {
    const r = planificar(peticion([parte('computo', { ramMb: 1024 })], { privado: true }), []);
    expect(r[0].resultado.destino).toBe('local');
    expect(r[0].resultado.suelo?.abrir).toBe('local');
  });
  it('mismo input, mismo plan', () => {
    const p = peticion([parte('computo', { ramMb: 256 })]);
    const ofertas = [oferta('nodoB'), oferta('nodoA')];
    expect(planificar(p, ofertas)).toEqual(planificar(p, ofertas));
  });
});
