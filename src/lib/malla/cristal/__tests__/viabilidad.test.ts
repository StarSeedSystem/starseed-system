import { describe, it, expect } from 'vitest';
import { viabilidad, type ContextoViabilidad } from '../viabilidad';
import type { Dato, SenalMedida } from '../tipos';

const dato = (parcial: Partial<Dato> = {}): Dato => ({
  id: 'd1',
  clase: 'publico',
  tipo: 'mensaje',
  bytes: 120,
  prioridad: 2,
  origen: 'n1',
  destino: 'n2',
  ...parcial,
});

const senal = (parcial: Partial<SenalMedida> = {}): SenalMedida => ({
  de: 'n1',
  a: 'n2',
  medio: 'wifi-lan',
  rttMs: 5,
  anchoBandaKbps: 50000,
  vistaEn: 1,
  ...parcial,
});

const ctxBase: ContextoViabilidad = {
  cuentaDe: (id) => (id === 'n1' || id === 'n2' ? 'cuenta-a' : 'cuenta-b'),
  cifradoE2E: true,
};

describe('viabilidad · vetos', () => {
  it("veta 'interno' si una punta no es de la cuenta del origen", () => {
    const v = viabilidad(dato({ clase: 'interno' }), senal({ a: 'n3' }), ctxBase);
    expect(v.apto).toBe(false);
    expect(v.valor).toBe(0);
    expect(v.motivo).toContain('misma cuenta');
  });

  it('veta privado sin cifrado E2E', () => {
    const v = viabilidad(dato({ clase: 'privado' }), senal(), { ...ctxBase, cifradoE2E: false });
    expect(v.apto).toBe(false);
    expect(v.motivo).toContain('cifrado');
  });

  it('veta interno por servidor sin cifrar', () => {
    const v = viabilidad(dato({ clase: 'interno' }), senal({ medio: 'servidor' }), {
      ...ctxBase,
      cifradoE2E: false,
    });
    expect(v.apto).toBe(false);
  });

  it('veta lora con una llamada', () => {
    const v = viabilidad(dato({ tipo: 'llamada' }), senal({ medio: 'lora' }), ctxBase);
    expect(v.apto).toBe(false);
    expect(v.motivo).toContain('llamada');
  });

  it('veta lora con más de 1600 bytes', () => {
    const v = viabilidad(dato({ bytes: 1601 }), senal({ medio: 'lora' }), ctxBase);
    expect(v.apto).toBe(false);
    expect(v.motivo).toContain('tramas');
  });

  it('veta nfc por encima de 32 KiB', () => {
    const v = viabilidad(dato({ bytes: 32769 }), senal({ medio: 'nfc' }), ctxBase);
    expect(v.apto).toBe(false);
    expect(v.motivo).toContain('32 KiB');
  });
});

describe('viabilidad · orden relativo', () => {
  it('un mensaje privado P0 de 120 B prefiere wifi-lan a servidor', () => {
    const d = dato({ clase: 'privado', prioridad: 0 });
    const wifi = viabilidad(d, senal({ medio: 'wifi-lan' }), ctxBase);
    const serv = viabilidad(d, senal({ medio: 'servidor', rttMs: 5, anchoBandaKbps: 50000 }), ctxBase);
    expect(wifi.apto).toBe(true);
    expect(serv.apto).toBe(true);
    expect(wifi.valor).toBeGreaterThan(serv.valor);
  });

  it('un archivo de 5 MB nunca va por lora y sí por wifi-lan', () => {
    const d = dato({ tipo: 'archivo', bytes: 5 * 1024 * 1024 });
    expect(viabilidad(d, senal({ medio: 'lora' }), ctxBase).apto).toBe(false);
    expect(viabilidad(d, senal({ medio: 'wifi-lan' }), ctxBase).apto).toBe(true);
  });

  it('P0 premia la latencia y P3 el ancho', () => {
    const rapidaEstrecha = senal({ rttMs: 2, anchoBandaKbps: 100 });
    const d0 = dato({ prioridad: 0 });
    const d3 = dato({ prioridad: 3 });
    const v0 = viabilidad(d0, rapidaEstrecha, ctxBase);
    const v3 = viabilidad(d3, rapidaEstrecha, ctxBase);
    expect(v0.valor).toBeGreaterThan(v3.valor);
  });

  it('batería baja penaliza wifi-lan frente a ble', () => {
    const ctx = { ...ctxBase, bateriaPct: 10 };
    const d = dato();
    const wifi = viabilidad(d, senal({ medio: 'wifi-lan' }), ctx);
    const wifiConCarga = viabilidad(d, senal({ medio: 'wifi-lan' }), ctxBase);
    expect(wifi.valor).toBeLessThan(wifiConCarga.valor);
  });
});
