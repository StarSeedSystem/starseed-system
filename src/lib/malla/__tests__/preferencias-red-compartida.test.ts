import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PREFERENCIAS_POR_DEFECTO,
  sanearPreferenciasRed,
  leerPreferenciasRed,
  guardarPreferenciasRed,
} from '../preferencias-red-compartida';

describe('preferencias-red-compartida', () => {
  describe('PREFERENCIAS_POR_DEFECTO', () => {
    it('todo está apagado por defecto', () => {
      expect(PREFERENCIAS_POR_DEFECTO.interruptor).toBe(false);
      expect(PREFERENCIAS_POR_DEFECTO.maximoCon).toBe('nadie');
      expect(PREFERENCIAS_POR_DEFECTO.soloWifi).toBe(true);
      expect(PREFERENCIAS_POR_DEFECTO.kbpsSubidaMax).toBe(1024);
      expect(PREFERENCIAS_POR_DEFECTO.reservaBateriaPct).toBe(30);
      expect(PREFERENCIAS_POR_DEFECTO.automatico).toBe(false);
      expect(PREFERENCIAS_POR_DEFECTO.compartirMedidas).toBe(false);
    });
  });

  describe('sanearPreferenciasRed', () => {
    it('devuelve valores por defecto con null', () => {
      const r = sanearPreferenciasRed(null);
      expect(r).toEqual(PREFERENCIAS_POR_DEFECTO);
    });

    it('devuelve valores por defecto con objeto vacío', () => {
      const r = sanearPreferenciasRed({});
      expect(r).toEqual(PREFERENCIAS_POR_DEFECTO);
    });

    it('devuelve valores por defecto con tipos incorrectos', () => {
      const r = sanearPreferenciasRed({
        interruptor: 'sí',
        maximoCon: 123,
        soloWifi: 'true',
        kbpsSubidaMax: 'mucho',
        reservaBateriaPct: -5,
        automatico: 'auto',
        compartirMedidas: 'sí',
      });
      expect(r).toEqual(PREFERENCIAS_POR_DEFECTO);
    });

    it('sanea maximoCon a valor válido y descarta inválidos', () => {
      expect(sanearPreferenciasRed({ maximoCon: 'publico' }).maximoCon).toBe('publico');
      expect(sanearPreferenciasRed({ maximoCon: 'grupo' }).maximoCon).toBe('grupo');
      expect(sanearPreferenciasRed({ maximoCon: 'vinculos' }).maximoCon).toBe('vinculos');
      expect(sanearPreferenciasRed({ maximoCon: 'mi-cuenta' }).maximoCon).toBe('mi-cuenta');
      expect(sanearPreferenciasRed({ maximoCon: 'nadie' }).maximoCon).toBe('nadie');
      expect(sanearPreferenciasRed({ maximoCon: 'inventado' }).maximoCon).toBe('nadie');
      expect(sanearPreferenciasRed({ maximoCon: null }).maximoCon).toBe('nadie');
    });

    it('acota kbpsSubidaMax entre 0 y 100000', () => {
      expect(sanearPreferenciasRed({ kbpsSubidaMax: -100 }).kbpsSubidaMax).toBe(0);
      expect(sanearPreferenciasRed({ kbpsSubidaMax: 500 }).kbpsSubidaMax).toBe(500);
      expect(sanearPreferenciasRed({ kbpsSubidaMax: 200000 }).kbpsSubidaMax).toBe(100000);
      expect(sanearPreferenciasRed({ kbpsSubidaMax: 123.9 }).kbpsSubidaMax).toBe(123);
    });

    it('acota reservaBateriaPct entre 0 y 100', () => {
      expect(sanearPreferenciasRed({ reservaBateriaPct: -10 }).reservaBateriaPct).toBe(0);
      expect(sanearPreferenciasRed({ reservaBateriaPct: 45 }).reservaBateriaPct).toBe(45);
      expect(sanearPreferenciasRed({ reservaBateriaPct: 150 }).reservaBateriaPct).toBe(100);
      expect(sanearPreferenciasRed({ reservaBateriaPct: 33.7 }).reservaBateriaPct).toBe(33);
    });

    it('convierte booleanos a true/false estricto', () => {
      expect(sanearPreferenciasRed({ interruptor: 1 }).interruptor).toBe(false);
      expect(sanearPreferenciasRed({ interruptor: true }).interruptor).toBe(true);
      expect(sanearPreferenciasRed({ soloWifi: 'true' }).soloWifi).toBe(false);
      expect(sanearPreferenciasRed({ soloWifi: false }).soloWifi).toBe(false);
      expect(sanearPreferenciasRed({ automatico: true }).automatico).toBe(true);
      expect(sanearPreferenciasRed({ compartirMedidas: true }).compartirMedidas).toBe(true);
    });
  });

  describe('guardarPreferenciasRed / leerPreferenciasRed', () => {
    const clave = 'starseed.red-compartida.v1';

    beforeEach(() => {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(clave);
      }
    });

    afterEach(() => {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(clave);
      }
    });

    it('ida y vuelta: guardar y leer devuelve lo mismo', () => {
      const prefs = {
        interruptor: true,
        maximoCon: 'vinculos' as const,
        soloWifi: false,
        kbpsSubidaMax: 5000,
        reservaBateriaPct: 20,
        automatico: true,
        compartirMedidas: true,
      };
      guardarPreferenciasRed(prefs);
      const leidas = leerPreferenciasRed();
      expect(leidas).toEqual(prefs);
    });

    it('subir el nivel de apertura devuelve aviso: true', () => {
      // Empezamos con 'nadie'
      guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'nadie' });

      // Subimos a 'mi-cuenta'
      let r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'mi-cuenta' });
      expect(r.aviso).toBe(true);

      // Subimos a 'vinculos'
      r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'vinculos' });
      expect(r.aviso).toBe(true);

      // Subimos a 'grupo'
      r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'grupo' });
      expect(r.aviso).toBe(true);

      // Subimos a 'publico'
      r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'publico' });
      expect(r.aviso).toBe(true);
    });

    it('bajar el nivel de apertura no avisa', () => {
      // Empezamos con 'publico'
      guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'publico' });

      // Bajamos a 'grupo'
      let r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'grupo' });
      expect(r.aviso).toBe(false);

      // Bajamos a 'vinculos'
      r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'vinculos' });
      expect(r.aviso).toBe(false);

      // Bajamos a 'mi-cuenta'
      r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'mi-cuenta' });
      expect(r.aviso).toBe(false);

      // Bajamos a 'nadie'
      r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'nadie' });
      expect(r.aviso).toBe(false);
    });

    it('mantener el mismo nivel no avisa', () => {
      guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'vinculos' });
      const r = guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'vinculos' });
      expect(r.aviso).toBe(false);
    });

    it('cambiar otros campos sin tocar maximoCon no avisa', () => {
      guardarPreferenciasRed({ ...PREFERENCIAS_POR_DEFECTO, maximoCon: 'vinculos' });
      const r = guardarPreferenciasRed({
        ...PREFERENCIAS_POR_DEFECTO,
        maximoCon: 'vinculos',
        interruptor: true,
        soloWifi: false,
        kbpsSubidaMax: 9999,
        reservaBateriaPct: 15,
        automatico: true,
        compartirMedidas: true,
      });
      expect(r.aviso).toBe(false);
    });
  });
});