import { Plataforma } from './cristal/permisos-antenas';

export interface EstadoTransporte {
  transporte: string;
  disponible: boolean;
  motivo: string;
}

export interface ResumenTransportes {
  detectados: EstadoTransporte[];
  usables: EstadoTransporte[];
  pendientes: EstadoTransporte[];
}

type ParametrosDeteccion = {
  plataforma: Plataforma;
  tieneBluetooth: boolean;
  tieneSerial: boolean;
  tieneNfc: boolean;
  tieneGeo: boolean;
};

const MOTIVOS_PENDIENTES_INHERENTES: Record<string, Record<string, string>> = {
  'web-chromium': {
    'Web Bluetooth': 'Pendiente: btleplug en escritorio, plugin Kotlin en Android',
    'Web Serial': 'Pendiente: serie en Windows/Android',
    'Web NFC': 'No disponible en el navegador actual',
  },
  'web-safari': {
    'Web Bluetooth': 'No soportado en Safari',
    'Web Serial': 'No soportado en Safari',
    'Web NFC': 'No soportado en Safari',
  },
  'web-firefox': {
    'Web Bluetooth': 'No soportado en Firefox',
    'Web Serial': 'No soportado en Firefox',
    'Web NFC': 'No soportado en Firefox',
  },
  'android-chromium': {
    'Web Serial': 'No disponible en Android',
    'Web Bluetooth': 'Pendiente: btleplug en escritorio, plugin Kotlin en Android',
  },
  'tauri-escritorio': {
    'Detección de Reticulum': 'Pendiente: solo detección, transporte RNS es una ola aparte',
  },
  'tauri-android': {
    'Bluetooth nativos': 'Pendiente: btleplug en escritorio, plugin Kotlin en Android',
    'USB nativos': 'Pendiente: serie en Windows/Android',
  },
};

function transportesPorPlataforma(p: ParametrosDeteccion): EstadoTransporte[] {
  const { plataforma, tieneBluetooth, tieneSerial, tieneNfc, tieneGeo } = p;
  const resultado: EstadoTransporte[] = [];

  const add = (transporte: string, disponible: boolean, motivo = '') => {
    resultado.push({ transporte, disponible, motivo });
  };

  switch (plataforma) {
    case 'web-chromium':
      add('WebRTC', true);
      add('Web Bluetooth', tieneBluetooth, tieneBluetooth ? '' : 'Conecte un dispositivo Bluetooth y asegúrese de que esté activado');
      add('Web Serial', tieneSerial, tieneSerial ? '' : 'Conecte un dispositivo mediante puerto serie');
      add('Web NFC', false, 'No disponible en el navegador actual');
      add('Geolocalización', tieneGeo, tieneGeo ? '' : 'Active la geolocalización en la configuración del sistema o del navegador');
      break;

    case 'web-safari':
      add('WebRTC', true);
      add('Web Bluetooth', false, 'No soportado en Safari');
      add('Web Serial', false, 'No soportado en Safari');
      add('Web NFC', false, 'No soportado en Safari');
      add('Geolocalización', tieneGeo, tieneGeo ? '' : 'Active la geolocalización en la configuración del sistema');
      break;

    case 'web-firefox':
      add('WebRTC', true);
      add('Web Bluetooth', false, 'No soportado en Firefox');
      add('Web Serial', false, 'No soportado en Firefox');
      add('Web NFC', false, 'No soportado en Firefox');
      add('Geolocalización', tieneGeo, tieneGeo ? '' : 'Active la geolocalización en la configuración del sistema');
      break;

    case 'android-chromium':
      add('WebRTC', true);
      add('Web Bluetooth', tieneBluetooth, tieneBluetooth ? '' : 'Conecte un dispositivo Bluetooth y asegúrese de que esté activado');
      add('Web Serial', false, 'No disponible en Android');
      add('Web NFC', tieneNfc, tieneNfc ? '' : 'Este dispositivo no tiene capacidades NFC');
      add('Geolocalización', tieneGeo, tieneGeo ? '' : 'Active la geolocalización en la configuración del sistema');
      break;

    case 'tauri-escritorio':
      add('Faro UDP multicast', true);
      add('Meshtastic TCP', true);
      add('Radios por serie', tieneSerial, tieneSerial ? '' : 'Conecte un dispositivo mediante puerto serie');
      add('Detección de Reticulum', true);
      break;

    case 'tauri-android':
      add('Servicio en primer plano', true);
      add('Bluetooth nativos', tieneBluetooth, tieneBluetooth ? '' : 'Conecte un dispositivo Bluetooth y asegúrese de que esté activado');
      add('USB nativos', tieneSerial, tieneSerial ? '' : 'Conecte un dispositivo mediante USB o puerto serie');
      break;
  }

  return resultado;
}

function clasificarTransportes(transportes: EstadoTransporte[], plataforma: Plataforma): ResumenTransportes {
  const inherentementePendientes = MOTIVOS_PENDIENTES_INHERENTES[plataforma] ?? {};

  const detectados = transportes.filter((t) => t.disponible || t.motivo !== '');
  const usables = transportes.filter((t) => t.disponible && t.motivo === '' && !inherentementePendientes[t.transporte]);
  const pendientes: EstadoTransporte[] = [];

  for (const t of transportes) {
    const esInherentementePendiente = inherentementePendientes[t.transporte];
    const noDisponible = !t.disponible || t.motivo !== '';

    if (esInherentementePendiente || noDisponible) {
      const motivo = esInherentementePendiente ?? t.motivo;
      if (motivo) {
        pendientes.push({ ...t, motivo });
      }
    }
  }

  return { detectados, usables, pendientes };
}

export function resumenTransportes(p: ParametrosDeteccion): ResumenTransportes {
  const transportes = transportesPorPlataforma(p);
  return clasificarTransportes(transportes, p.plataforma);
}