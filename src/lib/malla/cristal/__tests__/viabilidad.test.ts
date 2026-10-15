import { describe, it, expect } from 'vitest';
import { viabilidad, Viabilidad } from '../viabilidad';
import { Dato, SenalMedida, Medio, ClaseDato, TipoDato, Prioridad } from '../tipos';

// Mock context
const createContext = (overrides: Partial<{
  cuentaDe: (neuronaId: string) => string | null;
  bateriaPct?: number | null;
  cifradoE2E: boolean;
}> = {}) => {
  const cuentaDe = (neuronaId: string) => {
    // Simple map: all neurons belong to cuenta 'cue1' unless specified
    if (neuronaId === 'n1') return 'cue1';
    if (neuronaId === 'n2') return 'cue1';
    if (neuronaId === 'n3') return 'cue2';
    return null;
  };
  return {
    cuentaDe,
    bateriaPct: null,
    cifradoE2E: false,
    ...overrides,
  };
};

describe('viabilidad', () => {
  const datoDefaults = {
    id: 'default-id',
    clase: 'interno',
    tipo: 'mensaje',
    bytes: 100,
    prioridad: 0,
    origen: 'n1',
    destino: 'n2',
  } as const;
  const senalDefaults = {
    de: 'n1',
    a: 'n2',
    medio: 'wifi-lan',
    rssiDbm: -50,
    snrDb: 20,
    rttMs: 50,
    anchoBandaKbps: 1000,
    perdidaPct: 0,
    vistaEn: 0,
    frecuenciaMhz: undefined,
    anchoCanalMhz: undefined,
  } as const;

  it('veto interno: punta no misma cuenta', () => {
    const dato = { ...datoDefaults, origen: 'n1', destino: 'n2' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n3', medio: 'wifi-lan' } as SenalMedida; // n3 is cue2
    const ctx = createContext();
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('interno');
  });

  it('veto privado sin cifradoE2E', () => {
    const dato = { ...datoDefaults, clase: 'privado', origen: 'n1', destino: 'n2' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: false });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('privado sin cifradoE2E');
  });

  it('veto interno sin cifradoE2E', () => {
    const dato = { ...datoDefaults, clase: 'interno', origen: 'n1', destino: 'n2' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: false });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('interno sin cifradoE2E');
  });

  it('veto lora bytes > 1600', () => {
    const dato = { ...datoDefaults, origen: 'n1', destino: 'n2', bytes: 2000 } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'lora' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: true });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('lora: bytes > 1600');
  });

  it('veto lora tipo llamada', () => {
    const dato = { ...datoDefaults, origen: 'n1', destino: 'n2', tipo: 'llamada' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'lora' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: true });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('lora: tipo llamada');
  });

  it('veto nfc bytes > 32768', () => {
    const dato = { ...datoDefaults, origen: 'n1', destino: 'n2', bytes: 40000 } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'nfc' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: true });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('nfc: bytes > 32768');
  });

  it('veto servidor para privado sin cifradoE2E', () => {
    const dato = { ...datoDefaults, clase: 'privado', origen: 'n1', destino: 'n2' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'servidor' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: false });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('servidor para privado/interno sin cifradoE2E');
  });

  it('veto servidor para interno sin cifradoE2E', () => {
    const dato = { ...datoDefaults, clase: 'interno', origen: 'n1', destino: 'n2' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'servidor' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: false });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.valor).toBe(0);
    expect(result.motivo).toContain('servidor para privado/interno sin cifradoE2E');
  });

  it('permite servidor para público sin cifradoE2E', () => {
    const dato = { ...datoDefaults, clase: 'publico', origen: 'n1', destino: 'n2' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'servidor' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: false });
    const result = viabilidad(dato, senal, ctx);
    // Should not be vetoed by the servidor rule because clase is publico
    // However, we need to check other vetoes: it's not interno/privado, so no veto for cifradoE2E.
    // We expect it to pass the vetoes and compute a valor.
    expect(result.apto).toBe(true); // Assuming signal is good enough
    expect(result.valor).toBeGreaterThan(0);
  });

  it('cálculo de valor básico', () => {
    const dato = { ...datoDefaults, origen: 'n1', destino: 'n2' } as Dato;
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan' } as SenalMedida;
    const ctx = createContext({ cifradoE2E: true, bateriaPct: 50 });
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(true);
    expect(result.valor).toBeGreaterThan(0);
    expect(result.valor).toBeLessThanOrEqual(1);
    expect(result.motivo).toContain('viable');
  });

  it('factor prioridad P0 afectado por latencia', () => {
    const datoP0 = { ...datoDefaults, origen: 'n1', destino: 'n2', prioridad: 0 };
    const datoP3 = { ...datoDefaults, origen: 'n1', destino: 'n2', prioridad: 3 };
    const senalBadLatency = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan', rttMs: 500 }; // high latency
    const senalGoodLatency = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan', rttMs: 50 }; // low latency
    const ctx = createContext({ cifradoE2E: true, bateriaPct: 50 });

    const resultP0Bad = viabilidad(datoP0, senalBadLatency, ctx);
    const resultP0Good = viabilidad(datoP0, senalGoodLatency, ctx);
    // For P0, low latency should yield higher valor
    expect(resultP0Good.valor).toBeGreaterThan(resultP0Bad.valor);

    const resultP3Bad = viabilidad(datoP3, senalBadLatency, ctx);
    const resultP3Good = viabilidad(datoP3, senalGoodLatency, ctx);
    // For P3, latency should have less impact (we also have bandwidth factor, but bandwidth same)
    // Actually our factor for P3 weighs bandwidth more, but bandwidth is same, so the difference might be small.
    // We'll just check that both are computed.
    expect(resultP3Bad.valor).toBeGreaterThan(0);
    expect(resultP3Good.valor).toBeGreaterThan(0);
  });

  it('factor prioridad P3 afectado por ancho de banda', () => {
    const datoP3 = { ...datoDefaults, origen: 'n1', destino: 'n2', prioridad: 3 };
    const senalLowBw = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan', anchoBandaKbps: 100 };
    const senalHighBw = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan', anchoBandaKbps: 10000 };
    const ctx = createContext({ cifradoE2E: true, bateriaPct: 50 });
 
    const resultP3Low = viabilidad(datoP3, senalLowBw, ctx);
    const resultP3High = viabilidad(datoP3, senalHighBw, ctx);
    expect(resultP3High.valor).toBeGreaterThan(resultP3Low.valor);
  });

  it('multiplicador servidor para no público', () => {
    const dato = { ...datoDefaults, clase: 'privado', origen: 'n1', destino: 'n2' };
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'servidor' };
    const ctx = createContext({ cifradoE2E: true, bateriaPct: 50 });
    const resultWithMultiplier = viabilidad(dato, senal, ctx);
    // Change medio to something else to see the effect
    const senalWs = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan' };
    const resultWs = viabilidad(dato, senalWs, ctx);
    // The servidor medio should apply 0.6 multiplier, so valor should be lower than wifi-lan (assuming same signal quality)
    // However, note that the signal quality might differ because we are using the same senalBase but changing medio.
    // The senalBase does not change with medio, so the calidadSenal is the same.
    // The factorPrioridad is the same because medio doesn't affect it.
    // The only difference is the servidor multiplier (0.6) and the bateria multiplier (not applicable).
    // So we expect resultWithMultiplier.valor = 0.6 * resultWs.valor
    // Let's compute the ratio.
    const ratio = resultWithMultiplier.valor / resultWs.valor;
    expect(ratio).toBeCloseTo(0.6, 0.1); // within 0.1
  });

  it('multiplicador bateria baja y alto consumo', () => {
    const dato = { ...datoDefaults, clase: 'publico', origen: 'n1', destino: 'n2' };
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan' };
    const ctxBaja = createContext({ cifradoE2E: true, bateriaPct: 10 }); // <20
    const ctxAlta = createContext({ cifradoE2E: true, bateriaPct: 50 }); // >=20
    const resultBaja = viabilidad(dato, senal, ctxBaja);
    const resultAlta = viabilidad(dato, senal, ctxAlta);
    // Expect bateria baja to apply 0.8 multiplier
    const ratio = resultBaja.valor / resultAlta.valor;
    expect(ratio).toBeCloseTo(0.8, 0.1);
  });

  it('valor no excede 1', () => {
    // Use excellent signal
    const dato = { ...datoDefaults, origen: 'n1', destino: 'n2', bytes: 100 };
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan', rssiDbm: -40, snrDb: 30, rttMs: 10, anchoBandaKbps: 50000, perdidaPct: 0 };
    const ctx = createContext({ cifradoE2E: true, bateriaPct: 80 });
    const result = viabilidad(dato, senal, ctx);
    expect(result.valor).toBeLessThanOrEqual(1);
  });

  it('valor no negativo', () => {
    // Use terrible signal
    const dato = { ...datoDefaults, origen: 'n1', destino: 'n2', bytes: 100 };
    const senal = { ...senalDefaults, de: 'n1', a: 'n2', medio: 'wifi-lan', rssiDbm: -200, snrDb: -10, rttMs: 5000, anchoBandaKbps: 0, perdidaPct: 100 };
    const ctx = createContext({ cifradoE2E: true, bateriaPct: 80 });
    const result = viabilidad(dato, senal, ctx);
    expect(result.valor).toBeGreaterThanOrEqual(0);
  });
});