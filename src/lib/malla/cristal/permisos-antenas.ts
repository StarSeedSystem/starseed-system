import { Platform } from './types';

export type Plataforma = 
  | 'web-chromium'
  | 'web-safari'
  | 'web-firefox'
  | 'android-chromium'
  | 'tauri-escritorio'
  | 'tauri-android';

export interface PermisosAntenasParams {
  plataforma: Plataforma;
  tieneBluetooth: boolean;
  tieneSerial: boolean;
  tieneNfc: boolean;
  tieneGeo: boolean;
}

export interface AntenaInfo {
  antena: string;
  disponible: boolean;
  motivo: string;
  comoPedir: string | null;
}

export function inventarioPorMedio(p: PermisosAntenasParams): AntenaInfo[] {
  const antennas = [
    {
      name: 'webrtc',
      label: 'WebRTC',
      supported: ['web-chromium','web-safari','web-firefox','android-chromium'].includes(p.plataforma),
      motivoUnsupported: 'Esta plataforma no soporta WebRTC. Necesita usar un navegador web compatible.',
    },
    {
      name: 'tieneBluetooth',
      label: 'Bluetooth',
      supported: ['web-chromium','android-chromium','tauri-escritorio','tauri-android'].includes(p.plataforma),
      motivoUnsupported: 'Esta plataforma no soporta Bluetooth. Necesita usar una plataforma con soporte para Bluetooth.',
    },
    {
      name: 'tieneSerial',
      label: 'Serial',
      supported: ['web-chromium','tauri-escritorio','tauri-android'].includes(p.plataforma),
      motivoUnsupported: 'Esta plataforma no soporta Serial. Necesita usar una plataforma con soporte para puertos serial.',
    },
    {
      name: 'tieneNfc',
      label: 'NFC',
      supported: ['web-chromium','android-chromium'].includes(p.plataforma),
      motivoUnsupported: 'Esta plataforma no soporta NFC. Necesita usar una plataforma con soporte para NFC.',
    },
    {
      name: 'tieneGeo',
      label: 'Geolocalización',
      supported: true,
      motivoUnsupported: 'Esta plataforma no soporta geolocalización.',
    },
  ];

  return antennas.map(ant => {
    const supported = ant.supported;
    const disponible = supported && (ant.name === 'webrtc' ? true : p[ant.name as keyof PermisosAntenasParams]);
    const motivo = supported 
      ? !p[ant.name as keyof PermisosAntenasParams] 
        ? `No disponible: falta hardware o permiso para ${ant.label}.` 
        : null
      : ant.motivoUnsupported;
    return {
      antena: ant.label,
      disponible,
      motivo: motivo ?? '',
      comoPedir: null,
    };
  });
}