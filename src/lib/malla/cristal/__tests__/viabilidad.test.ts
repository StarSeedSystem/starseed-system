import { viabilidad } from '../';

type Dato = {
  origen?: string;
  clase?: string;
  bytes?: number;
  prioridad?: number;
};

type Senal = {
  de?: string;
  a?: string;
  medio?: string;
  rssiDbm?: number;
  snrDb?: number;
  rttMs?: number;
  anchoBandaKbps?: number;
  perdidaPct?: number;
};

type Ctx = {
  cuentaDeFn: (id: string) => string | null;
  cifradoE2E: boolean;
  bateriaPct?: number;
};

function makeDato(overrides: Partial<Dato> = {}): Dato {
  return {
    origen: 'neurona1',
    clase: 'publico',
    bytes: 0,
    prioridad: 1,
    ...overrides,
  };
}

function makeSenalMedida(overrides: Partial<Senal> = {}): Senal {
  return {
    de: 'neurona1',
    a: 'neurona2',
    medio: 'wifi-lan',
    rssiDbm: -50,
    snrDb: 10,
    rttMs: 50,
    anchoBandaKbps: 1000,
    perdidaPct: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<Ctx> = {}): Ctx {
  return {
    cuentaDeFn: () => null,
    cifradoE2E: true,
    bateriaPct: 100,
    ...overrides,
  };
}

describe('viabilidad', () => {
  test('veto interno: punta de distinta cuenta', () => {
    const dato = makeDato({ origen: 'neurona1' });
    const senal = makeSenalMedida({ de: 'neurona1', a: 'neurona3' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('interno');
  });

  test('veto interno: ambas puntas de distinta cuenta', () => {
    const dato = makeDato({ origen: 'neurona1' });
    const senal = makeSenalMedida({ de: 'neurona2', a: 'neurona3' });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('interno');
  });

  test('veto interno: origen cuenta desconocida (no veto)', () => {
    const dato = makeDato({ origen: 'neurona1' });
    const senal = makeSenalMedida({ de: 'neurona2', a: 'neurona3' });
    const ctx = makeCtx({
      cuentaDeFn: () => null,
      cifradoE2E: true,
    });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(true);
  });

  test('veto privado sin cifradoE2E', () => {
    const dato = makeDato({ clase: 'privado' });
    const senal = makeSenalMedida();
    const ctx = makeCtx({ cifradoE2E: false });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('privado requiere cifradoE2E');
  });

  test('veto interno sin cifradoE2E', () => {
    const dato = makeDato({ clase: 'interno' });
    const senal = makeSenalMedida();
    const ctx = makeCtx({ cifradoE2E: false });
    const res = viabilidad(dato, senal, ctx);
    expect(res.apto).toBe(false);
    expect(res.valor).toBe(0);
    expect(res.motivo).toBe('interno requiere cifradoE2E');
  });

  test('veto lora: bytes > 1600', () => {
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

  test('veto lora: tipo llamada', () => {
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

  test('veto nfc: bytes > 32768', () => {
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

  test('veto servidor: medio servidor para privado sin cifradoE2E', () => {
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

  test('veto servidor: medio servidor para interno sin cifradoE2E', () => {
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

  test('valor básico', () => {
    const dato = makeDato({ prioridad: 0, origen: 'neurona1' });
    const senal = makeSenalMedida({
      rssiDbm: -50,
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

  test('factor servidor: reduce valor cuando medio es servidor y clase no publico', () => {
    const datoPublico = makeDato({ clase: 'publico' });
    const datoPrivado = makeDato({ clase: 'privado' });
    const senal = makeSenalMedida({ medio: 'servidor' });
    const ctx = makeCtx({ cifradoE2E: true });
    const resPublico = viabilidad(datoPublico, senal, ctx);
    const resPrivado = viabilidad(datoPrivado, senal, ctx);
    expect(resPrivado.valor).toBeCloseTo(resPublico.valor * 0.6, 2);
  });

  test('factor batería: reduce valor cuando batería < 20 y medio alto consumo', () => {
    const dato = makeDato();
    const senalWifi = makeSenalMedida({ medio: 'wifi-lan' });
    const senalBle = makeSenalMedida({ medio: 'ble' });
    const ctxBaja = makeCtx({ bateriaPct: 10 });
    const ctxNormal = makeCtx({ bateriaPct: 50 });
    const resWifiBaja = viabilidad(dato, senalWifi, ctxBaja);
    const resWifiNormal = viabilidad(dato, senalWifi, ctxNormal);
    const resBleBaja = viabilidad(dato, senalBle, ctxBaja);
    expect(resWifiBaja.valor).toBeCloseTo(resWifiNormal.valor * 0.8, 2);
    expect(resBleBaja.valor).toBeCloseTo(resWifiNormal.valor, 2);
  });

  test('orden relativo: mensaje privado P0 de 120 B prefiere wifi-lan a servidor', () => {
    const dato = makeDato({
      clase: 'privado',
      bytes: 120,
      prioridad: 0,
      origen: 'neurona1',
    });
    const senalWifi = makeSenalMedida({
      medio: 'wifi-lan',
      de: 'neurona1',
      a: 'neurona2',
      rttMs: 30,
      anchoBandaKbps: 10000,
    });
    const senalServidor = makeSenalMedida({
      medio: 'servidor',
      de: 'neurona1',
      a: 'neurona2',
      rttMs: 100,
      anchoBandaKbps: 5000,
    });
    const ctx = makeCtx({
      cuentaDeFn: (id) => (id === 'neurona1' || id === 'neurona2' ? 'cuentaA' : null),
      cifradoE2E: true,
    });
    const resWifi = viabilidad(dato, senalWifi, ctx);
    const resServidor = viabilidad(dato, senalServidor, ctx);
    expect(resWifi.valor).toBeGreaterThan(resServidor.valor);
  });

  test('orden relativo: 5 MB nunca va por lora (por veto de bytes)', () => {
    const dato = makeDato({ bytes: 5 * 1024 * 1024, origen: 'neurona1' });
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
