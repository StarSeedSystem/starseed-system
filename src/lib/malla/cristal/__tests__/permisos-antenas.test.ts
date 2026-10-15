import { describe, it, expect } from "vitest";
import { inventarioPorMedio } from "../permisos-antenas";

import type { PerfilUsuario } from "../permisos-antenas";

describe("inventarioPorMedio", () => {
  const perfilBase: PerfilUsuario = {
    plataforma: 'web-chromium',
    tieneBluetooth: true,
    tieneSerial: true,
    tieneNfc: true,
    tieneGeo: true,
  };

  it("web-chromium con todo habilitado muestra todas las antenas como disponibles", () => {
    const p: PerfilUsuario = { ...perfilBase, plataforma: 'web-chromium' };
    const resultado = inventarioPorMedio(p);
    
    expect(resultado).toHaveLength(5);
    expect(resultado.find(a => a.antena === 'webrtc')).toEqual(
      expect.objectContaining({ antena: 'webrtc', disponible: true, comoPedir: null })
    );
    expect(resultado.find(a => a.antena === 'bluetooth')).toEqual(
      expect.objectContaining({ antena: 'bluetooth', disponible: true, comoPedir: null })
    );
    expect(resultado.find(a => a.antena === 'serial')).toEqual(
      expect.objectContaining({ antena: 'serial', disponible: true, comoPedir: null })
    );
    expect(resultado.find(a => a.antena === 'nfc')).toEqual(
      expect.objectContaining({ antena: 'nfc', disponible: true, comoPedir: null })
    );
    expect(resultado.find(a => a.antena === 'geo')).toEqual(
      expect.objectContaining({ antena: 'geo', disponible: true, comoPedir: null })
    );
  });

  it("web-chromium sin Bluetooth muestra bluetooth como no disponible", () => {
    const p: PerfilUsuario = { ...perfilBase, plataforma: 'web-chromium', tieneBluetooth: false };
    const resultado = inventarioPorMedio(p);
    
    const bluetooth = resultado.find(a => a.antena === 'bluetooth');
    expect(bluetooth).toEqual(
      expect.objectContaining({
        antena: 'bluetooth',
        disponible: false,
        motivo: 'instala el plugin Web Bluetooth',
        comoPedir: 'Web Bluetooth API'
      })
    );
  });

  it("web-safari solo tiene webrtc y geo", () => {
    const p: PerfilUsuario = { ...perfilBase, plataforma: 'web-safari' };
    const resultado = inventarioPorMedio(p);
    
    expect(resultado).toHaveLength(2);
    expect(resultado.map(a => a.antena)).toEqual(['webrtc', 'geo']);
    expect(resultado.find(a => a.antena === 'webrtc')).toEqual(
      expect.objectContaining({ disponible: true, comoPedir: null })
    );
    expect(resultado.find(a => a.antena === 'geo')).toEqual(
      expect.objectContaining({
        disponible: true,
        comoPedir: null
      })
    );
  });

  it("web-firefox solo tiene webrtc y geo", () => {
    const p: PerfilUsuario = { ...perfilBase, plataforma: 'web-firefox' };
    const resultado = inventarioPorMedio(p);
    
    expect(resultado).toHaveLength(2);
    expect(resultado.map(a => a.antena)).toEqual(['webrtc', 'geo']);
  });

  it("android-chromium tiene webrtc, bluetooth y geo", () => {
    const p: PerfilUsuario = { ...perfilBase, plataforma: 'android-chromium' };
    const resultado = inventarioPorMedio(p);
    
    expect(resultado).toHaveLength(3);
    expect(resultado.map(a => a.antena)).toEqual(['webrtc', 'bluetooth', 'geo']);
  });

  it("tauri-escritorio tiene webrtc, serie y geo", () => {
    const p: PerfilUsuario = { ...perfilBase, plataforma: 'tauri-escritorio' };
    const resultado = inventarioPorMedio(p);
    
    expect(resultado).toHaveLength(3);
    expect(resultado.map(a => a.antena)).toEqual(['webrtc', 'serie', 'geo']);
  });

  it("tauri-android tiene webrtc, bluetooth, nfc y geo", () => {
    const p: PerfilUsuario = { ...perfilBase, plataforma: 'tauri-android' };
    const resultado = inventarioPorMedio(p);
    
    expect(resultado).toHaveLength(4);
    expect(resultado.map(a => a.antena)).toEqual(['webrtc', 'bluetooth', 'nfc', 'geo']);
  });

  it("sin APIs deshabilitadas muestra motivos apropiados", () => {
    const p: PerfilUsuario = {
      plataforma: 'web-chromium',
      tieneBluetooth: false,
      tieneSerial: false,
      tieneNfc: false,
      tieneGeo: false,
    };
    const resultado = inventarioPorMedio(p);
    
    const bluetooth = resultado.find(a => a.antena === 'bluetooth');
    expect(bluetooth).toEqual(
      expect.objectContaining({
        disponible: false,
        motivo: 'instala el plugin Web Bluetooth',
        comoPedir: 'Web Bluetooth API'
      })
    );
    
    const serial = resultado.find(a => a.antena === 'serial');
    expect(serial).toEqual(
      expect.objectContaining({
        disponible: false,
        motivo: 'instala el plugin Web Serial',
        comoPedir: 'Web Serial API'
      })
    );
    
    const nfc = resultado.find(a => a.antena === 'nfc');
    expect(nfc).toEqual(
      expect.objectContaining({
        disponible: false,
        motivo: 'necesitas Android 9+',
        comoPedir: 'Web NFC API'
      })
    );
    
    const geo = resultado.find(a => a.antena === 'geo');
    expect(geo).toEqual(
      expect.objectContaining({
        disponible: false,
        motivo: 'activa la ubicación',
        comoPedir: 'Geolocation API'
      })
    );
  });
});
