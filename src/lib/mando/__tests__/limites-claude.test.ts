import { describe, it, expect } from 'vitest';
import {
  LecturaLimites,
  ProgramadaClaude,
  ConfigLimitesClaude,
  costePorRevision,
  disparosAntes,
  estadoLimitesClaude,
  resumenLimitesClaude,
  EstadoLimitesClaude,
  ENLACE_USO_CLAUDE,
} from '../limites-claude';

// Rescate RSC1006F (ramas de la nube 2026-10-06): lectura base compacta.
const lecturaBase = (extra: Partial<LecturaLimites> = {}): LecturaLimites => ({
  t: '2026-10-04T10:00:00.000Z',
  sesion_pct: 10,
  sesion_reinicio: '2026-10-04T14:10:00.000Z',
  semana_pct: 20,
  semana_reinicio: '2026-10-09T00:00:00.000Z',
  modelo_nombre: null,
  modelo_pct: null,
  modelo_reinicio: null,
  fuente: 'test',
  ...extra,
});
const AHORA_RSC = Date.parse('2026-10-04T12:00:00.000Z');

describe('limites-claude (pure logic)', () => {
  describe('costePorRevision', () => {
    it('returns null for insufficient readings', () => {
      const lecturas: LecturaLimites[] = [
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 10,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 20,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];
      expect(costePorRevision(lecturas, 'sesion_pct')).toBeNull();
    });

    it('returns median of positive increases', () => {
      const lecturas: LecturaLimites[] = [
        // Same window (sesion_reinicio)
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 10,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T01:00:00.000Z',
          sesion_pct: 20,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T02:00:00.000Z',
          sesion_pct: 30,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        // Different window
        {
          t: '2026-01-01T03:00:00.000Z',
          sesion_pct: 40,
          sesion_reinicio: '2026-01-02T05:00:00.000Z', // different reinicio
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];
      // Increases: 10 (10->20), 10 (20->30) -> median 10
      expect(costePorRevision(lecturas, 'sesion_pct')).toBeCloseTo(10);
    });

    it('ignores non-positive increases', () => {
      const lecturas: LecturaLimites[] = [
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 20,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T01:00:00.000Z',
          sesion_pct: 20, // same value
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T02:00:00.000Z',
          sesion_pct: 10, // decrease
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];
      expect(costePorRevision(lecturas, 'sesion_pct')).toBeNull();
    });

    it('groups by reinicio field correctly', () => {
      const lecturas: LecturaLimites[] = [
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 10,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T01:00:00.000Z',
          sesion_pct: 20,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T02:00:00.000Z',
          sesion_pct: 30,
          sesion_reinicio: '2026-01-02T05:00:00.000Z', // different reinicio
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T03:00:00.000Z',
          sesion_pct: 40,
          sesion_reinicio: '2026-01-02T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];
      // First group (reinicio 2026-01-01T05:00:00Z): increases 10 (10->20)
      // Second group (reinicio 2026-01-02T05:00:00Z): increases 10 (30->40)
      // All increases: [10, 10] -> median 10
      expect(costePorRevision(lecturas, 'sesion_pct')).toBeCloseTo(10);
    });
  });

  describe('disparosAntes', () => {
    it('returns 0 for empty list', () => {
      expect(disparosAntes([], 0, 1000)).toBe(0);
    });

    it('counts a single task within interval', () => {
      const ahora = 0;
      const hasta = 1000 * 60 * 1000; // 1000 minutes in ms
      const lista: ProgramadaClaude[] = [
        {
          nombre: 'test',
          proxima: new Date(500 * 60 * 1000).toISOString(), // 500 minutes from ahora
          cada_min: null,
        },
      ];
      expect(disparosAntes(lista, ahora, hasta)).toBe(1);
    });

    it('does not count task outside interval (too early)', () => {
      const ahora = 0;
      const hasta = 1000 * 60 * 1000;
      const lista: ProgramadaClaude[] = [
        {
          nombre: 'test',
          proxima: new Date(-1000 * 60 * 1000).toISOString(), // 1000 minutes before ahora
          cada_min: null,
        },
      ];
      expect(disparosAntes(lista, ahora, hasta)).toBe(0);
    });

    it('does not count task outside interval (too late)', () => {
      const ahora = 0;
      const hasta = 1000 * 60 * 1000;
      const lista: ProgramadaClaude[] = [
        {
          nombre: 'test',
          proxima: new Date(2000 * 60 * 1000).toISOString(), // 2000 minutes from ahora
          cada_min: null,
        },
      ];
      expect(disparosAntes(lista, ahora, ahora + hasta)).toBe(0);
    });

    it('counts additional shots for periodic tasks', () => {
      const ahora = 0;
      const hasta = 1000 * 60 * 1000; // 1000 minutes
      const lista: ProgramadaClaude[] = [
        {
          nombre: 'test',
          proxima: new Date(0).toISOString(), // exactly at ahora
          cada_min: 100, // every 100 minutes
        },
      ];
      // Shots at: 0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000 -> 11 shots
      // But note: the condition is proxima in (ahora, hasta] -> proxima=0 is not > ahora (0), so the base shot is not counted.
      // However, the contract says: "por cada programada: 1 si `proxima` ∈ (ahora, reinicio] más, si `cada_min`>0, floor((reinicio − proxima)/cada_min)"
      // So if proxima == ahora, it is not in (ahora, reinicio] (since open at ahora). Then we only have the additional shots: floor((reinicio - proxima)/cada_min)
      // reinicio = hasta = 1000 minutes, proxima = 0 -> floor(1000/100) = 10.
      expect(disparosAntes(lista, ahora, hasta)).toBe(10);
    });

    it('handles mixed tasks', () => {
      const ahora = 0;
      const hasta = 1000 * 60 * 1000;
      const lista: ProgramadaClaude[] = [
        {
          nombre: 'test1',
          proxima: new Date(500 * 60 * 1000).toISOString(), // within interval
          cada_min: null,
        },
        {
          nombre: 'test2',
          proxima: new Date(0).toISOString(), // at ahora
          cada_min: 200, // every 200 minutes
        },
      ];
      // test1: proxima=500 >0 and <=1000 -> +1
      // test2: proxima=0 -> not in (0,1000] -> base 0; first occurrence > 0 = 200; then 200,400,600,800,1000 -> 5 shots
      // total = 1 + 5 = 6
      expect(disparosAntes(lista, ahora, hasta)).toBe(6);
    });

    // Caso real LC1007A: periódica vieja que pasó hace días; debe avanzar a primera ocurrencia posterior.
    it('caso real: periódica vieja cuenta 3 disparos hasta 23:10', () => {
      const ahora = new Date('2026-10-06T20:03:00-06:00').getTime();
      const hasta = new Date('2026-10-06T23:10:00-06:00').getTime();
      const lista: ProgramadaClaude[] = [
        {
          nombre: 'revisión periódica',
          proxima: '2026-10-04T23:20:00-06:00',
          cada_min: 60,
        },
      ];
      // Proxima = 2026-10-04 23:20 (ya pasó). Intervalo = 60 min.
      // Avanzar a primera > ahora (20:03 el 6 oct): 20:20, luego 21:20, 22:20; 23:20 pasa 23:10.
      expect(disparosAntes(lista, ahora, hasta)).toBe(3);
    });

    it('puntual futura: cuenta 1', () => {
      const ahora = new Date('2026-10-06T20:00:00-06:00').getTime();
      const hasta = new Date('2026-10-06T23:00:00-06:00').getTime();
      const lista: ProgramadaClaude[] = [
        { nombre: 'puntual', proxima: '2026-10-06T21:30:00-06:00', cada_min: null },
      ];
      expect(disparosAntes(lista, ahora, hasta)).toBe(1);
    });

    it('puntual pasada: cuenta 0', () => {
      const ahora = new Date('2026-10-06T21:00:00-06:00').getTime();
      const hasta = new Date('2026-10-06T23:00:00-06:00').getTime();
      const lista: ProgramadaClaude[] = [
        { nombre: 'pasada', proxima: '2026-10-06T20:30:00-06:00', cada_min: null },
      ];
      expect(disparosAntes(lista, ahora, hasta)).toBe(0);
    });

    it('periódica futura: cuenta base + adicionales', () => {
      const ahora = new Date('2026-10-06T20:00:00-06:00').getTime();
      const hasta = new Date('2026-10-06T23:00:00-06:00').getTime();
      const lista: ProgramadaClaude[] = [
        { nombre: 'futura', proxima: '2026-10-06T21:00:00-06:00', cada_min: 60 },
      ];
      // Base 21:00, adicionales 22:00, 23:00 -> total 3 (23:00 está en (20:00, 23:00], sí)
      expect(disparosAntes(lista, ahora, hasta)).toBe(3);
    });

    it('hasta <= ahora: 0', () => {
      const ahora = new Date('2026-10-06T22:00:00-06:00').getTime();
      const hasta = new Date('2026-10-06T21:00:00-06:00').getTime();
      const lista: ProgramadaClaude[] = [
        { nombre: 'cualquiera', proxima: '2026-10-06T21:30:00-06:00', cada_min: 60 },
      ];
      expect(disparosAntes(lista, ahora, hasta)).toBe(0);
    });
  });

  describe('estadoLimitesClaude', () => {
    const now = Date.now(); // mock now, but we'll use fixed timestamps for predictability
    const fixedNow = 1_000_000_000_000; // 2001-09-09T01:46:40.000Z

    it('returns default state for trash input', () => {
      const result = estadoLimitesClaude(null, fixedNow);
      expect(result.tono).toBe('aviso');
      expect(result.recomendacion).toBe('Sin lectura todavía: la dirección la toma en su próxima revisión');
      expect(result.sesion).toBeNull();
      expect(result.semana).toBeNull();
      expect(result.modelo).toBeNull();
    });

    it('returns default state for empty lecturas', () => {
      const config: ConfigLimitesClaude = {
        lecturas: [],
        programadas: { t: new Date().toISOString(), lista: [] },
        umbral_pct: 90,
      };
      const result = estadoLimitesClaude(config, fixedNow);
      expect(result.tono).toBe('aviso');
      expect(result.recomendacion).toBe('Sin lectura todavía: la dirección la toma en su próxima revisión');
    });

    it('calculates correct state with sample data', () => {
      // We'll create a set of lecturas that produce known increases
      const lecturas: LecturaLimites[] = [
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 10,
          sesion_reinicio: '2026-01-01T05:00:00.000Z', // 5 hours from start
          semana_pct: 20,
          semana_reinicio: '2026-01-08T00:00:00.000Z', // one week
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T01:00:00.000Z',
          sesion_pct: 20,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 25,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T02:00:00.000Z',
          sesion_pct: 30,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 30,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];

      // Set ahora to be after the last lectura but before the sesion reinicio
      // Last lectura at 02:00:00, sesion reinicio at 05:00:00 -> 3 hours later = 180 minutes
      const ahora = new Date('2026-01-01T03:00:00.000Z').getTime(); // 03:00:00, 1 hour after last lectura

      // Programmed tasks: none for simplicity
      const programadas: ProgramadaClaude[] = [];

      const config: ConfigLimitesClaude = {
        lecturas,
        programadas: { t: new Date().toISOString(), lista: programadas },
        umbral_pct: 90,
      };

      const result = estadoLimitesClaude(config, ahora);

      // Expect sesion window:
      //   pct = 30 (last lectura)
      //   queda = 70
      //   reinicio = '2026-01-01T05:00:00.000Z'
      //   minutosParaReinicio = 120 (02:00 to 05:00 is 3 hours? Wait: last lectura at 02:00, ahora at 03:00, reinicio at 05:00 -> from ahora to reinicio is 2 hours = 120 minutes)
      //   coste: increases are 10 and 10 -> median 10
      //   disparos: 0 (no programmed tasks)
      //   proyeccion = 30 + 0*10 = 30
      //   reiniciada: false (reinicio in future)
      //   tono: pct=30 <60, proyeccion=30 <90 -> 'ok'
      expect(result.sesion).not.toBeNull();
      expect(result.sesion?.pct).toBe(30);
      expect(result.sesion?.queda).toBe(70);
      expect(result.sesion?.minutosParaReinicio).toBeCloseTo(120);
      expect(result.sesion?.coste).toBeCloseTo(10);
      expect(result.sesion?.proyeccion).toBeCloseTo(30);
      expect(result.sesion?.reiniciada).toBe(false);
      expect(result.sesion?.tono).toBe('ok');

      // Expect semana window:
      //   pct = 30
      //   queda = 70
      //   reinicio = '2026-01-08T00:00:00.000Z' (far in future)
      //   minutosParaReinicio: large number
      //   coste: same as sesion? Actually, semana_pct values: 20,25,30 -> increases 5,5 -> median 5
      //   proyeccion = 30 + 0*5 = 30
      //   tono: 'ok'
      expect(result.semana).not.toBeNull();
      expect(result.semana?.pct).toBe(30);
      expect(result.semana?.coste).toBeCloseTo(5);
      expect(result.semana?.proyeccion).toBeCloseTo(30);
      expect(result.semana?.reiniciada).toBe(false);
      expect(result.semana?.tono).toBe('ok');

      // Modelo window: all null -> should be null
      expect(result.modelo).toBeNull();

      // lecturaEn: the t of the latest lectura
      expect(result.lecturaEn).toBe('2026-01-01T02:00:00.000Z');
      // lecturaHaceMin: from 02:00 to 03:00 is 60 minutes
      expect(result.lecturaHaceMin).toBe(60);
      // desactualizada: latest lectura is 60 minutes ago < 120 -> false
      expect(result.desactualizada).toBe(false);

      // programadasEnSesion and programadasEnSemana: 0
      expect(result.programadasEnSesion).toBe(0);
      expect(result.programadasEnSemana).toBe(0);
      // recomendacion: null because no projection exceeds umbral
      expect(result.recomendacion).toBeNull();
      // overall tono: 'ok'
      expect(result.tono).toBe('ok');
    });

    it('handles past reinicio', () => {
      const lecturas: LecturaLimites[] = [
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 80,
          sesion_reinicio: '2026-01-01T01:00:00.000Z', // 1 hour ago from ahora
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];
      const ahora = new Date('2026-01-01T02:00:00.000Z').getTime(); // 2 hours ago from the reinicio? Actually, reinicio at 01:00, ahora at 02:00 -> reinicio passed
      const config: ConfigLimitesClaude = {
        lecturas,
        programadas: { t: new Date().toISOString(), lista: [] },
        umbral_pct: 90,
      };
      const result = estadoLimitesClaude(config, ahora);
      expect(result.sesion).not.toBeNull();
      expect(result.sesion?.pct).toBe(0); // reset to 0
      expect(result.sesion?.queda).toBe(100);
      expect(result.sesion?.reiniciada).toBe(true);
      // minutosParaReinicio should be negative (from ahora to past reinicio)
      expect(result.sesion?.minutosParaReinicio).toBeLessThan(0);
      // tono: pct=0 <60, proyeccion=0 (since coste will be null? Actually, we have only one lectura for sesion_pct -> costePorRevision returns null because need at least two readings in same window)
      // So proyeccion = null -> tono: pct=0 <60, proyeccion null -> 'ok'? But we have desactualizada? Let's see.
      // The latest lectura is at 00:00, ahora at 02:00 -> 120 minutes ago? Actually 120 minutes exactly? 2 hours = 120 minutes -> desactualizada is true (older than 120 min? The contract says "más de 120 min", so equal is not more -> false? We'll check: (ahora - latestTime) = 120*60*1000 -> equal to 120 min in ms -> not greater -> desactualizada=false.
      // However, the contract says "lectura de hace más de 120 min", so we use >, not >=.
      // So desactualizada = false.
      // Then tono remains 'ok'. But we expect maybe 'aviso' because of desactualizada? No, because not desactualizada.
      // However, the contract says that if the lectura is older than 120 min, then desactualizada: true and at least aviso.
      // So in this case, since it's exactly 120 minutes, it's not desactualizada.
      // We'll accept the tono as 'ok' for now.
      // But note: the reinicio has passed, so we might want to show something else? The contract doesn't specify.
      // We'll rely on the test to match our implementation.
    });

    it('sets desactualizada and aviso when lectura old', () => {
      const lecturas: LecturaLimites[] = [
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 50,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];
      // Set ahora to be 130 minutes after the lectura
      const ahora = new Date('2026-01-01T02:10:00.000Z').getTime(); // 2 hours 10 minutes = 130 minutes
      const config: ConfigLimitesClaude = {
        lecturas,
        programadas: { t: new Date().toISOString(), lista: [] },
        umbral_pct: 90,
      };
      const result = estadoLimitesClaude(config, ahora);
      expect(result.desactualizada).toBe(true);
      // Even though the raw tono might be 'ok', we expect the overall tono to be at least 'aviso'
      expect(result.tono).toBe('aviso'); // because desactualizada triggers aviso
    });

    it('calculates recomendacion when projection exceeds umbral', () => {
      // We need a scenario where the proyeccion of sesion or semana exceeds umbral (90)
      // Let's make sesion window have high pct and low coste so that a few disparos push it over.
      const lecturas: LecturaLimites[] = [
        {
          t: '2026-01-01T00:00:00.000Z',
          sesion_pct: 80,
          sesion_reinicio: '2026-01-01T05:00:00.000Z', // 5 hours from start
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
        {
          t: '2026-01-01T01:00:00.000Z',
          sesion_pct: 85,
          sesion_reinicio: '2026-01-01T05:00:00.000Z',
          semana_pct: 0,
          semana_reinicio: '2026-01-08T00:00:00.000Z',
          modelo_nombre: null,
          modelo_pct: null,
          modelo_reinicio: null,
          fuente: 'test',
        },
      ];
      // Increases: 5 -> coste = 5
      const ahora = new Date('2026-01-01T02:00:00.000Z').getTime(); // 2 hours after start, 3 hours before reinicio
      // Programmed tasks: one task at proxima = ahora + 30 minutes, cada_min = 30 (so repeats every 30 minutes)
      // From proxima to reinicio: 3 hours = 180 minutes -> additional shots = floor(180/30) = 6
      // Plus the base shot if proxima in (ahora, reinicio]: yes -> total disparos = 1 + 6 = 7
      // Proyeccion = 85 + 7 * 5 = 85 + 35 = 120 -> exceeds 100? Actually, we clamp? No, we leave as is.
      // The contract says tono peligroso if proyeccion > 100 -> so we expect peligrosa.
      // For recomendacion: we check if proyeccion of sesion or semana exceeds umbral (90). It does (120>90).
      // Then N = floor((umbral - pct) / coste) = floor((90-85)/5) = floor(5/5)=1
      // So recomendacion: "Espacia las revisiones: caben 1 hasta el reinicio de sesión"
      const lista: ProgramadaClaude[] = [
        {
          nombre: 'test',
          proxima: new Date(ahora + 30 * 60 * 1000).toISOString(), // 30 minutes from ahora
          cada_min: 30,
        },
      ];
      const config: ConfigLimitesClaude = {
        lecturas,
        programadas: { t: new Date().toISOString(), lista },
        umbral_pct: 90,
      };
      const result = estadoLimitesClaude(config, ahora);
      expect(result.recomendacion).toBe('Espacia las revisiones: caben 1 hasta el reinicio de sesión');
      // Also expect tono peligrosa because proyeccion > 100
      expect(result.sesion?.tono).toBe('peligro');
      expect(result.tono).toBe('peligro');
    });
  });

  describe('resumenLimitesClaude', () => {
    it('returns "sin lectura" for empty state', () => {
      const estado: EstadoLimitesClaude = {
        sesion: null,
        semana: null,
        modelo: null,
        modeloNombre: null,
        lecturaEn: null,
        lecturaHaceMin: null,
        desactualizada: true,
        programadasEnSesion: 0,
        programadasEnSemana: 0,
        recomendacion: null,
        tono: 'aviso',
      };
      expect(resumenLimitesClaude(estado)).toBe('sin lectura');
    });

    it('returns formatted string with session and week', () => {
      const estado: EstadoLimitesClaude = {
        sesion: {
          pct: 34,
          queda: 66,
          reinicio: '2026-01-01T07:10:00.000Z', // 2h10m from ahora? We'll set minutosParaReinicio accordingly
          minutosParaReinicio: 130, // 2h10m
          coste: 5,
          proyeccion: 72,
          reiniciada: false,
          tono: 'ok',
        },
        semana: {
          pct: 61,
          queda: 39,
          reinicio: '2026-01-08T00:00:00.000Z',
          minutosParaReinicio: 10000, // some large number
          coste: 5,
          proyeccion: 65,
          reiniciada: false,
          tono: 'ok',
        },
        modelo: null,
        modeloNombre: null,
        lecturaEn: '2026-01-01T05:00:00.000Z',
        lecturaHaceMin: 60,
        desactualizada: false,
        programadasEnSesion: 10,
        programadasEnSemana: 5,
        recomendacion: null,
        tono: 'ok',
      };
      // We expect: "sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 72 %"
      // Note: the example uses the session's reinicio and proyeccion.
      const resumen = resumenLimitesClaude(estado);
      expect(resumen).toContain('sesión 34 %');
      expect(resumen).toContain('semana 61 %');
      expect(resumen).toContain('reinicia en 2 h 10 min');
      expect(resumen).toContain('proyección 72 %');
    });
  });
});

// Casos rescatados de las ramas de la nube (RSC1006F · LC1004B/Bd/C/E), adaptados a la API de main.
describe('limites-claude (rescate ramas nube)', () => {
  it('entrada basura ({}, null, "ruido"): todo null, tono aviso y recomendación fija', () => {
    for (const cfg of [{}, null, 'ruido']) {
      const e = estadoLimitesClaude(cfg, AHORA_RSC);
      expect(e.sesion).toBeNull();
      expect(e.semana).toBeNull();
      expect(e.tono).toBe('aviso');
      expect(e.recomendacion).toBe('Sin lectura todavía: la dirección la toma en su próxima revisión');
    }
  });

  it('peligro cuando pct >= umbral aunque la proyección sea null', () => {
    const e = estadoLimitesClaude(
      { lecturas: [lecturaBase({ semana_pct: 92 })], umbral_pct: 90 },
      AHORA_RSC,
    );
    expect(e.semana?.tono).toBe('peligro');
    expect(e.tono).toBe('peligro');
  });

  it('sin coste conocido la proyección es null y no hay recomendación', () => {
    const e = estadoLimitesClaude(
      { lecturas: [lecturaBase({ sesion_pct: 50 })], umbral_pct: 90 },
      AHORA_RSC,
    );
    expect(e.sesion?.proyeccion).toBeNull();
    expect(e.sesion?.tono).toBe('ok');
    expect(e.recomendacion).toBeNull();
  });

  it('expone modeloNombre y la ventana de modelo solo si la lectura la trae completa', () => {
    const e = estadoLimitesClaude(
      {
        lecturas: [lecturaBase({
          modelo_nombre: 'Fable',
          modelo_pct: 20,
          modelo_reinicio: '2026-10-09T00:00:00.000Z',
        })],
      },
      AHORA_RSC,
    );
    expect(e.modeloNombre).toBe('Fable');
    expect(e.modelo?.pct).toBe(20);
    // Sin reinicio del modelo, la ventana no se construye
    const incompleta = estadoLimitesClaude(
      { lecturas: [lecturaBase({ modelo_nombre: 'Fable', modelo_pct: 20 })] },
      AHORA_RSC,
    );
    expect(incompleta.modelo).toBeNull();
    expect(incompleta.modeloNombre).toBe('Fable');
  });

  it('lectura de hace más de 120 min: desactualizada, aviso global y ventana intacta', () => {
    const e = estadoLimitesClaude(
      { lecturas: [lecturaBase({ t: '2026-10-04T08:00:00.000Z', sesion_pct: 50 })] },
      AHORA_RSC,
    );
    expect(e.desactualizada).toBe(true);
    expect(e.lecturaHaceMin).toBe(240);
    expect(e.tono).toBe('aviso');
    expect(e.sesion?.tono).toBe('ok');
  });

  it('proyección >= umbral sin superar 100: tono aviso y recomendación de espaciado', () => {
    const cfg = {
      lecturas: [
        lecturaBase({ sesion_pct: 80 }),
        lecturaBase({ t: '2026-10-04T11:00:00.000Z', sesion_pct: 84 }),
      ],
      programadas: {
        t: '2026-10-04T11:00:00.000Z',
        lista: [{ nombre: 'ola', proxima: '2026-10-04T12:10:00.000Z', cada_min: 60 }],
      },
      umbral_pct: 90,
    };
    const e = estadoLimitesClaude(cfg, AHORA_RSC);
    // coste 4; `hasta` es cerrado: 12:10, 13:10 y 14:10 → 3 disparos
    expect(e.sesion?.coste).toBe(4);
    expect(e.programadasEnSesion).toBe(3);
    expect(e.sesion?.proyeccion).toBe(96);
    expect(e.sesion?.tono).toBe('aviso');
    expect(e.recomendacion).toBe('Espacia las revisiones: caben 1 hasta el reinicio de sesión');
  });

  it('resumen: "reiniciada" si el reinicio pasó y solo minutos si falta menos de una hora', () => {
    const pasada = estadoLimitesClaude(
      { lecturas: [lecturaBase({ sesion_reinicio: '2026-10-04T11:00:00.000Z' })] },
      AHORA_RSC,
    );
    expect(resumenLimitesClaude(pasada)).toContain('reiniciada');
    const cercana = estadoLimitesClaude(
      { lecturas: [lecturaBase({ sesion_reinicio: '2026-10-04T12:45:00.000Z' })] },
      AHORA_RSC,
    );
    expect(resumenLimitesClaude(cercana)).toContain('reinicia en 45 min');
  });

  it('mediana par: media de los dos centrales e ignora bajadas', () => {
    const lecturas = [
      lecturaBase({ sesion_pct: 10 }),
      lecturaBase({ t: '2026-10-04T10:30:00.000Z', sesion_pct: 14 }),
      lecturaBase({ t: '2026-10-04T11:00:00.000Z', sesion_pct: 22 }),
      lecturaBase({ t: '2026-10-04T11:30:00.000Z', sesion_pct: 21 }), // bajada: no cuenta
    ];
    // aumentos 4 y 8 → mediana (4+8)/2 = 6
    expect(costePorRevision(lecturas, 'sesion_pct')).toBe(6);
  });

  it('cada_min <= 0 se trata como puntual: cuenta 1 si proxima está en (ahora, hasta]', () => {
    const ahora = Date.parse('2026-10-05T12:00:00.000Z');
    const hasta = Date.parse('2026-10-05T18:00:00.000Z');
    const lista: ProgramadaClaude[] = [
      { nombre: 'cero', proxima: '2026-10-05T13:00:00.000Z', cada_min: 0 },
      { nombre: 'negativa', proxima: '2026-10-05T14:00:00.000Z', cada_min: -5 },
      { nombre: 'pasada', proxima: '2026-10-05T10:00:00.000Z', cada_min: 0 },
    ];
    expect(disparosAntes(lista, ahora, hasta)).toBe(2);
  });

  it('formato exacto del resumen calculado de verdad con proyección', () => {
    const e = estadoLimitesClaude(
      {
        lecturas: [
          lecturaBase({ sesion_pct: 30, semana_pct: 58 }),
          lecturaBase({ t: '2026-10-04T11:00:00.000Z', sesion_pct: 34, semana_pct: 61 }),
        ],
      },
      AHORA_RSC,
    );
    expect(resumenLimitesClaude(e)).toBe('sesión 34 % · semana 61 % · reinicia en 2 h 10 min · proyección 34 %');
  });

  it('ENLACE_USO_CLAUDE apunta a Ajustes → Uso de claude.ai', () => {
    expect(ENLACE_USO_CLAUDE).toBe('https://claude.ai/settings/usage');
  });
});