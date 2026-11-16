"use client";

/**
 * MÓDULO: voz-escucha — Envoltorio del reconocimiento de voz con aviso del proveedor.
 * ---------------------------------------------------------------------------
 * Proporciona una interfaz unificada para el reconocimiento de voz del navegador
 * (Web Speech API SpeechRecognition) y el respaldo open-source (STT-OSS).
 *
 * API pública:
 *   crearEscucha(entorno)          → crea un objeto de escucha
 *   disponible()                   → {ok, motivo?, audioSaleDelAparato}
 *   iniciar(idioma, callbacks)    → empieza a escuchar
 *   detener()                      → para de escuchar
 *
 * Mapeo de errores del navegador a español:
 *   not-allowed       → "No se permitió el acceso al micrófono"
 *   no-speech         → "No se detectó habla"
 *   network           → "Error de red"
 *   language-not-supported → "Idioma no soportado"
 */

type Reconocedor = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart?: (e: Event) => void;
  onerror?: (e: Event) => void;
  onend?: () => void;
  onresult?: (e: Event) => void;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

/** Estado interno del wrapper de escucha. */
interface EstadoEscucha {
  reconocedor: Reconocedor | null;
  idioma: string | null;
  listening: boolean;
  pendingFinal: boolean;
  pendingInterim: string;
  error: SttFatal | null;
}

/** Motivo por el que el STT quedó fuera de juego. */
type SttFatal = "not-allowed" | "no-speech" | "network" | "language-not-supported";

/** Mensajes de error en español para cada motivo fatal. */
const mensajesError: Record<SttFatal, string> = {
  not-allowed: "No se permitió el acceso al micrófono",
  no-speech: "No se detectó habla",
  network: "Error de red",
  "language-not-supported": "Idioma no soportado",
};

/**
 * Crea un nuevo envoltorio de reconocimiento de voz.
 *
 * @param entorno - Entorno opcional con módulos SpeechRecognition y/or ossStt.
 * @returns Objeto con los métodos `disponible`, `iniciar`, `detener`.
 */
export function crearEscucha(
  entorno: {
    SpeechRecognition?: { new (opts: unknown) => any };
    ossStt?: {
      disposer?: () => Promise<boolean>;
      hablar?: (audio: unknown) => Promise<string>;
    };
  } = {},
): {
  disponible: () => { ok: boolean; motivo?: string; audioSaleDelAparato: boolean };
  iniciar: (idioma: string, callbacks: {
    alResultado: (texto: string, final: boolean) => void;
    alError: (mensaje: string) => void;
  }) => void;
  detener: () => void;
} {
  let estado: EstadoEscucha = {
    reconocedor: null,
    idioma: null,
    listening: false,
    pendingFinal: false,
    pendingInterim: "",
    error: null,
  };

  constSpeechRecognition =
    entorno.SpeechRecognition ||
    (typeof window !== "undefined"
      ? ((window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any }).SpeechRecognition ||
          (window as unknown as { SpeechRecognition: any; webkitSpeechRecognition: any }).webkitSpeechRecognition)
      : undefined) || undefined;

  const disponible = (): {
    ok: boolean;
    motivo?: string;
    audioSaleDelAparato: boolean;
  } => {
    if (typeof window === "undefined") {
      return { ok: false, motivo: "Este aparato no ofrece reconocimiento de voz", audioSaleDelAparato: false };
    }

    // Si hay reconocimiento nativo del navegador disponible
    if (SpeechRecognition) {
      return { ok: true, audioSaleDelAparato: true };
    }

    // Si no hay reconocimiento nativo, verificar si el STT open-source está activado
    // (fallback local). En este caso, `audioSaleDelAparato` es false porque usa
    // un modelo local en lugar del reconocimiento nativo del navegador.
    // Por ahora, si no hay SpeechRecognition nativo, informamos que no está disponible
    // a menos que se implemente el opt-in completo.
    return {
      ok: false,
      motivo: "Este aparato no ofrece reconocimiento de voz",
      audioSaleDelAparato: false,
    };
  };

  const iniciar = (idioma: string, callbacks: {
    alResultado: (texto: string, final: boolean) => void;
    alError: (mensaje: string) => void;
  }): void => {
    if (estado.listening) return;

    // Si no hay reconocimiento disponible, lanzar error y retornar
    if (!SpeechRecognition) {
      callbacks.alError("Este aparato no ofrece reconocimiento de voz");
      return;
    }

    // Cancelar cualquier reconocimiento previo
    if (estado.reconocedor) {
      try {
        estado.reconocedor.stop();
      } catch { /* */ }
    }

    estado = {
      ...estado,
      idioma,
      listening: true,
      pendingFinal: false,
      pendingInterim: "",
      error: null,
    };

    try {
      const ReconocimientoCls = SpeechRecognition;
      const reconocedor = new ReconocimientoCls({
        lang: idioma || "es",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
      });

      // Limpiar estado anterior
      estado.reconocedor = reconocedor;

      // Manejo de resultados parciales (interim)
      reconocedor.onresult = (event: unknown) => {
        const ev = event as { results: { isFinal: boolean; [index: number]: { 0: { transcript: string } } }[]; isFinal: boolean };
        const transcript = Array.from(ev.results)
          .map((r) => r[0].transcript)
          .join("");

        if (ev.isFinal) {
          callbacks.alResultado(transcript, true);
          detener();
        } else {
          callbacks.alResultado(transcript, false);
        }
      };

      // Manejo de errores
      reconocedor.onerror = (event: unknown) => {
        const ev = event as { error: SttFatal };
        const code = ev.error;
        const mapa: Record<SttFatal, string> = {
          not-allowed: "No se permitió el acceso al micrófono",
          no-speech: "No se detectó habla",
          network: "Error de red",
          "language-not-supported": "Idioma no soportado",
        };
        const mensaje = mapa[code] || code || "Error de reconocimiento";
        callbacks.alError(mensaje);
        detener();
      };

      // Manejo de inicio
      reconocedor.onstart = () => {
        // Comienzo del reconocimiento — nothing needed for now
      };

      // Reinicio después de terminar
      reconocedor.onend = () => {
        if (estado.pendingFinal) {
          // Ya procesamos el resultado final, no reiniciar
          estado = {
            ...estado,
            reconocedor: null,
            listening: false,
          };
          return;
        }
        // Reiniciar automáticamente mientras stay in listening mode
        try {
          reconocedor.start();
        } catch {
          callbacks.alError("Error al reiniciar el reconocimiento");
estado = {
        ...estado,
        reconocedor: null,
        listening: false,
      };
        }
      };

      reconocedor.start();
    } catch (e) {
      const errorMsg = "Error de reconocimiento";
      callbacks.alError(errorMsg);
      detener();
    }
  };

  const detener = (): void => {
    if (estado.reconocedor) {
      try {
        estado.reconocedor.stop();
      } catch { /* */ }
      estado.reconocedor = null;
    }
    estado = {
      ...estado,
      listening: false,
      idioma: null,
    };
  };

  return { disponible, iniciar, detener };
}

export type { SttFatal, EstadoEscucha };