import { describe, it, expect } from 'vitest';
import * as portatil from '../portatil';
import { ModeloRouter, EntradaTabla } from './compatibilidad-openwrt';

describe('portatil', () => {
  describe('coordinacionPortatil', () => {
    const base = { id: '1', tipo: 'viaje-openwrt', bateriaPct: null, cargando: false };
    it.each([
      [{ cargando: true }, 6],
      [{ bateriaPct: null }, 6],
      [{ bateriaPct: 50 }, 6],
      [{ bateriaPct: 20 }, 4],
      [{ bateriaPct: 19 }, 3],
    ])('coordinacion', (i, e) => expect(portatil.coordinacionPortatil({ ...base, ...i })).toBe(e));
  });

  describe('factorAmortiguacion', () => {
    const r = { id: '1', tipo: 'viaje-openwrt', bateriaPct: 50, cargando: false, moviendose: false };
    it.each([
      [{ v: 1, m: false }, 0],
      [{ v: 0, m: false }, 0.6],
      [{ v: 0, m: true }, 0.3],
      [{ v: 1, m: true }, 0],
      [{ v: -0.5, m: false }, 0.6],
      [{ v: 1.5, m: false }, 0],
    ])('factor', (i, e) => expect(portatil.factorAmortiguacion({ ...r, moviendose: i.m }, i.v)).toBeCloseTo(e));
  });

  describe('compatibilidadPortatil', () => {
    const tabla = [{ fabricante: 't', modelo: 'm', target: 'r/m', perfil: 'p', soportado: true }];
    const mOpen = { fabricante: 't', modelo: 'm', tipo: 'viaje-openwrt' };
    const mMifi = { fabricante: 't', modelo: 'm', tipo: 'mifi-operador' };
    const mOtro = { fabricante: 't', modelo: 'm', tipo: 'viaje-otro' };

    it('openwrt', () => {
      const r = portatil.compatibilidadPortatil(mOpen, tabla);
      expect(r.estado).toBe('soportado-sin-flashear');
      expect(r.enlace).toBeNull();
      expect(r.pasos).toEqual([
        'activar SSH en su panel',
        'copiar el guion de la malla',
        'adoptar desde StarSeed',
      ]);
      expect(r.aviso).toBe('No hace falta flashear: ya trae un sistema basado en OpenWrt.');
    });

    it('mifi not supported', () => {
      const r = portatil.compatibilidadPortatil(mMifi, []);
      expect(r.estado).toBe('bloqueado-operador');
      expect(r.enlace).toBeNull();
      expect(r.pasos).toEqual([
        'No consta en la tabla de hardware: confirma el modelo exacto y su versión (viene en la pegatina de debajo del router)',
        'Busca el modelo en la tabla de hardware de OpenWrt antes de descargar nada',
        'este MiFi no se formatea, pero su internet entra en la malla a través de un titanio compatible, por Wi‑Fi (modo cliente) o por USB',
      ]);
    });

    it('mifi supported', () => {
      const r = portatil.compatibilidadPortatil(mMifi, tabla);
      expect(r.estado).toBe('soportado');
      expect(r.enlace).toBe('https://firmware-selector.openwrt.org/?target=r%2Fm&id=p');
    });

    it('otro', () => {
      const r = portatil.compatibilidadPortatil(mOtro, tabla);
      expect(r.estado).toBe('soportado');
      expect(r.enlace).toBe('https://firmware-selector.openwrt.org/?target=r%2Fm&id=p');
    });
  });

  describe('resumenSinSim', () => {
    it('correct', () => {
      const r = { id: '1', tipo: 'viaje-openwrt', bateriaPct: 50, cargando: false };
      expect(portatil.resumenSinSim(r)).toBe('Sin SIM es un titanio igual: la malla (802.11s + batman‑adv) va por las radios Wi‑Fi; el módem puede quedarse apagado.');
    });
  });
});