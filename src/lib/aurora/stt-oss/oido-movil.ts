/**
 * Oído del MÓVIL sin nube · Ola 1105 · VOZ · 2026-11-05. Módulo PURO (sin DOM, red ni disco).
 * Contrato: architecture/voz-estable-1105.md §3.
 *
 * En Android el reconocedor del navegador termina tras cada frase o silencio y, al reiniciarlo,
 * PITA en cada arranque. Por eso la línea estable elige primero la nube; si no hay, Whisper ya
 * descargado; si no, el reconocedor SOLO al detectar voz (un pitido por turno, nunca en bucle).
 */

export type OidoMovilId = "nube" | "whisper-web" | "navegador-por-voz" | "navegador";

export interface OpcionesOidoMovil {
    /** Hay oído en la nube (`/api/voz/oir`): la línea estable por tramos. */
    nube: boolean;
    /** El modelo de Whisper en el navegador (`oss-stt.ts`) ya está descargado y listo. */
    whisperDescargado: boolean;
    /** El navegador tiene reconocimiento de voz nativo. */
    navegador: boolean;
}

export interface EleccionOidoMovil {
    motor: OidoMovilId;
    motivo: string;
}

/** Ciclos seguidos sin oír nada a partir de los cuales NO se reinicia el reconocedor. */
export const CICLOS_SILENCIO_SIN_REINICIO = 2;

export interface OpcionesReinicioNavegador {
    /** Ciclos consecutivos que terminaron sin transcribir nada. */
    ciclosEnSilencio: number;
    /** Hay un turno de la persona pendiente de cerrar. */
    enTurno: boolean;
}

export function elegirOidoMovil(opciones: OpcionesOidoMovil): EleccionOidoMovil {
    const { nube, whisperDescargado, navegador } = opciones;
    if (nube) {
        return { motor: "nube", motivo: "oído en la nube: línea estable por tramos, sin reiniciar el reconocedor" };
    }
    if (whisperDescargado) {
        return { motor: "whisper-web", motivo: "Whisper ya descargado en el navegador: oye sin nube y sin reinicios" };
    }
    if (navegador) {
        return { motor: "navegador-por-voz", motivo: "el reconocedor del navegador se abre solo al detectar voz: un pitido por turno" };
    }
    return { motor: "navegador", motivo: "sin nube, sin Whisper y sin detección de voz: queda el reconocedor del navegador como suelo" };
}

export function debeReiniciarNavegador(opciones: OpcionesReinicioNavegador): boolean {
    const { ciclosEnSilencio, enTurno } = opciones;
    const ciclos = Math.max(0, ciclosEnSilencio);
    if (!enTurno && ciclos >= CICLOS_SILENCIO_SIN_REINICIO) return false;
    return true;
}
