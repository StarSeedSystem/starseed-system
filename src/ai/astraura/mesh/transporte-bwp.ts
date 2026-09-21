export type TransporteBwp =
  | "wifi-halo"
  | "reticulum"
  | "wifi-mesh"
  | "webrtc-local"
  | "usb-serial";

export interface DescripcionTransporteBwp {
  etiqueta: string;
  alcanceLectura: string;
  latencia: string;
  requiereHardware: boolean;
  prioridad: number;
}

export interface VinculoBwp {
  transporte: TransporteBwp;
  rssi?: number;
  tasaKbps?: number;
}

export interface EstadoTransporteBwp {
  online: boolean;
  mejor: TransporteBwp | null;
  totalKbps: number;
}

/** Menor número significa mayor prioridad de enlace. */
export const TRANSPORTES_BWP: Record<TransporteBwp, DescripcionTransporteBwp> = {
  "wifi-halo": {
    etiqueta: "Wi-Fi HaLow",
    alcanceLectura: "Hasta 1 km en campo abierto",
    latencia: "Baja",
    requiereHardware: true,
    prioridad: 1,
  },
  reticulum: {
    etiqueta: "Reticulum",
    alcanceLectura: "Según la interfaz de radio o red disponible",
    latencia: "Variable",
    requiereHardware: false,
    prioridad: 2,
  },
  "wifi-mesh": {
    etiqueta: "Wi-Fi Mesh",
    alcanceLectura: "Local, ampliable por saltos",
    latencia: "Baja",
    requiereHardware: false,
    prioridad: 3,
  },
  "webrtc-local": {
    etiqueta: "WebRTC local",
    alcanceLectura: "Red local entre navegadores",
    latencia: "Muy baja",
    requiereHardware: false,
    prioridad: 4,
  },
  "usb-serial": {
    etiqueta: "USB serie",
    alcanceLectura: "Conexión física directa",
    latencia: "Muy baja",
    requiereHardware: true,
    prioridad: 5,
  },
};

export function transportesOrdenados(
  disponibles: TransporteBwp[],
  preferido?: TransporteBwp,
): TransporteBwp[] {
  if (!preferido) return [...disponibles];

  const indicePreferido = disponibles.indexOf(preferido);
  if (indicePreferido < 0) return [...disponibles];

  const ordenados = [...disponibles];
  const [seleccionado] = ordenados.splice(indicePreferido, 1);
  return [seleccionado, ...ordenados];
}

export function estadoTransporte(vinculos: VinculoBwp[]): EstadoTransporteBwp {
  const mejor = vinculos.reduce<VinculoBwp | null>((actual, vinculo) => {
    if (!actual) return vinculo;
    return TRANSPORTES_BWP[vinculo.transporte].prioridad <
      TRANSPORTES_BWP[actual.transporte].prioridad
      ? vinculo
      : actual;
  }, null);

  const totalKbps = vinculos.reduce(
    (total, vinculo) => total + (vinculo.tasaKbps ?? 0),
    0,
  );

  return {
    online: vinculos.length > 0,
    mejor: mejor?.transporte ?? null,
    totalKbps,
  };
}
