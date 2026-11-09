/**
 * video-datos/tipos — contratos del vídeo ligero por enlace de datos (LLA1108H).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Puro (solo tipos y constantes). Todo lo que toca el navegador (WebCodecs, canvas, cámara) se inyecta
 * detrás de estas interfaces, así la sesión se prueba con falsos en jsdom.
 */

export const CODECS_VIDEO = ["vp8", "h264", "jpeg"] as const;
export type CodecVideo = (typeof CODECS_VIDEO)[number];

export function esCodecVideo(c: unknown): c is CodecVideo {
  return typeof c === "string" && (CODECS_VIDEO as readonly string[]).includes(c);
}

/** Un escalón de calidad: resolución, fotogramas por segundo, tasa objetivo y cada cuánto un fotograma clave. */
export interface PerfilVideo {
  w: number;
  h: number;
  fps: number;
  kbps: number;
  /** ms entre fotogramas clave (≈ 2 s). */
  kfMs: number;
}

/** Lo que captura la fuente en cada tic: `imagen` es opaco (VideoFrame, canvas…); solo el códec lo entiende. */
export interface FrameFuente {
  imagen: unknown;
  w: number;
  h: number;
  ts: number;
}

export interface FrameCodificado {
  clave: boolean;
  bytes: Uint8Array;
  ts: number;
  w: number;
  h: number;
}

export interface CodificadorVideo {
  configurar(p: PerfilVideo): void;
  codificar(f: FrameFuente, clave: boolean): void;
  alSalir(cb: (f: FrameCodificado) => void): void;
  cerrar(): void;
}

export interface ImagenDecodificada {
  /** VideoFrame, ImageBitmap o lo que sepa pintar la salida. */
  imagen: unknown;
  w: number;
  h: number;
  /** Quien la recibe debe llamar a esto cuando la haya pintado (VideoFrame.close()). */
  liberar?: () => void;
}

export interface DecodificadorVideo {
  decodificar(f: FrameCodificado): void;
  alImagen(cb: (i: ImagenDecodificada) => void): void;
  /** El decodificador se atascó (necesita un fotograma clave). */
  alError(cb: () => void): void;
  cerrar(): void;
}

export interface FabricaVideo {
  /** Códecs que ESTE aparato sabe codificar. */
  codificables(): CodecVideo[];
  /** Códecs que ESTE aparato sabe decodificar. */
  decodificables(): CodecVideo[];
  codificador(c: CodecVideo): CodificadorVideo | null;
  decodificador(c: CodecVideo): DecodificadorVideo | null;
}

/** La cámara (o la pantalla) reducida: devuelve un fotograma al tamaño pedido, o null si aún no hay imagen. */
export interface FuenteVideo {
  capturar(w: number, h: number): FrameFuente | null;
  cerrar(): void;
}

/** Dónde se pinta el vídeo que llega: un `MediaStream` (canvas.captureStream) que el mosaico ya sabe enseñar. */
export interface SalidaVideo {
  stream: MediaStream | null;
  pintar(i: ImagenDecodificada): void;
  cerrar(): void;
}

/** Lo que la sesión necesita del enlace, además de lo de la voz (todo opcional: sin ello se usa el texto de voz). */
export interface TransporteVideo {
  enviar(texto: string): "ok" | "descartado" | "cerrado";
  /** Cola propia del vídeo, siempre por detrás de la voz. */
  enviarVideo?(texto: string): "ok" | "descartado" | "cerrado";
  colaVozBytes?(): number;
  colaVideoBytes?(): number;
  ocupado(): boolean;
  alRecibir(cb: (texto: string) => void): () => void;
  abierto(): boolean;
  /** Capacidad medida o anunciada del enlace (kbps); null si no se sabe. */
  capacidadKbps?(): number | null;
  /** Bytes útiles máximos por fragmento (MTU del enlace). */
  mtu?(): number | null;
}

/** Escalones de calidad, de menos a más. 160×120 a 4 fps y 40 kbps es el suelo; 320×240 a 12 fps y 150 kbps, el techo. */
export const PERFILES_VIDEO: readonly PerfilVideo[] = [
  { w: 160, h: 120, fps: 4, kbps: 40, kfMs: 2000 },
  { w: 160, h: 120, fps: 6, kbps: 55, kfMs: 2000 },
  { w: 192, h: 144, fps: 8, kbps: 75, kfMs: 2000 },
  { w: 240, h: 180, fps: 10, kbps: 100, kfMs: 2000 },
  { w: 320, h: 240, fps: 10, kbps: 130, kfMs: 2000 },
  { w: 320, h: 240, fps: 12, kbps: 150, kfMs: 2000 },
];

/** Pantalla compartida por Bluetooth: apenas un fotograma por segundo, solo si no estorba. */
export const PERFIL_PANTALLA_LIGERA: PerfilVideo = { w: 320, h: 180, fps: 1, kbps: 30, kfMs: 3000 };

/** Lo que cuesta la voz ADPCM empaquetada en texto (≈ 16 kbps de audio ×1,4 de base64 y cabeceras). */
export const KBPS_VOZ_RESERVADOS = 28;
