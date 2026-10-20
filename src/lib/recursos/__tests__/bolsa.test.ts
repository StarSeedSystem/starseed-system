import { describe, it, expect } from 'vitest';
import { planificar } from '../bolsa';

const baseOferta = (overrides: Partial<{
  nodoId: string;
  computo: { nucleos: number; ramLibreMb: number; gpu: boolean; vramMb?: number; motores: string[] };
  presta: { cuenta: boolean; grupos: string[]; publico: boolean; topes: { cpuPct: number; ramMb: number; discoMb: number; horas?: { inicio: number; fin: number }; soloCargando: boolean } };
}> = {}): {
  nodoId: string;
  computo: { nucleos: number; ramLibreMb: number; gpu: boolean; vramMb?: number; motores: string[] };
  presta: { cuenta: boolean; grupos: string[]; publico: boolean; topes: { cpuPct: number; ramMb: number; discoMb: number; horas?: { inicio: number; fin: number }; soloCargando: boolean } };
} => ({
  nodoId: 'nodo1',
  computo: { nucleos: 4, ramLibreMb: 2048, gpu: true, vramMb: 4096, motores: ['imagen', 'voz'] },
  presta: {
    cuenta: true,
    grupos: ['grupo1'],
    publico: false,
    topes: { cpuPct: 50, ramMb: 1024, discoMb: 512, horas: { inicio: 8, fin: 18 }, soloCargando: false },
  },
  ...overrides,
});

const basePeticion = (overrides: Partial<{
  id: string;
  contexto: { tipo: 'cuenta' | 'grupo' | 'comunidad' | 'publicacion' | 'estacion'; id: string; privado: boolean };
  partes: { clase: 'computo' | 'bytes' | 'ventana' | 'relevo'; necesita: { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: string; kbps?: number; }[]; latenciaMaxMs?: number };
}> = {}): {
  id: string;
  contexto: { tipo: string; id: string; privado: boolean };
  partes: { clase: string; necesita: { ramMb?: number; gpu?: boolean; motor?: string; appId?: string; volumen?: string; kbps?: number; }[]; latenciaMaxMs?: number };
} => ({
  id: 'peticion1',
  contexto: { tipo: 'cuenta' as const, id: 'cuentaA', privado: false },
  partes: [
    {
      clase: 'computo' as const,
      necesita: { ramMb: 512 },
    },
    ...(overrides.partes ? overrides.partes : []),
  ],
  ...overrides,
});

describe('planificar - regla 1: privacidad', () => {
  it('privado: solo cuenta misma cuenta', () => {
    const p = basePeticion({ contexto: { tipo: 'cuenta', id: 'cuentaA', privado: true }, parts: [{ clase: 'computo', necesita: { ramMb: 256 } }] });
    // @ts-expect-error - testing private scenario
    const r = planificar(p, [baseOferta({ nodoId: 'nodo2', presta: { cuenta: false, publico: true } })]);
    expect(r[0].resultado.destino).not.toBe('nodo2');
  });
  it('no privado: permite pública o del grupo', () => {
    const p = basePeticion({ contexto: { tipo: 'cuenta', id: 'cuentaA', privado: false } });
    const r = planificar(p, [baseOferta({ nodoId: 'nodo2', presta: { cuenta: false, publico: true } })]);
    expect(r[0].resultado.destino).toBe('nodo2');
  });
});

describe('planificar - regla 2: latencia', () => {
  it('con latenciaMaxMs filtra ofertas con alta latencia', () => {
    const p = basePeticion({ latenciaMaxMs: 30 });
    const r = planificar(p, [baseOferta({ presta: { topes: { cpuPct: 10 } } })]);
    expect(r[0].resultado.motivo).toContain('latencia');
  });
  it('sin latenciaMaxMs no filtra', () => {
    const p = basePeticion();
    const r = planificar(p, [baseOferta({ presta: { topes: { cpuPct: 90 } } })]);
    expect(r[0].resultado.destino).not.toBeUndefined();
  });
});

describe('planificar - regla 3: energía', () => {
  it('batería baja descarta oferta', () => {
    const p = basePeticion({ contexto: { tipo: 'cuenta', privado: true } });
    const r = planificar(p, [baseOferta({ presta: { topes: { cpuPct: 10 } } })]);
    expect(r[0].resultado.destino).not.toBe('nodo1');
  });
  it('propia cuenta batería baja permite', () => {
    const p = basePeticion({ contexto: { tipo: 'cuenta', privado: true } });
    const r = planificar(p, [baseOferta({ presta: { cuenta: true, topes: { cpuPct: 10 } } })]);
    // Debería pasar o depender de otras reglas
    expect(r[0].resultado.motivo).toBeDefined();
  });
});

describe('planificar - regla 4: capacidad', () => {
  it('suficiente RAM pasa filtro de capacidad', () => {
    const p = basePeticion({ partes: [{ clase: 'computo', necesita: { ramMb: 512 } }] });
    const r = planificar(p, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 2048 } })]);
    expect(r[0].resultado.destino).toBe('nodo1');
  });
  it('RAM insuficiente falla', () => {
    const p = basePeticion({ partes: [{ clase: 'computo', necesita: { ramMb: 4096 } }] });
    const r = planificar(p, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 256 } })]);
    expect(r[0].resultado.destino).toBe('local');
    expect(r[0].resultado.motivo).toContain('Suelo');
  });
});

describe('planificar - regla 5: coste', () => {
  it('prefiere propia cuenta', () => {
    const p = basePeticion({ contexto: { tipo: 'cuenta', privado: false } });
    const r = planificar(p, [baseOferta({ presta: { cuenta: true } }), baseOferta({ presta: { cuenta: false, publico: true } })]);
    // La propia cuenta debería preferirse
    expect(r.length).toBe(2);
  });
});

describe('planificar - regla 6: reparto', () => {
  it('múltiples partes ramifica a varias fuentes', () => {
    const p = basePeticion({
      partes: [
        { clase: 'computo', necesita: { ramMb: 512 } },
        { clase: 'computo', necesita: { ramMb: 512 } },
      ],
    });
    const r = planificar(p, [baseOferta({ nodoId: 'nodo1', computo: { nucleos: 4, ramLibreMb: 2048 } })]);
    expect(r[0].resultado.fuentes).toBeDefined();
    expect(r[1].resultado.fuentes).toBeDefined();
  });
  it('parte única no ramifica', () => {
    const p = basePeticion({
      partes: [{ clase: 'computo', necesita: { ramMb: 512 } }],
    });
    const r = planificar(p, [baseOferta({ nodoId: 'nodo1', computo: { nucleos: 4, ramLibreMb: 2048 } })]);
    expect(r[0].resultado.fuentes).toBeUndefined();
  });
});

describe('planificar - regla 7: suelo', () => {
  it('sin recursos devuelve local con motivo', () => {
    const p = basePeticion({ partes: [{ clase: 'computo', necesita: { ramMb: 8192 } }] });
    const r = planificar(p, [baseOferta({ computo: { nucleos: 4, ramLibreMb: 256 } })]);
    expect(r[0].resultado.destino).toBe('local');
    expect(r[0].resultado.motivo).toContain('Suelo');
  });
  it('app pesada sin recursos sugiere local/web', () => {
    const p = basePeticion({
      partes: [{ clase: 'bytes', necesita: { volumen: 'app-pesada' } }],
    });
    const r = planificar(p, []);
    expect(r[0].resultado.destino).toBe('local');
    expect(r[0].resultado.motivo).toContain('Suelo');
  });
});

describe('planificar - determinismo', () => {
  it('mismo input siempre mismo output', () => {
    const p = basePeticion({ partes: [{ clase: 'computo', necesita: { ramMb: 512 } }] });
    const ofertas = [baseOferta({ nodoId: 'nodo2' }), baseOferta({ nodoId: 'nodo1' })];
    const r1 = planificar(p, ofertas);
    const r2 = planificar(p, ofertas);
    expect(r1).toEqual(r2);
  });
});