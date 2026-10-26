/**
 * Qué puede grabar ESTE navegador, sin pedir ningún permiso (puro).
 * ─────────────────────────────────────────────────────────────────────────────
 * Detecta APIs (no adivina por el nombre del navegador salvo en dos cosas que ninguna API revela:
 * si es iOS/Android y si el sonido del sistema es probable). Los permisos se piden solo al pulsar.
 *
 * Límites reales por navegador (resumen; el SOP `architecture/centro-control-logic.md` los detalla):
 *   · iPhone/iPad (Safari y cualquier navegador de iOS): NO existe `getDisplayMedia`.
 *   · Chrome para Android: tampoco. Sí hay cámara y micrófono.
 *   · Escritorio (Chrome, Edge, Firefox, Safari 13+): pantalla, ventana o pestaña.
 *   · Sonido del sistema: solo Chromium de escritorio (pestaña; pantalla entera en Windows/ChromeOS).
 *   · Hace falta contexto seguro (https o localhost).
 */

export type Plataforma = "ios" | "android" | "escritorio";

export type MotivoSinPantalla = "contexto-inseguro" | "sin-grabadora" | "ios" | "android" | "sin-api";

/** Lo mínimo del navegador que mira la detección (inyectable: así se prueba sin DOM). */
export interface EntornoGrabacion {
  mediaDevices: {
    getDisplayMedia?: unknown;
    getUserMedia?: unknown;
    getSupportedConstraints?: () => object;
  } | null;
  MediaRecorder: { isTypeSupported?: (mime: string) => boolean } | null;
  AudioContext: unknown;
  contextoSeguro: boolean;
  userAgent: string;
  /** `navigator.platform`. */
  plataforma: string;
  puntosTactiles: number;
}

export interface SoporteGrabacion {
  plataforma: Plataforma;
  contextoSeguro: boolean;
  grabadora: boolean;
  /** Se puede grabar pantalla, ventana o pestaña. */
  pantalla: boolean;
  /** Se puede grabar la cámara (sola o superpuesta). */
  camara: boolean;
  /** «probable» solo en Chromium de escritorio; en el resto no hay forma de pedirlo. */
  sonidoSistema: "probable" | "improbable";
  /** Qué contenedores sabe grabar la grabadora (según `isTypeSupported`). */
  formatos: { webm: boolean; mp4: boolean };
  /** Por qué no hay grabación de pantalla (null si la hay). */
  motivoSinPantalla: MotivoSinPantalla | null;
}

const esFuncion = (v: unknown): boolean => typeof v === "function";

export function plataformaDe(ua: string, plataforma: string, puntosTactiles: number): Plataforma {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ se presenta como un Mac con pantalla táctil.
  if (/Mac/i.test(plataforma) && puntosTactiles > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "escritorio";
}

export function detectarSoporte(e: EntornoGrabacion): SoporteGrabacion {
  const plataforma = plataformaDe(e.userAgent, e.plataforma, e.puntosTactiles);
  const md = e.mediaDevices;
  const grabadora = !!e.MediaRecorder;
  const hayDisplay = !!md && esFuncion(md.getDisplayMedia);
  const hayUsuario = !!md && esFuncion(md.getUserMedia);

  let motivoSinPantalla: MotivoSinPantalla | null = null;
  if (!e.contextoSeguro) motivoSinPantalla = "contexto-inseguro";
  else if (!hayDisplay) motivoSinPantalla = plataforma === "ios" ? "ios" : plataforma === "android" ? "android" : "sin-api";
  else if (!grabadora) motivoSinPantalla = "sin-grabadora";

  const chromium = /Chrome\/|Chromium\/|Edg\//.test(e.userAgent) && !/OPR\/|SamsungBrowser\//.test(e.userAgent);
  let sonidoSistema: SoporteGrabacion["sonidoSistema"] = "improbable";
  if (plataforma === "escritorio" && md) {
    let declarado = false;
    try {
      declarado = (md.getSupportedConstraints?.() as { systemAudio?: unknown } | undefined)?.systemAudio === true;
    } catch {
      declarado = false;
    }
    if (declarado || chromium) sonidoSistema = "probable";
  }

  const sabe = (mime: string): boolean => {
    try {
      return e.MediaRecorder?.isTypeSupported?.(mime) === true;
    } catch {
      return false;
    }
  };

  return {
    plataforma,
    contextoSeguro: e.contextoSeguro,
    formatos: { webm: sabe("video/webm"), mp4: sabe("video/mp4") },
    grabadora,
    pantalla: motivoSinPantalla === null,
    camara: e.contextoSeguro && grabadora && hayUsuario,
    sonidoSistema,
    motivoSinPantalla,
  };
}

/** El entorno real del navegador (en el servidor, uno vacío: nada es posible). */
export function entornoDelNavegador(): EntornoGrabacion {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { mediaDevices: null, MediaRecorder: null, AudioContext: null, contextoSeguro: false, userAgent: "", plataforma: "", puntosTactiles: 0 };
  }
  const w = window as unknown as {
    MediaRecorder?: EntornoGrabacion["MediaRecorder"];
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
    isSecureContext?: boolean;
  };
  let mediaDevices: EntornoGrabacion["mediaDevices"] = null;
  try {
    mediaDevices = navigator.mediaDevices ?? null;
  } catch {
    mediaDevices = null;
  }
  return {
    mediaDevices,
    MediaRecorder: w.MediaRecorder ?? null,
    AudioContext: w.AudioContext ?? w.webkitAudioContext ?? null,
    contextoSeguro: w.isSecureContext === true,
    userAgent: navigator.userAgent || "",
    plataforma: navigator.platform || "",
    puntosTactiles: navigator.maxTouchPoints || 0,
  };
}

export interface ConsejoSinPantalla {
  titulo: string;
  /** Una frase con el motivo, sin tecnicismos. */
  motivo: string;
  /** Qué hacer en este aparato, paso a paso. */
  pasos: string[];
}

/** Qué decirle a quien NO puede grabar la pantalla desde el navegador (sin botones muertos). */
export function consejoSinPantalla(motivo: MotivoSinPantalla): ConsejoSinPantalla {
  switch (motivo) {
    case "ios":
      return {
        titulo: "iPhone y iPad no dejan grabar la pantalla desde una página web",
        motivo: "Safari (y cualquier navegador de iOS) no incluye la función de compartir pantalla.",
        pasos: [
          "Abre Ajustes › Centro de control y añade «Grabación de pantalla».",
          "Desliza para abrir el Centro de control y pulsa el círculo para grabar; púlsalo de nuevo para parar.",
          "El vídeo queda en Fotos. Desde aquí sí puedes grabar con la cámara y el micrófono.",
        ],
      };
    case "android":
      return {
        titulo: "Chrome para Android no deja grabar la pantalla desde una página web",
        motivo: "El navegador del móvil no incluye la función de compartir pantalla.",
        pasos: [
          "Desliza hacia abajo el panel de ajustes rápidos y pulsa «Grabadora de pantalla».",
          "Si no aparece, edita el panel (lápiz) y añádela.",
          "Desde aquí sí puedes grabar con la cámara y el micrófono.",
        ],
      };
    case "contexto-inseguro":
      return {
        titulo: "La captura necesita una conexión segura",
        motivo: "El navegador solo permite compartir pantalla, cámara y micrófono en páginas https (o localhost).",
        pasos: ["Abre StarSeed OS por su dirección https y vuelve aquí."],
      };
    case "sin-grabadora":
      return {
        titulo: "Este navegador no incluye grabadora de vídeo",
        motivo: "Falta MediaRecorder, la pieza que convierte lo compartido en un archivo.",
        pasos: ["Prueba con una versión reciente de Chrome, Edge, Firefox o Safari de escritorio."],
      };
    default:
      return {
        titulo: "Este navegador no puede compartir la pantalla",
        motivo: "No ofrece la función de captura de pantalla.",
        pasos: ["Prueba con una versión reciente de Chrome, Edge, Firefox o Safari de escritorio."],
      };
  }
}
