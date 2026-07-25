/**
 * Constantes, tipos y helpers PUROS de la elección de voz POR NEURONA.
 *
 * Módulo deliberadamente LIVIANO: NO importa `react`, `react-dom` ni ningún
 * componente pesado del grafo de voz. Vive aparte de `voice-neuron-onboarding.tsx`
 * (que SÍ monta el componente React y se carga en el root layout) para EVITAR que
 * los módulos asíncronos que consumen estas constantes (p.ej.
 * `neuron-voice-choice.tsx` en páginas de ajustes) fuercen a
 * `voice-neuron-onboarding.tsx` a convertirse en un chunk COMPARTIDO asíncrono —
 * lo que provocaba una carrera de inicialización de React
 * ("Minified React error #310", intermitente solo en producción).
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

/** Clave localStorage de la elección de voz POR DISPOSITIVO (no viaja con la cuenta). */
export const NEURON_VOICE_LS_KEY = "starseed.voz.neurona.v2";
/** Evento para reabrir la ventana de elección sin recargar la página. */
export const NEURON_VOICE_REOPEN_EVENT = "starseed:voz-neurona-reopen";

const LATER_RETRY_MS = 24 * 60 * 60_000;
const DAEMON_STATUS = "http://127.0.0.1:4444/status";

/**
 * VERSIÓN DEL SISTEMA DE VOZ OMNIVOICE (Adenda 88 · petición de Alex).
 * ⬆️ SÚBELA cada vez que actualicemos el motor/comportamiento de voz. La elección
 * de cada neurona guarda la versión con la que se configuró; si al cargar la app
 * la versión guardada NO coincide con esta, la ventana de elección local/web se
 * REABRE automáticamente para que esa neurona reconfigure con la nueva versión —
 * aun para quienes ya habían elegido. Al elegir (o cerrar) se re-sella y no vuelve
 * a molestar hasta la próxima actualización.
 */
export const VOICE_SYSTEM_VERSION = 97;

// (Adenda 90) "fastweb": la neurona prefiere otros sistemas web automáticos
// (más rápidos, menos realistas que OpenVoice) en vez del predeterminado. Los
// cuatro modos son EXCLUYENTES entre sí: local / cloud / fastweb / later.
export type NeuronVoiceMode = "cloud" | "local" | "fastweb" | "later";

export interface NeuronVoiceChoice {
  mode: NeuronVoiceMode;
  at: number;
  /** Versión del sistema de voz con la que se configuró (Adenda 88). */
  sysV?: number;
}

/** Lee la elección de voz de ESTA neurona (o null si aún no eligió). Nunca lanza. */
export function readNeuronVoiceChoice(): NeuronVoiceChoice | null {
  try {
    const raw = safeGet(NEURON_VOICE_LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as NeuronVoiceChoice;
    return j &&
      (j.mode === "cloud" || j.mode === "local" || j.mode === "fastweb" || j.mode === "later")
      ? j
      : null;
  } catch {
    return null;
  }
}

/**
 * ¿La elección de esta neurona es de una versión ANTERIOR del sistema de voz?
 * (Entonces hay que reconfigurar con la nueva.) Una elección sin `sysV` cuenta
 * como obsoleta (se guardó antes del versionado). Nunca lanza.
 */
export function neuronVoiceChoiceIsStale(choice: NeuronVoiceChoice | null): boolean {
  if (!choice) return false; // sin elección aún: es la primera vez, no "obsoleta"
  return (choice.sysV ?? 0) !== VOICE_SYSTEM_VERSION;
}

/** Persiste la elección de voz de esta neurona (+ notifica a la UI). Nunca lanza. */
export function writeNeuronVoiceChoice(mode: NeuronVoiceMode): void {
  try {
    safeSet(
      NEURON_VOICE_LS_KEY,
      JSON.stringify({ mode, at: Date.now(), sysV: VOICE_SYSTEM_VERSION } satisfies NeuronVoiceChoice),
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(NEURON_VOICE_REOPEN_EVENT, { detail: { silent: true } }));
    }
  } catch {
    /* */
  }
}

/**
 * Reabre la ventana de elección de voz de la neurona: borra la elección y avisa a
 * la ventana global (montada en el layout) para que vuelva a preguntar SIN recargar
 * la página. Si por algún motivo no hay ventana montada, la próxima navegación la
 * mostrará igualmente. Nunca lanza.
 */
export function forceReopenNeuronVoiceWindow(): void {
  try {
    safeSet(NEURON_VOICE_LS_KEY, "");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(NEURON_VOICE_REOPEN_EVENT, { detail: { reopen: true } }));
    }
  } catch {
    /* */
  }
}

/** ¿Está el daemon local vivo y listo? Sonda corta; nunca lanza. */
export async function probeLocalDaemon(): Promise<boolean> {
  try {
    const r = await fetch(DAEMON_STATUS, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return false;
    const j = (await r.json()) as { ready?: boolean };
    return j?.ready === true;
  } catch {
    return false;
  }
}

/** Re-export interno para quienes necesiten el umbral de reintento "más tarde". */
export const NEURON_VOICE_LATER_RETRY_MS = LATER_RETRY_MS;
