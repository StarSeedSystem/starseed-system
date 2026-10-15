// Malla cristalina SiO₂ amorfa: inventario de antenas por medio
// Función pura: sin node:* ni Supabase ni window

export interface PerfilAntena {
  antena: string;
  disponible: boolean;
  motivo: string;
  comoPedir: string | null;
}

export interface PerfilUsuario {
  plataforma: 'web-chromium' | 'web-safari' | 'web-firefox' | 'android-chromium' | 'tauri-escritorio' | 'tauri-android';
  tieneBluetooth: boolean;
  tieneSerial: boolean;
  tieneNfc: boolean;
  tieneGeo: boolean;
}

function puedeWebChromium(p: PerfilUsuario): PerfilAntena[] {
  return [
    { antena: 'webrtc', disponible: true, motivo: '', comoPedir: null },
    { antena: 'bluetooth', disponible: p.tieneBluetooth, motivo: p.tieneBluetooth ? '' : 'instala el plugin Web Bluetooth', comoPedir: p.tieneBluetooth ? null : 'Web Bluetooth API' },
    { antena: 'serial', disponible: p.tieneSerial, motivo: p.tieneSerial ? '' : 'instala el plugin Web Serial', comoPedir: p.tieneSerial ? null : 'Web Serial API' },
    { antena: 'nfc', disponible: p.tieneNfc, motivo: p.tieneNfc ? '' : 'necesitas Android 9+', comoPedir: p.tieneNfc ? null : 'Web NFC API' },
    { antena: 'geo', disponible: p.tieneGeo, motivo: p.tieneGeo ? '' : 'activa la ubicación', comoPedir: p.tieneGeo ? null : 'Geolocation API' },
  ];
}

function puedeWebSafari(p: PerfilUsuario): PerfilAntena[] {
  return [
    { antena: 'webrtc', disponible: true, motivo: '', comoPedir: null },
    { antena: 'geo', disponible: p.tieneGeo, motivo: p.tieneGeo ? '' : 'activa la ubicación', comoPedir: p.tieneGeo ? null : 'Geolocation API' },
  ];
}

function puedeWebFirefox(p: PerfilUsuario): PerfilAntena[] {
  return [
    { antena: 'webrtc', disponible: true, motivo: '', comoPedir: null },
    { antena: 'geo', disponible: p.tieneGeo, motivo: p.tieneGeo ? '' : 'activa la ubicación', comoPedir: p.tieneGeo ? null : 'Geolocation API' },
  ];
}

function puedeAndroidChromium(p: PerfilUsuario): PerfilAntena[] {
  return [
    { antena: 'webrtc', disponible: true, motivo: '', comoPedir: null },
    { antena: 'bluetooth', disponible: p.tieneBluetooth, motivo: p.tieneBluetooth ? '' : 'instala el plugin Web Bluetooth para Android', comoPedir: p.tieneBluetooth ? null : 'Web Bluetooth API' },
    { antena: 'geo', disponible: p.tieneGeo, motivo: p.tieneGeo ? '' : 'activa la ubicación', comoPedir: p.tieneGeo ? null : 'Geolocation API' },
  ];
}

function puedeTauriEscritorio(p: PerfilUsuario): PerfilAntena[] {
  return [
    { antena: 'webrtc', disponible: true, motivo: '', comoPedir: null },
    { antena: 'serie', disponible: p.tieneSerial, motivo: p.tieneSerial ? '' : 'configura el puerto serie nativo', comoPedir: p.tieneSerial ? null : 'Puerto serie nativo' },
    { antena: 'geo', disponible: p.tieneGeo, motivo: p.tieneGeo ? '' : 'activa la ubicación', comoPedir: p.tieneGeo ? null : 'Geolocalización nativa' },
  ];
}

function puedeTauriAndroid(p: PerfilUsuario): PerfilAntena[] {
  return [
    { antena: 'webrtc', disponible: true, motivo: '', comoPedir: null },
    { antena: 'bluetooth', disponible: p.tieneBluetooth, motivo: p.tieneBluetooth ? '' : 'habilita Bluetooth nativo', comoPedir: p.tieneBluetooth ? null : 'Bluetooth nativo' },
    { antena: 'nfc', disponible: p.tieneNfc, motivo: p.tieneNfc ? '' : 'activa NFC nativo', comoPedir: p.tieneNfc ? null : 'NFC nativo' },
    { antena: 'geo', disponible: p.tieneGeo, motivo: p.tieneGeo ? '' : 'activa la ubicación', comoPedir: p.tieneGeo ? null : 'Geolocalización nativa' },
  ];
}

export function inventarioPorMedio(p: PerfilUsuario): PerfilAntena[] {
  switch (p.plataforma) {
    case 'web-chromium':
      return puedeWebChromium(p);
    case 'web-safari':
      return puedeWebSafari(p);
    case 'web-firefox':
      return puedeWebFirefox(p);
    case 'android-chromium':
      return puedeAndroidChromium(p);
    case 'tauri-escritorio':
      return puedeTauriEscritorio(p);
    case 'tauri-android':
      return puedeTauriAndroid(p);
    default:
      return [];
  }
}
