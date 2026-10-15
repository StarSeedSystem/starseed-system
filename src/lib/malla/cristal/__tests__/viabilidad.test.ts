// Tests for viabilidad function
import { describe, it, expect } from 'vitest';
import { viabilidad } from '../viabilidad';
import { Dato, SenalMedida, Medio, ClaseDato, Prioridad } from '../tipos';

describe('viabilidad', () => {
  const ctx = {
    cuentaDe: (neuronaId: string) => {
      // Simulate: neurons 1 and 2 are in account 'acc1', neuron 3 in 'acc2'
      if (neuronaId === '1' || neuronaId === '2') return 'acc1';
      if (neuronaId === '3') return 'acc2';
      return null;
    },
    bateriaPct: null,
    cifradoE2E: false,
  };

  const baseDato: Dato = {
    id: 'd1',
    clase: 'publico', // change as needed
    tipo: 'mensaje',
    bytes: 100,
    prioridad: 0,
    origen: '1',
    destino: '2',
  };

  const baseSenal: SenalMedida = {
    de: '1',
    a: '2',
    medio: 'wifi-lan' as Medio,
    rssiDbm: -50,
    snrDb: 10,
    rttMs: 50,
    anchoBandaKbps: 1000,
    perdidaPct: 0,
    frecuenciaMhz: 2400,
    anchoCanalMhz: 20,
    vistaEn: 1000,
  };

  it('should return veto interno when dato is interno and endpoints are in different accounts', () => {
    const dato: Dato = { ...baseDato, clase: 'interno', origen: '1', destino: '3' };
    const result = viabilidad(dato, baseSenal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('interno');
    expect(result.valor).toBe(0);
  });

  it('should return veto interno when dato is interno and destino account is unknown', () => {
    const dato: Dato = { ...baseDato, clase: 'interno', origen: '1', destino: '999' };
    const result = viabilidad(dato, baseSenal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('interno');
    expect(result.valor).toBe(0);
  });

  it('should return veto privado when dato is privado and no cifradoE2E', () => {
    const dato: Dato = { ...baseDato, clase: 'privado' };
    const result = viabilidad(dato, baseSenal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('privado');
    expect(result.valor).toBe(0);
  });

  it('should return veto interno when dato is interno and no cifradoE2E', () => {
    const dato: Dato = { ...baseDato, clase: 'interno' };
    const result = viabilidad(dato, baseSenal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('interno');
    expect(result.valor).toBe(0);
  });

  it('should not apply veto privado/interno when cifradoE2E is true', () => {
    const dato: Dato = { ...baseDato, clase: 'privado' };
    const ctxWithCifrado = { ...ctx, cifradoE2E: true };
    const result = viabilidad(dato, baseSenal, ctxWithCifrado);
    // Should not be vetoed by privado/interno without cifrado
    expect(result.motivo).not.toBe('privado');
    expect(result.motivo).not.toBe('interno');
  });

  it('should return veto lora when bytes > 1600', () => {
    const dato: Dato = { ...baseDato, bytes: 2000 };
    const senal: SenalMedida = { ...baseSenal, medio: 'lora' as Medio };
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('lora');
    expect(result.valor).toBe(0);
  });

  it('should return veto lora when tipo is llamada', () => {
    const dato: Dato = { ...baseDato, tipo: 'llamada' };
    const senal: SenalMedida = { ...baseSenal, medio: 'lora' as Medio };
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('lora');
    expect(result.valor).toBe(0);
  });

  it('should return veto nfc when bytes > 32768', () => {
    const dato: Dato = { ...baseDato, bytes: 40000 };
    const senal: SenalMedida = { ...baseSenal, medio: 'nfc' as Medio };
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('nfc');
    expect(result.valor).toBe(0);
  });

  it('should return veto servidor when dato is privado/interno, medio servidor, and no cifradoE2E', () => {
    const dato: Dato = { ...baseDato, clase: 'privado' };
    const senal: SenalMedida = { ...baseSenal, medio: 'servidor' as Medio };
    const result = viabilidad(dato, senal, ctx);
    expect(result.apto).toBe(false);
    expect(result.motivo).toBe('servidor');
    expect(result.valor).toBe(0);
  });

  it('should return viable when all conditions are met', () => {
    const dato: Dato = { ...baseDato, clase: 'publico' };
    const senal: SenalMedida = { ...baseSenal };
    const ctxWithCifrado = { ...ctx, cifradoE2E: true };
    const result = viabilidad(dato, senal, ctxWithCifrado);
    expect(result.apto).toBe(true);
    expect(result.motivo).toBe('viable');
    expect(result.valor).toBeGreaterThan(0);
    expect(result.valor).toBeLessThanOrEqual(1);
  });

  it('should apply servidor factor 0.6 when medio is servidor and clase is not publico', () => {
    const dato: Dato = { ...baseDato, clase: 'privado' };
    const senal: SenalMedida = { ...baseSenal, medio: 'servidor' as Medio };
    const ctxWithCifrado = { ...ctx, cifradoE2E: true };
    const resultWithoutFactor = viabilidad({
      ...dato,
      clase: 'publico', // to avoid the 0.6 factor
    }, senal, ctxWithCifrado);
    const resultWithFactor = viabilidad(dato, senal, ctxWithCifrado);
    // The value with factor should be 0.6 times the value without factor (approximately)
    expect(resultWithFactor.valor).toBeCloseTo(resultWithoutFactor.valor * 0.6);
  });

  it('should apply bateria factor 0.8 when bateria < 20 and medio is wifi-lan or webrtc', () => {
    const dato: Dato = { ...baseDato };
    const senalWifi: SenalMedida = { ...baseSenal, medio: 'wifi-lan' as Medio };
    const senalWebrtc: SenalMedida = { ...baseSenal, medio: 'webrtc' as Medio };
    const ctxLowBattery = { ...ctx, bateriaPct: 10 };
    const ctxHighBattery = { ...ctx, bateriaPct: 50 };

    const resultWifiLow = viabilidad(dato, senalWifi, ctxLowBattery);
    const resultWifiHigh = viabilidad(dato, senalWifi, ctxHighBattery);
    expect(resultWifiLow.valor).toBeCloseTo(resultWifiHigh.valor * 0.8);

    const resultWebrtcLow = viabilidad(dato, senalWebrtc, ctxLowBattery);
    const resultWebrtcHigh = viabilidad(dato, senalWebrtc, ctxHighBattery);
    expect(resultWebrtcLow.valor).toBeCloseTo(resultWebrtcHigh.valor * 0.8);
  });

  it('should not apply bateria factor when bateria >= 20 or medio is not high consumption', () => {
    const dato: Dato = { ...baseDato };
    const senalLora: SenalMedida = { ...baseSenal, medio: 'lora' as Medio };
    const ctxLowBattery = { ...ctx, bateriaPct: 10 };
    const ctxHighBattery = { ...ctx, bateriaPct: 50 };

    const resultLoraLow = viabilidad(dato, senalLora, ctxLowBattery);
    const resultLoraHigh = viabilidad(dato, senalLora, ctxHighBattery);
    // Should be the same because medio is not wifi-lan or webrtc
    expect(resultLoraLow.valor).toBeCloseTo(resultLoraHigh.valor);
  });
});
