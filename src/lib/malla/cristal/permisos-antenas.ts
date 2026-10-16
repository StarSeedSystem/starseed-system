export type Plataforma =
  | 'web-chromium'
  | 'web-safari'
  | 'web-firefox'
  | 'android-chromium'
  | 'tauri-escritorio'
  | 'tauri-android';

export type AntenaInfo = {
  antena: string;
  disponible: boolean;
  motivo: string;
  comoPedir: string | null;
};

export function inventarioPorMedio(p: {
  plataforma: Plataforma;
  tieneBluetooth: boolean;
  tieneSerial: boolean;
  tieneNfc: boolean;
  tieneGeo: boolean;
}): AntenaInfo[] {
  const { plataforma, tieneBluetooth, tieneSerial, tieneNfc, tieneGeo } = p;
  const result: AntenaInfo[] = [];

  const add = (antena: string, disponible: boolean, motivo: string = '', comoPedir: string | null = null) => {
    result.push({ antena, disponible, motivo: motivo || '', comoPedir });
  };

  switch (plataforma) {
    case 'web-chromium':
      add('WebRTC', true);
      add('Web Bluetooth', tieneBluetooth, '', tieneBluetooth ? null : 'Conecte un dispositivo Bluetooth y asegúrese de que esté activado');
      add('Web Serial', tieneSerial, '', tieneSerial ? null : 'Conecte un dispositivo mediante puerto serie');
      add('Web NFC', false, 'Disponible solo en Android');
      add('Geolocalización', tieneGeo, '', tieneGeo ? null : 'Active la geolocalización en la configuración del sistema o del navegador');
      break;

    case 'web-safari':
      add('WebRTC', true);
      add('Web Bluetooth', false, 'No soportado en Safari');
      add('Web Serial', false, 'No soportado en Safari');
      add('Web NFC', false, 'No soportado en Safari');
      add('Geolocalización', tieneGeo, '', tieneGeo ? null : 'Active la geolocalización en la configuración del sistema');
      break;

    case 'web-firefox':
      add('WebRTC', true);
      add('Web Bluetooth', false, 'No soportado en Firefox');
      add('Web Serial', false, 'No soportado en Firefox');
      add('Web NFC', false, 'No soportado en Firefox');
      add('Geolocalización', tieneGeo, '', tieneGeo ? null : 'Active la geolocalización en la configuración del sistema');
      break;

    case 'android-chromium':
      add('WebRTC', true);
      add('Web Bluetooth', tieneBluetooth, '', tieneBluetooth ? null : 'Conecte un dispositivo Bluetooth y asegúrese de que esté activado');
      add('Web Serial', false, 'No disponible en Android');
      add('Web NFC', tieneNfc, '', tieneNfc ? null : 'Este dispositivo no tiene capacidades NFC');
      add('Geolocalización', tieneGeo, '', tieneGeo ? null : 'Active la geolocalización en la configuración del sistema');
      break;

    case 'tauri-escritorio':
      add('Faro UDP multicast', true);
      add('Meshtastic TCP', true);
      add('Radios por serie', tieneSerial, '', tieneSerial ? null : 'Conecte un dispositivo mediante puerto serie');
      add('Detección de Reticulum', true);
      break;

    case 'tauri-android':
      add('Servicio en primer plano', true);
      add('Bluetooth nativos', tieneBluetooth, '', tieneBluetooth ? null : 'Conecte un dispositivo Bluetooth y asegúrese de que esté activado');
      add('USB nativos', tieneSerial, '', tieneSerial ? null : 'Conecte un dispositivo mediante USB o puerto serie');
      break;
  }

  return result;
}