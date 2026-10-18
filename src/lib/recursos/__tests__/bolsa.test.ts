import { describe, it, expect } from 'vitest';
import { planificar, Peticion, Contexto, Parte, Necesidades, ResultadoParte, Suelo } from '../bolsa';
import { OfertaNeurona } from '../oferta';

// Helper to create a base oferta with time set within topes
const baseOferta = (overrides: Partial<OfertaNeurona> = {}): OfertaNeurona => {
  const fixedTime = new Date(2026, 9, 18, 10, 0, 0).getTime();
  return {
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
    t: fixedTime,
    ...overrides,
  };
};

describe('planificar', () => {
  it('returns result for each part', () => {
     const peticion: Peticion = {
       id: 'p1',
       contexto: { tipo: 'cuenta', id: 'cuentaA', privado: false },
       partes: [
         { clase: 'computo', necesita: { ramMb: 512 } },
         { clase: 'computo', necesita: { volumen: 512 } },
       ],
     };
    const ofertas: OfertaNeurona[] = [baseOferta()];
    const results = planificar(peticion, ofertas, {});
    expect(results).toHaveLength(2);
    expect((results[0] as ResultadoParte).destino).toBe('nodo1');
    expect((results[1] as ResultadoParte).destino).toBe('nodo1');
  });

  it('returns suelo when no matching oferta', () => {
    const peticion: Peticion = {
      id: 'p2',
      contexto: { tipo: 'cuenta', id: 'cuentaB', privado: false },
      partes: [{ clase: 'computo', necesita: { ramMb: 512 } }],
    };
    const ofertas: OfertaNeurona[] = [baseOferta({ cuentaId: 'cuentaA' })];
    const results = planificar(peticion, ofertas, {});
    expect(results).toHaveLength(1);
    const suelo = results[0] as Suelo;
    expect(suelo.abrirEn).toBe('local');
    expect(suelo.falta).toContain('ramMb');
  });

  it('respects private contexto (blocks public offer)', () => {
    const peticion: Peticion = {
      id: 'p3',
      contexto: { tipo: 'cuenta', id: 'cuentaA', privado: true },
      partes: [{ clase: 'computo', necesita: { ramMb: 512 } }],
    };
    const ofertas: OfertaNeurona[] = [baseOferta({ 
      cuentaId: 'cuentaA',
      presta: { ...baseOferta().presta, publico: true, cuenta: false } 
    })];
    const results = planificar(peticion, ofertas, {});
    expect(results).toHaveLength(1);
    const suelo = results[0] as Suelo;
    expect(suelo.abrirEn).toBe('local');
    expect(suelo.falta).toContain('ramMb');
  });

  it('checks gpu requirement', () => {
    const peticion: Peticion = {
      id: 'p4',
      contexto: { tipo: 'cuenta', id: 'cuentaA', privado: false },
      partes: [{ clase: 'computo', necesita: { gpu: true } }],
    };
    const ofertas: OfertaNeurona[] = [baseOferta({ 
      cuentaId: 'cuentaA',
      computo: { ...baseOferta().computo, gpu: false } 
    })];
    const results = planificar(peticion, ofertas, {});
    expect(results).toHaveLength(1);
    const suelo = results[0] as Suelo;
    expect(suelo.abrirEn).toBe('local');
    expect(suelo.falta).toContain('gpu');
  });

  it('checks motor requirement', () => {
    const peticion: Peticion = {
      id: 'p5',
      contexto: { tipo: 'cuenta', id: 'cuentaA', privado: false },
      partes: [{ clase: 'computo', necesita: { motor: 'imagen' } }],
    };
    const ofertas: OfertaNeurona[] = [baseOferta({ 
      cuentaId: 'cuentaA',
      computo: { ...baseOferta().computo, motores: ['voz'] } 
    })];
    const results = planificar(peticion, ofertas, {});
    expect(results).toHaveLength(1);
    const suelo = results[0] as Suelo;
    expect(suelo.abrirEn).toBe('local');
    expect(suelo.falta).toContain('motor');
  });
});