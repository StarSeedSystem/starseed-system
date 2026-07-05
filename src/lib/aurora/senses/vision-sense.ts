"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AURORA · SENTIDO DE LA VISTA (puente al motor SmolVLM2 local)
 * ---------------------------------------------------------------------------
 * Orquesta captura (pantalla/cámara/imagen) + descripción con el motor de
 * visión de Astraura (`@/ai/astraura/vision`). Pensado para que las ACCIONES de
 * Aurora o su chat pregunten "¿qué ves en mi pantalla?" y reciban una respuesta.
 *
 * Todo defensivo y SSR-safe. Import DINÁMICO del motor: Transformers.js no se
 * carga salvo que la visión se use de verdad. Respeta el opt-in del usuario y su
 * modelo preferido (localStorage "starseed.aurora.vision.v1").
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { VisionImage, VisionModelKey, VisionProgress } from "@/ai/astraura/vision";

/** Clave de preferencias del panel de Visión (compartida con la UI). */
export const VISION_PREFS_KEY = "starseed.aurora.vision.v1";

export interface VisionPrefs {
  /** ¿El usuario permitió la visión de Aurora? */
  enabled: boolean;
  /** Modelo preferido. */
  model: VisionModelKey;
}

const DEFAULT_PREFS: VisionPrefs = { enabled: false, model: "256M" };

/** Lee las preferencias de visión (opt-in + modelo). SSR-safe, nunca lanza. */
export function getVisionPrefs(): VisionPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(VISION_PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        enabled: !!p?.enabled,
        model: p?.model === "500M" ? "500M" : "256M",
      };
    }
  } catch { /* */ }
  return { ...DEFAULT_PREFS };
}

/** Guarda las preferencias de visión (parcial). SSR-safe, nunca lanza. */
export function setVisionPrefs(patch: Partial<VisionPrefs>): VisionPrefs {
  const next = { ...getVisionPrefs(), ...patch };
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(VISION_PREFS_KEY, JSON.stringify(next)); } catch { /* */ }
  }
  return next;
}

/** ¿La visión está disponible en este navegador (WebGPU)? Import dinámico. */
export async function visionSenseAvailable(): Promise<boolean> {
  try {
    const mod = await import("@/ai/astraura/vision");
    return mod.visionAvailable();
  } catch {
    return false;
  }
}

export interface AuroraSeeOptions {
  /** Instrucción para el modelo (por defecto, descripción en español). */
  prompt?: string;
  /** Fuerza un modelo; si se omite, usa el de las preferencias. */
  model?: VisionModelKey;
  /** Progreso de descarga del modelo la 1ª vez. */
  onProgress?: (p: VisionProgress) => void;
  /** Máximo de tokens. */
  maxTokens?: number;
  /** Cámara frontal/trasera cuando source === "camera". */
  facing?: "user" | "environment";
}

/**
 * El sentido de la vista de Aurora. Orquesta captura + descripción y devuelve
 * el texto. `source`:
 *   · "screen"  → captura un fotograma de la pantalla (pide permiso).
 *   · "camera"  → captura un fotograma de la cámara (pide permiso).
 *   · "image"   → describe la imagen dada en `payload` (dataURL/Blob/canvas/img).
 *
 * Defensivo: si el usuario cancela un permiso, devuelve un mensaje amable en vez
 * de lanzar. Si el motor falla, propaga un Error claro.
 */
export async function auroraSee(
  source: "screen" | "camera" | "image",
  payload?: VisionImage,
  promptOrOpts?: string | AuroraSeeOptions,
): Promise<string> {
  const opts: AuroraSeeOptions = typeof promptOrOpts === "string"
    ? { prompt: promptOrOpts }
    : (promptOrOpts || {});
  const prefs = getVisionPrefs();
  const model = opts.model || prefs.model;

  const vision = await import("@/ai/astraura/vision");
  if (!vision.visionAvailable()) {
    throw new Error("La visión local necesita un navegador con WebGPU (Chrome/Edge de escritorio).");
  }

  let image: VisionImage | null = null;
  if (source === "screen") {
    image = await vision.captureScreenFrame();
    if (!image) return "No compartiste ninguna pantalla, así que no puedo ver nada ahora mismo.";
  } else if (source === "camera") {
    image = await vision.captureCameraFrame(opts.facing || "user");
    if (!image) return "No me diste acceso a la cámara, así que no puedo ver nada ahora mismo.";
  } else {
    if (!payload) throw new Error("No hay imagen que analizar.");
    image = payload;
  }

  const description = await vision.describeImage(image, opts.prompt, {
    model,
    maxTokens: opts.maxTokens,
    onProgress: opts.onProgress,
  });
  return description;
}

/* ── Enrutado de comandos de voz (no invasivo) ───────────────────────────── */

/** Normaliza texto (minúsculas, sin acentos) para casar frases robustamente. */
function normVision(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * ¿Este texto es una petición de VISIÓN? Detecta frases como:
 *   "¿qué ves?", "describe la pantalla", "mira la cámara", "analiza esta imagen".
 * Devuelve la fuente a usar o null si no aplica.
 */
export function detectVisionCommand(text: string): "screen" | "camera" | "image" | null {
  const n = normVision(text);
  if (!n) return null;

  // Debe haber un verbo/intención visual para no capturar frases genéricas.
  const hasVisualIntent =
    /\b(que ves|qué ves|que estas viendo|describe|descríbeme|analiza|mira|observa|reconoce|identifica|lee lo que ves|ves en|puedes ver)\b/.test(n) ||
    /\bvis[ui]on\b/.test(n);
  if (!hasVisualIntent) return null;

  const mentionsCamera = /\b(camara|cámara|webcam|selfie|mi cara|frente a mi)\b/.test(n);
  const mentionsScreen = /\b(pantalla|escritorio|lo que hay en pantalla|mi pantalla|esta ventana|la ventana)\b/.test(n);
  const mentionsImage = /\b(imagen|foto|fotografia|fotografía|captura|este dibujo|la imagen)\b/.test(n);

  if (mentionsCamera) return "camera";
  if (mentionsScreen) return "screen";
  if (mentionsImage) return "image";

  // "¿qué ves?" a secas → asumimos la pantalla (lo más útil en un OS).
  if (/\b(que ves|qué ves|que estas viendo|puedes ver|describe lo que ves)\b/.test(n)) return "screen";
  return null;
}

/**
 * Puente NO INVASIVO para el enrutador de comandos de Aurora. Si `text` es una
 * petición de visión, la resuelve y devuelve la descripción; si no, devuelve
 * null (para que el flujo normal continúe). Nunca lanza: ante un fallo devuelve
 * un mensaje explicativo (string), no una excepción.
 *
 * Nota: la fuente "image" desde voz no tiene con qué trabajar (no hay imagen
 * adjunta por voz), así que se degrada a la pantalla, que es lo que el usuario
 * suele querer decir con "analiza esto".
 */
export async function maybeHandleVisionCommand(text: string): Promise<string | null> {
  let source = detectVisionCommand(text);
  if (!source) return null;
  // Por voz no hay imagen adjunta: "analiza esta imagen" → mira la pantalla.
  if (source === "image") source = "screen";

  // Respeta el opt-in: si la visión no está permitida, guía al usuario.
  const prefs = getVisionPrefs();
  if (!prefs.enabled) {
    return "Puedo ver tu pantalla, tu cámara o una imagen, pero primero necesito que actives la Visión de Aurora en Ajustes → Experiencia. Es 100% local y privada.";
  }

  try {
    if (!(await visionSenseAvailable())) {
      return "Mi visión local necesita un navegador con WebGPU (Chrome o Edge de escritorio). Aquí no está disponible.";
    }
    const desc = await auroraSee(source, undefined, {
      prompt: source === "camera"
        ? "Describe lo que ves por la cámara, en español, con detalle."
        : "Describe lo que ves en la pantalla, en español, con detalle.",
    });
    return desc;
  } catch (e: any) {
    const d = (e?.message ? String(e.message) : "").trim();
    return d
      ? `No pude ver ahora mismo: ${d}`
      : "No pude activar mi visión ahora mismo. Inténtalo de nuevo en un momento.";
  }
}
