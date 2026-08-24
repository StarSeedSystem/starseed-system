"use client";

/**
 * StarSeed OS — Bus de eventos de la Orbe Cuántica de Voz
 * ----------------------------------------------------------------------------
 * Puerto TIPADO, en miniatura, del patrón `on/off/emit` que el original usaba
 * para su singleton `omniVoice` (`/tmp/orig/services/omniVoice.js`, consumido
 * en `QuantumVoiceOrbWidget.jsx` como `omniVoice.on('state_change', cb)`,
 * `omniVoice.on('duplex_state', cb)`, `omniVoice.getFrequencyData()`, etc.).
 * Aquí no hay un motor de voz detrás — solo el CANAL: cualquier superficie
 * (el motor de voz real, un futuro puente del backend Astraura 1.58-bit, un
 * panel de depuración) puede publicar `state`/`level`/`frequencies`/`persona`/
 * `params` y cualquier `<QuantumOrb>`/`<QuantumOrbAvatar>` — o cualquier otro
 * componente — puede suscribirse sin acoplarse a quién produce los datos.
 *
 * Relación con `aurora-orb-bus.ts` (LEÍDO ANTES de escribir este archivo, tal
 * y como pide el encargo): ese bus ya resuelve, y muy bien, tres cosas MUY
 * específicas del orbe REDONDO existente — posición/visibilidad persistida,
 * el pulso `aurora:speak` del TTS y el `AnalyserNode` compartido del
 * micrófono (`acquireMicAnalyser`). Nada de eso sirve aquí tal cual:
 *   · No expone un `Uint8Array` de espectro completo (solo `level`+3 bandas),
 *     así que no cubre el evento `frequencies` (128 bins) que pide este
 *     encargo para las partículas ligadas a bin.
 *   · No sabe nada de "personalidad" ni de los parámetros expresivos
 *     (`turbulence`/`spikiness`/…) que el 1.58-bit puede generar — ese
 *     vocabulario es enteramente nuevo (`quantum-orb-theme.ts`).
 * Por eso este archivo NO duplica lo que ya existe (posición/visibilidad/mic
 * singleton siguen viviendo solo en `aurora-orb-bus.ts`) sino que añade el
 * canal complementario que faltaba. `aurora-orb.tsx` es quien conecta ambos
 * mundos: lee el nivel real del micrófono compartido de `aurora-orb-bus.ts` y
 * lo reemite aquí como `level`/`frequencies` para que `<QuantumOrb>` (y quien
 * más escuche) lo reciba de forma uniforme.
 *
 * 100% aditivo, sin dependencias externas y SSR-safe (no toca `window`).
 */

import type { QuantumOrbParams } from "./quantum-orb-theme";

/** Mismo vocabulario de estado que la prop `state` de `<QuantumOrb>`. */
export type QuantumOrbVoiceState =
  | "idle"
  | "listening"
  | "user_speaking"
  | "thinking"
  | "speaking"
  | "error";

/** Payload de cada evento publicable en el bus. */
export interface QuantumOrbBusEventMap {
  state: QuantumOrbVoiceState;
  level: number;
  frequencies: Uint8Array | null;
  persona: string;
  params: Partial<QuantumOrbParams>;
}

export type QuantumOrbBusEvent = keyof QuantumOrbBusEventMap;
type QuantumOrbListener<K extends QuantumOrbBusEvent> = (payload: QuantumOrbBusEventMap[K]) => void;
type ErasedListener = (payload: unknown) => void;

/**
 * Bus mínimo por tipo-borrado internamente (un único `Map` para todos los
 * eventos) pero con una superficie pública 100% tipada — cada `on`/`off`/
 * `emit` infiere el payload correcto a partir del nombre del evento, así que
 * nunca hace falta `any` para usarlo desde fuera.
 */
class QuantumOrbBus {
  private listeners = new Map<QuantumOrbBusEvent, Set<ErasedListener>>();

  /** Suscribe `cb` a `event`. Devuelve la función de baja (mismo patrón que `omniVoice.on`). */
  on<K extends QuantumOrbBusEvent>(event: K, cb: QuantumOrbListener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(cb as ErasedListener);
    return () => this.off(event, cb);
  }

  /** Da de baja `cb` de `event`. Seguro de llamar aunque ya estuviera de baja. */
  off<K extends QuantumOrbBusEvent>(event: K, cb: QuantumOrbListener<K>): void {
    this.listeners.get(event)?.delete(cb as ErasedListener);
  }

  /** Publica `payload` a todos los suscriptores de `event`. Nunca lanza. */
  emit<K extends QuantumOrbBusEvent>(event: K, payload: QuantumOrbBusEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    // Copia defensiva: un listener puede des-suscribirse a sí mismo al ser llamado.
    for (const cb of Array.from(set)) {
      try {
        (cb as QuantumOrbListener<K>)(payload);
      } catch {
        /* un suscriptor roto nunca debe tirar el bus ni al resto de oyentes */
      }
    }
  }

  /** Da de baja TODOS los oyentes de un evento (o de todos si se omite). Uso en tests/HMR. */
  clear(event?: QuantumOrbBusEvent): void {
    if (event) this.listeners.delete(event);
    else this.listeners.clear();
  }
}

/**
 * Singleton compartido por toda la app — igual que `omniVoice` en el
 * original. Importa `quantumOrbBus` donde haga falta publicar o escuchar.
 */
export const quantumOrbBus = new QuantumOrbBus();

// ── Azúcar sintáctico opcional (mismos nombres que el vocabulario del original) ──

export const onQuantumOrbState = (cb: QuantumOrbListener<"state">): (() => void) => quantumOrbBus.on("state", cb);
export const onQuantumOrbLevel = (cb: QuantumOrbListener<"level">): (() => void) => quantumOrbBus.on("level", cb);
export const onQuantumOrbFrequencies = (cb: QuantumOrbListener<"frequencies">): (() => void) =>
  quantumOrbBus.on("frequencies", cb);
export const onQuantumOrbPersona = (cb: QuantumOrbListener<"persona">): (() => void) =>
  quantumOrbBus.on("persona", cb);
/** El canal que usará el puente del backend Astraura 1.58-bit cuando exista. */
export const onQuantumOrbParams = (cb: QuantumOrbListener<"params">): (() => void) =>
  quantumOrbBus.on("params", cb);

export const emitQuantumOrbState = (state: QuantumOrbVoiceState): void => quantumOrbBus.emit("state", state);
export const emitQuantumOrbLevel = (level: number): void => quantumOrbBus.emit("level", level);
export const emitQuantumOrbFrequencies = (freq: Uint8Array | null): void =>
  quantumOrbBus.emit("frequencies", freq);
export const emitQuantumOrbPersona = (personaId: string): void => quantumOrbBus.emit("persona", personaId);
export const emitQuantumOrbParams = (params: Partial<QuantumOrbParams>): void =>
  quantumOrbBus.emit("params", params);
