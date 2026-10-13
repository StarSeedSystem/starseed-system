import { describe, it, expect } from 'vitest';
import { viabilidad, calidadSenal } from '../viabilidad';
import type { Dato, SenalMedida } from '../tipos';

const datoBase = (o: Partial<Dato> = {}): Dato => ({
  id: '1', clase: 'privado', tipo: 'mensaje', bytes: 100, prioridad: 0,
  origen: 'c1:n1', destino: null, ...o
});

const senalBase = (o: Partial<SenalMedida> = {}): SenalMedida => ({
  de: 'c1:n1', a: 'c2:n2', medio: 'wifi-lan', rssiDbm: -50, snrDb: 10,
  rttMs: 50, anchoBandaKbps: 10000, perdidaPct: 0, frecuenciaMhz: 2400,
  anchoCanalMhz: 20, vistaEn: 1, ...o
});

const ctxBase = {
  cuentaDe: (id: string) => (id.startsWith('c1:') ? 'c1' : id.startsWith('c2:') ? 'c2' : null),
  bateriaPct: 50, cifradoE2E: true
};

describe('viabilidad', () => {
  describe('vetos', () => {
    const vetoCases: Array<{
      dato: Partial<Dato>;
      senal: Partial<SenalMedida>;
      ctx: Partial<typeof ctxBase>;
      expected: { apto: false; valor: 0; motivo: string };
    }> = [
      { dato: { clase: 'interno' }, senal: { de: 'c2:n1' }, ctx: {}, expected: { apto: false, valor: 0, motivo: 'interno' } },
      { dato: { clase: 'interno' }, senal: { a: 'c2:n1' }, ctx: {}, expected: { apto: false, valor: 0, motivo: 'interno' } },
      { dato: { clase: 'privado' }, senal: {}, ctx: { cifradoE2E: false }, expected: { apto: false, valor: 0, motivo: 'privado' } },
      { dato: { clase: 'interno' }, senal: {}, ctx: { cifradoE2E: false }, expected: { apto: false, valor: 0, motivo: 'interno' } },
      { dato: { bytes: 2000 }, senal: { medio: 'lora' }, ctx: {}, expected: { apto: false, valor: 0, motivo: 'lora' } },
      { dato: { tipo: 'llamada' }, senal: { medio: 'lora' }, ctx: {}, expected: { apto: false, valor: 0, motivo: 'lora' } },
      { dato: { bytes: 40000 }, senal: { medio: 'nfc' }, ctx: {}, expected: { apto: false, valor: 0, motivo: 'nfc' } },
      { dato: { clase: 'privado' }, senal: { medio: 'servidor', de: 'c1:n1', a: 'c1:n2' }, ctx: { cifradoE2E: false }, expected: { apto: false, valor: 0, motivo: 'servidor' } },
      { dato: { clase: 'interno' }, senal: { medio: 'servidor', de: 'c1:n1', a: 'c1:n2' }, ctx: { cifradoE2E: false }, expected: { apto: false, valor: 0, motivo: 'servidor' } }
    ];

    vetoCases.forEach(({ dato, senal, ctx, expected }, i) => {
      it(`veto ${i}`, () => {
        const r = viabilidad(
          datoBase(dato),
          senalBase(senal),
          { ...ctxBase, ...ctx }
        );
        expect(r.apto).toBe(false);
        expect(r.valor).toBe(0);
        expect(r.motivo).toBe(expected.motivo);
      });
    });
  });

  describe('cálculo', () => {
    it('rango 0-1 cuando viable', () => {
      const r = viabilidad(datoBase(), senalBase(), ctxBase);
      expect(r.apto).toBe(true);
      expect(r.valor).toBeGreaterThanOrEqual(0);
      expect(r.valor).toBeLessThanOrEqual(1);
      expect(r.motivo).toBe('viable');
    });
    it('factor servidor 0.6', () => {
      const dato = datoBase({ clase: 'privado' });
      const senal = senalBase({ medio: 'servidor', rssiDbm: -40, snrDb: 15, rttMs: 0, anchoBandaKbps: 200000, perdidaPct: 0, de: 'c1:n1', a: 'c1:n2', vistaEn: 1 });
      const calidad = calidadSenal(senal);
      const r = viabilidad(dato, senal, { ...ctxBase, bateriaPct: 50 });
      expect(r.valor).toBeCloseTo(calidad * 0.6);
    });
    it('factor batería 0.8', () => {
      const dato = datoBase({ clase: 'publico' });
      const senal = senalBase({ medio: 'wifi-lan', rssiDbm: -40, snrDb: 15, rttMs: 0, anchoBandaKbps: 100000, perdidaPct: 0, de: 'c1:n1', a: 'c2:n2', vistaEn: 1 });
      const calidad = calidadSenal(senal);
      const r = viabilidad(dato, senal, { ...ctxBase, bateriaPct: 10 });
      expect(r.valor).toBeCloseTo(calidad * 0.8);
    });
    it('factor prioridad neutro', () => {
      const senal = senalBase();
      const r0 = viabilidad(datoBase({ prioridad: 0 }), senal, ctxBase);
      const r3 = viabilidad(datoBase({ prioridad: 3 }), senal, ctxBase);
      expect(r0.valor).toBeCloseTo(r3.valor);
    });
  });

  describe('orden relativo', () => {
    it('privado P0 120B prefiere wifi-lan a servidor', () => {
      const dato = datoBase({ clase: 'privado', tipo: 'mensaje', bytes: 120, prioridad: 0 });
      const w = viabilidad(dato, senalBase({ medio: 'wifi-lan' }), ctxBase);
      const s = viabilidad(dato, senalBase({ medio: 'servidor' }), ctxBase);
      expect(w.valor).toBeGreaterThan(s.valor);
    });
    it('5 MB nunca por lora', () => {
      const dato = datoBase({ clase: 'publico', tipo: 'archivo', bytes: 5 * 1024 * 1024, prioridad: 0 });
      const r = viabilidad(dato, senalBase({ medio: 'lora' }), ctxBase);
      expect(r.apto).toBe(false);
      expect(r.valor).toBe(0);
      expect(r.motivo).toBe('lora');
    });
  });
});