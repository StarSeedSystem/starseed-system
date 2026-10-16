import { describe, it, expect } from 'vitest';
import { inventarioPorMedio, Plataforma, AntenaInfo } from '../permisos-antenas';

describe('inventarioPorMedio', () => {
  const expectAntena = (result: AntenaInfo[], antena: string, disponibles: boolean[], motivos: string[], comoPedirs: (string | null)[]) => {
    const item = result.find(a => a.antena === antena);
    expect(item).toBeDefined();
    expect(item?.disponible).toBe(disponibles[0]); // Simplified for demo
    if (motivos[0]) expect(item?.motivo).toBe(motivos[0]);
    if (comoPedirs[0]) expect(item?.comoPedir).toBe(comoPedirs[0]);
  };

  describe('web-chromium', () => {
    it('should report correct availability', () => {
      const result = inventarioPorMedio({
        plataforma: 'web-chromium',
        tieneBluetooth: true,
        tieneSerial: true,
        tieneNfc: false,
        tieneGeo: true
      });
      
      expectAntena(result, 'WebRTC', [true], [''], [null]);
      expectAntena(result, 'Web Bluetooth', [true], [''], [null]);
      expectAntena(result, 'Web Serial', [true], [''], [null]);
      expectAntena(result, 'Web NFC', [false], ['Disponible solo en Android'], [null]);
      expectAntena(result, 'Geolocalización', [true], [''], [null]);
    });
  });

  describe('web-safari', () => {
    it('should report correct availability', () => {
      const result = inventarioPorMedio({
        plataforma: 'web-safari',
        tieneBluetooth: true,
        tieneSerial: true,
        tieneNfc: true,
        tieneGeo: true
      });
      
      expectAntena(result, 'WebRTC', [true], [''], [null]);
      expectAntena(result, 'Web Bluetooth', [false], ['No soportado en Safari'], [null]);
      expectAntena(result, 'Web Serial', [false], ['No soportado en Safari'], [null]);
      expectAntena(result, 'Web NFC', [false], ['No soportado en Safari'], [null]);
      expectAntena(result, 'Geolocalización', [true], [''], [null]);
    });
  });

  describe('android-chromium', () => {
    it('should report correct availability', () => {
      const result = inventarioPorMedio({
        plataforma: 'android-chromium',
        tieneBluetooth: true,
        tieneSerial: true,
        tieneNfc: true,
        tieneGeo: true
      });
      
      expectAntena(result, 'WebRTC', [true], [''], [null]);
      expectAntena(result, 'Web Bluetooth', [true], [''], [null]);
      expectAntena(result, 'Web Serial', [false], ['No disponible en Android'], [null]);
      expectAntena(result, 'Web NFC', [true], [''], [null]);
      expectAntena(result, 'Geolocalización', [true], [''], [null]);
    });
  });

  describe('tauri-escritorio', () => {
    it('should report correct availability', () => {
      const result = inventarioPorMedio({
        plataforma: 'tauri-escritorio',
        tieneBluetooth: true,
        tieneSerial: true,
        tieneNfc: true,
        tieneGeo: true
      });
      
      expectAntena(result, 'Faro UDP multicast', [true], [''], [null]);
      expectAntena(result, 'Meshtastic TCP', [true], [''], [null]);
      expectAntena(result, 'Radios por serie', [true], [''], [null]);
      expectAntena(result, 'Detección de Reticulum', [true], [''], [null]);
    });
  });

  describe('tauri-android', () => {
    it('should report correct availability', () => {
      const result = inventarioPorMedio({
        plataforma: 'tauri-android',
        tieneBluetooth: true,
        tieneSerial: true,
        tieneNfc: true,
        tieneGeo: true
      });
      
      expectAntena(result, 'Servicio en primer plano', [true], [''], [null]);
      expectAntena(result, 'Bluetooth nativos', [true], [''], [null]);
      expectAntena(result, 'USB nativos', [true], [''], [null]);
    });
  });
});