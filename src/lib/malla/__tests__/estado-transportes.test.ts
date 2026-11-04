import { describe, it, expect, beforeAll } from 'vitest';
import { Plataforma } from '@/lib/malla/cristal/permisos-antenas';
import {
  EstadoTransporte,
  ResumenTransportes,
  resumenTransportes,
} from '../estado-transportes';

describe('resumenTransportes', () => {
  const baseParams = {
    tieneBluetooth: true,
    tieneSerial: true,
    tieneNfc: true,
    tieneGeo: true,
  };

  const testCases: Array<{
    plataforma: Plataforma;
    expectedDetectados: string[];
    expectedUsables: string[];
    expectedPendientes: Array<{ transporte: string; motivo: string }>;
  }> = [
    {
      plataforma: 'web-chromium',
      expectedDetectados: ['WebRTC', 'Web Bluetooth', 'Web Serial', 'Web NFC', 'Geolocalización'],
      expectedUsables: ['WebRTC', 'Geolocalización'],
      expectedPendientes: [
        { transporte: 'Web Bluetooth', motivo: 'Pendiente: btleplug en escritorio, plugin Kotlin en Android' },
        { transporte: 'Web Serial', motivo: 'Pendiente: serie en Windows/Android' },
        { transporte: 'Web NFC', motivo: 'No disponible en el navegador actual' },
      ],
    },
    {
      plataforma: 'web-safari',
      expectedDetectados: ['WebRTC', 'Web Bluetooth', 'Web Serial', 'Web NFC', 'Geolocalización'],
      expectedUsables: ['WebRTC', 'Geolocalización'],
      expectedPendientes: [
        { transporte: 'Web Bluetooth', motivo: 'No soportado en Safari' },
        { transporte: 'Web Serial', motivo: 'No soportado en Safari' },
        { transporte: 'Web NFC', motivo: 'No soportado en Safari' },
      ],
    },
    {
      plataforma: 'web-firefox',
      expectedDetectados: ['WebRTC', 'Web Bluetooth', 'Web Serial', 'Web NFC', 'Geolocalización'],
      expectedUsables: ['WebRTC', 'Geolocalización'],
      expectedPendientes: [
        { transporte: 'Web Bluetooth', motivo: 'No soportado en Firefox' },
        { transporte: 'Web Serial', motivo: 'No soportado en Firefox' },
        { transporte: 'Web NFC', motivo: 'No soportado en Firefox' },
      ],
    },
    {
      plataforma: 'android-chromium',
      expectedDetectados: ['WebRTC', 'Web Bluetooth', 'Web Serial', 'Web NFC', 'Geolocalización'],
      expectedUsables: ['WebRTC', 'Geolocalización'],
      expectedPendientes: [
        { transporte: 'Web Serial', motivo: 'No disponible en Android' },
        { transporte: 'Web Bluetooth', motivo: 'Pendiente: btleplug en escritorio, plugin Kotlin en Android' },
      ],
    },
    {
      plataforma: 'tauri-escritorio',
      expectedDetectados: [
        'Faro UDP multicast',
        'Meshtastic TCP',
        'Radios por serie',
        'Detección de Reticulum',
      ],
      expectedUsables: ['Faro UDP multicast', 'Meshtastic TCP', 'Radios por serie'],
      expectedPendientes: [
        { transporte: 'Detección de Reticulum', motivo: 'Pendiente: solo detección, transporte RNS es una ola aparte' },
      ],
    },
    {
      plataforma: 'tauri-android',
      expectedDetectados: ['Servicio en primer plano', 'Bluetooth nativos', 'USB nativos'],
      expectedUsables: ['Servicio en primer plano'],
      expectedPendientes: [
        { transporte: 'Bluetooth nativos', motivo: 'Pendiente: btleplug en escritorio, plugin Kotlin en Android' },
        { transporte: 'USB nativos', motivo: 'Pendiente: serie en Windows/Android' },
      ],
    },
  ];

  for (const tc of testCases) {
    describe(tc.plataforma, () => {
      let resultado: ResumenTransportes;

      beforeAll(() => {
        resultado = resumenTransportes({ plataforma: tc.plataforma, ...baseParams });
      });

      it('reporta todos los transportes detectados', () => {
        const detectados = resultado.detectados.map((e) => e.transporte);
        for (const esperado of tc.expectedDetectados) {
          expect(detectados).toContain(esperado);
        }
      });

      it('clasifica correctamente los usables', () => {
        const usables = resultado.usables.map((e) => e.transporte);
        for (const esperado of tc.expectedUsables) {
          expect(usables).toContain(esperado);
        }
      });

      it('reporta pendientes con su motivo honesto', () => {
        for (const { transporte, motivo } of tc.expectedPendientes) {
          const pendiente = resultado.pendientes.find((p) => p.transporte === transporte);
          expect(pendiente).toBeDefined();
          expect(pendiente?.motivo).toBe(motivo);
        }
      });

      it('no hay transportes detectados sin clasificar', () => {
        const todosClasificados = new Set([
          ...resultado.detectados.map((e) => e.transporte),
          ...resultado.usables.map((e) => e.transporte),
          ...resultado.pendientes.map((e) => e.transporte),
        ]);
        for (const d of resultado.detectados) {
          expect(todosClasificados.has(d.transporte)).toBe(true);
        }
      });
    });
  }

  describe('estructura de tipos', () => {
    it('EstadoTransporte tiene los campos requeridos', () => {
      const e: EstadoTransporte = {
        transporte: 'Test',
        disponible: true,
        motivo: '',
      };
      expect(e.transporte).toBe('Test');
      expect(e.disponible).toBe(true);
      expect(e.motivo).toBe('');
    });

    it('ResumenTransportes agrupa las tres categorías', () => {
      const r: ResumenTransportes = {
        detectados: [],
        usables: [],
        pendientes: [],
      };
      expect(Array.isArray(r.detectados)).toBe(true);
      expect(Array.isArray(r.usables)).toBe(true);
      expect(Array.isArray(r.pendientes)).toBe(true);
    });
  });
});