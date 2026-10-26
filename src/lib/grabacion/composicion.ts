/**
 * Cámara superpuesta (imagen en imagen) dibujada en un lienzo (canvas) · geometría pura + compositor.
 * ─────────────────────────────────────────────────────────────────────────────
 * `MediaRecorder` solo graba flujos. Para mezclar la pantalla y la cámara en UN vídeo se dibujan
 * las dos en un canvas y se graba `canvas.captureStream()`. La cámara va en círculo con un aro
 * dorado (el acento de Logic) en una esquina elegida.
 *
 * Límite honesto: el canvas se redibuja desde ESTA página. Se usa un ticker en un Worker
 * (`latido.ts`) porque los temporizadores normales se frenan con la pestaña en segundo plano;
 * aun así, un navegador puede estrangular una página oculta. Sin cámara superpuesta la grabación
 * va directa del navegador al archivo y no depende de esto.
 */

import type { PosicionCamara, TamanoCamara } from "./tipos";

export interface Dimensiones {
  w: number;
  h: number;
}
export interface Rect extends Dimensiones {
  x: number;
  y: number;
}

/** Fracción del ancho del lienzo que ocupa el círculo de la cámara. */
export const FRACCION_CAMARA: Record<TamanoCamara, number> = { pequena: 0.14, mediana: 0.2, grande: 0.28 };
/** Margen al borde, como fracción del ancho. */
export const MARGEN_CAMARA = 0.025;
export const COLOR_ARO = "#D4AF37";

/** Tope del lienzo: 1920×1080 en cualquier orientación; medidas pares (H.264 las exige). */
export function calcularLienzo(ancho: number, alto: number, maxLargo = 1920, maxCorto = 1080): Dimensiones {
  let w = Number.isFinite(ancho) && ancho > 0 ? ancho : 1280;
  let h = Number.isFinite(alto) && alto > 0 ? alto : 720;
  const largo = Math.max(w, h);
  const corto = Math.min(w, h);
  const k = Math.min(1, maxLargo / largo, maxCorto / corto);
  w = Math.max(2, Math.round((w * k) / 2) * 2);
  h = Math.max(2, Math.round((h * k) / 2) * 2);
  return { w, h };
}

/** Rectángulo donde cabe `origen` dentro de `destino` sin deformarse, centrado (object-fit: contain). */
export function encajar(origen: Dimensiones, destino: Dimensiones): Rect {
  if (origen.w <= 0 || origen.h <= 0) return { x: 0, y: 0, w: destino.w, h: destino.h };
  const k = Math.min(destino.w / origen.w, destino.h / origen.h);
  const w = origen.w * k;
  const h = origen.h * k;
  return { x: (destino.w - w) / 2, y: (destino.h - h) / 2, w, h };
}

/** Cuadrado de la cámara dentro del lienzo, pegado a la esquina elegida. */
export function rectCamara(lienzo: Dimensiones, posicion: PosicionCamara, tamano: TamanoCamara): Rect {
  const lado = Math.round(lienzo.w * FRACCION_CAMARA[tamano]);
  const margen = Math.round(lienzo.w * MARGEN_CAMARA);
  const x = posicion.endsWith("derecha") ? lienzo.w - lado - margen : margen;
  const y = posicion.startsWith("abajo") ? lienzo.h - lado - margen : margen;
  return { x, y, w: lado, h: lado };
}

/** Recorte central cuadrado del origen (object-fit: cover) para llenar el círculo. */
export function recorteCuadrado(origen: Dimensiones): Rect {
  const lado = Math.min(origen.w, origen.h);
  return { x: (origen.w - lado) / 2, y: (origen.h - lado) / 2, w: lado, h: lado };
}

/** Lo mínimo del contexto 2D que usa el dibujo (se prueba con uno de mentira). */
export interface Contexto2DMinimo {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(img: unknown, ...args: number[]): void;
  save(): void;
  restore(): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  clip(): void;
  stroke(): void;
}

export interface FuenteDibujo extends Dimensiones {
  /** El elemento (video) que se dibuja. */
  elemento: unknown;
}

/** Un fotograma: fondo negro, pantalla encajada y la cámara en su círculo con aro dorado. */
export function dibujarFotograma(
  ctx: Contexto2DMinimo,
  lienzo: Dimensiones,
  pantalla: FuenteDibujo,
  camara: FuenteDibujo | null,
  posicion: PosicionCamara,
  tamano: TamanoCamara,
): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, lienzo.w, lienzo.h);
  if (pantalla.w > 0 && pantalla.h > 0) {
    const r = encajar(pantalla, lienzo);
    ctx.drawImage(pantalla.elemento, r.x, r.y, r.w, r.h);
  }
  if (camara && camara.w > 0 && camara.h > 0) {
    const c = rectCamara(lienzo, posicion, tamano);
    const s = recorteCuadrado(camara);
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(camara.elemento, s.x, s.y, s.w, s.h, c.x, c.y, c.w, c.h);
    ctx.restore();
    ctx.strokeStyle = COLOR_ARO;
    ctx.lineWidth = Math.max(2, Math.round(lienzo.w * 0.0025));
    ctx.beginPath();
    ctx.arc(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ── Compositor (usa el DOM; todo inyectado) ─────────────────────────────── */

export interface VideoMinimo {
  srcObject: unknown;
  muted: boolean;
  playsInline: boolean;
  videoWidth: number;
  videoHeight: number;
  play(): Promise<void> | void;
  pause?(): void;
  addEventListener(tipo: string, fn: () => void, opts?: unknown): void;
  removeEventListener(tipo: string, fn: () => void): void;
  readyState?: number;
}

export interface LienzoMinimo {
  width: number;
  height: number;
  getContext(tipo: "2d"): Contexto2DMinimo | null;
  captureStream(fps?: number): { getVideoTracks(): MediaStreamTrack[] };
  toBlob?(cb: (b: Blob | null) => void, tipo?: string, calidad?: number): void;
}

export interface DepsComposicion {
  crearElemento: (tag: "video" | "canvas") => unknown;
  /** Llama a `cb` ~`fps` veces por segundo; devuelve cómo parar. */
  latido: (cb: () => void, fps: number) => () => void;
}

export interface Composicion {
  pista: MediaStreamTrack;
  ancho: number;
  alto: number;
  detener(): void;
}

/** Espera a que el vídeo tenga medidas (o a `ms`); nunca rechaza. */
export async function prepararVideo(video: VideoMinimo, ms = 2000): Promise<void> {
  try {
    await Promise.resolve(video.play());
  } catch {
    /* autoplay bloqueado: se sigue, el fotograma saldrá cuando haya imagen */
  }
  if (video.videoWidth > 0) return;
  await new Promise<void>((resolver) => {
    let hecho = false;
    const fin = () => {
      if (hecho) return;
      hecho = true;
      video.removeEventListener("loadeddata", fin);
      video.removeEventListener("loadedmetadata", fin);
      clearTimeout(t);
      resolver();
    };
    const t = setTimeout(fin, ms);
    video.addEventListener("loadeddata", fin);
    video.addEventListener("loadedmetadata", fin);
  });
}

export async function crearComposicion(
  p: {
    pantalla: MediaStream;
    camara: MediaStream;
    ancho: number;
    alto: number;
    fps: number;
    posicion: PosicionCamara;
    tamano: TamanoCamara;
  },
  deps: DepsComposicion,
): Promise<Composicion> {
  const vPantalla = deps.crearElemento("video") as VideoMinimo;
  const vCamara = deps.crearElemento("video") as VideoMinimo;
  for (const [v, flujo] of [[vPantalla, p.pantalla], [vCamara, p.camara]] as const) {
    v.muted = true;
    v.playsInline = true;
    v.srcObject = flujo;
  }
  await Promise.all([prepararVideo(vPantalla), prepararVideo(vCamara)]);

  const medidas = calcularLienzo(p.ancho, p.alto);
  const lienzo = deps.crearElemento("canvas") as LienzoMinimo;
  lienzo.width = medidas.w;
  lienzo.height = medidas.h;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin-lienzo");

  const dibujar = () => {
    dibujarFotograma(
      ctx,
      medidas,
      { elemento: vPantalla, w: vPantalla.videoWidth, h: vPantalla.videoHeight },
      { elemento: vCamara, w: vCamara.videoWidth, h: vCamara.videoHeight },
      p.posicion,
      p.tamano,
    );
  };
  dibujar();
  const pararLatido = deps.latido(dibujar, p.fps);
  const pista = lienzo.captureStream(p.fps).getVideoTracks()[0];
  if (!pista) {
    pararLatido();
    throw new Error("sin-pista-de-lienzo");
  }
  return {
    pista,
    ancho: medidas.w,
    alto: medidas.h,
    detener() {
      pararLatido();
      for (const v of [vPantalla, vCamara]) {
        try {
          v.pause?.();
          v.srcObject = null;
        } catch {
          /* ya liberado */
        }
      }
    },
  };
}
