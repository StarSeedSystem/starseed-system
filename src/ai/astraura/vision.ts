"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA · VISIÓN (SmolVLM2 · WebGPU · HuggingFace · 100% local)
 * ---------------------------------------------------------------------------
 * Da a Aurora PERCEPCIÓN VISUAL local, gratuita y privada con los modelos de
 * visión+vídeo más pequeños jamás publicados (Apache-2.0):
 *   · HuggingFaceTB/SmolVLM2-256M-Video-Instruct  → rápido, "en vivo" (~250 MB q4)
 *   · HuggingFaceTB/SmolVLM2-500M-Video-Instruct  → más calidad
 *
 * Corre 100% en el navegador vía Transformers.js + WebGPU (task
 * "image-text-to-text", dtype q4f16). Nada de la pantalla, la cámara ni las
 * imágenes sale del dispositivo.
 *
 * IMPORTANTE: el runtime se carga desde CDN con `new Function("u", "return
 * import(u)")` para que NI webpack NI TypeScript intenten resolver la URL (no
 * es una dependencia npm; solo existe en el navegador). Mismo patrón que
 * `builtin-engines.ts`.
 *
 * Todo defensivo y SSR-safe: si algo falla, lanza un Error claro y NUNCA deja
 * la cámara o la captura de pantalla encendidas (limpieza de streams garantizada).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Modelos de visión disponibles (alias corto → id ONNX oficial de HuggingFace). */
export type VisionModelKey = "256M" | "500M";

export const VISION_MODELS: Record<VisionModelKey, { id: string; label: string; approxSize: string; note: string }> = {
  "256M": {
    id: "HuggingFaceTB/SmolVLM2-256M-Video-Instruct",
    label: "SmolVLM2 256M (rápido)",
    approxSize: "~250 MB",
    note: "El más ligero: percepción en vivo de pantalla/cámara.",
  },
  "500M": {
    id: "HuggingFaceTB/SmolVLM2-500M-Video-Instruct",
    label: "SmolVLM2 500M (calidad)",
    approxSize: "~500 MB",
    note: "Más detalle a cambio de algo más de descarga y latencia.",
  },
};

/** Fuente del catálogo (para el registro de uso). */
const VISION_SOURCE_ID = "smolvlm2-webgpu";

/** Prompt por defecto: descripción rica en español. */
const DEFAULT_PROMPT = "Describe lo que ves con detalle, en español.";

/** Entrada de imagen aceptada por el motor. */
export type VisionImage = string | Blob | File | HTMLCanvasElement | HTMLImageElement;

/** Progreso de descarga del modelo (1ª vez). */
export interface VisionProgress {
  /** Fichero/etapa que se está descargando. */
  file?: string;
  /** Porcentaje 0-100. */
  progress: number;
  /** Mensaje legible para la UI. */
  message: string;
}

export interface DescribeOptions {
  /** Modelo a usar (por defecto "256M", el más rápido). */
  model?: VisionModelKey;
  /** Máximo de tokens a generar (por defecto 128). */
  maxTokens?: number;
  /** Callback de progreso de la descarga del modelo la 1ª vez. */
  onProgress?: (p: VisionProgress) => void;
}

/* ── Disponibilidad ──────────────────────────────────────────────────────── */

/** ¿Hay WebGPU en este navegador? Requisito para SmolVLM2. SSR-safe. */
export function visionAvailable(): boolean {
  try {
    return typeof navigator !== "undefined" && !!(navigator as any).gpu;
  } catch {
    return false;
  }
}

/* ── Carga del pipeline (cache por modelo) ───────────────────────────────── */

// Cacheamos un pipeline POR modelo: cambiar de 256M a 500M no debe tirar el que
// ya está cargado. Mismo espíritu que builtin-engines.ts pero indexado por id.
const visionPipelines: Record<string, Promise<any>> = {};

/**
 * Carga (una vez) el pipeline "image-text-to-text" de Transformers.js desde CDN
 * para el modelo dado. Import por Function() para que webpack/TS no lo resuelvan
 * (solo existe en el navegador). Cachea el pipeline por id de modelo.
 */
async function getVisionPipeline(
  modelId: string,
  onProgress?: (p: VisionProgress) => void,
): Promise<any> {
  const existing = visionPipelines[modelId];
  if (existing) return existing;
  const created = (async () => {
    if (!visionAvailable()) throw new Error("WebGPU no disponible: la visión local necesita un navegador con WebGPU.");
    const importFromCdn = new Function("u", "return import(u)") as (u: string) => Promise<any>;
    const mod: any = await importFromCdn("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3");
    const pipe = await mod.pipeline("image-text-to-text", modelId, {
      device: "webgpu",
      dtype: "q4f16",
      progress_callback: (r: any) => {
        try {
          if (r?.status === "progress" && r?.file) {
            const pct = Math.round(r.progress || 0);
            onProgress?.({ file: r.file, progress: pct, message: `${r.file} ${pct}%` });
          } else if (r?.status === "ready") {
            onProgress?.({ progress: 100, message: "Modelo de visión listo." });
          }
        } catch { /* progreso best-effort */ }
      },
    });
    return pipe;
  })();
  visionPipelines[modelId] = created;
  // Si la carga falla, no dejamos la promesa rechazada cacheada (permitir reintento).
  created.catch(() => { delete visionPipelines[modelId]; });
  return created;
}

/**
 * Precarga (descarga+calienta) el pipeline de visión SIN analizar nada. La usa
 * el instalador de modelos en segundo plano para dejar SmolVLM2 listo. Devuelve
 * cuando el modelo está cacheado. Nunca deja la promesa rechazada cacheada.
 */
export async function warmUpVision(
  modelId = VISION_MODELS["256M"].id,
  onProgress?: (p: string) => void,
): Promise<void> {
  await getVisionPipeline(modelId, (p) => onProgress?.(p.message || ""));
}

/* ── Normalización de la imagen a dataURL ────────────────────────────────── */

/** Convierte un Blob/File a dataURL (base64) con FileReader. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("No pude leer la imagen."));
      fr.readAsDataURL(blob);
    } catch (e) {
      reject(e instanceof Error ? e : new Error("No pude leer la imagen."));
    }
  });
}

/** Dibuja un <img> en un canvas y devuelve su dataURL (para imágenes ya cargadas). */
function imageElementToDataUrl(img: HTMLImageElement): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("La imagen aún no tiene dimensiones (¿no ha cargado?).");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pude preparar el lienzo para la imagen.");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

/**
 * Normaliza CUALQUIER entrada de imagen a un dataURL string. Acepta:
 * dataURL/URL string, Blob/File, HTMLCanvasElement, HTMLImageElement.
 */
export async function toDataUrl(image: VisionImage): Promise<string> {
  if (typeof image === "string") return image; // dataURL o URL http(s)
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) {
    return image.toDataURL("image/png");
  }
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    return imageElementToDataUrl(image);
  }
  if (typeof Blob !== "undefined" && image instanceof Blob) {
    return blobToDataUrl(image);
  }
  throw new Error("Formato de imagen no soportado para la visión.");
}

/* ── Registro de uso (defensivo) ─────────────────────────────────────────── */

/** Registra el uso en Astraura sin romper si el módulo no está disponible. */
async function noteVisionUsage(modelId: string): Promise<void> {
  try {
    const mod: any = await import("./usage");
    mod?.noteUsage?.(VISION_SOURCE_ID, modelId);
  } catch { /* el registro de uso es opcional */ }
}

/* ── Extracción del texto de la respuesta ────────────────────────────────── */

/** Extrae el texto del turno assistant de la salida de Transformers.js. */
function extractAssistantText(out: any): string {
  try {
    const gen = out?.[0]?.generated_text;
    if (Array.isArray(gen)) {
      const last = gen[gen.length - 1];
      const content = last?.content;
      if (typeof content === "string") return content.trim();
      // Algunos pipelines devuelven content como array de partes {type,text}.
      if (Array.isArray(content)) {
        return content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).join(" ").trim();
      }
    }
    if (typeof gen === "string") return gen.trim();
  } catch { /* */ }
  return "";
}

/* ── API pública: describir una imagen ───────────────────────────────────── */

/**
 * Describe una imagen con SmolVLM2 (100% local). Devuelve el texto del modelo.
 * Defensivo: si falla, lanza un Error claro.
 */
export async function describeImage(
  image: VisionImage,
  prompt: string = DEFAULT_PROMPT,
  opts: DescribeOptions = {},
): Promise<string> {
  if (!visionAvailable()) {
    throw new Error("La visión local necesita WebGPU y este navegador no lo tiene. Prueba en Chrome/Edge de escritorio.");
  }
  const key: VisionModelKey = opts.model === "500M" ? "500M" : "256M";
  const modelId = VISION_MODELS[key].id;
  const maxTokens = Math.max(16, Math.min(512, opts.maxTokens ?? 128));
  const dataUrl = await toDataUrl(image);
  const pipe = await getVisionPipeline(modelId, opts.onProgress);

  const messages = [
    {
      role: "user",
      content: [
        { type: "image", image: dataUrl },
        { type: "text", text: prompt || DEFAULT_PROMPT },
      ],
    },
  ];

  let out: any;
  try {
    out = await pipe(messages, { max_new_tokens: maxTokens, do_sample: false });
  } catch (e: any) {
    const d = e?.message ? String(e.message) : "";
    throw new Error(`La visión local falló al procesar la imagen${d ? `: ${d}` : "."}`);
  }
  const text = extractAssistantText(out);
  void noteVisionUsage(modelId);
  if (!text) throw new Error("El modelo de visión no devolvió descripción.");
  return text;
}

/**
 * Describe VARIAS imágenes a la vez (multi-imagen). Útil para muestrear fotogramas
 * de un vídeo o comparar varias capturas. Devuelve el texto del modelo.
 */
export async function describeImages(
  images: VisionImage[],
  prompt: string = DEFAULT_PROMPT,
  opts: DescribeOptions = {},
): Promise<string> {
  if (!images?.length) throw new Error("No hay imágenes que describir.");
  if (!visionAvailable()) {
    throw new Error("La visión local necesita WebGPU y este navegador no lo tiene.");
  }
  const key: VisionModelKey = opts.model === "500M" ? "500M" : "256M";
  const modelId = VISION_MODELS[key].id;
  const maxTokens = Math.max(16, Math.min(512, opts.maxTokens ?? 160));
  const dataUrls = await Promise.all(images.map((im) => toDataUrl(im)));
  const pipe = await getVisionPipeline(modelId, opts.onProgress);

  const content: any[] = dataUrls.map((u) => ({ type: "image", image: u }));
  content.push({ type: "text", text: prompt || DEFAULT_PROMPT });
  const messages = [{ role: "user", content }];

  let out: any;
  try {
    out = await pipe(messages, { max_new_tokens: maxTokens, do_sample: false });
  } catch (e: any) {
    const d = e?.message ? String(e.message) : "";
    throw new Error(`La visión local falló al procesar las imágenes${d ? `: ${d}` : "."}`);
  }
  const text = extractAssistantText(out);
  void noteVisionUsage(modelId);
  if (!text) throw new Error("El modelo de visión no devolvió descripción.");
  return text;
}

/* ── Captura de fotogramas (pantalla / cámara / vídeo) ────────────────────── */

/** Dibuja un elemento de vídeo en un canvas nuevo y devuelve su dataURL. */
function videoFrameToDataUrl(video: HTMLVideoElement): string {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("El vídeo aún no tiene dimensiones para capturar.");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pude preparar el lienzo para el fotograma.");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/png");
}

/** Espera a que un <video> tenga metadatos/datos listos (con timeout). */
function waitForVideoReady(video: HTMLVideoElement, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 2 && video.videoWidth) return resolve();
    let done = false;
    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      clearTimeout(timer);
      err ? reject(err) : resolve();
    };
    const onReady = () => { if (video.videoWidth) finish(); };
    const timer = setTimeout(() => finish(new Error("Tiempo agotado esperando el vídeo.")), timeoutMs);
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
  });
}

/** Detiene TODAS las pistas de un stream (nunca dejar cámara/pantalla encendidas). */
function stopStream(stream: MediaStream | null | undefined): void {
  try {
    stream?.getTracks?.().forEach((t) => { try { t.stop(); } catch { /* */ } });
  } catch { /* */ }
}

/**
 * Captura UN fotograma de la PANTALLA (getDisplayMedia). El navegador pide
 * permiso al usuario y elige qué compartir. Devuelve un dataURL, o null si el
 * usuario cancela. SIEMPRE cierra el stream al terminar.
 */
export async function captureScreenFrame(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Este navegador no permite capturar la pantalla.");
  }
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e: any) {
    // El usuario canceló el diálogo de compartir: no es un error, es un "no".
    if (e?.name === "NotAllowedError" || e?.name === "AbortError") return null;
    throw new Error("No pude acceder a la pantalla.");
  }
  try {
    video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => { /* algunos navegadores no requieren play explícito */ });
    await waitForVideoReady(video);
    // Un respiro corto para que el primer frame no salga en negro.
    await new Promise((r) => setTimeout(r, 120));
    return videoFrameToDataUrl(video);
  } finally {
    if (video) { try { video.srcObject = null; } catch { /* */ } }
    stopStream(stream);
  }
}

/**
 * Captura UN fotograma de la CÁMARA (getUserMedia). `facing` elige cámara
 * frontal ("user") o trasera ("environment"). Devuelve un dataURL o null si se
 * cancela. SIEMPRE apaga la cámara al terminar.
 */
export async function captureCameraFrame(facing: "user" | "environment" = "user"): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este navegador no permite acceder a la cámara.");
  }
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: false,
    });
  } catch (e: any) {
    if (e?.name === "NotAllowedError" || e?.name === "AbortError") return null;
    throw new Error("No pude acceder a la cámara.");
  }
  try {
    video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => { /* */ });
    await waitForVideoReady(video);
    await new Promise((r) => setTimeout(r, 120));
    return videoFrameToDataUrl(video);
  } finally {
    if (video) { try { video.srcObject = null; } catch { /* */ } }
    stopStream(stream);
  }
}

/**
 * Muestrea N fotogramas de un <video> ya montado y los describe como multi-imagen
 * (percepción temporal ligera). No abre streams: solo lee del vídeo dado, así que
 * no toca permisos ni cámara. Devuelve el texto del modelo.
 */
export async function describeVideoElement(
  videoEl: HTMLVideoElement,
  prompt: string = "Describe lo que ocurre en estos fotogramas, en español.",
  frames = 4,
  opts: DescribeOptions = {},
): Promise<string> {
  if (typeof HTMLVideoElement === "undefined" || !(videoEl instanceof HTMLVideoElement)) {
    throw new Error("No hay un elemento de vídeo válido para analizar.");
  }
  await waitForVideoReady(videoEl).catch(() => { /* intentamos igualmente con lo que haya */ });
  const n = Math.max(1, Math.min(8, frames));
  const shots: string[] = [];
  const duration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
  const wasPaused = videoEl.paused;

  if (duration > 0 && n > 1) {
    // Vídeo con duración conocida: buscamos posiciones repartidas y capturamos.
    const originalTime = videoEl.currentTime;
    try {
      for (let i = 0; i < n; i++) {
        const t = (duration * (i + 0.5)) / n;
        await seekVideo(videoEl, t);
        try { shots.push(videoFrameToDataUrl(videoEl)); } catch { /* frame no listo */ }
      }
    } finally {
      try { await seekVideo(videoEl, originalTime); } catch { /* */ }
      if (!wasPaused) { try { await videoEl.play(); } catch { /* */ } }
    }
  } else {
    // Stream en vivo (sin duración): muestreamos en el tiempo real, espaciados.
    for (let i = 0; i < n; i++) {
      try { shots.push(videoFrameToDataUrl(videoEl)); } catch { /* */ }
      if (i < n - 1) await new Promise((r) => setTimeout(r, 250));
    }
  }

  const uniqueShots = shots.filter(Boolean);
  if (!uniqueShots.length) throw new Error("No pude capturar fotogramas del vídeo.");
  return describeImages(uniqueShots, prompt, opts);
}

/** Busca una posición del vídeo y espera al evento `seeked` (con timeout). */
function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener("seeked", finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, 1500);
    video.addEventListener("seeked", finish);
    try { video.currentTime = time; } catch { finish(); }
  });
}
