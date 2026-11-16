// @vitest-environment jsdom
/**
 * Preferencias locales de compartir red por aparato (MRI2b): todo apagado por defecto,
 * saneado de basura, aviso al subir el nivel de apertura e ida y vuelta en localStorage.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CLAVE_PREFERENCIAS_RED,
  PREFERENCIAS_POR_DEFECTO,
  guardarPreferenciasRed,
  leerPreferenciasRed,
  nivelApertura,
  paraMotorRed,
  sanearPreferenciasRed,
  subeApertura,
  type PreferenciasRed,
} from '../preferencias-red-compartida';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* almacenamiento no disponible en este entorno */
  }
});

describe('PREFERENCIAS_POR_DEFECTO', () => {
  it('arranca con todo apagado', () => {
    expect(PREFERENCIAS_POR_DEFECTO).toEqual({
      encendido: false,
      maximoCon: 'nadie',
      soloWifi: true,
      kbpsSubidaMax: 1024,
      reservaBateriaPct: 30,
      automatico: false,
      compartirMedidas: false,
    });
  });

  it('sin nada guardado devuelve los valores por defecto', () => {
    expect(leerPreferenciasRed()).toEqual(PREFERENCIAS_POR_DEFECTO);
  });
});

describe('sanearPreferenciasRed', () => {
  it('cualquier forma rara vuelve al valor seguro', () => {
    for (const crudo of [null, undefined, 'texto', 42, [], true]) {
      expect(sanearPreferenciasRed(crudo)).toEqual(PREFERENCIAS_POR_DEFECTO);
    }
  });

  it('acota números y rechaza un maximoCon fuera de COMPARTIR', () => {
    expect(sanearPreferenciasRed({ kbpsSubidaMax: -5, reservaBateriaPct: 900, maximoCon: 'todos' }))
      .toMatchObject({ kbpsSubidaMax: 8, reservaBateriaPct: 100, maximoCon: 'nadie' });
    expect(sanearPreferenciasRed({ kbpsSubidaMax: 99_999_999, reservaBateriaPct: -3 }))
      .toMatchObject({ kbpsSubidaMax: 1_000_000, reservaBateriaPct: 0 });
  });

  it('respeta valores válidos y no inventa booleanos', () => {
    expect(
      sanearPreferenciasRed({
        encendido: true,
        maximoCon: 'vinculos',
        soloWifi: false,
        kbpsSubidaMax: 2048,
        reservaBateriaPct: 45,
        automatico: true,
        compartirMedidas: true,
      }),
    ).toEqual({
      encendido: true,
      maximoCon: 'vinculos',
      soloWifi: false,
      kbpsSubidaMax: 2048,
      reservaBateriaPct: 45,
      automatico: true,
      compartirMedidas: true,
    });
    expect(sanearPreferenciasRed({ encendido: 'sí', soloWifi: 'no' }))
      .toMatchObject({ encendido: false, soloWifi: true });
  });
});

describe('aviso al abrir la red', () => {
  it('subir de nadie a público avisa y guarda', () => {
    const abierto: PreferenciasRed = {
      ...PREFERENCIAS_POR_DEFECTO,
      encendido: true,
      maximoCon: 'publico',
    };
    expect(guardarPreferenciasRed(abierto)).toEqual({ aviso: true });
    expect(leerPreferenciasRed()).toEqual(abierto);
  });

  it('bajar el nivel no avisa', () => {
    guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, encendido: true, maximoCon: 'publico' });
    expect(
      guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, encendido: true, maximoCon: 'vinculos' }),
    ).toEqual({ aviso: false });
    expect(guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO })).toEqual({ aviso: false });
  });

  it('nivelApertura y subeApertura respetan el interruptor', () => {
    const apagado: PreferenciasRed = { ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'publico' };
    expect(nivelApertura(apagado)).toBe(0);
    expect(subeApertura(apagado, { ...apagado, encendido: true })).toBe(true);
    expect(subeApertura({ ...apagado, encendido: true }, apagado)).toBe(false);
  });
});

describe('ida y vuelta en localStorage', () => {
  it('guarda saneado y lee lo mismo', () => {
    const p: PreferenciasRed = {
      ...PREFERENCIAS_POR_DEFECTO,
      encendido: true,
      maximoCon: 'grupo',
      kbpsSubidaMax: 2048,
      reservaBateriaPct: 40,
    };
    expect(guardarPreferenciasRed(p)).toEqual({ aviso: true });
    expect(leerPreferenciasRed()).toEqual(p);
    expect(JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS_RED) ?? 'null')).toEqual(p);
  });

  it('JSON roto no rompe y devuelve el defecto', () => {
    localStorage.setItem(CLAVE_PREFERENCIAS_RED, '{roto');
    expect(leerPreferenciasRed()).toEqual(PREFERENCIAS_POR_DEFECTO);
  });

  it('un valor guardado fuera de rango se sanea al leer', () => {
    localStorage.setItem(
      CLAVE_PREFERENCIAS_RED,
      JSON.stringify({ maximoCon: 'inventado', kbpsSubidaMax: 1e12, reservaBateriaPct: 250 }),
    );
    expect(leerPreferenciasRed()).toEqual({
      ...PREFERENCIAS_POR_DEFECTO,
      kbpsSubidaMax: 1_000_000,
      reservaBateriaPct: 100,
    });
  });
});

describe('paraMotorRed', () => {
  it('traduce al contrato del motor y apaga el nivel si el interruptor está apagado', () => {
    expect(paraMotorRed(PREFERENCIAS_POR_DEFECTO)).toEqual({
      compartirMaximo: 'nadie',
      soloWifi: true,
      kbpsSubidaMax: 1024,
      permitirMedida: false,
      reservaBateriaMinPct: 30,
    });
    expect(
      paraMotorRed({ ...PREFERENCIAS_POR_DEFECTO, encendido: true, maximoCon: 'grupo', compartirMedidas: true }),
    ).toMatchObject({ compartirMaximo: 'grupo', permitirMedida: true, reservaBateriaMinPct: 30 });
  });
});
