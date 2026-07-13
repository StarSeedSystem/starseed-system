"use client";

/**
 * capabilities — Detección y negociación de capacidades del entorno para la voz
 * natural de Aurora, en CUALQUIER dispositivo y navegador.
 * ----------------------------------------------------------------------------
 * Objetivo: que Aurora hable (o degrade con dignidad) siempre, pidiendo los
 * permisos correctos EN EL ORDEN correcto y adaptándose a lo que el contexto
 * permite, buscando el MÁXIMO acceso posible.
 *
 *   · Chrome / Edge / Safari  → SpeechRecognition (webkit) presente = voz FULL
 *     (reconocimiento de voz + síntesis).
 *   · Firefox / algunos WebView → sin SpeechRecognition = 'tts-only' (te hablo,
 *     tú escribes) o 'text-only' si tampoco hay síntesis. El chat sigue 100%.
 *   · Contexto no seguro (http sin localhost) → el micrófono no se concede;
 *     lo reportamos con honestidad para que la UI lo explique.
 *
 * TODO es defensivo y SSR-safe: jamás lanza, jamás rompe la app ni la voz
 * nativa. Sin dependencias nuevas.
 *
 * RESPALDO OPEN-SOURCE (aditivo, explícito): cuando NO hay reconocimiento de voz
 * nativo, existe un fallback OSS (transformers.js/Whisper por CDN, opt-in). Aquí
 * sólo EXPONEMOS si es viable (`ossSttAvailable`) y si el usuario lo activó
 * (`ossSttEnabled`). NUNCA cambiamos `voiceMode` por ello: el fallback es
 * explícito y se cablea desde su propio panel, no automáticamente.
 */

import { isOssSttSupported } from "@/lib/aurora/stt-oss/oss-stt";
import { isOssSttEnabled } from "@/lib/aurora/stt-oss/opt-in";
import { isMobileDevice, queryMicPermission } from "@/lib/aurora/voice-autonomy";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Modo de voz efectivo del entorno. */
export type VoiceMode = "full" | "tts-only" | "text-only";

/** Familia de navegador/motor deducida por User-Agent (heurística, best-effort). */
export type BrowserGuess =
  | "chrome"
  | "edge"
  | "safari"
  | "firefox"
  | "webview"
  | "unknown";

/** Estado del permiso de micrófono tras intentar obtenerlo. */
export type MicAccess = "granted" | "denied" | "unavailable";

/** Estado CONSULTADO del permiso de micrófono (Permissions API). */
export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

/** Informe completo de capacidades del entorno actual. */
export interface CapabilityReport {
  /** ¿Existe SpeechRecognition (STT) — nativo o webkit? */
  hasSpeechRecognition: boolean;
  /** ¿Existe síntesis de voz (TTS, window.speechSynthesis)? */
  hasTTS: boolean;
  /** ¿Existe navigator.mediaDevices.getUserMedia (captura de audio)? */
  hasMediaDevices: boolean;
  /** ¿Existe la Permissions API (navigator.permissions.query)? */
  hasPermissionsAPI: boolean;
  /** ¿Se puede entrar a pantalla completa (documentElement.requestFullscreen)? */
  canFullscreen: boolean;
  /** ¿Es un contexto seguro (https / localhost)? Requisito para el micrófono. */
  isSecureContext: boolean;
  /** Familia de navegador/motor deducida por UA. */
  browser: BrowserGuess;
  /** ¿Se ejecuta como PWA instalada (standalone)? */
  isStandalonePWA: boolean;
  /** ¿El puntero primario es grueso (móvil/tablet táctil)? */
  isCoarsePointer: boolean;
  /**
   * ¿Es un móvil/tablet? (Android · iOS · táctil). Reglas propias de STT: nunca
   * retener el micrófono con `getUserMedia`, y el permiso SIEMPRE se pide desde
   * un GESTO del usuario. Ver `isMobileDevice()` en `voice-autonomy.ts`.
   */
  isMobile: boolean;
  /**
   * Permiso de micrófono CONSULTADO (Permissions API), no supuesto. Arranca en
   * 'unknown' (la consulta es asíncrona) y el provider lo refresca al montar y
   * tras cada petición de acceso. Con 'prompt'/'denied' en MÓVIL, el toque del
   * orbe pide el permiso en el gesto — nunca arranca un STT que fallaría.
   */
  micPermission: MicPermission;
  /** Modo de voz efectivo derivado de lo anterior. */
  voiceMode: VoiceMode;
  /**
   * ¿Es viable el reconocimiento de voz OPEN-SOURCE de respaldo (transformers.js
   * por CDN)? Requiere WebAssembly + micrófono. Es INDEPENDIENTE de si el usuario
   * lo activó; sólo indica que el entorno podría ejecutarlo. NO altera voiceMode.
   */
  ossSttAvailable: boolean;
  /** ¿El usuario activó (opt-in) el respaldo OSS? (default false). */
  ossSttEnabled: boolean;
  /** Mensaje honesto y accionable para la UI según el contexto. */
  note: string;
}

/** Resultado de la petición de máximo acceso. */
export interface MaxAccessResult {
  /** Estado del micrófono tras pedirlo. */
  mic: MicAccess;
  /** ¿Se entró a pantalla completa? */
  fullscreen: boolean;
  /** Modo de voz efectivo (recalculado con el resultado del micrófono). */
  voiceMode: VoiceMode;
  /** Nota honesta para la UI. */
  note: string;
}

/** Opciones de requestMaxAccess. */
export interface RequestMaxAccessOptions {
  /**
   * ¿La llamada nace de un gesto del usuario? Solo entonces intentamos pantalla
   * completa (los navegadores exigen activación por gesto). Por defecto true.
   */
  fromUserGesture?: boolean;
  /**
   * ¿Intentar pantalla completa además del micrófono? Por defecto false: el
   * micrófono es el objetivo esencial; la pantalla completa es un extra opcional
   * que solo pedimos si se solicita explícitamente.
   */
  wantFullscreen?: boolean;
}

// ── Detección de bajo nivel (todo guardado) ──────────────────────────────────

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function detectSpeechRecognition(): boolean {
  if (!hasWindow()) return false;
  try {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    return typeof w.SpeechRecognition !== "undefined" || typeof w.webkitSpeechRecognition !== "undefined";
  } catch {
    return false;
  }
}

function detectTTS(): boolean {
  if (!hasWindow()) return false;
  try {
    return typeof window.speechSynthesis !== "undefined";
  } catch {
    return false;
  }
}

function detectMediaDevices(): boolean {
  if (typeof navigator === "undefined") return false;
  try {
    return !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
  } catch {
    return false;
  }
}

function detectPermissionsAPI(): boolean {
  if (typeof navigator === "undefined") return false;
  try {
    const anyNav = navigator as unknown as {
      permissions?: { query?: unknown };
    };
    return typeof anyNav.permissions?.query === "function";
  } catch {
    return false;
  }
}

function detectCanFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const el = document.documentElement as unknown as {
      requestFullscreen?: unknown;
      webkitRequestFullscreen?: unknown;
    };
    return typeof el?.requestFullscreen === "function" || typeof el?.webkitRequestFullscreen === "function";
  } catch {
    return false;
  }
}

function detectSecureContext(): boolean {
  if (!hasWindow()) return false;
  try {
    // isSecureContext cubre https + localhost + file según el navegador.
    if (typeof window.isSecureContext === "boolean") return window.isSecureContext;
    const host = window.location?.hostname || "";
    return (
      window.location?.protocol === "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1"
    );
  } catch {
    return false;
  }
}

function detectBrowser(): BrowserGuess {
  if (typeof navigator === "undefined") return "unknown";
  let ua = "";
  try {
    ua = (navigator.userAgent || "").toLowerCase();
  } catch {
    return "unknown";
  }
  if (!ua) return "unknown";
  // WebView primero: Android WebView (wv) o iOS in-app sin Safari/CriOS/FxiOS.
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const iosInApp = isIOS && !/safari|crios|fxios|edgios/.test(ua);
  if (/; wv\)/.test(ua) || /version\/[\d.]+ chrome\/[\d.]+ mobile/.test(ua) && /; wv/.test(ua) || iosInApp) {
    return "webview";
  }
  if (/edg\//.test(ua) || /edgios|edga/.test(ua)) return "edge";
  if (/firefox|fxios/.test(ua)) return "firefox";
  // Chrome antes que Safari (el UA de Chrome contiene "safari").
  if (/chrome|crios|chromium/.test(ua) && !/edg\//.test(ua)) return "chrome";
  if (/safari/.test(ua)) return "safari";
  return "unknown";
}

function detectStandalonePWA(): boolean {
  if (!hasWindow()) return false;
  try {
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    // iOS Safari legacy.
    const nav = navigator as unknown as { standalone?: boolean };
    return nav?.standalone === true;
  } catch {
    return false;
  }
}

function detectCoarsePointer(): boolean {
  if (!hasWindow()) return false;
  try {
    return window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  } catch {
    return false;
  }
}

// ── Derivación del modo de voz + nota honesta ────────────────────────────────

/**
 * Deriva el VoiceMode a partir de las capacidades. `micGranted` refina el
 * resultado tras pedir permiso: si hay STT pero el micrófono fue denegado o no
 * está disponible, el reconocimiento no puede funcionar → caemos a 'tts-only'.
 */
function deriveVoiceMode(
  hasSpeechRecognition: boolean,
  hasTTS: boolean,
  isSecureContext: boolean,
  micGranted?: boolean,
): VoiceMode {
  const sttUsable =
    hasSpeechRecognition && isSecureContext && (micGranted === undefined || micGranted === true);
  if (sttUsable) return "full";
  if (hasTTS) return "tts-only";
  return "text-only";
}

function noteFor(
  browser: BrowserGuess,
  hasSpeechRecognition: boolean,
  hasTTS: boolean,
  isSecureContext: boolean,
  voiceMode: VoiceMode,
  micDenied?: boolean,
): string {
  if (!isSecureContext) {
    return "Conexión no segura: el micrófono no está disponible aquí. Escríbeme y te respondo.";
  }
  if (micDenied) {
    return hasTTS
      ? "Sin permiso de micrófono. Escríbeme y te hablo; toca para volver a intentar el permiso."
      : "Sin permiso de micrófono. Escríbeme por el chat.";
  }
  if (voiceMode === "full") {
    return "Voz completa disponible: te escucho y te hablo.";
  }
  if (!hasSpeechRecognition) {
    // Firefox y algunos WebView no traen reconocimiento de voz.
    if (browser === "firefox") {
      return hasTTS
        ? "Este navegador (Firefox) no reconoce voz; escríbeme y te hablo."
        : "Este navegador (Firefox) no reconoce voz; escríbeme por el chat.";
    }
    return hasTTS
      ? "Este navegador no reconoce voz; escríbeme y te hablo."
      : "Este navegador no soporta voz; escríbeme por el chat.";
  }
  return hasTTS
    ? "Escríbeme y te hablo."
    : "Escríbeme por el chat.";
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * getCapabilities — Instantánea SSR-safe de las capacidades del entorno.
 * En servidor (sin window) devuelve un informe conservador 'text-only' que no
 * intenta nada; en cliente detecta todo y calcula el voiceMode.
 */
export function getCapabilities(): CapabilityReport {
  if (!hasWindow()) {
    return {
      hasSpeechRecognition: false,
      hasTTS: false,
      hasMediaDevices: false,
      hasPermissionsAPI: false,
      canFullscreen: false,
      isSecureContext: false,
      browser: "unknown",
      isStandalonePWA: false,
      isCoarsePointer: false,
      isMobile: false,
      micPermission: "unknown",
      voiceMode: "text-only",
      ossSttAvailable: false,
      ossSttEnabled: false,
      note: "Preparando el entorno…",
    };
  }

  const hasSpeechRecognition = detectSpeechRecognition();
  const hasTTS = detectTTS();
  const hasMediaDevices = detectMediaDevices();
  const hasPermissionsAPI = detectPermissionsAPI();
  const canFullscreen = detectCanFullscreen();
  const isSecureContext = detectSecureContext();
  const browser = detectBrowser();
  const isStandalonePWA = detectStandalonePWA();
  const isCoarsePointer = detectCoarsePointer();

  const voiceMode = deriveVoiceMode(hasSpeechRecognition, hasTTS, isSecureContext);
  const note = noteFor(browser, hasSpeechRecognition, hasTTS, isSecureContext, voiceMode);

  // Respaldo OSS: sólo lo REPORTAMOS (viable + opt-in). Todo defensivo; jamás
  // toca voiceMode ni carga transformers.js (importar sus detectores es barato).
  let ossSttAvailable = false;
  let ossSttEnabled = false;
  try {
    ossSttAvailable = isOssSttSupported();
  } catch {
    ossSttAvailable = false;
  }
  try {
    ossSttEnabled = isOssSttEnabled();
  } catch {
    ossSttEnabled = false;
  }

  return {
    hasSpeechRecognition,
    hasTTS,
    hasMediaDevices,
    hasPermissionsAPI,
    canFullscreen,
    isSecureContext,
    browser,
    isStandalonePWA,
    isCoarsePointer,
    isMobile: isMobileDevice(),
    // La consulta real del permiso es ASÍNCRONA: aquí queda 'unknown' y el
    // provider la refina con `withMicPermission()` al montar y tras pedir acceso.
    micPermission: "unknown",
    voiceMode,
    ossSttAvailable,
    ossSttEnabled,
    note,
  };
}

/**
 * Devuelve una COPIA del informe con el permiso de micrófono real ya aplicado
 * (recalculando `voiceMode` y la nota). Con el permiso DENEGADO no hay voz
 * completa por mucho que exista SpeechRecognition — antes lo dábamos por bueno y
 * la UI decía "voz completa" mientras Aurora estaba sorda. Nunca lanza.
 */
export function withMicPermission(
  report: CapabilityReport,
  micPermission: MicPermission,
): CapabilityReport {
  const micGranted =
    micPermission === "granted" ? true : micPermission === "denied" ? false : undefined;
  const voiceMode = deriveVoiceMode(
    report.hasSpeechRecognition,
    report.hasTTS,
    report.isSecureContext,
    micGranted,
  );
  const note = noteFor(
    report.browser,
    report.hasSpeechRecognition,
    report.hasTTS,
    report.isSecureContext,
    voiceMode,
    micPermission === "denied",
  );
  return { ...report, micPermission, voiceMode, note };
}

/**
 * Instantánea de capacidades CON el permiso de micrófono ya consultado. Es la
 * que debe usar cualquier decisión de "¿puedo escuchar aquí?". Nunca lanza.
 */
export async function getCapabilitiesWithMic(): Promise<CapabilityReport> {
  const base = getCapabilities();
  let perm: MicPermission = "unknown";
  try { perm = await queryMicPermission(); } catch { perm = "unknown"; }
  return withMicPermission(base, perm);
}

/**
 * requestMaxAccess — Pide el MÁXIMO acceso posible EN EL ORDEN correcto y
 * devuelve lo concedido. Nunca lanza.
 *
 *   (a) Micrófono vía getUserMedia({ audio: true }) si hay mediaDevices; tras
 *       confirmar, LIBERA el stream de prueba de inmediato (no dejamos el mic
 *       tomado — el reconocimiento de voz abrirá el suyo).
 *   (b) Pantalla completa vía documentElement.requestFullscreen SOLO si viene de
 *       un gesto del usuario y se solicitó (opt-in); envuelto en try/catch.
 *
 * Devuelve { mic, fullscreen, voiceMode, note } recalculando el voiceMode con
 * el resultado real del micrófono.
 */
export async function requestMaxAccess(
  opts: RequestMaxAccessOptions = {},
): Promise<MaxAccessResult> {
  const { fromUserGesture = true, wantFullscreen = false } = opts;
  const caps = getCapabilities();

  // (a) Micrófono ─ objetivo esencial para la voz completa.
  //
  // ⚠️ MÓVIL (Adenda 67 · P0-3): si el permiso YA está concedido, NO tocamos
  // `getUserMedia`. En Android abrir una captura paralela —aunque sea un sondeo
  // de un instante— le quita el micrófono al `SpeechRecognition` y lo deja
  // SORDO. El sondeo solo tiene sentido cuando falta el permiso (y entonces
  // llega desde un GESTO del usuario, que es lo que exige el navegador).
  let mic: MicAccess = "unavailable";
  let alreadyGranted = false;
  try {
    alreadyGranted = (await queryMicPermission()) === "granted";
  } catch { alreadyGranted = false; }

  if (alreadyGranted) {
    // Permiso vivo: nada de capturas paralelas. El STT abrirá el suyo.
    mic = "granted";
  } else if (caps.hasMediaDevices && caps.isSecureContext) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic = "granted";
      // Libera el stream de prueba de inmediato: no retenemos el micrófono.
      try {
        stream.getTracks().forEach((t) => {
          try { t.stop(); } catch { /* */ }
        });
      } catch { /* */ }
      // RESPIRO en móvil: Android tarda un instante en liberar el micrófono tras
      // parar las pistas. Sin esta pausa, el `SpeechRecognition` que arranca a
      // continuación se encuentra el mic ocupado (`audio-capture`/abort) y el
      // usuario ve "no escucha" justo después de conceder el permiso.
      if (isMobileDevice()) {
        await new Promise((r) => setTimeout(r, 350));
      }
    } catch (err) {
      // NotAllowedError / SecurityError → denegado; el resto → no disponible.
      const name = (err as { name?: string })?.name || "";
      mic = name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError"
        ? "denied"
        : "unavailable";
    }
  } else if (!caps.isSecureContext) {
    mic = "unavailable";
  } else {
    mic = "unavailable";
  }

  // (b) Pantalla completa ─ extra opcional, solo con gesto y si se pidió.
  let fullscreen = false;
  if (wantFullscreen && fromUserGesture && caps.canFullscreen) {
    try {
      const el = document.documentElement as unknown as {
        requestFullscreen?: () => Promise<void>;
        webkitRequestFullscreen?: () => Promise<void> | void;
      };
      if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
        fullscreen = true;
      } else if (typeof el.webkitRequestFullscreen === "function") {
        await Promise.resolve(el.webkitRequestFullscreen());
        fullscreen = true;
      }
    } catch {
      fullscreen = false; // el usuario puede rechazarlo; nunca rompemos.
    }
  }

  const micGranted = mic === "granted";
  const voiceMode = deriveVoiceMode(
    caps.hasSpeechRecognition,
    caps.hasTTS,
    caps.isSecureContext,
    micGranted,
  );
  const note = noteFor(
    caps.browser,
    caps.hasSpeechRecognition,
    caps.hasTTS,
    caps.isSecureContext,
    voiceMode,
    mic === "denied",
  );

  return { mic, fullscreen, voiceMode, note };
}

/**
 * Etiqueta corta para chips de UI según el modo de voz (cristalino, honesto).
 */
export function voiceModeChipLabel(mode: VoiceMode): string {
  switch (mode) {
    case "full":
      return "voz completa";
    case "tts-only":
      return "solo texto · te hablo";
    case "text-only":
    default:
      return "solo texto";
  }
}
