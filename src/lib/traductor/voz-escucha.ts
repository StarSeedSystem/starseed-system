/**
 * TU1116-APP-F1 · Envoltorio del reconocimiento de voz
 * RAIZ DEL REPOSITORIO: `/home/runner/work/_temp/starseed-wt/TU13`
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo puro (sin red, sin disco, sin procesos lanzados).
 * Ofrece un envoltorio uniforme para SpeechRecognition (navegador) y el
 * respaldo OSS (transformers.js/Whisper). Se inyectan las dependencias.
 */

export type EstadoEscucha = "disponible" | "no-disponible" | "error";

export interface InformeEscucha {
    ok: boolean;
    motivo?: string;
    audioSaleDelAparato: boolean;
}

export interface ResultadoReconocimiento {
    texto: string;
    final: boolean;
}

export interface CallbacksReconocimiento {
    alResultado: (texto: string, final: boolean) => void;
    alError: (msg: string) => void;
}

export type SpeechRecognitionLike = {
    lang: string;
    interimResults: boolean;
    continuous: boolean;
    onresult: ((ev: SpeechRecognitionEvent) => void) | null;
    onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
    onend: ((ev: Event) => void) | null;
    start: () => void;
    stop: () => void;
};

export interface EntornoEscucha {
    SpeechRecognition?: {
        new (): SpeechRecognitionLike;
    };
    webkitSpeechRecognition?: {
        new (): SpeechRecognitionLike;
    };
    ossStt?: {
        iniciar: (idioma: string, callbacks: CallbacksReconocimiento) => Promise<void>;
        detener: () => void;
        disponible: () => InformeEscucha;
    };
    ossModeloCargado?: () => boolean;
}

function mapearError(type: string): string {
    const errores: Record<string, string> = {
        "not-allowed": "No se ha concedido el permiso de micrófono.toca para autorizarlo",
        "permission-denied": "Permiso de micrófono denegado. Escríbeme y te respondo",
        "no-speech": "No se detectó voz. intenta de nuevo",
        "audio-capture": "El micrófono está ocupado o no disponible",
        "network": "Error de red al reconocer. verifica tu conexión",
        "language-not-supported": "Idioma no soportado por el reconocimiento",
        "aborted": "Reconocimiento cancelado",
        "service-not-allowed": "El servicio de reconocimiento no está disponible",
    };
    return errores[type] ?? "Error inesperado en el reconocimiento de voz";
}

export function crearEscucha(entorno: EntornoEscucha): {
    disponible: () => InformeEscucha;
    iniciar: (idioma: string, callbacks: CallbacksReconocimiento) => Promise<void>;
    detener: () => void;
} {
    let activo = false;
    let reconocimiento: SpeechRecognitionLike | null = null;
    let callbacksActuales: CallbacksReconocimiento | null = null;

    const srNativo = entorno.SpeechRecognition ?? entorno.webkitSpeechRecognition;

    function getSrNativo(): SpeechRecognitionLike | null {
        if (!srNativo) return null;
        try {
            return new srNativo();
        } catch {
            return null;
        }
    }

    return {
        disponible: (): InformeEscucha => {
            if (srNativo) {
                return {
                    ok: true,
                    audioSaleDelAparato: true,
                };
            }

            if (entorno.ossStt) {
                const ossDisp = entorno.ossStt.disponible();
                if (ossDisp.ok) {
                    return {
                        ok: true,
                        audioSaleDelAparato: false,
                    };
                }
            }

            return {
                ok: false,
                motivo: "Este aparato no ofrece reconocimiento de voz",
                audioSaleDelAparato: false,
            };
        },

        iniciar: async (idioma: string, callbacks: CallbacksReconocimiento): Promise<void> => {
            if (activo) {
                callbacks.alError("Ya hay una sesión de reconocimiento activa");
                return;
            }

            callbacksActuales = callbacks;

            if (srNativo) {
                const rec = getSrNativo();
                if (!rec) {
                    activo = false;
                    callbacks.alError("No se pudo crear el reconocimiento nativo");
                    return;
                }

                try {
                    rec.lang = idioma;
                    rec.interimResults = true;
                    rec.continuous = true;

                    rec.onresult = (ev: SpeechRecognitionEvent) => {
                        const evento = ev as unknown as { results?: SpeechRecognitionAlternativeList };
                        if (!evento.results) return;
                        const resultado = evento.results[evento.results.length - 1];
                        if (resultado && resultado.isFinal) {
                            callbacks.alResultado(resultado[0].transcript, true);
                        } else if (evento.results.length > 0) {
                            const interino = evento.results[0][0].transcript;
                            callbacks.alResultado(interino, false);
                        }
                    };

                    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
                        const error = ev as unknown as { error?: string };
                        const motivo = mapearError(error.error ?? "unknown");
                        callbacks.alError(motivo);
                        detener();
                    };

                    rec.onend = () => {
                        if (activo) {
                            callbacks.alError("Sesión terminada inesperadamente");
                        }
                        activo = false;
                        reconocimiento = null;
                    };

                    rec.start();
                    activo = true;
                    reconocimiento = rec;
                } catch (e) {
                    activo = false;
                    reconocimiento = null;
                    callbacks.alError("Error al iniciar el reconocimiento nativo");
                }

                return;
            }

            if (entorno.ossStt) {
                try {
                    await entorno.ossStt.iniciar(idioma, callbacks);
                    activo = true;
                } catch {
                    activo = false;
                    callbacksActuales = null;
                    callbacks.alError("No se pudo iniciar el reconocimiento OSS");
                }
                return;
            }

            activo = false;
            callbacksActuales = null;
            callbacks.alError("Este aparato no ofrece reconocimiento de voz");
        },

        detener: () => {
            if (reconocimiento) {
                try {
                    reconocimiento.stop();
                } catch {
                    /* */
                }
                reconocimiento = null;
            }
            if (entorno.ossStt && activo) {
                entorno.ossStt.detener();
            }
            activo = false;
            callbacksActuales = null;
        },
    };
}