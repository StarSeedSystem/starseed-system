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
  /** VID1110A: el códec falló (configuración no aceptada, fotograma rechazado…). Antes se tragaba en silencio. */
  alError?(cb: (mensaje: string) => void): void;
  /** LLA1110C: aún tiene fotogramas en cola (no da abasto); la sesión no le mete otro y lo cuenta como descarte «códec». */
  ocupado?(): boolean;
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
  /** El decodificador se atascó (necesita un fotograma clave). VID1110A: con el motivo, para el registro. */
  alError(cb: (mensaje?: string) => void): void;
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
  /** VID1110A: cuántos fotogramas dio la cámara de verdad y cuántos eran negros (cámara tapada o de Continuidad sin imagen). */
  diagnostico?(): { vistos: number; negros: number; vivo: boolean; pausada?: boolean; listo?: number; errorPlay?: string };
  /** LLA1110C: por qué el último `capturar` devolvió null («sin-datos», «pausada», «quieta», «cerrada»). */
  motivoSinImagen?(): string | null;
  cerrar(): void;
}

/** Dónde se pinta el vídeo que llega: un `MediaStream` (canvas.captureStream) que el mosaico ya sabe enseñar. */
export interface SalidaVideo {
  /** VID1110A: el `canvas` donde se pinta TODO lo que llega. La superficie lo monta tal cual en el mosaico (ruta robusta en WKWebView y Chromium). */
  lienzo?: HTMLCanvasElement | null;
  /** Solo para grabar o para quien necesite un MediaStream; se crea al pedirlo (`captureStream` de un canvas sin pintar da negro). */
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
  /** VID1110A: tope de la cola de vídeo del enlace en bytes de texto (Bluetooth: 24 KiB, lo viejo se tira). */
  topeColaVideoBytes?(): number | null;
  /**
   * LLA1111B: bytes que entraron en el carril de la voz desde que se abrió (voz + vídeo + controles). Con él y
   * `colaVozBytes` la sesión mide lo que el enlace acusa de verdad y reparte: el vídeo va en el MISMO carril que la voz
   * (ver `reparto.ts`). Sin él, el vídeo va por su cola propia como antes.
   */
  bytesEntrados?(): number;
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

/**
 * LLA1111B · escalera del reparto (voz y vídeo en el mismo carril estrecho). Más fina y más barata por fotograma que
 * `PERFILES_VIDEO`: a 160×120, 4–7 kbit por fotograma ya dan una imagen reconocible (≈ 0,2–0,4 bits por píxel), y lo
 * que se ahorra se convierte en fotogramas por segundo. De arriba abajo baja primero los fps y luego el tamaño; abajo
 * del todo quedan 3 → 2 → 1 fps a 160×120 antes de pausar (el de 1 fps es el suelo, `SUELO_KBPS` en `reparto.ts`).
 * Lo que de verdad cuesta cada escalón en el carril lo mide `CosteEscalon` (el códec rara vez gasta lo configurado).
 */
export const PERFILES_VIDEO_REPARTO: readonly PerfilVideo[] = [
  { w: 160, h: 120, fps: 1, kbps: 6, kfMs: 8000 },
  { w: 160, h: 120, fps: 2, kbps: 10, kfMs: 6000 },
  { w: 160, h: 120, fps: 3, kbps: 14, kfMs: 5000 },
  { w: 160, h: 120, fps: 4, kbps: 18, kfMs: 5000 },
  { w: 160, h: 120, fps: 5, kbps: 22, kfMs: 5000 },
  { w: 160, h: 120, fps: 6, kbps: 27, kfMs: 5000 },
  { w: 192, h: 144, fps: 6, kbps: 34, kfMs: 5000 },
  { w: 192, h: 144, fps: 8, kbps: 44, kfMs: 4000 },
  { w: 240, h: 180, fps: 10, kbps: 65, kfMs: 4000 },
  { w: 320, h: 240, fps: 10, kbps: 95, kfMs: 3000 },
  { w: 320, h: 240, fps: 12, kbps: 115, kfMs: 3000 },
];

/** Pantalla compartida por Bluetooth: apenas un fotograma por segundo, solo si no estorba. */
export const PERFIL_PANTALLA_LIGERA: PerfilVideo = { w: 320, h: 180, fps: 1, kbps: 30, kfMs: 3000 };

/** Lo que cuesta la voz ADPCM empaquetada en texto (≈ 16 kbps de audio ×1,4 de base64 y cabeceras). */
export const KBPS_VOZ_RESERVADOS = 28;

/** VID1110A: contadores por sentido que la sesión anota cada 5 s en el registro del enlace. */
export interface ContadoresVideoTx {
  capturados: number;
  codificados: number;
  enviados: number;
  descartados: number;
  clave: number;
  kbps: number;
  /** Fotogramas de la cámara que eran negros del todo. */
  negros: number;
  erroresCodec: number;
  /** LLA1110C: cada descarte con su motivo (ver `MotivoDescarteVideo`). */
  motivos: Partial<Record<MotivoDescarteVideo, number>>;
}

/**
 * LLA1110C · por qué no salió un fotograma (el registro los cuenta por separado):
 *  · `enlace-ocupado`: la voz llena la cola del enlace (contrapresión real) · `cola-video`: la cola de vídeo del enlace va llena;
 *  · `saliendo`: aún sale a trozos el fotograma anterior · `caducado`: llevaba demasiado esperando sitio;
 *  · `presupuesto`: pasaba de la tasa del escalón · `sustituido`: un clave nuevo reemplazó al que salía;
 *  · `codec`: el códec no da abasto · `sin-imagen`: la cámara no dio fotograma nuevo · `trocear`: no cupo en fragmentos;
 *  · `enlace-tiro`: el enlace tiró fragmentos al pasar su tope · `pausa` (LLA1111B): el vídeo está en pausa porque la
 *    señal solo alcanza para la voz (no se captura).
 */
export type MotivoDescarteVideo = "pausa" | "enlace-ocupado" | "cola-video" | "saliendo" | "caducado" | "presupuesto" | "sustituido" | "codec" | "sin-imagen" | "trocear" | "enlace-tiro";
export interface ContadoresVideoRx {
  paquetes: number;
  cuadros: number;
  decodificados: number;
  pintados: number;
  errores: number;
  ultimoError: string;
}
