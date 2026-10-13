import { describe, it, expect } from 'vitest';
import { viabilidad } from '../viabilidad';
import type { Dato, SenalMedida } from '../tipos';

// Helper to create a mock context
const createCtx = (overrides: Partial<{
  cuentaDe: (neuronaId: string) => string | null;
  bateriaPct?: number | null;
  cifradoE2E: boolean;
}> = {}) => {
  const cuentaDe = (neuronaId: string) => {
    // By default, all neurons belong to the same account 'account1'
    return 'account1';
  };
  return {
    cuentaDe,
    bateriaPct: null,
    cifradoE2E: false,
    ...overrides,
  };
};

// Helper to create a basic dato
const baseDato: Dato = {
  id: 'dato1',
  clase: 'privado', // will be overridden in tests
  tipo: 'mensaje',  // will be overridden in tests
  bytes: 100,
  prioridad: 0,     // will be overridden in tests
  origen: 'neurona1',
  destino: 'neurona2',
};

// Helper to create a basic senal
const baseSenal: SenalMedida = {
  de: 'neurona1',
  a: 'neurona2',
  medio: 'wifi-lan', // will be overridden in tests
  rssiDbm: -50,
  snrDb: 10,
  rttMs: 20,
  anchoBandaKbps: 10000,
  perdidaPct: 0,
  frecuenciaMhz: 2400,
  anchoCanalMhz: 20,
  vistaEn: 1,
};

describe('viabilidad', () => {
  describe('vetos', () => {
    it('debe veto interno cuando la punta de origen no es de la misma cuenta', () => {
      const dato = { ...baseDato };
      const senal = { ...baseSenal };
      const ctx = createCtx({
        cuentaDe: (id) => {
          if (id === 'neurona1') return 'account1';
          if (id === 'neurona2') return 'account2'; // different account
          return null;
        },
      });
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('interno');
    });

    it('debe veto interno cuando la punta de destino no es de la misma cuenta', () => {
      const dato = { ...baseDato };
      const senal = { ...baseSenal };
      const ctx = createCtx({
        cuentaDe: (id) => {
          if (id === 'neurona1') return 'account1';
          if (id === 'neurona2') return 'account1';
          if (id === 'neurona3') return 'account2'; // not used
          return null;
        },
      });
      // Change the senal to have a third neuron? Actually, senal only has de and a.
      // We'll set senal.a to a neuron of a different account.
      const senalMod = { ...senal, a: 'neurona3' };
      const ctxMod = createCtx({
        cuentaDe: (id) => {
          if (id === 'neurona1') return 'account1';
          if (id === 'neurona3') return 'account2'; // different account
          return null;
        },
      });
      const result = viabilidad(dato, senalMod, ctxMod);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('interno');
    });

    it('debe veto privado sin cifradoE2E', () => {
      const dato = { ...baseDato, clase: 'privado' };
      const senal = { ...baseSenal };
      const ctx = createCtx({ cifradoE2E: false });
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('privado');
    });

    it('debe veto interno sin cifradoE2E', () => {
      const dato = { ...baseDato, clase: 'interno' };
      const senal = { ...baseSenal };
      const ctx = createCtx({ cifradoE2E: false });
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('interno');
    });

    it('debe veto lora por bytes > 1600', () => {
      const dato = { ...baseDato, bytes: 2000 };
      const senal = { ...baseSenal, medio: 'lora' };
      const ctx = createCtx({ cifradoE2E: true });
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('lora');
    });

    it('debe veto lora por tipo llamada', () => {
      const dato = { ...baseDato, tipo: 'llamada', bytes: 100 };
      const senal = { ...baseSenal, medio: 'lora' };
      const ctx = createCtx({ cifradoE2E: true });
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('lora');
    });

    it('debe veto nfc por bytes > 32768', () => {
      const dato = { ...baseDato, bytes: 40000 };
      const senal = { ...baseSenal, medio: 'nfc' };
      const ctx = createCtx({ cifradoE2E: true });
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('nfc');
    });
  });

  describe('cálculo de viabilidad', () => {
    it('debe retornar viabilidad positiva cuando pasa todos los vetos', () => {
      const dato = { ...baseDato };
      const senal = { ...baseSenal };
      const ctx = createCtx({ cifradoE2E: true }); // needed for privado
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(true);
      expect(result.valor).toBeGreaterThan(0);
      expect(result.valor).toBeLessThanOrEqual(1);
      expect(result.motivo).toBe('viable');
    });

    it('debe aplicar factor de servidor correctamente', () => {
      // We'll test that for a servidor medium and non-public class, the factor is 0.6
      // We'll set up a scenario where the only difference is the medio and the class.
      const datoPrivado = { ...baseDato, clase: 'privado' };
      const datoPublico = { ...baseDato, clase: 'publico' };
      const senalServidor = { ...baseSenal, medio: 'servidor' };
      const senalWifi = { ...baseSenal, medio: 'wifi-lan' };
      const ctx = createCtx({ cifradoE2E: true, bateriaPct: 50 }); // battery high so no battery factor

      // For privado, servidor should have factor 0.6, wifi-lan factor 1.0 (assuming same calidad and prioridad factors)
      // We'll keep calidad, prioridad, and battery factors the same by using the same senal except medio.
      // But note: calidadSenal depends on medio because of CAPACIDAD_KBPS in the bandwidth score? Actually, calidadSenal uses the senal's medio to look up capacity in CAPACIDAD_KBPS for the bandwidth score.
      // So the calidad will be different for servidor and wifi-lan because of different capacities.
      // To isolate the factorServidor, we need to make the calidadSenal the same for both media.
      // We can do that by setting the anchoBandaKbps to be proportional to the capacity? Actually, the bandwidth score in calidadSenal is:
      //   puntuaAnchoBanda(anchoBandaKbps, CAPACIDAD_KBPS[medio])
      // If we set anchoBandaKbps = CAPACIDAD_KBPS[medio], then the score is 1 for any medio.
      // Let's set the anchoBandaKbps to the capacity of each medio.

      const capacidadWifi = 100000; // from CAPACIDAD_KBPS['wifi-lan']
      const capacidadServidor = 10000; // from CAPACIDAD_KBPS['servidor']

      const senalWifiFull = { ...senalWifi, anchoBandaKbps: capacidadWifi };
      const senalServidorFull = { ...senalServidor, anchoBandaKbps: capacidadServidor };

      // Also, we want the same latency score, so we'll set the same rttMs.

      const resultPrivadoWifi = viabilidad(datoPrivado, senalWifiFull, ctx);
      const resultPrivadoServidor = viabilidad(datoPrivado, senalServidorFull, ctx);

      // The factorServidor for privado should be 0.6 for servidor and 1.0 for wifi-lan.
      // So we expect the valor for wifi-lan to be higher than for servidor by a factor of 1/0.6? Actually, the valor is multiplied by factorServidor.
      // So if everything else is equal, then:
      //   valorWifi = calidad * factorDePrioridad * 1.0 * factorBateria
      //   valorServidor = calidad * factorDePrioridad * 0.6 * factorBateria
      // Therefore, valorServidor should be 0.6 * valorWifi.

      // We'll compute the ratio.
      const ratio = resultPrivadoServidor.valor / resultPrivadoWifi.valor;
      expect(ratio).toBeCloseTo(0.6, 2); // within 0.02
    });

    it('debe aplicar factor de batería correctamente', () => {
      // Test that when bateriaPct < 20 and medio is wifi-lan or webrtc, factor is 0.8
      // We'll use a privado dato to avoid the servidor factor interference.
      const dato = { ...baseDato, clase: 'privado' };
      const ctxLowBattery = createCtx({ cifradoE2E: true, bateriaPct: 10 }); // low battery
      const ctxHighBattery = createCtx({ cifradoE2E: true, bateriaPct: 50 }); // high battery

      // We'll use wifi-lan medio.
      const senal = { ...baseSenal, medio: 'wifi-lan' };
      // Set anchoBandaKbps to capacity to get bandwidth score of 1.
      const senalFull = { ...senal, anchoBandaKbps: 100000 };

      const resultLow = viabilidad(dato, senalFull, ctxLowBattery);
      const resultHigh = viabilidad(dato, senalFull, ctxHighBattery);

      // The battery factor for low battery should be 0.8, for high battery 1.0.
      // So we expect resultLow.valor to be 0.8 * resultHigh.valor (assuming other factors equal).
      const ratio = resultLow.valor / resultHigh.valor;
      expect(ratio).toBeCloseTo(0.8, 2);
    });

    it('debe respetar el orden relativo: mensaje privado P0 de 120 B prefiere wifi-lan a servidor', () => {
      // We'll create two senales: one for wifi-lan and one for servidor.
      // We'll set the characteristics such that wifi-lan has better latency (lower rttMs) and servidor has worse latency.
      // We'll keep the bandwidth scores at 1 by setting anchoBandaKbps to capacity.
      const dato = { ...baseDato, clase: 'privado', prioridad: 0, bytes: 120 };
      const ctx = createCtx({ cifradoE2E: true, bateriaPct: 50 });

      // Wifi-lan: good latency
      const senalWifi = {
        ...baseSenal,
        medio: 'wifi-lan',
        rttMs: 20, // good
        anchoBandaKbps: 100000, // capacity of wifi-lan
      };
      // Servidor: worse latency
      const senalServidor = {
        ...baseSenal,
        medio: 'servidor',
        rttMs: 100, // worse
        anchoBandaKbps: 10000, // capacity of servidor
      };

      const resultWifi = viabilidad(dato, senalWifi, ctx);
      const resultServidor = viabilidad(dato, senalServidor, ctx);

      // We expect the wifi-lan to have higher valor than servidor.
      expect(resultWifi.valor).toBeGreaterThan(resultServidor.valor);
    });

    it('debe respetar el orden relativo: mensaje de 5 MB nunca va por lora (por veto)', () => {
      // This is covered by the lora veto test above.
      // We'll just do a sanity check.
      const dato = { ...baseDato, bytes: 5 * 1024 * 1024 }; // 5 MB
      const senal = { ...baseSenal, medio: 'lora' };
      const ctx = createCtx({ cifradoE2E: true });
      const result = viabilidad(dato, senal, ctx);
      expect(result.apto).toBe(false);
      expect(result.valor).toBe(0);
      expect(result.motivo).toBe('lora');
    });
  });
});