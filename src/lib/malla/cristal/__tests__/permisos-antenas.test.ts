import { describe, it, expect } from 'vitest';
import { inventarioPorMedio, PermisosAntenasParams } from '../permisos-antenas';

describe('inventarioPorMedio', () => {
  const baseParams: Omit<PermisosAntenasParams, 'plataforma'> = {
    tieneBluetooth: false,
    tieneSerial: false,
    tieneNfc: false,
    tieneGeo: false,
  };

  describe('web-chromium', () => {
    it('should return correct inventory when all permissions are denied', () => {
      const params: PermisosAntenasParams = { plataforma: 'web-chromium', ...baseParams };
      const result = inventarioPorMedio(params);
      // We expect 5 antennas: webrtc, bluetooth, serial, nfc, geo
      expect(result).toHaveLength(5);
      // Check that webrtc is not supported? Actually, web-chromium supports webrtc, but since tieneBluetooth etc are false, webrtc should be available? 
      // Wait, webrtc does not depend on any of the booleans. In our implementation, webrtc is supported and we set disponible to true regardless of the booleans? 
      // Actually, we set disponible for webrtc to: supported && true (because we don't have a boolean for webrtc, we used true). 
      // So webrtc should be disponible: true.
      const webrtc = result.find((ant) => ant.antena === 'WebRTC');
      expect(webrtc).toBeDefined();
      expect(webrtc?.disponible).toBe(true);
      // Bluetooth: supported but tieneBluetooth false -> disponible: false
      const bluetooth = result.find((ant) => ant.antena === 'Bluetooth');
      expect(bluetooth).toBeDefined();
      expect(bluetooth?.disponible).toBe(false);
      expect(bluetooth?.motivo).toContain('No disponible');
      // Serial: supported (we assumed) but tieneSerial false -> disponible: false
      const serial = result.find((ant) => ant.antena === 'Serial');
      expect(serial).toBeDefined();
      expect(serial?.disponible).toBe(false);
      // NFC: supported (for web-chromium? we said only Android, but we are web-chromium -> not supported? 
      // In our implementation, for web-chromium, NFC is supported only if plataforma is web-chromium or android-chromium? 
      // We had: getSupported for NFC returns true for ['web-chromium', 'android-chromium'].
      // So for web-chromium, NFC is supported -> disponible: false because tieneNfc false.
      const nfc = result.find((ant) => ant.antena === 'NFC');
      expect(nfc).toBeDefined();
      expect(nfc?.disponible).toBe(false);
      // Geo: supported and tieneGeo false -> disponible: false
      const geo = result.find((ant) => ant.antena === 'Geolocalización');
      expect(geo).toBeDefined();
      expect(geo?.disponible).toBe(false);
    });

    it('should grant Bluetooth permission and update inventory', () => {
      // We cannot test localStorage in vitest easily without jsdom? We'll skip for now.
      // We'll test the pure function by passing tieneBluetooth: true.
      const params: PermisosAntenasParams = { 
        plataforma: 'web-chromium',
        tieneBluetooth: true,
        tieneSerial: false,
        tieneNfc: false,
        tieneGeo: false,
      };
      const result = inventarioPorMedio(params);
      const bluetooth = result.find((ant) => ant.antena === 'Bluetooth');
      expect(bluetooth?.disponible).toBe(true);
      expect(bluetooth?.motivo).toBe('');
    });
  });

  // We'll add more test cases for other platforms in the next chunks.
});