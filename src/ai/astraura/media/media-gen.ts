"use client";

// ════════════════════════════════════════════════════════════════════════════
// Astraura · MEDIA-GEN — generación audiovisual GRATIS/LOCAL primero + failover
// ----------------------------------------------------------------------------
// Habilidad de Astraura para generar IMAGEN (y, con límites honestos, AUDIO y
// VÍDEO) desde CUALQUIER cuenta, desde la web, SIN instalar nada:
//
//   • Motor por defecto: **Pollinations.ai** — GET público, sin clave, CORS ok,
//     usable directamente como `<img src>` o con fetch→blob. SIEMPRE disponible
//     (es la red de seguridad de todo el módulo: el failover final de imagen Y
//     de audio cae aquí).
//   • Alternativas OPCIONALES por cuenta o por neurona (dispositivo):
//       - Hugging Face Inference API (web-key, token gratuito).
//       - AUTOMATIC1111 / Fooocus-API / ComfyUI (local-endpoint: el propio
//         servidor del usuario — reutiliza los endpoints que ya tenga
//         conectados en /servicios vía `oss-connections.ts`, o uno propio de
//         esta habilidad).
//       - Muapi.ai (web-key DE PAGO, bring-your-own-key): investigado y NO es
//         el motor por defecto (es una pasarela de pago sobre modelos de
//         terceros); se cataloga para una futura integración real, honesta
//         sobre que HOY no ejecuta generación.
//       - Endpoint propio genérico (custom-endpoint).
//
// FILOSOFÍA NUCLEAR (CLAUDE.md §3, Ciberdelia + Abundancia): la tecnología
// amplifica, nunca exige peaje para empezar. Por eso la imagen SIEMPRE funciona
// gratis desde el navegador; el resto son mejoras opcionales que el usuario
// activa si quiere más calidad o control (local) o más servicios (de pago).
//
// LÍMITES HONESTOS (no se inventan):
//   • AUDIO: Pollinations sirve voz (texto→voz) vía su endpoint de texto con
//     `model=openai-audio`; es SÍNTESIS DE VOZ del propio prompt (TTS), no
//     generación musical. Es el único motor de audio "siempre disponible".
//   • VÍDEO: ningún proveedor gratis/web de este catálogo genera vídeo de forma
//     fiable todavía. Sin un endpoint propio (ComfyUI / servicio propio)
//     conectado, `generateVideo` devuelve `ok:false` con un mensaje honesto —
//     nunca finge un resultado.
//
// Persistencia: preferencias en localStorage `starseed.media.prefs.v1`
// (`MEDIA_PREFS_KEY`), evento `starseed:media-prefs` (`MEDIA_PREFS_EVENT`) al
// guardar. Los endpoints de AUTOMATIC1111/Fooocus-API reutilizan, si existen,
// las conexiones ya guardadas en `oss-connections.ts` (las que el usuario
// configuró en /servicios) — así no hay que repetir la misma URL dos veces.
//
// Todo defensivo y SSR-safe: ninguna función de este módulo lanza. Los fallos
// de red se traducen siempre en `{ ok:false, error }` legible en español.
// ════════════════════════════════════════════════════════════════════════════

import { connectionsForService } from "@/lib/services/oss-connections";
import {
  FORMATOS_PUBLICACION,
  MUESTREADORES_COMFYUI,
  PLANIFICADORES_COMFYUI,
  NODOS_NUCLEO,
  MEGAPIXELES,
  imagenAImagen,
  ladosFormato,
  textoAImagen,
  variaciones,
  type EscalaImagen,
  type FormatoPublicacion,
  type GrafoComfyUI,
  type MuestreadorComfyUI,
  type PlanificadorComfyUI,
  type PeticionFlujo,
} from "@/lib/imagenes/flujos-comfyui";
import type { GaleriaImagenes, OpcionGaleria } from "./proveedor-neuronas";
import type { CapaImg } from "@/lib/imagenes/plan";
import type { UsoLicencia } from "@/lib/avatares/adn/adn";

// ────────────────────────────────────────────────────────────────────────────
// Tipos base del catálogo de proveedores
// ────────────────────────────────────────────────────────────────────────────

/** Tipo de medio que esta habilidad puede generar. */
export type MediaKind = "image" | "video" | "audio";

/** Motores de generación audiovisual conocidos por Astraura. */
export type MediaProviderId =
  | "pollinations"
  | "neuronas"
  | "hf-inference"
  | "automatic1111"
  | "fooocus"
  | "comfyui"
  | "muapi"
  | "custom-endpoint";

/**
 * Cómo se accede a un proveedor:
 *  • web-free      → funciona desde el navegador, sin clave (Pollinations).
 *  • web-key       → API en la nube que pide una clave/token del usuario.
 *  • local-endpoint→ servidor propio/auto-hospedado (el usuario da la URL).
 */
export type MediaAccessKind = "web-free" | "web-key" | "local-endpoint";

/** Definición de un proveedor del catálogo (metadatos, no la implementación). */
export interface MediaProvider {
  id: MediaProviderId;
  label: string;
  /** Qué tipos de medio cubre este proveedor (honesto: solo lo que de verdad intenta generar). */
  kinds: MediaKind[];
  access: MediaAccessKind;
  /** ¿Necesita una clave/token para funcionar? */
  needsKey: boolean;
  /** Explicación honesta en español: qué es, qué pide, y sus límites. */
  note: string;
}

/** Catálogo de proveedores. Pollinations es el único `web-free` — el default. */
export const MEDIA_PROVIDERS: MediaProvider[] = [
  {
    id: "pollinations",
    label: "Pollinations.ai",
    kinds: ["image", "audio"],
    access: "web-free",
    needsKey: false,
    note:
      "Motor GRATIS y por defecto: funciona desde cualquier navegador, sin instalar nada ni pedir clave. Genera la imagen al vuelo (GET directo, usable como <img src>) y sintetiza voz (texto→voz) para audio. No genera vídeo de forma fiable — para vídeo hace falta un servicio propio.",
  },
  {
    id: "neuronas",
    label: "Tus neuronas (local)",
    kinds: ["image"],
    access: "local-endpoint",
    needsKey: false,
    note:
      "Reparte la petición por tus neuronas (este aparato, la pestaña con WebGPU, otras tuyas y la malla) y devuelve VARIAS opciones a la vez según el plan de capas. Funciona si alguna neurona tiene el servicio local de imágenes encendido; si ninguna responde, cae a Pollinations.",
  },
  {
    id: "hf-inference",
    label: "Hugging Face Inference API",
    kinds: ["image"],
    access: "web-key",
    needsKey: true,
    note:
      "Modelos de imagen de Hugging Face vía su API de Inference. Necesita un token gratuito de Hugging Face (Bearer). Los modelos gratuitos pueden tardar unos segundos en \"despertar\" la primera vez (cold start).",
  },
  {
    id: "automatic1111",
    label: "Stable Diffusion (AUTOMATIC1111)",
    kinds: ["image"],
    access: "local-endpoint",
    needsKey: false,
    note:
      "Tu propio servidor de Stable Diffusion (WebUI AUTOMATIC1111, arrancada con --api). Más calidad y control que Pollinations. Reutiliza el endpoint que ya tengas conectado en /servicios, o pega uno propio aquí.",
  },
  {
    id: "fooocus",
    label: "Fooocus-API",
    kinds: ["image"],
    access: "local-endpoint",
    needsKey: false,
    note:
      "Tu propio servidor Fooocus-API (FastAPI sobre Fooocus, Stable Diffusion XL). Reutiliza el endpoint que ya tengas conectado en /servicios, o pega uno propio aquí.",
  },
  {
    id: "comfyui",
    label: "ComfyUI",
    kinds: ["image", "video"],
    access: "local-endpoint",
    needsKey: false,
    note:
      "Tu propio servidor ComfyUI. Un ComfyUI REAL pide el GRAFO del flujo en formato API, y esto el OS ya lo construye: usa las plantillas puras de nodos del núcleo (flujos-comfyui) y manda {prompt: grafo} a /prompt. Para flujos de vídeo especiales (AnimateDiff/SVD) sigue valiendo un proxy delante.",
  },
  {
    id: "muapi",
    label: "Muapi.ai (pasarela de pago)",
    kinds: ["image", "video", "audio"],
    access: "web-key",
    needsKey: true,
    note:
      "Pasarela de PAGO de terceros (bring-your-own-key) que agrega modelos de imagen/vídeo/audio de varios proveedores. NO es gratis y NO es el motor por defecto de StarSeed. Catalogada para una futura integración: hoy NO ejecuta generación real (evita inventar una llamada a una API de pago sin verificar) — usa tu clave manualmente en muapi.ai mientras tanto.",
  },
  {
    id: "custom-endpoint",
    label: "Endpoint propio",
    kinds: ["image", "video", "audio"],
    access: "local-endpoint",
    needsKey: false,
    note:
      "Cualquier endpoint HTTP tuyo (self-host o proxy). Intento genérico: recibe un POST con {prompt,...} y espera una imagen/vídeo/audio en la respuesta (URL, base64, o el binario directo).",
  },
];

/** Busca un proveedor del catálogo por id. */
export function findMediaProvider(id: MediaProviderId): MediaProvider | undefined {
  return MEDIA_PROVIDERS.find((p) => p.id === id);
}

/** ¿Este proveedor declara soporte para este tipo de medio? */
function providerSupportsKind(id: MediaProviderId, kind: MediaKind): boolean {
  return !!findMediaProvider(id)?.kinds.includes(kind);
}

function providerLabel(id: MediaProviderId): string {
  return findMediaProvider(id)?.label ?? id;
}

// ────────────────────────────────────────────────────────────────────────────
// Preferencias (cuenta + por neurona) — localStorage `starseed.media.prefs.v1`
// ────────────────────────────────────────────────────────────────────────────

export const MEDIA_PREFS_KEY = "starseed.media.prefs.v1";
/** Evento emitido tras cada `setMediaPrefs` (para que la UI se refresque). */
export const MEDIA_PREFS_EVENT = "starseed:media-prefs";

/** Preferencia de proveedor por defecto, por cuenta y por neurona (dispositivo). */
export interface MediaPrefs {
  /** Proveedor por defecto para IMAGEN (siempre presente; cae en "pollinations"). */
  defaultImage: MediaProviderId;
  /** Proveedor por defecto para VÍDEO (opcional: sin uno, se resuelve en el momento). */
  defaultVideo?: MediaProviderId;
  /** Proveedor por defecto para AUDIO (opcional: sin uno, se resuelve en el momento). */
  defaultAudio?: MediaProviderId;
  /** Overrides POR NEURONA (dispositivo): neuronId → proveedor por tipo de medio. */
  perNeuron?: Record<
    string,
    { image?: MediaProviderId; video?: MediaProviderId; audio?: MediaProviderId }
  >;
  /** Token gratuito de Hugging Face (Bearer) para `hf-inference`. */
  hfToken?: string;
  /** Clave de Muapi.ai (de pago, bring-your-own-key). */
  muapiKey?: string;
  /** Endpoints propios por proveedor (clave = MediaProviderId, p.ej. "automatic1111"). */
  customEndpoints?: Record<string, string>;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function defaultPrefs(): MediaPrefs {
  return { defaultImage: "pollinations" };
}

function sanitizeProviderId(v: unknown): MediaProviderId | undefined {
  return typeof v === "string" && MEDIA_PROVIDERS.some((p) => p.id === v)
    ? (v as MediaProviderId)
    : undefined;
}

function sanitizePerNeuronEntry(
  raw: unknown,
): { image?: MediaProviderId; video?: MediaProviderId; audio?: MediaProviderId } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out: { image?: MediaProviderId; video?: MediaProviderId; audio?: MediaProviderId } = {};
  const img = sanitizeProviderId(r.image);
  if (img) out.image = img;
  const vid = sanitizeProviderId(r.video);
  if (vid) out.video = vid;
  const aud = sanitizeProviderId(r.audio);
  if (aud) out.audio = aud;
  return Object.keys(out).length ? out : null;
}

function sanitizePerNeuron(raw: unknown): MediaPrefs["perNeuron"] {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<
    string,
    { image?: MediaProviderId; video?: MediaProviderId; audio?: MediaProviderId }
  > = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const entry = sanitizePerNeuronEntry(v);
    if (entry && k.trim()) out[k] = entry;
  }
  return Object.keys(out).length ? out : undefined;
}

function sanitizeCustomEndpoints(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim() && k.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Lee las preferencias de generación audiovisual. SSR-safe; nunca lanza. */
export function getMediaPrefs(): MediaPrefs {
  if (!isClient()) return defaultPrefs();
  try {
    const raw = window.localStorage.getItem(MEDIA_PREFS_KEY);
    if (!raw) return defaultPrefs();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultPrefs();
    const p = parsed as Record<string, unknown>;
    const out: MediaPrefs = { defaultImage: sanitizeProviderId(p.defaultImage) ?? "pollinations" };
    const dv = sanitizeProviderId(p.defaultVideo);
    if (dv) out.defaultVideo = dv;
    const da = sanitizeProviderId(p.defaultAudio);
    if (da) out.defaultAudio = da;
    const pn = sanitizePerNeuron(p.perNeuron);
    if (pn) out.perNeuron = pn;
    if (typeof p.hfToken === "string" && p.hfToken.trim()) out.hfToken = p.hfToken.trim();
    if (typeof p.muapiKey === "string" && p.muapiKey.trim()) out.muapiKey = p.muapiKey.trim();
    const ce = sanitizeCustomEndpoints(p.customEndpoints);
    if (ce) out.customEndpoints = ce;
    return out;
  } catch {
    return defaultPrefs();
  }
}

/**
 * Aplica un patch parcial a las preferencias, persiste y emite `MEDIA_PREFS_EVENT`.
 * Merge amable:
 *   • `defaultImage/defaultVideo/defaultAudio` se reemplazan si vienen (id válido);
 *     un id inválido/ausente conserva el valor previo (`defaultImage` nunca queda vacío).
 *   • `perNeuron` se fusiona POR (neuronId, tipo de medio): solo se tocan las
 *     claves presentes en el patch de esa neurona; el resto de tipos/neuronas
 *     se conservan. Pasar `undefined` en una clave la BORRA (vuelve a heredar
 *     el valor por defecto de la cuenta).
 *   • `hfToken` / `muapiKey`: cadena vacía o solo-espacios los borra.
 *   • `customEndpoints` se fusiona por clave (proveedor); valor vacío la borra.
 * SSR-safe: sin `window` no persiste pero devuelve el resultado calculado.
 * Nunca lanza.
 */
export function setMediaPrefs(patch: Partial<MediaPrefs>): MediaPrefs {
  const current = getMediaPrefs();
  const next: MediaPrefs = { ...current };

  if (patch && typeof patch === "object") {
    if (patch.defaultImage !== undefined) {
      const v = sanitizeProviderId(patch.defaultImage);
      if (v) next.defaultImage = v;
    }
    if (patch.defaultVideo !== undefined) {
      const v = sanitizeProviderId(patch.defaultVideo);
      if (v) next.defaultVideo = v;
      else delete next.defaultVideo;
    }
    if (patch.defaultAudio !== undefined) {
      const v = sanitizeProviderId(patch.defaultAudio);
      if (v) next.defaultAudio = v;
      else delete next.defaultAudio;
    }
    if (patch.perNeuron !== undefined && typeof patch.perNeuron === "object") {
      const merged: Record<
        string,
        { image?: MediaProviderId; video?: MediaProviderId; audio?: MediaProviderId }
      > = { ...(next.perNeuron || {}) };
      for (const [neuronId, rawEntry] of Object.entries(patch.perNeuron)) {
        if (!neuronId.trim()) continue;
        const existing: { image?: MediaProviderId; video?: MediaProviderId; audio?: MediaProviderId } = {
          ...(merged[neuronId] || {}),
        };
        const entry = (rawEntry ?? {}) as Record<string, unknown>;
        // Campos explícitos (evita escritura indexada genérica): solo se toca
        // la clave si el patch la incluye — ausente ⇒ se conserva tal cual.
        if ("image" in entry) {
          const v = sanitizeProviderId(entry.image);
          if (v) existing.image = v;
          else delete existing.image;
        }
        if ("video" in entry) {
          const v = sanitizeProviderId(entry.video);
          if (v) existing.video = v;
          else delete existing.video;
        }
        if ("audio" in entry) {
          const v = sanitizeProviderId(entry.audio);
          if (v) existing.audio = v;
          else delete existing.audio;
        }
        if (Object.keys(existing).length) merged[neuronId] = existing;
        else delete merged[neuronId];
      }
      next.perNeuron = Object.keys(merged).length ? merged : undefined;
    }
    if (patch.hfToken !== undefined) {
      const v = (patch.hfToken || "").trim();
      if (v) next.hfToken = v;
      else delete next.hfToken;
    }
    if (patch.muapiKey !== undefined) {
      const v = (patch.muapiKey || "").trim();
      if (v) next.muapiKey = v;
      else delete next.muapiKey;
    }
    if (patch.customEndpoints !== undefined && typeof patch.customEndpoints === "object") {
      const merged: Record<string, string> = { ...(next.customEndpoints || {}) };
      for (const [k, v] of Object.entries(patch.customEndpoints)) {
        if (!k.trim()) continue;
        if (typeof v === "string" && v.trim()) merged[k] = v.trim();
        else delete merged[k];
      }
      next.customEndpoints = Object.keys(merged).length ? merged : undefined;
    }
  }

  if (!isClient()) return next;
  try {
    window.localStorage.setItem(MEDIA_PREFS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(MEDIA_PREFS_EVENT, { detail: next }));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
  return next;
}

/**
 * Resuelve QUÉ proveedor usar para un tipo de medio, con la prioridad:
 *   1) override de la NEURONA (`perNeuron[neuronId][kind]`), si `neuronId` se
 *      pasa y hay una entrada guardada que además declare soporte para `kind`.
 *   2) el proveedor por DEFECTO de cuenta para ese `kind` (si lo declara).
 *   3) Pollinations, si cubre ese `kind` (imagen/audio).
 *   4) el primer proveedor del catálogo que cubra ese `kind` (p.ej. vídeo).
 * Nunca lanza; siempre devuelve un `MediaProviderId` válido.
 */
export function resolveProvider(kind: MediaKind, neuronId?: string): MediaProviderId {
  try {
    const prefs = getMediaPrefs();
    if (neuronId && neuronId.trim()) {
      const override = prefs.perNeuron?.[neuronId]?.[kind];
      if (override && providerSupportsKind(override, kind)) return override;
    }
    const def =
      kind === "image" ? prefs.defaultImage : kind === "video" ? prefs.defaultVideo : prefs.defaultAudio;
    if (def && providerSupportsKind(def, kind)) return def;
    if (providerSupportsKind("pollinations", kind)) return "pollinations";
    const anyMatch = MEDIA_PROVIDERS.find((p) => p.kinds.includes(kind));
    return anyMatch?.id ?? "pollinations";
  } catch {
    return "pollinations";
  }
}

/** Poblado del selector de la UI: proveedores disponibles para `kind` + cuál está activo ahora mismo. */
export function listMediaProvidersFor(
  kind: MediaKind,
  opts?: { neuronId?: string },
): { available: MediaProvider[]; active: MediaProviderId } {
  const available = MEDIA_PROVIDERS.filter((p) => p.kinds.includes(kind));
  const active = resolveProvider(kind, opts?.neuronId);
  return { available, active };
}

// ────────────────────────────────────────────────────────────────────────────
// Utilidades de red defensivas (fetch con timeout, nunca lanzan)
// ────────────────────────────────────────────────────────────────────────────

interface SafeJsonResult {
  ok: boolean;
  status?: number;
  data?: unknown;
  text?: string;
  reason?: "no-net" | "timeout" | "bad-url" | "http";
}

async function safeFetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<SafeJsonResult> {
  if (!isClient() || typeof fetch === "undefined") return { ok: false, reason: "no-net" };
  if (!url || !/^https?:\/\//i.test(url)) return { ok: false, reason: "bad-url" };
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      }, timeoutMs)
    : null;
  try {
    const res = await fetch(url, { ...init, signal: controller?.signal, credentials: "omit", mode: "cors" });
    if (timer) clearTimeout(timer);
    let data: unknown;
    let text = "";
    try {
      text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = undefined; // no era JSON; nos quedamos con el texto crudo
        }
      }
    } catch {
      /* cuerpo ilegible: seguimos con lo que tengamos */
    }
    return { ok: res.ok, status: res.status, data, text, reason: res.ok ? undefined : "http" };
  } catch (e: unknown) {
    if (timer) clearTimeout(timer);
    const aborted = (e as { name?: string })?.name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "no-net" };
  }
}

/**
 * fetch defensivo que espera contenido BINARIO (imagen/audio/vídeo). Si
 * `requireBinary` y el content-type no es image/audio/video/*, lo trata como
 * un fallo (evita disfrazar un JSON de error como si fuera el medio). Nunca
 * lanza: cualquier problema devuelve `null`.
 */
async function safeFetchBlob(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  requireBinary = false,
): Promise<Blob | null> {
  if (!isClient() || typeof fetch === "undefined") return null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      }, timeoutMs)
    : null;
  try {
    const res = await fetch(url, { ...init, signal: controller?.signal, credentials: "omit", mode: "cors" });
    if (timer) clearTimeout(timer);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (requireBinary && ct && !/^(image|audio|video)\//.test(ct)) return null;
    const blob = await res.blob();
    return blob && blob.size > 0 ? blob : null;
  } catch {
    if (timer) clearTimeout(timer);
    return null;
  }
}

function safeObjectUrl(blob: Blob): string | null {
  try {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      return URL.createObjectURL(blob);
    }
  } catch {
    /* noop */
  }
  return null;
}

function netFailMessage(serviceName: string, r: SafeJsonResult, timeoutMs: number): string {
  if (r.reason === "timeout") {
    return `${serviceName} no respondió a tiempo (${Math.round(timeoutMs / 1000)} s). ¿Está encendido y accesible?`;
  }
  if (r.reason === "http") {
    return `${serviceName} respondió con un error (HTTP ${r.status ?? "?"}).`;
  }
  if (r.reason === "bad-url") {
    return `La URL de ${serviceName} no es válida. Configura un endpoint http(s).`;
  }
  return `No se pudo conectar con ${serviceName} (CORS, apagado, o URL incorrecta).`;
}

function safeErrMsg(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  try {
    return String(e);
  } catch {
    return "Error inesperado.";
  }
}

function trimSlash(url: string): string {
  return (url || "").trim().replace(/\/+$/, "");
}

function joinUrl(base: string, path: string): string {
  const b = trimSlash(base);
  if (!path) return b;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** Ancho/alto saneados a un rango razonable (evita pedir tamaños absurdos). */
function clampDim(n: unknown): number | undefined {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return undefined;
  return Math.max(64, Math.min(2048, Math.round(v)));
}

/**
 * Extrae una URL de medio (imagen/audio/vídeo) de una respuesta JSON tolerando
 * las formas más comunes: array de strings/objetos, `{images:[...]}` (A1111),
 * o un objeto plano con una clave típica (url/base64/image/video/audio/…). Si
 * el valor es base64 "pelado", lo envuelve en una data URL con el mime de
 * `kind`. Devuelve `null` si no reconoce nada (nunca inventa una URL).
 */
function extractMediaUrl(data: unknown, rawText: string | undefined, kind: MediaKind): string | null {
  const defaultMime = kind === "image" ? "image/png" : kind === "audio" ? "audio/mpeg" : "video/mp4";
  const asDataUrl = (raw: string): string => {
    const s = raw.trim();
    if (!s) return "";
    if (/^data:/i.test(s) || /^https?:\/\//i.test(s)) return s;
    return `data:${defaultMime};base64,${s}`;
  };
  const KEYS = ["url", "siteUrl", "image", "img", "video", "audio", "output", "base64", "b64", "data"];
  const pickFromObj = (o: Record<string, unknown>): string | null => {
    for (const k of KEYS) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return asDataUrl(v);
    }
    return null;
  };
  if (Array.isArray(data)) {
    for (const item of data) {
      if (typeof item === "string" && item.trim()) return asDataUrl(item);
      if (item && typeof item === "object") {
        const got = pickFromObj(item as Record<string, unknown>);
        if (got) return got;
      }
    }
  }
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const listKey of ["images", "videos", "audios", "outputs", "results"]) {
      const arr = o[listKey];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item === "string" && item.trim()) return asDataUrl(item);
          if (item && typeof item === "object") {
            const got = pickFromObj(item as Record<string, unknown>);
            if (got) return got;
          }
        }
      }
    }
    const flat = pickFromObj(o);
    if (flat) return flat;
  }
  if (typeof rawText === "string") {
    const t = rawText.trim();
    if (/^https?:\/\//i.test(t)) return t;
    if (kind === "image" && /^data:image\//i.test(t)) return t;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Resolución de endpoints locales (reutiliza /servicios cuando es posible)
// ────────────────────────────────────────────────────────────────────────────

/** Mapa MediaProviderId → id del catálogo OSS (`oss-services.ts`) equivalente. */
const MEDIA_TO_OSS_SERVICE: Partial<Record<MediaProviderId, string>> = {
  automatic1111: "automatic1111",
  fooocus: "fooocus-api",
};

/**
 * Resuelve el endpoint HTTP a usar para un proveedor local/propio:
 *   1) `MediaPrefs.customEndpoints[providerId]` — override explícito de ESTA
 *      habilidad (lo que el usuario pegó en el panel de generación audiovisual).
 *   2) La conexión ya configurada en /servicios (`oss-connections.ts`) para el
 *      servicio OSS equivalente (automatic1111/fooocus-api) — así el usuario no
 *      repite la misma URL dos veces.
 *   3) "" si no hay nada (el llamador decide el mensaje honesto).
 * Nunca lanza.
 */
function resolveEndpoint(id: MediaProviderId, prefs: MediaPrefs): string {
  const custom = (prefs.customEndpoints?.[id] || "").trim();
  if (custom) return trimSlash(custom);
  const ossId = MEDIA_TO_OSS_SERVICE[id];
  if (ossId) {
    try {
      const conns = connectionsForService(ossId).filter((c) => c.enabled && (c.endpoint || "").trim());
      const first = conns[0];
      if (first?.endpoint) return trimSlash(first.endpoint);
    } catch {
      /* sin oss-connections utilizable: seguimos sin endpoint */
    }
  }
  return "";
}

// ────────────────────────────────────────────────────────────────────────────
// Resultado común de generación
// ────────────────────────────────────────────────────────────────────────────

/** Resultado de cualquier función de generación de este módulo. */
export interface MediaGenResult {
  ok: boolean;
  /** URL usable directamente (http(s), data: o blob:) cuando `ok`. */
  url?: string;
  /** Blob del medio, si se pudo traer (opcional; `url` ya es usable sin él). */
  blob?: Blob;
  /** Proveedor que REALMENTE respondió (puede ser distinto al pedido si hubo failover). */
  provider: MediaProviderId;
  /** Mensaje honesto en español cuando `ok:false`. */
  error?: string;
  /** Galería completa cuando se pidieron varias opciones (`opciones > 1` o el proveedor "neuronas"). */
  galeria?: GaleriaImagenes;
}

const POLLINATIONS_IMAGE_BASE = "https://image.pollinations.ai/prompt";
const POLLINATIONS_TEXT_BASE = "https://text.pollinations.ai";
const HF_INFERENCE_BASE = "https://api-inference.huggingface.co/models";
const HF_DEFAULT_IMAGE_MODEL = "stabilityai/stable-diffusion-xl-base-1.0";

const POLLINATIONS_IMAGE_TIMEOUT_MS = 45000;
const POLLINATIONS_AUDIO_TIMEOUT_MS = 30000;
const HF_TIMEOUT_MS = 60000;
/** Los servidores locales (A1111/Fooocus/ComfyUI/propio) pueden tardar sin GPU potente. */
const LOCAL_TIMEOUT_MS = 120000;

/** Mensaje honesto: por qué `generateVideo` puede devolver `ok:false`. Exportado para la UI. */
export const VIDEO_LIMIT_MESSAGE =
  "La generación de vídeo no tiene todavía un servicio GRATIS/web integrado (Pollinations no genera vídeo de forma fiable). Conecta tu propio servicio de vídeo (ComfyUI o un endpoint propio) en la configuración de esta habilidad.";

// ────────────────────────────────────────────────────────────────────────────
// IMAGEN — generateImage()
// ────────────────────────────────────────────────────────────────────────────

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
  provider?: MediaProviderId;
  neuronId?: string;
  negative?: string;
  /** Cuántas opciones generar a la vez (1–8). >1 activa la galería del proveedor "neuronas". */
  opciones?: number;
  /** Prioridad y permisos de la galería (proveedor "neuronas"). */
  prioridad?: "calidad" | "rapidez";
  comercial?: boolean;
  conReferencia?: boolean;
  permisoRemoto?: boolean;
  /** ComfyUI (imagen a imagen): nombre del archivo de entrada YA subido a /input del servidor (subirlo lo hace el cliente de flujos, IMG1020B). Con él, el flujo usa `imagenAImagen` en vez de `textoAImagen`. */
  imagenEntrada?: string;
  /** ComfyUI (imagen a imagen): cuánto reescribe el KSampler, de 0 a 1 (0,75 si no llega: revisa sin olvidar lo pedido). */
  denoise?: number;
  /** ComfyUI: muestreador del KSampler, de la lista blanca del núcleo (euler si no llega o no está en la lista). */
  muestreador?: string;
  /** ComfyUI: planificador del KSampler, de la lista blanca del núcleo (normal si no llega o no está en la lista). */
  planificador?: string;
}

/** Construye la imagen con Pollinations (siempre disponible; nunca lanza, siempre `ok:true` si hay prompt). */
async function pollinationsImage(opts: GenerateImageOptions): Promise<MediaGenResult> {
  const params = new URLSearchParams();
  const width = clampDim(opts.width);
  const height = clampDim(opts.height);
  if (width) params.set("width", String(width));
  if (height) params.set("height", String(height));
  if (typeof opts.seed === "number" && Number.isFinite(opts.seed)) {
    params.set("seed", String(Math.floor(opts.seed)));
  }
  if (opts.model && opts.model.trim()) params.set("model", opts.model.trim());
  if (opts.negative && opts.negative.trim()) params.set("negative", opts.negative.trim());
  params.set("nologo", "true");
  const url = `${POLLINATIONS_IMAGE_BASE}/${encodeURIComponent(opts.prompt)}?${params.toString()}`;
  // Best-effort: si el fetch→blob falla (CORS/timeout), la URL sigue siendo
  // perfectamente usable como <img src> — por eso `ok:true` no depende de él.
  const blob = await safeFetchBlob(url, {}, POLLINATIONS_IMAGE_TIMEOUT_MS, true);
  return { ok: true, url, blob: blob ?? undefined, provider: "pollinations" };
}

async function hfInferenceImage(opts: GenerateImageOptions): Promise<MediaGenResult> {
  const prefs = getMediaPrefs();
  const token = (prefs.hfToken || "").trim();
  if (!token) {
    return {
      ok: false,
      provider: "hf-inference",
      error: "Falta tu token gratuito de Hugging Face (pégalo en la configuración de esta habilidad).",
    };
  }
  const model = (opts.model || HF_DEFAULT_IMAGE_MODEL).trim();
  const url = `${HF_INFERENCE_BASE}/${encodeURI(model)}`;
  const body: Record<string, unknown> = { inputs: opts.prompt };
  if (opts.negative && opts.negative.trim()) {
    body.parameters = { negative_prompt: opts.negative.trim() };
  }
  const blob = await safeFetchBlob(
    url,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    HF_TIMEOUT_MS,
    true,
  );
  if (!blob) {
    return {
      ok: false,
      provider: "hf-inference",
      error: `Hugging Face no devolvió una imagen (modelo "${model}"). Puede estar "durmiendo" (reintenta en unos segundos) o el token/modelo no ser válido.`,
    };
  }
  const objUrl = safeObjectUrl(blob);
  return objUrl
    ? { ok: true, url: objUrl, blob, provider: "hf-inference" }
    : { ok: false, provider: "hf-inference", error: "No se pudo crear la vista previa de la imagen." };
}

/** POST genérico que espera un medio (JSON con url/base64, o binario directo si `tryBlobFirst`). */
async function postForMedia(
  url: string,
  providerId: MediaProviderId,
  kind: MediaKind,
  body: unknown,
  timeoutMs: number,
  tryBlobFirst = false,
): Promise<MediaGenResult> {
  if (tryBlobFirst) {
    const blob = await safeFetchBlob(
      url,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      timeoutMs,
      true,
    );
    if (blob) {
      const objUrl = safeObjectUrl(blob);
      if (objUrl) return { ok: true, url: objUrl, blob, provider: providerId };
    }
  }
  const res = await safeFetchJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  if (!res.ok) {
    return { ok: false, provider: providerId, error: netFailMessage(providerLabel(providerId), res, timeoutMs) };
  }
  const media = extractMediaUrl(res.data, res.text, kind);
  if (!media) {
    return {
      ok: false,
      provider: providerId,
      error: `${providerLabel(providerId)} respondió pero no reconocí el resultado en la respuesta.`,
    };
  }
  return { ok: true, url: media, provider: providerId };
}

async function a1111Image(opts: GenerateImageOptions): Promise<MediaGenResult> {
  const endpoint = resolveEndpoint("automatic1111", getMediaPrefs());
  if (!endpoint) {
    return {
      ok: false,
      provider: "automatic1111",
      error: "No hay un endpoint de AUTOMATIC1111 configurado (aquí o en /servicios).",
    };
  }
  const body: Record<string, unknown> = { prompt: opts.prompt, steps: 20 };
  if (opts.negative && opts.negative.trim()) body.negative_prompt = opts.negative.trim();
  const width = clampDim(opts.width);
  const height = clampDim(opts.height);
  if (width) body.width = width;
  if (height) body.height = height;
  if (typeof opts.seed === "number" && Number.isFinite(opts.seed)) body.seed = Math.floor(opts.seed);
  return postForMedia(joinUrl(endpoint, "/sdapi/v1/txt2img"), "automatic1111", "image", body, LOCAL_TIMEOUT_MS);
}

async function fooocusImage(opts: GenerateImageOptions): Promise<MediaGenResult> {
  const endpoint = resolveEndpoint("fooocus", getMediaPrefs());
  if (!endpoint) {
    return {
      ok: false,
      provider: "fooocus",
      error: "No hay un endpoint de Fooocus-API configurado (aquí o en /servicios).",
    };
  }
  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    negative_prompt: opts.negative && opts.negative.trim() ? opts.negative.trim() : "",
    async_process: false,
    require_base64: true,
  };
  if (typeof opts.seed === "number" && Number.isFinite(opts.seed)) body.image_seed = Math.floor(opts.seed);
  return postForMedia(joinUrl(endpoint, "/v1/generation/text-to-image"), "fooocus", "image", body, LOCAL_TIMEOUT_MS);
}

// ────────────────────────────────────────────────────────────────────────────
// ComfyUI de verdad: plantillas puras → grafo en formato API (IMG1020A + §2)
// ────────────────────────────────────────────────────────────────────────────

/** Checkpoint por defecto: SD 1.5, el instalado en el A1 (repos-libreria-1020d.md §7). Si el servidor no tiene ese archivo exacto, ComfyUI responde con node_errors y el fallo sale legible. */
const COMFYUI_CHECKPOINT_DEFECTO = "v1-5-pruned-emaonly.safetensors";

/** Proporción (ancho ÷ alto) de cada formato de publicación. */
const PROPORCION_FORMATO: Record<FormatoPublicacion, number> = { "1:1": 1, "4:5": 0.8, "9:16": 9 / 16, "16:9": 16 / 9 };

/** El formato de publicación cuya proporción más se acerca a la pedida; sin tamaño pedido, 1:1. */
export function formatoComfyuiMasCercano(ancho?: number, alto?: number): FormatoPublicacion {
  if (!ancho || !alto) return "1:1";
  const objetivo = ancho / alto;
  return FORMATOS_PUBLICACION.reduce((mejor, f) =>
    Math.abs(PROPORCION_FORMATO[f] - objetivo) < Math.abs(PROPORCION_FORMATO[mejor] - objetivo) ? f : mejor,
  );
}

/** Obtiene la lista de checkpoints disponibles en el servidor ComfyUI (GET /object_info/CheckpointLoaderSimple). */
export async function checkpointsDisponibles(endpoint: string): Promise<string[]> {
  if (!isClient() || typeof fetch === "undefined") return [];
  const url = joinUrl(endpoint, "/object_info/CheckpointLoaderSimple");
  try {
    const res = await fetch(url, { method: "GET", credentials: "omit", mode: "cors" });
    if (!res.ok) return [];
    const data = await res.json();
    const ckpt = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
    return Array.isArray(ckpt) ? ckpt : [];
  } catch {
    return [];
  }
}

/** Envía un grafo a ComfyUI (/prompt) y devuelve el prompt_id. */
async function comfyuiEnviarPrompt(endpoint: string, grafo: GrafoComfyUI): Promise<string | null> {
  if (!isClient() || typeof fetch === "undefined") return null;
  const url = joinUrl(endpoint, "/prompt");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ prompt: grafo }),
      credentials: "omit",
      mode: "cors",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.prompt_id === "string" ? data.prompt_id : null;
  } catch {
    return null;
  }
}

/** Espera a que termine la generación consultando /history/{prompt_id}. */
async function comfyuiEsperarHistorial(
  endpoint: string,
  promptId: string,
  timeoutMs: number,
): Promise<{ outputs: Record<string, unknown> } | null> {
  if (!isClient() || typeof fetch === "undefined") return null;
  const url = joinUrl(endpoint, `/history/${promptId}`);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET", credentials: "omit", mode: "cors" });
      if (res.ok) {
        const data = await res.json();
        const entry = data?.[promptId];
        if (entry?.outputs) return { outputs: entry.outputs };
      }
    } catch {
      /* ignorar y reintentar */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/** Descarga la imagen generada desde /view. */
async function comfyuiDescargarImagen(
  endpoint: string,
  filename: string,
  subfolder: string,
  type: string,
): Promise<Blob | null> {
  if (!isClient() || typeof fetch === "undefined") return null;
  const params = new URLSearchParams({ filename, subfolder, type });
  const url = `${joinUrl(endpoint, "/view")}?${params.toString()}`;
  try {
    const res = await fetch(url, { method: "GET", credentials: "omit", mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob && blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/** Ejecuta un grafo (o varios para variaciones) en ComfyUI y devuelve URLs de /view. */
async function comfyuiEjecutarGrafos(
  endpoint: string,
  grafos: GrafoComfyUI[],
  timeoutMs: number,
): Promise<string[]> {
  const urls: string[] = [];
  for (const grafo of grafos) {
    const promptId = await comfyuiEnviarPrompt(endpoint, grafo);
    if (!promptId) continue;
    const history = await comfyuiEsperarHistorial(endpoint, promptId, timeoutMs);
    if (!history) continue;
    for (const nodeOut of Object.values(history.outputs)) {
      const files = (nodeOut as { images?: Array<{ filename: string; subfolder: string; type: string }> })?.images;
      if (Array.isArray(files)) {
        for (const f of files) {
          const blob = await comfyuiDescargarImagen(endpoint, f.filename, f.subfolder, f.type);
          if (blob) {
            const objUrl = safeObjectUrl(blob);
            if (objUrl) urls.push(objUrl);
          }
        }
      }
    }
  }
  return urls;
}

/** Traduce la petición de imagen del OS a una plantilla pura del flujo (los lados son del formato; pasos/CFG/muestreo: valores sanos por defecto, acotados como pide la plantilla). */
export function peticionFlujoComfyui(opts: GenerateImageOptions): PeticionFlujo {
  const checkpoint = (opts.model || "").trim() || COMFYUI_CHECKPOINT_DEFECTO;
  const escala: EscalaImagen = /sd15|v1-5|1[.,]5/.test(checkpoint) ? "sd15" : "estandar";
  const semilla =
    typeof opts.seed === "number" && Number.isFinite(opts.seed)
      ? Math.max(0, Math.floor(opts.seed))
      : Math.floor(Math.random() * 2 ** 31);
  const texto: string = opts.muestreador || "";
  const tiempo: string = opts.planificador || "";
  return {
    checkpoint,
    positivo: opts.prompt,
    negativo: (opts.negative || "").trim(),
    formato: formatoComfyuiMasCercano(clampDim(opts.width), clampDim(opts.height)),
    escala,
    semilla,
    pasos: 20,
    cfg: 7,
    muestreador: (MUESTREADORES_COMFYUI as readonly string[]).includes(texto)
      ? (opts.muestreador as MuestreadorComfyUI)
      : "euler",
    planificador: (PLANIFICADORES_COMFYUI as readonly string[]).includes(tiempo)
      ? (opts.planificador as PlanificadorComfyUI)
      : "normal",
  };
}

/**
 * El GRAFO ComfyUI de una petición del OS, con el flujo que pide su enunciado:
 * `imagenAImagen` (LoadImage → VAEEncode → KSampler con `denoise`) cuando llega
 * `imagenEntrada`; `textoAImagen` en los demás casos. PURO: construye el grafo
 * en formato API, no lo envía (el envío lo hace `comfyuiImage`).
 * Nunca se deja sin valor un `denoise` de imagen a imagen: 0,75 si no llega.
 */
export function grafoComfyuiDe(opts: GenerateImageOptions): GrafoComfyUI {
  const base = peticionFlujoComfyui(opts);
  const entrada = (opts.imagenEntrada || "").trim();
  return entrada
    ? imagenAImagen({
        ...base,
        imagen: entrada,
        denoise:
          typeof opts.denoise === "number" && Number.isFinite(opts.denoise) ? opts.denoise : 0.75,
      })
    : textoAImagen(base);
}

export async function comfyuiImage(opts: GenerateImageOptions): Promise<MediaGenResult> {
  const endpoint = resolveEndpoint("comfyui", getMediaPrefs());
  if (!endpoint) {
    const p = peticionFlujoComfyui(opts);
    const lados = ladosFormato(p.formato, p.escala ?? "estandar");
    const mp = String(MEGAPIXELES[p.escala ?? "estandar"]).replace(".", ",");
    return {
      ok: false,
      provider: "comfyui",
      error: `No hay un endpoint de ComfyUI configurado (aquí o en /servicios). El flujo habría sido ${p.formato} a ${lados.ancho}×${lados.alto} (≈${mp} MP).`,
    };
  }
  const checkpointPref = (opts.model || "").trim();
  const checkpoints = checkpointPref ? [checkpointPref] : await checkpointsDisponibles(endpoint);
  if (!checkpoints.length) {
    return {
      ok: false,
      provider: "comfyui",
      error: "No hay checkpoints instalados en tu ComfyUI. Instala al menos uno (p. ej. v1-5-pruned-emaonly.safetensors) en la carpeta models/checkpoints.",
    };
  }
  const checkpoint = checkpoints[0];
  const nOpciones =
    typeof opts.opciones === "number" && Number.isFinite(opts.opciones)
      ? Math.max(1, Math.min(8, Math.floor(opts.opciones)))
      : 1;
  const basePeticion = peticionFlujoComfyui({ ...opts, model: checkpoint });
  let grafos: GrafoComfyUI[];
  if (nOpciones > 1) {
    const semillas = Array.from({ length: nOpciones }, (_, i) =>
      typeof opts.seed === "number" && Number.isFinite(opts.seed)
        ? Math.max(0, Math.floor(opts.seed)) + i
        : Math.floor(Math.random() * 2 ** 31) + i,
    );
    grafos = variaciones(basePeticion, semillas);
  } else {
    grafos = [grafoComfyuiDe({ ...opts, model: checkpoint })];
  }
  const fuera = [...new Set(grafos.flatMap((g) => Object.values(g).map((n) => n.class_type)))].filter(
    (tipo) => !(NODOS_NUCLEO as readonly string[]).includes(tipo),
  );
  if (fuera.length) {
    return {
      ok: false,
      provider: "comfyui",
      error: `El grafo lleva nodos fuera de la lista blanca del núcleo (${fuera.join(", ")}): no se envía.`,
    };
  }
  const urls = await comfyuiEjecutarGrafos(endpoint, grafos, LOCAL_TIMEOUT_MS);
  if (!urls.length) {
    return {
      ok: false,
      provider: "comfyui",
      error: "ComfyUI no devolvió imágenes (revisa /history para ver node_errors).",
    };
  }
  if (urls.length === 1) {
    return { ok: true, url: urls[0], provider: "comfyui" };
  }
  const capa: CapaImg = "dispositivo";
  const uso: UsoLicencia = "libre";
  const galeria: GaleriaImagenes = {
    ok: true,
    opciones: urls.map((u, i) => ({
      url: u,
      modelo: checkpoint,
      capa,
      neurona: "local",
      semilla: basePeticion.semilla + i,
      licencia: "GPL-3.0",
      uso,
      atribucion: "Generado con ComfyUI local",
      segundos: 0,
    })),
    descartes: [],
  };
  return { ok: true, url: urls[0], provider: "comfyui", galeria };
}

async function customEndpointImage(opts: GenerateImageOptions): Promise<MediaGenResult> {
  const endpoint = resolveEndpoint("custom-endpoint", getMediaPrefs());
  if (!endpoint) {
    return { ok: false, provider: "custom-endpoint", error: "No has configurado ningún endpoint propio." };
  }
  const body: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.negative && opts.negative.trim()) body.negative_prompt = opts.negative.trim();
  const width = clampDim(opts.width);
  const height = clampDim(opts.height);
  if (width) body.width = width;
  if (height) body.height = height;
  if (typeof opts.seed === "number" && Number.isFinite(opts.seed)) body.seed = Math.floor(opts.seed);
  return postForMedia(endpoint, "custom-endpoint", "image", body, LOCAL_TIMEOUT_MS, true);
}

/** Muapi: catalogado, pero HONESTO — no ejecuta una llamada de pago sin verificar. */
async function muapiImage(): Promise<MediaGenResult> {
  const prefs = getMediaPrefs();
  return {
    ok: false,
    provider: "muapi",
    error: (prefs.muapiKey || "").trim()
      ? "Muapi.ai todavía no está integrado como motor real de generación en esta habilidad (pasarela de pago de terceros; pendiente de integración). Se usará Pollinations mientras tanto."
      : "Muapi.ai es una pasarela de PAGO (necesitas tu propia clave en muapi.ai) y aún no está integrada como motor real aquí. Se usará Pollinations mientras tanto.",
  };
}

async function tryProviderImage(id: MediaProviderId, opts: GenerateImageOptions): Promise<MediaGenResult> {
  try {
    switch (id) {
      case "automatic1111":
        return await a1111Image(opts);
      case "fooocus":
        return await fooocusImage(opts);
      case "comfyui":
        return await comfyuiImage(opts);
      case "hf-inference":
        return await hfInferenceImage(opts);
      case "muapi":
        return await muapiImage();
      case "custom-endpoint":
        return await customEndpointImage(opts);
      case "pollinations":
      default:
        return await pollinationsImage(opts);
    }
  } catch (e) {
    return { ok: false, provider: id, error: safeErrMsg(e) };
  }
}

/**
 * Genera una imagen a partir de un prompt. GRATIS/LOCAL primero con failover:
 * usa el proveedor pedido (`opts.provider`) o el resuelto por preferencia
 * (`resolveProvider("image", opts.neuronId)`); si ese proveedor falla, cae
 * SIEMPRE a Pollinations (nunca deja al usuario sin imagen por un fallo de
 * conexión a un servicio opcional). Devuelve el proveedor que REALMENTE
 * respondió. Nunca lanza; SSR-safe.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<MediaGenResult> {
  if (!isClient()) {
    return {
      ok: false,
      provider: opts?.provider ?? "pollinations",
      error: "La generación de imágenes se hace desde el navegador.",
    };
  }
  const prompt = (opts?.prompt ?? "").toString().trim();
  if (!prompt) {
    return { ok: false, provider: opts?.provider ?? "pollinations", error: "Describe qué imagen quieres generar." };
  }
  const args: GenerateImageOptions = { ...opts, prompt };
  const chosen: MediaProviderId =
    opts.provider && MEDIA_PROVIDERS.some((p) => p.id === opts.provider)
      ? opts.provider
      : resolveProvider("image", opts.neuronId);

  // Galería: varias opciones a la vez repartidas por capas/neuronas (IMG1011B).
  const nOpciones =
    typeof opts.opciones === "number" && Number.isFinite(opts.opciones)
      ? Math.max(1, Math.min(8, Math.floor(opts.opciones)))
      : 1;
  if (nOpciones > 1 || chosen === "neuronas") {
    try {
      const mod = await import("./proveedor-neuronas");
      const galeria = await mod.generarGaleriaImagenes({
        prompt,
        opciones: nOpciones,
        ...(opts.prioridad ? { prioridad: opts.prioridad } : {}),
        comercial: opts.comercial === true,
        conReferencia: opts.conReferencia === true,
        permisoRemoto: opts.permisoRemoto === true,
        semillaBase:
          typeof opts.seed === "number" && Number.isFinite(opts.seed) ? Math.floor(opts.seed) : 1,
        viaWebGratis: async (semilla) => {
          const r = await pollinationsImage({
            prompt,
            width: opts.width,
            height: opts.height,
            seed: semilla,
            model: opts.model,
          });
          return r.ok && r.url ? { url: r.url } : null;
        },
      });
      if (galeria.ok) {
        const first = galeria.opciones.find((o) => o.url) ?? galeria.opciones[0];
        return { ok: true, ...(first?.url ? { url: first.url } : {}), provider: "neuronas", galeria };
      }
      // Regla de oro: si toda la galería falla, una imagen por la web gratis.
      const planB = await pollinationsImage(args);
      return { ...planB, galeria };
    } catch (e) {
      const planB = await pollinationsImage(args);
      return { ...planB, galeria: { ok: false, opciones: [], descartes: [], error: safeErrMsg(e) } };
    }
  }

  if (chosen === "pollinations") return pollinationsImage(args);

  const attempt = await tryProviderImage(chosen, args);
  if (attempt.ok) return attempt;
  // Failover honesto: Pollinations SIEMPRE disponible para imagen.
  return pollinationsImage(args);
}

// ────────────────────────────────────────────────────────────────────────────
// AUDIO — generateAudio()
// ────────────────────────────────────────────────────────────────────────────

export interface GenerateAudioOptions {
  /** Texto a convertir en voz (Pollinations sintetiza EXACTAMENTE este texto). */
  prompt: string;
  /** Voz a usar (según el proveedor; Pollinations acepta p.ej. "alloy", "nova"…). */
  voice?: string;
  provider?: MediaProviderId;
  neuronId?: string;
  model?: string;
}

/**
 * Texto→voz con Pollinations: `https://text.pollinations.ai/{prompt}?model=openai-audio&voice=…`.
 * Es SÍNTESIS DE VOZ del propio prompt (TTS), no generación musical — límite honesto.
 */
async function pollinationsAudio(prompt: string, voice?: string): Promise<MediaGenResult> {
  const v = (voice || "alloy").trim() || "alloy";
  const params = new URLSearchParams({ model: "openai-audio", voice: v });
  const url = `${POLLINATIONS_TEXT_BASE}/${encodeURIComponent(prompt)}?${params.toString()}`;
  const blob = await safeFetchBlob(url, {}, POLLINATIONS_AUDIO_TIMEOUT_MS, true);
  if (!blob) {
    return {
      ok: false,
      provider: "pollinations",
      error: "Pollinations no devolvió audio esta vez (puede estar saturado). Puedes reintentar en unos segundos.",
    };
  }
  const objUrl = safeObjectUrl(blob);
  return objUrl
    ? { ok: true, url: objUrl, blob, provider: "pollinations" }
    : { ok: false, provider: "pollinations", error: "No se pudo crear la vista previa del audio." };
}

/**
 * Genera audio (voz) a partir de un texto. Motor SIEMPRE disponible:
 * Pollinations (texto→voz). Si el proveedor elegido es un endpoint propio y
 * responde, se usa ese; en cualquier otro caso (incluida Muapi, sin integrar
 * todavía) cae honestamente a Pollinations. Nunca lanza; SSR-safe.
 */
export async function generateAudio(opts: GenerateAudioOptions): Promise<MediaGenResult> {
  if (!isClient()) {
    return { ok: false, provider: "pollinations", error: "La generación de audio se hace desde el navegador." };
  }
  const prompt = (opts?.prompt ?? "").toString().trim();
  if (!prompt) {
    return { ok: false, provider: "pollinations", error: "Escribe el texto que quieres convertir en voz." };
  }

  const requested =
    opts.provider && MEDIA_PROVIDERS.some((p) => p.id === opts.provider) ? opts.provider : undefined;
  const chosen: MediaProviderId =
    requested && providerSupportsKind(requested, "audio") ? requested : resolveProvider("audio", opts.neuronId);

  if (chosen === "custom-endpoint") {
    const endpoint = resolveEndpoint("custom-endpoint", getMediaPrefs());
    if (endpoint) {
      const res = await postForMedia(endpoint, "custom-endpoint", "audio", { prompt, voice: opts.voice }, LOCAL_TIMEOUT_MS, true);
      if (res.ok) return res;
    }
    return pollinationsAudio(prompt, opts.voice);
  }

  // Muapi (de pago, sin integrar) o cualquier otro caso → Pollinations, siempre disponible.
  return pollinationsAudio(prompt, opts.voice);
}

// ────────────────────────────────────────────────────────────────────────────
// VÍDEO — generateVideo()   (límite honesto: sin servicio propio, no hay vídeo)
// ────────────────────────────────────────────────────────────────────────────

export interface GenerateVideoOptions {
  prompt: string;
  /** Duración aproximada en segundos, si el servicio la admite. */
  seconds?: number;
  provider?: MediaProviderId;
  neuronId?: string;
  model?: string;
}

/**
 * Genera vídeo a partir de un prompt. LÍMITE HONESTO: no existe un motor
 * gratis/web fiable para vídeo (Pollinations no lo cubre) — solo funciona si
 * el usuario conectó un servicio propio (ComfyUI o un endpoint propio). Sin
 * eso, devuelve `ok:false` con `VIDEO_LIMIT_MESSAGE`; NUNCA inventa un vídeo.
 * Nunca lanza; SSR-safe.
 */
export async function generateVideo(opts: GenerateVideoOptions): Promise<MediaGenResult> {
  if (!isClient()) {
    return { ok: false, provider: opts?.provider ?? "custom-endpoint", error: "La generación de vídeo se hace desde el navegador." };
  }
  const prompt = (opts?.prompt ?? "").toString().trim();
  if (!prompt) {
    return { ok: false, provider: opts?.provider ?? "custom-endpoint", error: "Describe qué vídeo quieres generar." };
  }

  const requested =
    opts.provider && MEDIA_PROVIDERS.some((p) => p.id === opts.provider) ? opts.provider : undefined;
  const chosen: MediaProviderId =
    requested && providerSupportsKind(requested, "video") ? requested : resolveProvider("video", opts.neuronId);

  const prefs = getMediaPrefs();

  if (chosen === "custom-endpoint") {
    const endpoint = resolveEndpoint("custom-endpoint", prefs);
    if (!endpoint) return { ok: false, provider: "custom-endpoint", error: VIDEO_LIMIT_MESSAGE };
    return postForMedia(endpoint, "custom-endpoint", "video", { prompt, seconds: opts.seconds }, LOCAL_TIMEOUT_MS, true);
  }

  if (chosen === "comfyui") {
    const endpoint = resolveEndpoint("comfyui", prefs);
    if (!endpoint) return { ok: false, provider: "comfyui", error: VIDEO_LIMIT_MESSAGE };
    return postForMedia(joinUrl(endpoint, "/prompt"), "comfyui", "video", { prompt, seconds: opts.seconds }, LOCAL_TIMEOUT_MS, true);
  }

  if (chosen === "muapi") {
    return {
      ok: false,
      provider: "muapi",
      error: `Muapi.ai (vídeo) es una pasarela de pago y aún no está integrada como motor real aquí. ${VIDEO_LIMIT_MESSAGE}`,
    };
  }

  // Salvaguarda honesta: ningún proveedor gratis/web cubre vídeo todavía.
  return { ok: false, provider: chosen, error: VIDEO_LIMIT_MESSAGE };
}
