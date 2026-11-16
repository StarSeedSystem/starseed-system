/**
 * TU13 · Lógica pura del reconocimiento de voz.
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo SIN hooks React: entrada → salida, sin red, sin disco.
 * 
 * Esta es la parte pura que los tests pueden importar y probar sin necesidad
 * de un entorno React completo.
 */

// Tipos puros para el reconocimiento de voz
export type SttFatal = "not-allowed" | "service-not-allowed" | "no-speech" | "network" | "language-not-supported";

export interface OpcionIdioma {
  idioma: string;
}

/**
 * Configurador de reconocedor de voz (tipo estructural, sin any).
 * Acepta cualquier constructor de SpeechRecognition compatible (nativo o simulado en tests).
 */
export type SpeechRecognitionConstructor = new (...args: any[]) => any;

/**
 * Opciones para el envoltorio de reconocimiento de voz (modo puro, sin hooks).
 * ─────────────────────────────────────────────────────────────────────────────
 * Este módulo SIN hooks React: entrada → salida, sin red, sin disco.
 * 
 * Esta es la parte pura que los tests pueden importar y probar sin necesidad
 * de un entorno React completo.
 */

export interface OpcionesEscuchaPure {
  SpeechRecognition?: SpeechRecognitionConstructor;
}

/**
 * Configura un reconocedor de voz con los handlers dados.
 * Devuelve el reconocedor configurado o null si no está disponible.
 * Lanza ningún error: retorna null en caso de falta de soporte.
 */
export function configurarReconocedor(
  SpeechRecognition: any,
  onResultado: (texto: string, final: boolean) => void,
  onError: (msg: string) => void
): any | null {
  if (!SpeechRecognition) {
    onError("No se concedió el permiso de micrófono");
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous = true;
  rec.interimResults = true;

  rec.onstart = () => {
    // Señalaría al componente React que empezó a escuchar
  };

  rec.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      const isFinal = r.isFinal;
      const transcript = r[0] ? r[0].transcript : "";
      onResultado(transcript, isFinal);
    }
  };

  rec.onerror = (event: any) => {
    const err = event.error || "failed";
    let msg: string;
    switch (err) {
      case "not-allowed":
      case "service-not-allowed":
        msg = "No se concedió el permiso de micrófono";
        break;
      case "no-speech":
        msg = "No se detectó habla en el periodo de escucha";
        break;
      case "network":
        msg = "Error de red en el reconocimiento de voz";
        break;
      case "language-not-supported":
        msg = "El idioma no está soportado";
        break;
      default:
        msg = `Error de reconocimiento: ${err}`;
    }
    onError(msg);
  };

  rec.onend = () => {
    // Sesión terminó
  };

  return rec;
}

/**
 * Mapea un error del reconocedor a un mensaje en español.
 * Función pura: entrada → salida, sin efectos secundarios.
 */
export function mapearErrorStt(err: string): string {
  switch (err) {
    case "not-allowed":
    case "service-not-allowed":
      return "No se concedió el permiso de micrófono";
    case "no-speech":
      return "No se detectó habla en el periodo de escucha";
    case "network":
      return "Error de red en el reconocimiento de voz";
    case "language-not-supported":
      return "El idioma no está soportado";
    default:
      return `Error de reconocimiento: ${err}`;
  }
}

/**
 * Verifica si el reconocimiento de voz está disponible en el entorno.
 * Función pura: recibe el SpeechRecognition como parámetro, no accede a window directamente.
 * Retorna true solo si es una función constructora (typeof === "function").
 */
export function esReconocimientoDisponible(SpeechRecognition: any): boolean {
  return typeof SpeechRecognition === "function";
}

export type { SttFatal, OpcionIdioma, OpcionesEscuchaPure };