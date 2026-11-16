/**
 * TU1116-APP-F1 · Envoltorio del reconocimiento de voz
 * ─────────────────────────────────────────────────────────────────────────────
 * Provee una interfaz unificada para el reconocimiento de voz, con notificación
 * del proveedor activo. Soporta SpeechRecognition del navegador como vía
 * principal y un respaldo OSS (Whisper) cuando esté habilitado.
 */

export type IdiomaReconocimiento = "es" | "en" | "es-ES" | "es-MX" | "en-US" | "auto";

export type ErrorReconocimiento =
  | "not-allowed"
  | "no-speech"
  | "network"
  | "language-not-supported"
  | "audio-capture"
  | "service-not-allowed"
  | "failed";

export type ProveedorReconocimiento = "navegador" | "oss" | "nube" | "nulo";

export interface ResultadoReconocimiento {
  texto: string;
  provisional: boolean;
  proveedor: ProveedorReconocimiento;
}

export interface EscuchaVoz {
  disponible(): { ok: boolean; motivo?: string; audioSaleDelAparato: boolean };
  iniciar(idioma: IdiomaReconocimiento, opciones: {
    alResultado: (texto: ResultadoReconocimiento) => void;
    alError: (error: ErrorReconocimiento, mensaje: string) => void;
  }): void;
  detener(): void;
  enEscucha(): boolean;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: ((e: Event) => void) | null;
  onresult: ((e: { resultIndex: number; results: SpeechRecognitionResult[] }) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionEventCallback = (e: { resultIndex: number; results: SpeechRecognitionResult[] }) => void;

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export function mapErrorReconocimiento(err: string): ErrorReconocimiento {
  const e = err.toLowerCase();
  if (e === "not-allowed" || e === "service-not-allowed") return "not-allowed";
  if (e === "no-speech") return "no-speech";
  if (e === "network" || e.includes("fetch") || e.includes("networkerror") || e.includes("network error")) return "network";
  if (e === "language-not-supported" || e === "language-not-implemented") return "language-not-supported";
  if (e === "audio-capture" || e.includes("audio capture") || e.includes("audiodevice") || e.includes("audio capture")) return "audio-capture";
  if (e === "failed") return "failed";
  return "failed";
}

export function mensajeError(error: ErrorReconocimiento, idioma: IdiomaReconocimiento): string {
  const mensajes: Record<ErrorReconocimiento, Record<string, string>> = {
    "not-allowed": {
      es: "No se otorgó permiso para acceder al micrófono. Por favor, permite el acceso desde la configuración del navegador.",
      en: "Microphone access was not granted. Please allow microphone access in your browser settings.",
    },
    "no-speech": {
      es: "No se detectó habla. Por favor, habla clarificamente y verifica que el micrófono esté funcionando.",
      en: "No speech detected. Please speak clearly and check that your microphone is working.",
    },
    "network": {
      es: "Error de red al reconocer el habla. Verifica tu conexión a internet.",
      en: "Network error during speech recognition. Please check your internet connection.",
    },
    "language-not-supported": {
      es: `El idioma "${idioma}" no está soportado por el reconocimiento del navegador. Usa un idioma diferente.`,
      en: `Language "${idioma}" is not supported by browser speech recognition. Use a different language.`,
    },
    "audio-capture": {
      es: "No se pudo acceder al micrófono. Verifica que no esté en uso por otra aplicación.",
      en: "Could not access microphone. Check that it's not in use by another application.",
    },
    "service-not-allowed": {
      es: "El servicio de reconocimiento de voz no está disponible en este contexto.",
      en: "Speech recognition service is not allowed in this context.",
    },
    "failed": {
      es: "Falló el reconocimiento de voz. Por favor, reinicia el reconocimiento o verifica que el micrófono funcione.",
      en: "Speech recognition failed. Please restart recognition or check if your microphone works.",
    },
  };
  return mensajes[error][idioma];
}

export function crearEscucha(entorno: {
  SpeechRecognition?: { new (): SpeechRecognitionLike } | null;
  ossStt?: { estaHabilitado: () => boolean };
}): EscuchaVoz {
  let reconocimiento: SpeechRecognitionLike | null = null;
  let enActividad = false;
  let pronipcionOtorgado = false;

  function obtenerSpeechRecognition(): SpeechRecognitionLike | null {
    if (entorno.SpeechRecognition) {
      return new entorno.SpeechRecognition();
    }
    if (typeof window !== "undefined") {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) return new SR();
    }
    return null;
  }

  const disponible = (): { ok: boolean; motivo?: string; audioSaleDelAparato: boolean } => {
    const SR = obtenerSpeechRecognition();
    if (!SR) {
      if (entorno.ossStt?.estaHabilitado()) {
        return { ok: true, motivo: "oss-disponible", audioSaleDelAparato: false };
      }
      return { ok: false, motivo: "Este aparato no ofrece reconocimiento de voz", audioSaleDelAparato: false };
    }
    return { ok: true, audioSaleDelAparato: true };
  };

  const iniciar = (
    idioma: IdiomaReconocimiento,
    opciones: {
      alResultado: (texto: ResultadoReconocimiento) => void;
      alError: (error: ErrorReconocimiento, mensaje: string) => void;
    },
  ): void => {
    const sr = obtenerSpeechRecognition();
    if (!sr) {
      if (entorno.ossStt?.estaHabilitado()) {
        opciones.alError(
          "failed",
          "El reconocimiento OSS no está implementado en este envoltorio. Usa una implementación local.",
        );
        return;
      }
      opciones.alError("failed", "No hay motor de reconocimiento disponible");
      return;
    }

    try {
      sr.lang = idioma;
      sr.interimResults = true;
      sr.continuous = idioma === "auto" ? false : true;
      sr.maxAlternatives = 1;

      sr.onresult = (e: any) => {
        const idx = e.resultIndex || 0;
        const results = e.results || [];
        const ultimoResultado = results[idx];
        const texto = ultimoResultado?.[0]?.transcript || "";
        const esFinal = ultimoResultado?.isFinal || false;

        if (texto.trim()) {
          opciones.alResultado({
            texto,
            provisional: !esFinal,
            proveedor: "navegador",
          });
        }
      };

      sr.onerror = (e: any) => {
        const errStr = e?.error || "unknown";
        const error: ErrorReconocimiento = mapErrorReconocimiento(errStr);
        opciones.alError(error, mensajeError(error, idioma));
      };

      sr.onend = () => {
        reconocimiento = null;
        enActividad = false;
      };

      sr.start();
      reconocimiento = sr;
      enActividad = true;
      pronipcionOtorgado = true;
    } catch (err) {
      opciones.alError(
        "failed",
        "No se pudo iniciar el reconocimiento: " + (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const detener = (): void => {
    if (reconocimiento) {
      try {
        reconocimiento.stop();
      } catch {
        /* */
      }
    }
    enActividad = false;
    reconocimiento = null;
  };

  return {
    disponible,
    iniciar,
    detener,
    enEscucha: () => enActividad,
  };
}