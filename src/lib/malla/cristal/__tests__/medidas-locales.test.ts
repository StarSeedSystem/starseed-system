// Pruebas de medidas-locales: entradas medidas → SenalMedida[] (módulo puro).
import { describe, it, expect } from 'vitest';
import {
  FRESCURA_MS,
  senalesDeNodosMesh,
  senalesDeRutasWebRTC,
  senalesDeVecinosFaro,
  senalesDeEnlacesLocales,
} from '../medidas-locales';

const AHORA = 1_800_000_000_000;

describe('senalesDeNodosMesh', () => {
  it('convierte nodos con medidas a señales lora', () => {
    const s = senalesDeNodosMesh('yo', [
      { id: '!a4c1', snr: 8.5, rssi: -95, lastHeard: AHORA - 1000 },
    ], AHORA);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ de: 'yo', a: '!a4c1', medio: 'lora', snrDb: 8.5, rssiDbm: -95, vistaEn: AHORA - 1000 });
  });

  it('omite campos no medidos y usa ahora sin lastHeard', () => {
    const s = senalesDeNodosMesh('yo', [{ id: 'x' }], AHORA);
    expect(s[0]).toMatchObject({ medio: 'lora', vistaEn: AHORA });
    expect('snrDb' in s[0]).toBe(false);
    expect('rssiDbm' in s[0]).toBe(false);
  });

  it('ignora sin id y más viejos de 5 min', () => {
    const s = senalesDeNodosMesh('yo', [
      { snr: 1 },
      { id: 'viejo', lastHeard: AHORA - FRESCURA_MS - 1 },
      { id: 'fresco', lastHeard: AHORA - FRESCURA_MS },
    ], AHORA);
    expect(s.map(x => x.a)).toEqual(['fresco']);
  });
});

describe('senalesDeRutasWebRTC', () => {
  it("misma-lan da 'wifi-lan'; el resto 'webrtc'", () => {
    const s = senalesDeRutasWebRTC('yo', [
      { par: 'ana', clase: 'misma-lan', rttMs: 3, kbps: 5000 },
      { par: 'beto', clase: 'internet-directo', rttMs: 40 },
      { par: 'carla', clase: 'turn' },
    ], AHORA);
    expect(s.map(x => x.medio)).toEqual(['wifi-lan', 'webrtc', 'webrtc']);
    expect(s[0]).toMatchObject({ rttMs: 3, anchoBandaKbps: 5000, vistaEn: AHORA });
    expect('anchoBandaKbps' in s[1]).toBe(false);
  });

  it('ignora rutas sin par', () => {
    expect(senalesDeRutasWebRTC('yo', [{ clase: 'turn' }], AHORA)).toEqual([]);
  });
});

describe('senalesDeVecinosFaro', () => {
  it("todo vecino fresco es 'wifi-lan' con su visto_ms", () => {
    const s = senalesDeVecinosFaro('yo', [
      { neurona: 'neu-2', visto_ms: AHORA - 2000, rssi: -60 },
      { neurona: 'neu-3', visto_ms: AHORA },
    ], AHORA);
    expect(s.map(x => x.medio)).toEqual(['wifi-lan', 'wifi-lan']);
    expect(s[0]).toMatchObject({ de: 'yo', a: 'neu-2', rssiDbm: -60, vistaEn: AHORA - 2000 });
    expect('rssiDbm' in s[1]).toBe(false);
  });

  it('ignora sin neurona o caducados', () => {
    const s = senalesDeVecinosFaro('yo', [
      { neurona: null, visto_ms: AHORA },
      { neurona: '', visto_ms: AHORA },
      { neurona: 'viejo', visto_ms: AHORA - FRESCURA_MS - 1 },
    ], AHORA);
    expect(s).toEqual([]);
  });
});

describe('senalesDeEnlacesLocales', () => {
  it("'ble' si el tipo es ble; si no 'webrtc'", () => {
    const s = senalesDeEnlacesLocales('yo', [
      { id: 'local:1', tipo: 'ble' },
      { par: 'otra-id', tipo: 'webrtc', rttMs: 8 },
      { id: 'local:3' },
    ], AHORA);
    expect(s.map(x => x.medio)).toEqual(['ble', 'webrtc', 'webrtc']);
    expect(s[1]).toMatchObject({ a: 'otra-id', rttMs: 8, vistaEn: AHORA });
  });

  it('prefiere par sobre id y descarta sin ambos', () => {
    const s = senalesDeEnlacesLocales('yo', [
      { id: 'local:x', par: 'pepe' },
      { tipo: 'ble' },
    ], AHORA);
    expect(s.map(x => x.a)).toEqual(['pepe']);
  });
});
