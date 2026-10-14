import { describe, it, expect } from 'vitest';
import { viabilidad } from '../viabilidad';

// Helper functions to create test data
function makeDato(overrides: Partial<{
  clase: 'interno' | 'privado' | 'publico';
  tipo: 'mensaje' | 'llamada' | 'archivo' | 'publicacion' | 'sincronia' | 'conciencia';
  bytes: number;
  prioridad: 0 | 1 | 2 | 3;
  origen: string;
  destino: string | null;
  id: string;
}> = {}): any {
  return {
    clase: 'privado',
    tipo: 'mensaje',
    bytes: 100,
    prioridad: 2,
    origen: 'neurona1',
    destino: null,
    id: 'dato1',
    ...overrides,
  };
}

function makeSenalMedida(overrides: Partial<{
  de: string;
  a: string;
  medio: 'lora' | 'ble' | 'wifi-lan' | 'webrtc' | 'wifi-mesh' | 'reticulum' | 'serie' | 'servidor' | 'nfc';
  rssiDbm?: number;
  snrDb?: number;
  rttMs?: number;
  anchoBandaKbps?: number;
  perdidaPct?: number;
  frecuenciaMhz?: number;
  anchoCanalMhz?: number;
  vistaEn: number;
}> = {}): any {
  return {
    de: 'neurona1',
    a: 'neurona2',
    medio: 'wifi-lan',
    rssiDbm: -50,
    snrDb: 10,
    rttMs: 50,
    anchoBandaKbps: 1000,
    perdidaPct: 0,
    vistaEn: 1,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<{
  cuentaDeFn: (id: string) => string | null;
  cifradoE2E: boolean;
  bateriaPct?: number;
}> = {}): any {
  return {
    cuentaDeFn: () => null,
    cifradoE2E: true,
    bateriaPct: 50,
    ...overrides,
  };
}

// Test cases from the cloud branch
describe('viabilidad', () => {
  it('veto interno: punta de distinta cuenta', () => {
    const dato = makeDato({ origen: 'neurona1' }); // origen cuentaA
    const senal = makeSenalMedida({ de: 'neurona1', a: 'neurona3' }); // neurona3 cuenta? null (distinta)
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('interno');
  });

  it('veto interno: ambas puntas de distinta cuenta', () => {
    const dato = makeDato({ origen: 'neurona1' });
    const senal = makeSenalMedida({ de: 'neurona2', a: 'neurona3' }); // ambas cuenta null
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('interno');
  });

  it('veto interno: origen cuenta desconocida (no veto)', () => {
    const dato = makeDato({ origen: 'neurona1' });
    const senal = makeSenalMedida({ de: 'neurona2', a: 'neurona3' });
    const ctx = makeCtx({
      cuentaDeFn: () => null, // no conocemos ninguna cuenta
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    // No debería ser veto interno porque no sabemos la cuenta del origen
    expect(res.apto).toBe(true);
  });

  it('veto privado sin cifradoE2E', () => {
    const dato = makeDato({ clase: 'privado' });
    const senal = makeSenalMedida();
    const ctx = makeCtx({ cifradoE2E: false });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('privado requiere cifradoE2E');
  });

  it('veto interno sin cifradoE2E', () => {
    const dato = makeDato({ clase: 'interno' });
    const senal = makeSenalMedida();
    const ctx = makeCtx({ cifradoE2E: false });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('interno requiere cifradoE2E');
  });

  it('veto lora: bytes > 1600', () => {
    const dato = makeDato({ bytes: 2000, origen: 'neurona1' });
    const senal = makeSenalMedida({ medio: 'lora', de: 'neurona1', a: 'neurona2' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('lora');
  });

  it('veto lora: tipo llamada', () => {
    const dato = makeDato({ tipo: 'llamada', origen: 'neurona1' });
    const senal = makeSenalMedida({ medio: 'lora', de: 'neurona1', a: 'neurona2' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('lora');
  });

  it('veto nfc: bytes > 32768', () => {
    const dato = makeDato({ bytes: 40000, origen: 'neurona1' });
    const senal = makeSenalMedida({ medio: 'nfc', de: 'neurona1', a: 'neurona2' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('nfc');
  });

  it('veto servidor: medio servidor para privado sin cifradoE2E', () => {
    const dato = makeDato({ clase: 'privado', origen: 'neurona1' });
    const senal = makeSenalMedida({ medio: 'servidor', de: 'neurona1', a: 'neurona2' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: false,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('servidor');
  });

  it('veto servidor: medio servidor para interno sin cifradoE2E', () => {
    const dato = makeDato({ clase: 'interno', origen: 'neurona1' });
    const senal = makeSenalMedida({ medio: 'servidor', de: 'neurona1', a: 'neurona2' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: false,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('servidor');
  });

  it('valor básico', () => {
    const dato = makeDato({ prioridad: 0, origen: 'neurona1' });
    const senal = makeSenalMedida({
      rssiDbm: -50, // buen rssi
      snrDb: 10,
      rttMs: 50,
      anchoBandaKbps: 1000,
      perdidaPct: 0,
      de: 'neurona1',
      a: 'neurona2',
    });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(true);
    expect(res.valor).toBeGreaterThan(0);
    expect(res.valor).toBeLessThanOrEqual(1);
    expect(res.motivo).toBe('viable');
  });

  it('factor servidor: reduce valor cuando medio es servidor y clase no publico', () => {
    const datoPublico = makeDato({ clase: 'publico' });
    const datoPrivado = makeDato({ clase: 'privado' });
    const senal = makeSenalMedida({ medio: 'servidor' });
    const ctx = makeCtx({ cifradoE2E: true });
    const resPublico = viabilidad(datoPublico, senal, ctx);
    const resPrivado = viabilidad(datoPrivado, senal, ctx);
    // El factor servidor es 0.6 para privado, 1.0 para publico
    expect(resPrivado.valor).toBeCloseTo(resPublico.valor * 0.6, 2);
  });

  it('factor batería: reduce valor cuando batería < 20 y medio alto consumo', () => {
    const dato = makeDato();
    const senalWifi = makeSenalMedida({ medio: 'wifi-lan' });
    const senalBle = makeSenalMedida({ medio: 'ble' }); // no alto consumo
    const ctxBaja = makeCtx({ bateriaPct: 10 });
    const ctxNormal = makeCtx({ bateriaPct: 50 });
    const resWifiBaja = viabilidad(dato, senalWifi, ctxBaja);
    const resWifiNormal = viabilidad(dato, senalWifi, ctxNormal);
    const resBleBaja = viabilidad(dato, senalBle, ctxBaja);
    // Factor batería 0.8 solo para wifi-lan y webrtc con batería <20
    expect(resWifiBaja.valor).toBeCloseTo(resWifiNormal.valor * 0.8, 2);
    // Ble no debería verse afectado
    expect(resBleBaja.valor).toBeCloseTo(resWifiNormal.valor, 2); // porque ble no es alto consumo
  });

  it('orden relativo: mensaje privado P0 de 120 B prefiere wifi-lan a servidor', () => {
    const dato = makeDato({
      clase: 'privado',
      bytes: 120,
      prioridad: 0, // P0 premia latencia
      origen: 'neurona1',
    });
    // Señal wifi-lan: baja latencia, buen ancho
    const senalWifi = makeSenalMedida({
      medio: 'wifi-lan',
      de: 'neurona1',
      a: 'neurona2',
      rttMs: 30, // baja latencia
      anchoBandaKbps: 10000,
    });
    // Señal servidor: mayor latencia (simulado)
    const senalServidor = makeSenalMedida({
      medio: 'servidor',
      de: 'neurona1',
      a: 'neurona2',
      rttMs: 100, // mayor latencia
      anchoBandaKbps: 5000,
    });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const resWifi = viabilidad(dato, senalWifi, ctx);
    const resServidor = viabilidad(dato, senalServidor, ctx);
    // P0: premia latencia, así que wifi debería tener mayor valor que servidor
    expect(resWifi.valor).toBeGreaterThan(resServidor.valor);
  });

  it('orden relativo: 5 MB nunca va por lora (por veto de bytes)', () => {
    const dato = makeDato({ bytes: 5 * 1024 * 1024, origen: 'neurona1' }); // 5 MB
    const senalLora = makeSenalMedida({ medio: 'lora', de: 'neurona1', a: 'neurona2' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senalLora, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('lora');
  });
});