"use client";

/**
 * video-datos/codec-web — WebCodecs (VP8 / H.264 baseline) o JPEG de canvas para el vídeo ligero (LLA1108H).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Solo donde `isConfigSupported` lo confirme se usa WebCodecs:
 *   · VP8   `vp8`           — WebView de Android (Chromium) y navegadores de escritorio.
 *   · H.264 `avc1.42001e`   — baseline nivel 3.0, Annex B, `latencyMode: "realtime"` (Safari/WKWebView de Mac y Chromium).
 * Si falta WebCodecs de vídeo, JPEG desde un canvas a muy pocos fotogramas por segundo. Nunca lanza.
 * Cada lado anuncia lo que sabe DECODIFICAR y el que emite elige entre lo que sabe CODIFICAR (ver sesion-video.ts).
 */
import { quitarLienzoVivo, registrarLienzoVivo } from "./lienzos";
import type { CodecVideo, CodificadorVideo, DecodificadorVideo, FabricaVideo, FrameCodificado, FrameFuente, FuenteVideo, ImagenDecodificada, PerfilVideo, SalidaVideo } from "./tipos";

/* ───────────── Lo mínimo de WebCodecs que usamos (sin depender de lib.dom) ───────────── */

interface ChunkCodificado {
  type: "key" | "delta";
  byteLength: number;
  copyTo(b: Uint8Array): void;
}
interface FrameWC {
  displayWidth: number;
  displayHeight: number;
  close(): void;
}
interface VideoEncoderWC {
  configure(c: Record<string, unknown>): void;
  encode(f: unknown, o?: { keyFrame?: boolean }): void;
  close(): void;
  encodeQueueSize?: number;
  state?: string;
}
interface VideoDecoderWC {
  configure(c: Record<string, unknown>): void;
  decode(c: unknown): void;
  close(): void;
  state?: string;
}
interface WebCodecsVideo {
  VideoEncoder?: { new (i: { output: (c: ChunkCodificado) => void; error: (e: unknown) => void }): VideoEncoderWC; isConfigSupported(c: Record<string, unknown>): Promise<{ supported?: boolean }> };
  VideoDecoder?: { new (i: { output: (f: FrameWC) => void; error: (e: unknown) => void }): VideoDecoderWC; isConfigSupported(c: Record<string, unknown>): Promise<{ supported?: boolean }> };
  VideoFrame?: new (src: unknown, init: { timestamp: number }) => { close(): void };
  EncodedVideoChunk?: new (i: { type: "key" | "delta"; timestamp: number; data: Uint8Array }) => unknown;
}

const g = (): WebCodecsVideo => globalThis as unknown as WebCodecsVideo;

const CFG_CODEC: Record<"vp8" | "h264", { codec: string; extra: Record<string, unknown> }> = {
  vp8: { codec: "vp8", extra: {} },
  h264: { codec: "avc1.42001e", extra: { avc: { format: "annexb" } } },
};

async function soportado(c: "vp8" | "h264"): Promise<{ enc: boolean; dec: boolean }> {
  const w = g();
  try {
    if (!w.VideoEncoder || !w.VideoDecoder || !w.VideoFrame || !w.EncodedVideoChunk) return { enc: false, dec: false };
    const cfg = CFG_CODEC[c];
    const [e, d] = await Promise.all([
      w.VideoEncoder.isConfigSupported({ codec: cfg.codec, width: 160, height: 120, bitrate: 40_000, framerate: 4, latencyMode: "realtime", ...cfg.extra }),
      w.VideoDecoder.isConfigSupported({ codec: cfg.codec }),
    ]);
    return { enc: !!e?.supported, dec: !!d?.supported };
  } catch {
    return { enc: false, dec: false };
  }
}

/* ───────────────────────────── VP8 / H.264 ───────────────────────────── */

function codificadorWebCodecs(c: "vp8" | "h264"): CodificadorVideo | null {
  const w = g();
  if (!w.VideoEncoder || !w.VideoFrame) return null;
  const Enc = w.VideoEncoder;
  const Fr = w.VideoFrame;
  let cb: (f: FrameCodificado) => void = () => undefined;
  let perfil: PerfilVideo | null = null;
  let tsUltimo = 0;
  let enc: VideoEncoderWC | null = null;
  let cbError: (m: string) => void = () => undefined;
  const fallo = (e: unknown) => {
    try {
      cbError(e instanceof Error ? e.message || e.name : typeof e === "string" ? e : "error del codificador");
    } catch {
      /* el aviso no tumba el vídeo */
    }
  };
  const abrir = (): VideoEncoderWC | null => {
    try {
      const e = new Enc({
        output: (chunk) => {
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          cb({ clave: chunk.type === "key", bytes, ts: tsUltimo, w: perfil?.w ?? 0, h: perfil?.h ?? 0 });
        },
        error: (e) => {
          enc = null; // se reabre en el próximo fotograma, que irá clave
          fallo(e);
        },
      });
      return e;
    } catch (e) {
      fallo(e);
      return null;
    }
  };
  const configurar = (p: PerfilVideo) => {
    perfil = p;
    try {
      if (!enc) enc = abrir();
      enc?.configure({ codec: CFG_CODEC[c].codec, width: p.w, height: p.h, bitrate: p.kbps * 1000, framerate: p.fps, latencyMode: "realtime", ...CFG_CODEC[c].extra });
    } catch (e) {
      enc = null;
      fallo(e);
    }
  };
  return {
    configurar,
    /** LLA1110C: el códec aún tiene fotogramas en cola; la sesión no captura otro (y lo cuenta como descarte «códec»). */
    ocupado: () => (enc?.encodeQueueSize ?? 0) > 2,
    codificar(f: FrameFuente, clave: boolean) {
      if (!perfil) return;
      if (!enc) configurar(perfil);
      if (!enc) return;
      // Cola del códec crecida = no da abasto: este fotograma se salta (el siguiente no tiene por qué ir clave).
      if ((enc.encodeQueueSize ?? 0) > 2) return;
      try {
        tsUltimo = f.ts;
        const vf = new Fr(f.imagen, { timestamp: Math.round(f.ts * 1000) });
        enc.encode(vf, { keyFrame: clave });
        vf.close();
      } catch (e) {
        enc = null;
        fallo(e);
      }
    },
    alSalir(f) {
      cb = f;
    },
    alError(f) {
      cbError = f;
    },
    cerrar() {
      try {
        enc?.close();
      } catch {
        /* noop */
      }
      enc = null;
    },
  };
}

function decodificadorWebCodecs(c: "vp8" | "h264"): DecodificadorVideo | null {
  const w = g();
  if (!w.VideoDecoder || !w.EncodedVideoChunk) return null;
  const Dec = w.VideoDecoder;
  const Chunk = w.EncodedVideoChunk;
  let cbImg: (i: ImagenDecodificada) => void = () => undefined;
  let cbErr: (m?: string) => void = () => undefined;
  let dec: VideoDecoderWC | null = null;
  let hayClave = false;
  const msg = (e: unknown) => (e instanceof Error ? e.message || e.name : typeof e === "string" ? e : "error del decodificador");
  const abrir = (): VideoDecoderWC | null => {
    try {
      const d = new Dec({
        output: (f) => cbImg({ imagen: f, w: f.displayWidth, h: f.displayHeight, liberar: () => f.close() }),
        error: (e) => {
          dec = null;
          hayClave = false;
          cbErr(msg(e));
        },
      });
      d.configure({ codec: CFG_CODEC[c].codec });
      return d;
    } catch (e) {
      cbErr(msg(e));
      return null;
    }
  };
  return {
    decodificar(f: FrameCodificado) {
      if (!dec) {
        if (!f.clave) return cbErr("diferencial sin clave previa");
        dec = abrir();
      }
      if (!dec) return;
      if (f.clave) hayClave = true;
      if (!hayClave) return;
      try {
        dec.decode(new Chunk({ type: f.clave ? "key" : "delta", timestamp: Math.round(f.ts * 1000), data: f.bytes }));
      } catch (e) {
        dec = null;
        hayClave = false;
        cbErr(msg(e));
      }
    },
    alImagen(cb) {
      cbImg = cb;
    },
    alError(cb) {
      cbErr = cb;
    },
    cerrar() {
      try {
        dec?.close();
      } catch {
        /* noop */
      }
      dec = null;
    },
  };
}

/* ───────────────────────────── JPEG (respaldo) ───────────────────────────── */

interface LienzoJpeg {
  width: number;
  height: number;
  toDataURL(tipo: string, calidad?: number): string;
}

/** Como mucho este número de fotogramas por segundo en JPEG (cada uno es un fotograma completo). */
export const FPS_MAX_JPEG = 3;

function bytesDeDataUrl(url: string): Uint8Array | null {
  const i = url.indexOf(",");
  if (i < 0) return null;
  try {
    const bin = atob(url.slice(i + 1));
    const out = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) out[k] = bin.charCodeAt(k);
    return out;
  } catch {
    return null;
  }
}

function codificadorJpeg(): CodificadorVideo {
  let cb: (f: FrameCodificado) => void = () => undefined;
  let perfil: PerfilVideo | null = null;
  let calidad = 0.5;
  let n = 0;
  return {
    configurar(p) {
      perfil = p;
      n = 0;
    },
    codificar(f: FrameFuente, clave: boolean) {
      if (!perfil) return;
      const cada = Math.max(1, Math.ceil(perfil.fps / FPS_MAX_JPEG));
      if (!clave && n++ % cada !== 0) return;
      const lienzo = f.imagen as LienzoJpeg | null;
      if (!lienzo || typeof lienzo.toDataURL !== "function") return;
      let bytes: Uint8Array | null = null;
      try {
        bytes = bytesDeDataUrl(lienzo.toDataURL("image/jpeg", calidad));
      } catch {
        bytes = null;
      }
      if (!bytes) return;
      // Ajusta la calidad a la tasa pedida con los fotogramas por segundo reales de JPEG.
      const objetivo = (perfil.kbps * 1000) / 8 / Math.min(perfil.fps, FPS_MAX_JPEG);
      if (bytes.length > objetivo * 1.2) calidad = Math.max(0.2, calidad - 0.08);
      else if (bytes.length < objetivo * 0.6) calidad = Math.min(0.8, calidad + 0.05);
      cb({ clave: true, bytes, ts: f.ts, w: f.w, h: f.h });
    },
    alSalir(f) {
      cb = f;
    },
    cerrar() {
      /* nada que cerrar */
    },
  };
}

function decodificadorJpeg(): DecodificadorVideo | null {
  const crear = (globalThis as unknown as { createImageBitmap?: (b: Blob) => Promise<{ width: number; height: number; close(): void }> }).createImageBitmap;
  if (typeof crear !== "function" || typeof Blob === "undefined") return null;
  let cbImg: (i: ImagenDecodificada) => void = () => undefined;
  let cbErr: (m?: string) => void = () => undefined;
  let vivo = true;
  return {
    decodificar(f) {
      void crear(new Blob([f.bytes as BlobPart], { type: "image/jpeg" }))
        .then((bm) => {
          if (!vivo) return bm.close();
          cbImg({ imagen: bm, w: bm.width, h: bm.height, liberar: () => bm.close() });
        })
        .catch(() => cbErr("jpeg ilegible"));
    },
    alImagen(cb) {
      cbImg = cb;
    },
    alError(cb) {
      cbErr = cb;
    },
    cerrar() {
      vivo = false;
    },
  };
}

function hayCanvas(): boolean {
  try {
    return typeof document !== "undefined" && typeof document.createElement === "function" && !!document.createElement("canvas").getContext;
  } catch {
    return false;
  }
}

/** La fábrica real: detecta qué ofrece este aparato. Siempre devuelve una (puede no tener nada que codificar). */
export async function crearFabricaVideoWeb(): Promise<FabricaVideo> {
  const [vp8, h264] = await Promise.all([soportado("vp8"), soportado("h264")]);
  const jpegDec = decodificadorJpeg() !== null;
  const jpegEnc = hayCanvas();
  const codificables: CodecVideo[] = [...(vp8.enc ? (["vp8"] as const) : []), ...(h264.enc ? (["h264"] as const) : []), ...(jpegEnc ? (["jpeg"] as const) : [])];
  const decodificables: CodecVideo[] = [...(vp8.dec ? (["vp8"] as const) : []), ...(h264.dec ? (["h264"] as const) : []), ...(jpegDec ? (["jpeg"] as const) : [])];
  return {
    codificables: () => codificables,
    decodificables: () => decodificables,
    codificador: (c) => (c === "jpeg" ? (jpegEnc ? codificadorJpeg() : null) : codificables.includes(c) ? codificadorWebCodecs(c) : null),
    decodificador: (c) => (c === "jpeg" ? decodificadorJpeg() : decodificables.includes(c) ? decodificadorWebCodecs(c) : null),
  };
}

/* ───────────────────────────── Cámara reducida y salida ───────────────────────────── */

/** VID1110A: un fotograma «negro» tiene todas las muestras por debajo de este brillo (0..255). */
const BRILLO_NEGRO = 10;

/** ¿Es negro este canvas? Mira una rejilla de ≤ 16×12 muestras; si no puede leerlo, dice que no (no inventa un fallo). */
export function lienzoEsNegro(ctx: { getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> } }, w: number, h: number): boolean {
  try {
    const datos = ctx.getImageData(0, 0, w, h).data;
    const pasoX = Math.max(1, Math.floor(w / 16));
    const pasoY = Math.max(1, Math.floor(h / 12));
    for (let y = 0; y < h; y += pasoY) {
      for (let x = 0; x < w; x += pasoX) {
        const o = (y * w + x) * 4;
        if (Math.max(datos[o], datos[o + 1], datos[o + 2]) > BRILLO_NEGRO) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** LLA1110C: por qué la fuente no dio imagen en el último intento (para los motivos de descarte del registro). */
export type MotivoSinImagen = "sin-datos" | "pausada" | "quieta" | "cerrada";

/**
 * La cámara (o la pantalla) como fuente: un <video> y un canvas al tamaño pedido (recorte centrado).
 * VID1110A: el <video> SE MONTA en el documento (WKWebView y algunos Chromium no decodifican un <video> suelto).
 * LLA1110C: ya no fuera de la pantalla. WebKit PAUSA un <video> silenciado que no está en el viewport (ahorro de energía)
 * y deja de entregar fotogramas nuevos: se queda dentro de la ventana, en una esquina, de 2×2 px y casi transparente.
 * Además no se manda dos veces el MISMO fotograma: si el <video> no avanzó desde la última captura, se dice «quieta»
 * (antes se codificaba otra vez la imagen congelada, o negra, y se contaba como enviada).
 */
export function crearFuenteDePista(pista: MediaStreamTrack): FuenteVideo | null {
  if (typeof document === "undefined" || typeof MediaStream !== "function") return null;
  try {
    const video = document.createElement("video") as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.setAttribute("aria-hidden", "true");
    video.setAttribute("data-fuente-video-ligero", "");
    video.tabIndex = -1;
    video.style.cssText = "position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:2147483646";
    video.srcObject = new MediaStream([pista]);
    try {
      document.body.appendChild(video);
    } catch {
      /* sin body (pruebas): se sigue con el <video> suelto */
    }
    let ultimoErrorPlay = "";
    const reanudar = () => {
      if (video.paused)
        void video.play().catch((e: unknown) => {
          ultimoErrorPlay = e instanceof Error ? e.name || e.message : "play";
        });
    };
    reanudar();
    // Fotogramas nuevos del <video>: con requestVideoFrameCallback se cuentan de verdad; sin él, por `currentTime`.
    let nuevos = 0;
    let cerrada = false;
    const rvfc = typeof video.requestVideoFrameCallback === "function";
    if (rvfc) {
      const contar = () => {
        if (cerrada) return;
        nuevos++;
        try {
          video.requestVideoFrameCallback!(contar);
        } catch {
          /* noop */
        }
      };
      video.requestVideoFrameCallback!(contar);
    }
    let vistosHasta = -1;
    let tiempoVisto = -1;
    const lienzo = document.createElement("canvas");
    const ctx = lienzo.getContext("2d", { willReadFrequently: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return null;
    let vistos = 0;
    let negros = 0;
    let motivo: MotivoSinImagen | null = null;
    return {
      capturar(w, h) {
        if (cerrada) {
          motivo = "cerrada";
          return null;
        }
        if (video.paused) reanudar();
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
          motivo = video.paused ? "pausada" : "sin-datos";
          return null;
        }
        // El <video> no avanzó: el mismo fotograma no se vuelve a mandar.
        // (Con los dos: si WebKit no avisara de fotogramas de un <video> tan pequeño, `currentTime` sigue valiendo.)
        const avanzo = (rvfc && nuevos !== vistosHasta) || video.currentTime !== tiempoVisto;
        if (!avanzo && vistos > 0) {
          motivo = video.paused ? "pausada" : "quieta";
          return null;
        }
        vistosHasta = nuevos;
        tiempoVisto = video.currentTime;
        motivo = null;
        if (lienzo.width !== w) lienzo.width = w;
        if (lienzo.height !== h) lienzo.height = h;
        // «cover»: llena el cuadro recortando lo que sobra.
        const k = Math.max(w / video.videoWidth, h / video.videoHeight);
        const sw = w / k;
        const sh = h / k;
        ctx.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
        vistos++;
        if (vistos % 4 === 1 && lienzoEsNegro(ctx, w, h)) negros++;
        return { imagen: lienzo, w, h, ts: typeof performance !== "undefined" ? performance.now() : Date.now() };
      },
      motivoSinImagen: () => motivo,
      diagnostico() {
        return { vistos, negros, vivo: pista.readyState === "live" && !pista.muted, pausada: video.paused, listo: video.readyState, errorPlay: ultimoErrorPlay };
      },
      cerrar() {
        cerrada = true;
        try {
          video.pause();
          video.srcObject = null;
          video.remove();
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}

/**
 * Salida: un canvas que la superficie monta DIRECTAMENTE en el mosaico (`lienzo`). VID1110A: antes solo se daba su
 * `captureStream`, que en WKWebView no emite fotogramas de un canvas fuera del documento y en cualquier motor
 * solo emite al pintar: el <video> del mosaico se quedaba en negro. El `stream` sigue existiendo (grabación,
 * mezcla), pero se crea la primera vez que alguien lo pide.
 */
export function crearSalidaVideoWeb(): SalidaVideo | null {
  if (typeof document === "undefined") return null;
  try {
    const lienzo = document.createElement("canvas") as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
    lienzo.width = 160;
    lienzo.height = 120;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    let stream: MediaStream | null = null;
    const vivo = registrarLienzoVivo(lienzo);
    return {
      lienzo,
      get stream(): MediaStream | null {
        if (!stream && typeof lienzo.captureStream === "function") {
          try {
            stream = lienzo.captureStream(15);
          } catch {
            stream = null;
          }
        }
        return stream;
      },
      pintar(i) {
        try {
          if (lienzo.width !== i.w) lienzo.width = i.w;
          if (lienzo.height !== i.h) lienzo.height = i.h;
          ctx.drawImage(i.imagen as CanvasImageSource, 0, 0, i.w, i.h);
          vivo.pintadoEn = typeof performance !== "undefined" ? performance.now() : Date.now();
          vivo.pintados++;
        } finally {
          i.liberar?.();
        }
      },
      cerrar() {
        quitarLienzoVivo(vivo);
        try {
          for (const t of stream?.getTracks() ?? []) t.stop();
        } catch {
          /* noop */
        }
      },
    };
  } catch {
    return null;
  }
}
