/**
 * Grabadora de pantalla del Centro de Control · tipos y constantes (puro, sin DOM).
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspirada en Cap (capsoftware/cap), la grabadora de pantalla abierta: aquí se hace lo que un
 * navegador PUEDE hacer de verdad (getDisplayMedia + MediaRecorder); lo que no, lo dice
 * `soporte.ts` con su motivo y su camino (grabador del sistema o la app de escritorio Cap).
 */

export type FuenteGrabacion = "pantalla" | "camara";
export type CalidadGrabacion = "ligera" | "estandar" | "alta";
export type PreferenciaFormato = "auto" | "mp4";
export type PosicionCamara = "abajo-derecha" | "abajo-izquierda" | "arriba-derecha" | "arriba-izquierda";
export type TamanoCamara = "pequena" | "mediana" | "grande";
export type CuentaAtras = 0 | 3 | 5;

export type FaseGrabadora =
  | "inactiva"
  | "preparando"
  | "cuenta-atras"
  | "grabando"
  | "pausada"
  | "procesando"
  | "lista"
  | "error";

/** Qué eligió el navegador compartir (`displaySurface`) o «camara» si es solo cámara. */
export type SuperficieGrabada = "monitor" | "window" | "browser" | "camara";

export interface OpcionesGrabacion {
  fuente: FuenteGrabacion;
  microfono: boolean;
  /** Pide el audio de lo compartido (solo Chromium de escritorio lo ofrece). */
  sonidoSistema: boolean;
  /** Imagen en imagen de la cámara sobre la pantalla (solo con fuente «pantalla»). */
  camaraSuperpuesta: boolean;
  cuentaAtras: CuentaAtras;
  calidad: CalidadGrabacion;
  formato: PreferenciaFormato;
  posicionCamara: PosicionCamara;
  tamanoCamara: TamanoCamara;
}

export const OPCIONES_POR_DEFECTO: OpcionesGrabacion = {
  fuente: "pantalla",
  microfono: false,
  sonidoSistema: false,
  camaraSuperpuesta: false,
  cuentaAtras: 3,
  calidad: "estandar",
  formato: "auto",
  posicionCamara: "abajo-derecha",
  tamanoCamara: "mediana",
};

export interface PerfilCalidad {
  etiqueta: string;
  /** Bits por segundo del vídeo. */
  bps: number;
  fps: number;
}

export const CALIDADES: Record<CalidadGrabacion, PerfilCalidad> = {
  ligera: { etiqueta: "Ligera", bps: 1_000_000, fps: 15 },
  estandar: { etiqueta: "Estándar", bps: 2_500_000, fps: 30 },
  alta: { etiqueta: "Alta", bps: 5_000_000, fps: 30 },
};

export const BPS_AUDIO = 128_000;

/** Límite honesto de la subida a la Biblioteca (el mismo que `MAX_UPLOAD_BYTES` de os-files). */
export const LIMITE_BIBLIOTECA_BYTES = 50 * 1024 * 1024;
/** La grabación se detiene sola aquí: los trozos viven en la memoria del aparato. */
export const LIMITE_AUTOPARADA_BYTES = 400 * 1024 * 1024;
/** Cada cuánto entrega trozos el MediaRecorder (ms): da el tamaño en vivo. */
export const TROZO_MS = 1000;

export interface ResultadoGrabacion {
  tipo: "video" | "imagen";
  blob: Blob;
  /** URL de objeto para la vista previa (se revoca al descartar). */
  url: string;
  /** Tipo MIME base, sin parámetros de códec (p. ej. «video/webm»). */
  mimeType: string;
  extension: string;
  nombre: string;
  bytes: number;
  duracionMs: number;
  ancho?: number;
  alto?: number;
  conAudio?: boolean;
}

export interface Instantanea {
  fase: FaseGrabadora;
  /** Segundos que faltan en la cuenta atrás. */
  cuenta: number;
  /** Duración ya confirmada (antes del tramo en curso). */
  acumuladoMs: number;
  /** Instante (reloj del controlador) en que empezó el tramo en curso; solo con `grabando`. */
  tramoDesde: number | null;
  bytes: number;
  superficie: SuperficieGrabada | null;
  /** Lo que de verdad entra en la grabación (puede ser menos de lo pedido). */
  conMicrofono: boolean;
  conSonidoSistema: boolean;
  conCamara: boolean;
  mimeType: string | null;
  /** Avisos que no impiden grabar («no se pudo usar la cámara…»). */
  avisos: string[];
  error: string | null;
  resultado: ResultadoGrabacion | null;
  captura: ResultadoGrabacion | null;
}

export const INSTANTANEA_INICIAL: Instantanea = Object.freeze({
  fase: "inactiva",
  cuenta: 0,
  acumuladoMs: 0,
  tramoDesde: null,
  bytes: 0,
  superficie: null,
  conMicrofono: false,
  conSonidoSistema: false,
  conCamara: false,
  mimeType: null,
  avisos: [],
  error: null,
  resultado: null,
  captura: null,
}) as Instantanea;
