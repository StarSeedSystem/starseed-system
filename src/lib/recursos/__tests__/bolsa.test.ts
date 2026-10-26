import { describe, it, expect } from 'vitest';
import type { OfertaNeurona } from '../oferta';
import { planificar, type ContextoPeticion, type Parte, type Peticion } from '../bolsa';

const oferta = (o: Partial<OfertaNeurona> = {}): OfertaNeurona => ({
  nodoId: 'nodo1', cuentaId: 'cuentaA', medio: 'local',
  computo: { nucleos: 8, ramLibreMb: 4096, gpu: true, vramMb: 8192, motores: ['imagen'] },
  almacen: { prestaMb: 2048, volumenes: ['vol1'] },
  apps: [{ id: 'app-pesada', version: '1' }],
  enlaces: { subidaKbps: 5000, bajadaKbps: 5000, latenciaMs: { cuentaA: 5 } },
  energia: { bateriaPct: 90, cargando: false, enUso: false },
  presta: { cuenta: true, grupos: ['g1'], publico: false, topes: { cpuPct: 100, ramMb: 4096, discoMb: 2048, soloCargando: false } },
  t: Date.UTC(2026, 9, 26, 12, 0, 0),
  ...o,
});

const pet = (partes: Parte[], contexto: Partial<ContextoPeticion> = {}): Peticion => ({
  id: 'p1', contexto: { tipo: 'cuenta', id: 'cuentaA', privado: false, ...contexto }, partes,
});

describe('planificar · privacidad', () => {
  it('lo privado no usa la nube compartida ni vecinos públicos', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 256 } }], { privado: true }), [
      oferta({ nodoId: 'propio' }),
      oferta({ nodoId: 'nube', cuentaId: 'otra', medio: 'nube', presta: { ...oferta().presta, cuenta: false, publico: true } }),
    ]);
    expect(r[0].destino).toBe('propio');
  });

  it('lo privado sí usa los servidores del cerebro', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 256 } }], { privado: true }), [
      oferta({ nodoId: 'cerebro', cuentaId: 'otra', medio: 'cerebro', presta: { ...oferta().presta, cuenta: false } }),
    ]);
    expect(r[0].destino).toBe('cerebro');
  });

  it('un grupo solo usa lo que sus miembros prestan', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 256 } }], { tipo: 'grupo', id: 'g1' }), [
      oferta({ nodoId: 'miembro' }),
      oferta({ nodoId: 'ajeno', cuentaId: 'otra', presta: { ...oferta().presta, cuenta: false, grupos: [], publico: true } }),
    ]);
    expect(r[0].destino).toBe('miembro');
  });
});

describe('planificar · latencia', () => {
  it('con tope solo vale red local o latencia medida bajo el tope', () => {
    const r = planificar(pet([{ clase: 'ventana', necesita: { kbps: 1000 }, latenciaMaxMs: 20 }]), [
      oferta({ nodoId: 'remoto', medio: 'webrtc', enlaces: { subidaKbps: 5000, latenciaMs: { cuentaA: 50 } } }),
      oferta({ nodoId: 'local', medio: 'lan' }),
    ]);
    expect(r[0].destino).toBe('local');
  });

  it('sin medición no se inventa la latencia', () => {
    const r = planificar(pet([{ clase: 'ventana', necesita: { kbps: 100 }, latenciaMaxMs: 20 }]), [
      oferta({ nodoId: 'sin-medir', medio: 'webrtc', enlaces: { subidaKbps: 5000 } }),
    ]);
    expect(r[0].destino).toBe('nube');
  });
});

describe('planificar · energía y capacidad', () => {
  it('descarta una neurona en uso o con batería baja sin cargar', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 256 } }]), [
      oferta({ nodoId: 'ocupada', energia: { bateriaPct: 80, cargando: false, enUso: true } }),
      oferta({ nodoId: 'bateria', energia: { bateriaPct: 10, cargando: false, enUso: false } }),
    ]);
    expect(r[0].destino).toBe('local');
  });

  it('con batería baja cargando sí presta', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 256 } }]), [
      oferta({ nodoId: 'cargando', energia: { bateriaPct: 10, cargando: true, enUso: false } }),
    ]);
    expect(r[0].destino).toBe('cargando');
  });

  it('usa lo que presta (topes), no lo que tiene', () => {
    const topes = { ...oferta().presta.topes, ramMb: 256 };
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 1024 } }]), [
      oferta({ nodoId: 'limitada', presta: { ...oferta().presta, topes } }),
    ]);
    expect(r[0].destino).toBe('local');
    expect(r[0].suelo?.falta).toContain('1024 MB de RAM');
  });

  it('exige la app y el motor pedidos', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { appId: 'app-pesada', motor: 'voz' } }]), [
      oferta({ apps: [{ id: 'app-pesada', version: '1' }], computo: { ...oferta().computo, motores: ['imagen'] } }),
    ]);
    expect(r[0].destino).toBe('nube');
  });
});

describe('planificar · coste y reparto', () => {
  it('prefiere lo propio antes que un vecino público', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 256 } }], { tipo: 'comunidad', id: 'c1' }), [
      oferta({ nodoId: 'a-vecino', cuentaId: 'otra', presta: { ...oferta().presta, cuenta: false, publico: true } }),
      oferta({ nodoId: 'z-propio' }),
    ]);
    expect(r[0].destino).toBe('z-propio');
  });

  it('ramifica la bajada entre varias fuentes si una no basta', () => {
    const r = planificar(pet([{ clase: 'bytes', necesita: { kbps: 8000 } }]), [
      oferta({ nodoId: 'n1', enlaces: { bajadaKbps: 5000, subidaKbps: 5000 } }),
      oferta({ nodoId: 'n2', enlaces: { bajadaKbps: 5000, subidaKbps: 5000 } }),
    ]);
    expect(r[0].fuentes).toEqual(['n1', 'n2']);
    expect(r[0].destino).toBe('n1');
  });

  it('reparte el cálculo si ninguna neurona tiene la RAM pedida', () => {
    const topes = { ...oferta().presta.topes, ramMb: 512 };
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 1024 } }]), [
      oferta({ nodoId: 'n1', presta: { ...oferta().presta, topes } }),
      oferta({ nodoId: 'n2', presta: { ...oferta().presta, topes } }),
    ]);
    expect(r[0].fuentes).toEqual(['n1', 'n2']);
    expect(r[0].motivo).toContain('Reparto');
  });
});

describe('planificar · suelo y determinismo', () => {
  it('un móvil sin recursos abre la app pesada en la web y dice qué falta', () => {
    const r = planificar(pet([{ clase: 'computo', necesita: { ramMb: 4096, appId: 'app-pesada' } }]), []);
    expect(r[0].destino).toBe('nube');
    expect(r[0].suelo?.modo).toBe('web');
    expect(r[0].motivo).toContain('app-pesada');
  });

  it('lo privado nunca cae en la web compartida', () => {
    const r = planificar(pet([{ clase: 'bytes', necesita: { volumen: 'vol1' } }], { privado: true }), []);
    expect(r[0].destino).toBe('local');
    expect(r[0].motivo).toContain('cuenta');
  });

  it('empata por nodoId y no depende del orden de entrada', () => {
    const parte: Parte = { clase: 'computo', necesita: { ramMb: 256 } };
    const a = oferta({ nodoId: 'nodo-b' }), b = oferta({ nodoId: 'nodo-a' });
    expect(planificar(pet([parte]), [b, a])[0].destino).toBe('nodo-a');
    expect(planificar(pet([parte]), [a, b])[0]).toEqual(planificar(pet([parte]), [a, b])[0]);
  });
});
