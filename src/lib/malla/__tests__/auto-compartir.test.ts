import { describe, it, expect } from 'vitest';
import type { PuertaInternet } from '../cristal/puertas-internet';
import type { EstadoRedCompartida, PreferenciasRedCompartida } from '../auto-compartir';
import { sugerirComparticion } from '../auto-compartir';

const puerta = (extra: Partial<PuertaInternet> = {}): PuertaInternet => ({
  id: 'p1',
  neurona: 'n1',
  cuenta: 'c1',
  tipo: 'movil-4g',
  bajadaKbps: 20000,
  subidaKbps: 5000,
  latenciaMs: 40,
  medida: false,
  compartir: 'publico',
  ...extra,
});

const prefs = (extra: Partial<PreferenciasRedCompartida> = {}): PreferenciasRedCompartida => ({
  encendido: true,
  maximo: 'publico',
  soloWifi: false,
  kbpsSubidaMax: 10000,
  permitirMedidas: false,
  ...extra,
});

const estado = (extra: Partial<EstadoRedCompartida> = {}): EstadoRedCompartida => ({
  enWifi: true,
  cargando: true,
  bateriaPct: 80,
  medida: false,
  usoMb: 0,
  ...extra,
});

const decidir = (
  p: Partial<PuertaInternet>,
  pr: Partial<PreferenciasRedCompartida>,
  es: Partial<EstadoRedCompartida> = {}
) =>
  sugerirComparticion({
    puertas: [puerta(p)],
    preferencias: prefs(pr),
    estado: estado(es),
    ahora: 1_000,
  }).decisiones[0];

describe('sugerirComparticion', () => {  it('nunca ofrece si el interruptor del aparato está apagado', () => {
    expect(decidir({}, { encendido: false })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('mantiene apagada una puerta que ya estaba en nadie con el interruptor apagado', () => {
    expect(decidir({ compartir: 'nadie' }, { encendido: false })).toMatchObject({ accion: 'mantener', con: 'nadie' });
  });
  it('mantiene en nadie una puerta que el dueño no comparte', () => {
    expect(decidir({ compartir: 'nadie' }, {})).toMatchObject({ accion: 'mantener', con: 'nadie' });
  });
  it('retira la oferta en datos móviles cuando soloWifi está activo', () => {
    expect(decidir({}, { soloWifi: true }, { enWifi: false })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('ofrece en Wi-Fi cuando soloWifi está activo', () => {
    expect(decidir({}, { soloWifi: true }, { enWifi: true })).toMatchObject({ accion: 'ofrecer' });
  });
  it('retira con batería baja y sin cargar', () => {
    expect(decidir({}, {}, { bateriaPct: 20, cargando: false })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('ofrece con batería baja si el aparato está cargando', () => {
    expect(decidir({}, {}, { bateriaPct: 20, cargando: true })).toMatchObject({ accion: 'ofrecer' });
  });
  it('no bloquea si la batería es desconocida', () => {
    expect(decidir({}, {}, { bateriaPct: null })).toMatchObject({ accion: 'ofrecer' });
  });
  it('ofrece justo en la reserva del 30 %', () => {
    expect(decidir({}, {}, { bateriaPct: 30, cargando: false })).toMatchObject({ accion: 'ofrecer' });
  });
  it('baja al máximo del dueño si la puerta pide más nivel', () => {
    expect(decidir({ compartir: 'publico' }, { maximo: 'grupo' })).toMatchObject({ accion: 'ofrecer', con: 'grupo' });
  });
  it('conserva el nivel de la puerta cuando no supera el máximo', () => {
    expect(decidir({ compartir: 'vinculos' }, { maximo: 'grupo' })).toMatchObject({ accion: 'ofrecer', con: 'vinculos' });
  });
  it('retira si el máximo del dueño es nadie', () => {
    expect(decidir({ compartir: 'publico' }, { maximo: 'nadie' })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('retira una puerta medida sin permiso explícito', () => {
    expect(decidir({ medida: true }, { permitirMedidas: false })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('ofrece una puerta medida con permiso explícito', () => {
    expect(decidir({ medida: true }, { permitirMedidas: true })).toMatchObject({ accion: 'ofrecer' });
  });
  it('retira si la conexión medida agotó su tope de datos', () => {
    expect(decidir({}, { topeDatosMb: 500 }, { medida: true, usoMb: 500 })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('ofrece si la conexión medida aún tiene datos', () => {
    expect(decidir({}, { topeDatosMb: 500 }, { medida: true, usoMb: 120 })).toMatchObject({ accion: 'ofrecer' });
  });
  it('retira si la subida de la puerta supera el tope del dueño', () => {
    expect(decidir({ subidaKbps: 20000 }, { kbpsSubidaMax: 10000 })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('retira una puerta medida sin margen mensual para otros', () => {
    const p = { medida: true, topeMensualMb: 1000, usadoMesMb: 900, reservaDuenoPct: 20 };
    expect(decidir(p, { permitirMedidas: true })).toMatchObject({ accion: 'retirar', con: 'nadie' });
  });
  it('devuelve una decisión por puerta, cada una con su motivo', () => {
    const r = sugerirComparticion({
      puertas: [puerta({ id: 'a' }), puerta({ id: 'b', compartir: 'nadie' })],
      preferencias: prefs(),
      estado: estado(),
      ahora: 1_000,
    });
    expect(r.decisiones.map((d) => d.puertaId)).toEqual(['a', 'b']);
    expect(r.decisiones.every((d) => d.motivo.length > 0)).toBe(true);
  });
});
