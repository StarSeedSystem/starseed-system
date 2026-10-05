/**
 * StarSeed OS — CAMR · TIPOS (Ola 1005C · CAMR1005A).
 * ============================================================================
 * Capa de abstracción heterogénea del Enrutamiento Cognitivo Multiespectro.
 * Contrato: `architecture/camr-enrutamiento-cognitivo.md` (§1 y §3).
 *
 * Módulo PURO (sin react, sin navegador, sin `node:*`). Nunca lanza.
 */

/** Tecnologías de enlace físico que unifica el CAMR. */
export type Tecnologia =
  | "rns" // Reticulum/RNS (HF, VHF, UHF, LoRa por RNode)
  | "meshtastic" // puente Meshtastic (serie, BLE, HTTP)
  | "80211s" // malla Wi-Fi IEEE 802.11s
  | "babel" // malla IP con Babel
  | "batman" // B.A.T.M.A.N.-adv
  | "yggdrasil" // Yggdrasil (overlay cifrado)
  | "simulado"; // simulador interno del OS

/** Clases de tráfico CAMR (gobiernan la política del planificador, §3). */
export type ClaseTrafico =
  | "control-critico" // coordinación, emergencias, latidos
  | "mensajes" // chat, avisos
  | "tiempo-real" // voz, llamadas
  | "masivo"; // archivos, sync, medios

/** Estado operativo de un enlace físico. */
export type EstadoEnlace = "activo" | "degradado" | "caido" | "desconectado";

/** Medición instantánea de un enlace (§1: RSSI, SNR, BER/PER, ruido…). */
export interface Medicion {
  /** Intensidad de señal recibida (dBm), null si no aplica. */
  rssiDbm: number | null;
  /** Relación señal/ruido (dB), null si no aplica. */
  snrDb: number | null;
  /** Tasa de error de bits o de paquetes (0..1), null sin dato. */
  ber: number | null;
  /** Ruido de fondo del canal (dBm), null si no aplica. */
  ruidoDbm: number | null;
  /** Latencia del enlace en ms, null sin dato. */
  latenciaMs: number | null;
  /** Pérdida de paquetes de la ventana reciente (0..1), null sin dato. */
  perdida: number | null;
  /** Tiempo de aire usado por el canal compartido (0..1), null sin dato. */
  tiempoAireUsado: number | null;
  /** Número de vecinos alcanzables por este enlace. */
  vecinos: number;
  /** Ancho de banda disponible estimado (kbps), null sin dato. */
  anchoBandaKbps: number | null;
  /** epoch ms de la medición. */
  at: number;
}

/** Parámetros de radio que el motor puede proponer o aplicar (§2). */
export interface ParametrosRadio {
  /** Canal o frecuencia central (MHz). */
  frecuenciaMhz: number;
  /** Potencia de transmisión (dBm, antes de la antena). */
  potenciaDbm: number;
  /** Ancho de canal (MHz). */
  anchoBandaMhz?: number;
  /** Factor de dispersión LoRa (7..12), si aplica. */
  spreadFactor?: number;
  /** Tasa de codificación LoRa ("4/5", "4/8"), si aplica. */
  codingRate?: string;
  /** Estación de modulación Wi-Fi (MCS 0..11), si aplica. */
  mcs?: number;
  /** Ganancia de la antena (dBi). */
  gananciaAntenaDbi?: number;
  /** Pérdidas de cable y conectores (dB). */
  perdidasDb?: number;
}

/** Un enlace físico heterogéneo bajo el CAMR. */
export interface EnlaceFisico {
  /** Identificador único del enlace. */
  id: string;
  tecnologia: Tecnologia;
  /** Banda lógica (p.ej. "EU_868", "wifi-5g", "ham-2m"). */
  banda: string;
  /** Frecuencia central actual (MHz). */
  frecuenciaMhz: number;
  /** Capacidad nominal del medio (kbps). */
  capacidadKbps: number;
  /** MTU del enlace (bytes); el CAMR trocea al cruzar tecnologías. */
  mtu: number;
  /** ¿El medio permite cifrar el contenido? (false en radioaficionado, §5). */
  cifradoPermitido: boolean;
  estado: EstadoEnlace;
  /** Última medición cruda. */
  medir(): Medicion;
  /**
   * Aplica parámetros de radio. Con `opts.seco` (por defecto true) solo valida
   * y simula el resultado sin tocar el hardware.
   */
  aplicar(params: ParametrosRadio, opts: { seco: boolean }): Promise<{ ok: boolean; error?: string }>;
  /** Envía un paquete por este enlace con la clase de tráfico del mensaje. */
  enviar(paquete: Uint8Array, clase: ClaseTrafico): Promise<{ ok: boolean; error?: string }>;
}

/** Registro de una decisión del planificador (visible en el panel, §6). */
export interface Decision {
  /** Enlace elegido (primario). */
  enlaceId: string;
  /** Enlace redundante (control-critico usa dos caminos si existen). */
  enlaceRedundanteId?: string;
  /** Clase de tráfico que originó la decisión. */
  clase: ClaseTrafico;
  /** Por qué (transparencia radical para el panel). */
  motivo: string;
  /** Puntuación híbrida del enlace elegido (0..1). */
  puntuacion: number;
  /** epoch ms de la decisión. */
  at: number;
}
