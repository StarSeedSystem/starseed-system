"use client";

/**
 * StarSeed OS — Aurora "siempre encendida" (wake-word)
 * ----------------------------------------------------------------------------
 * Modo PASIVO de escucha en segundo plano: cuando el usuario activa "Aurora
 * siempre encendida", el reconocimiento de voz se mantiene vivo por el flujo
 * SUPERVISADO del provider (start() con backoff + watchdog), pero Aurora NO
 * responde a todo lo que oye. Sólo despierta cuando detecta la palabra clave
 * "aurora" en el transcript. Entonces:
 *
 *   1. onWake()  → entra en modo ACTIVO: la conversación arranca con el resto
 *      de la frase tras "aurora" (el comando limpio, vía stripWake()).
 *   2. tras ~6s sin habla nueva → onSleep() → vuelve al fondo pasivo.
 *
 * Este módulo NO toca el motor ni el provider: es un hook + helpers PUROS que
 * un componente cliente del Exocórtex cablea con useAurora() (leyendo
 * transcript/interim y llamando send()/speak()).
 *
 *  · SSR-safe: todo acceso a window/localStorage está guardado.
 *  · Sin dependencias nuevas.
 *  · Defensivo: entradas raras nunca rompen la detección.
 *
 * Persistencia del ajuste: `starseed.aurora.always-on` ("1"/"0", default OFF).
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Persistencia del ajuste "siempre encendida" ──────────────────────────────
/** Clave de localStorage del modo "Aurora siempre encendida" (versión-neutra). */
export const AURORA_ALWAYS_ON_KEY = "starseed.aurora.always-on";
/** Evento interno (mismo tab) emitido al cambiar el ajuste. */
export const AURORA_ALWAYS_ON_EVENT = "starseed:aurora-always-on";

/** La palabra clave que despierta a Aurora (normalizada, sin acentos). */
export const WAKE_WORD = "aurora";
/** Silencio (ms) tras el cual el modo activo vuelve al fondo pasivo. */
export const WAKE_SLEEP_MS = 6000;

// ── Normalización (acentos + minúsculas), igual que engine/actions ───────────
/**
 * Normaliza texto para comparaciones robustas: minúsculas, sin acentos
 * (NFD + quita marcas combinantes) y espacios colapsados. SSR-safe / defensivo.
 */
export function normalizeWake(text: unknown): string {
  const s = typeof text === "string" ? text : String(text ?? "");
  try {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return s.toLowerCase().replace(/\s+/g, " ").trim();
  }
}

/**
 * ¿Aparece la palabra clave "aurora" (como palabra, no como subcadena) en el
 * texto? Insensible a acentos/mayúsculas. Defensivo ante entradas no-string.
 */
export function containsWake(text: unknown, wake: string = WAKE_WORD): boolean {
  const hay = normalizeWake(text);
  if (!hay) return false;
  const needle = normalizeWake(wake) || WAKE_WORD;
  // Límite de palabra tolerante a puntuación (no exige \b, que falla con
  // acentos ya removidos): "aurora," / "¡aurora!" / "aurora?" cuentan.
  const re = new RegExp(`(^|[^a-z0-9])${escapeReg(needle)}([^a-z0-9]|$)`, "i");
  return re.test(` ${hay} `);
}

/**
 * Quita el "aurora" inicial (y una coma/espacio de cortesía) para pasar el
 * comando LIMPIO al motor. Si "aurora" aparece en medio, corta desde ahí hacia
 * adelante (lo que el usuario dijo tras nombrarla). Conserva el texto original
 * (mayúsculas/acentos) del comando, sólo recorta el prefijo hasta la palabra.
 *
 * Ejemplos:
 *   stripWake("Aurora, abre mis pizarras") → "abre mis pizarras"
 *   stripWake("oye aurora pon el tema oscuro") → "pon el tema oscuro"
 *   stripWake("aurora") → ""
 */
export function stripWake(text: unknown, wake: string = WAKE_WORD): string {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const needle = normalizeWake(wake) || WAKE_WORD;
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Trabajamos por TOKENS del texto ORIGINAL (conservando acentos/mayúsculas del
  // comando), comparando cada uno por su NÚCLEO alfanumérico normalizado. Esto es
  // robusto a la puntuación pegada ("aurora," / "¡aurora!") y a los acentos.
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  // Núcleo normalizado de un token (sin acentos, sin puntuación en los bordes).
  const core = (tok: string): string =>
    normalizeWake(tok).replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, "");

  // Última aparición de la palabra clave como token (lo dicho tras nombrarla).
  let idx = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (core(tokens[i]) === needle) idx = i;
  }

  if (idx === -1) {
    // La clave no es un token propio (p. ej. viene fusionada "auroraabre"): si el
    // núcleo del primer token empieza por la clave, quítala; si no, devuelve tal cual.
    const firstCore = core(tokens[0] ?? "");
    if (firstCore.startsWith(needle) && firstCore.length > needle.length) {
      const rest = tokens[0].replace(new RegExp(`^[^a-z0-9]*${escapeReg(needle)}`, "i"), "");
      return [rest, ...tokens.slice(1)].join(" ").replace(/^[\s,.;:!?¡¿]+/, "").trim();
    }
    return trimmed;
  }

  // Todo lo que sigue a la palabra clave = comando limpio (sin puntuación líder).
  const rest = tokens.slice(idx + 1).join(" ");
  return rest.replace(/^[\s,.;:!?¡¿]+/, "").trim();
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Lectura / escritura del ajuste (SSR-safe) ────────────────────────────────
/** ¿Está activado el modo "Aurora siempre encendida"? (default OFF). */
export function readAlwaysOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AURORA_ALWAYS_ON_KEY) === "1";
  } catch {
    return false;
  }
}

/** Activa/desactiva el modo y avisa a los suscriptores (mismo tab + storage). */
export function setAlwaysOn(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AURORA_ALWAYS_ON_KEY, on ? "1" : "0");
  } catch {
    /* defensivo */
  }
  try {
    window.dispatchEvent(new CustomEvent<boolean>(AURORA_ALWAYS_ON_EVENT, { detail: on }));
  } catch {
    /* defensivo */
  }
}

/** Suscribe a los cambios del ajuste (mismo tab vía evento, otros vía storage). */
export function subscribeAlwaysOn(cb: (on: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb(!!(e as CustomEvent<boolean>).detail);
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_ALWAYS_ON_KEY) cb(readAlwaysOn());
  };
  window.addEventListener(AURORA_ALWAYS_ON_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AURORA_ALWAYS_ON_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Hook reactivo para el ajuste "siempre encendida": [on, setOn]. El setter
 * persiste y notifica; el estado se sincroniza entre pestañas.
 */
export function useAlwaysOn(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOn(readAlwaysOn());
    return subscribeAlwaysOn(setOn);
  }, []);
  const set = useCallback((v: boolean) => {
    setAlwaysOn(v);
    setOn(v); // optimista: no esperamos el rebote del evento
  }, []);
  return [on, set];
}

// ── Hook principal: useWakeWord ──────────────────────────────────────────────
export interface UseWakeWordOptions {
  /** ¿El modo "siempre encendida" está activo? Si es false, el hook no hace nada. */
  enabled: boolean;
  /** Transcript FINAL más reciente del motor (frases reconocidas). */
  transcript: string;
  /** Transcript PARCIAL en curso (mientras el usuario habla). */
  interim: string;
  /**
   * Aurora despierta: se detectó "aurora". Recibe el comando LIMPIO (lo dicho
   * tras la palabra clave, o "" si sólo se la nombró). El consumidor decide si
   * lo envía a send() al instante o al dormir.
   */
  onWake: (command: string) => void;
  /** Vuelve al fondo pasivo tras el silencio (WAKE_SLEEP_MS sin habla nueva). */
  onSleep?: () => void;
  /** Se detectó habla nueva estando ya despierta (para acumular el comando). */
  onSpeech?: (command: string) => void;
  /** Silencio (ms) antes de dormir. Por defecto WAKE_SLEEP_MS. */
  sleepMs?: number;
}

export interface UseWakeWordState {
  /** ¿Aurora está en modo ACTIVO (despierta por la palabra clave)? */
  awake: boolean;
  /** Fuerza el despertar manualmente (p. ej. desde un botón). */
  wake: (command?: string) => void;
  /** Fuerza volver al fondo pasivo manualmente. */
  sleep: () => void;
}

/**
 * Observa transcript/interim y despierta a Aurora cuando aparece "aurora".
 * PURO respecto al motor: no lo importa ni lo llama; el consumidor conecta los
 * callbacks con useAurora().send()/speak(). Cuando `enabled` es false, queda
 * inerte (y duerme si estaba despierta).
 */
export function useWakeWord(opts: UseWakeWordOptions): UseWakeWordState {
  const {
    enabled,
    transcript,
    interim,
    onWake,
    onSleep,
    onSpeech,
    sleepMs = WAKE_SLEEP_MS,
  } = opts;

  const [awake, setAwake] = useState(false);
  const awakeRef = useRef(false);
  awakeRef.current = awake;

  // Callbacks en refs para no re-armar timers/efectos por identidad cambiante.
  const cbRef = useRef({ onWake, onSleep, onSpeech });
  cbRef.current = { onWake, onSleep, onSpeech };

  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Última señal (transcript o interim) ya procesada, para no repetir.
  const lastSeenRef = useRef<string>("");

  const clearSleepTimer = useCallback(() => {
    if (sleepTimer.current) {
      clearTimeout(sleepTimer.current);
      sleepTimer.current = null;
    }
  }, []);

  const doSleep = useCallback(() => {
    clearSleepTimer();
    if (!awakeRef.current) return;
    awakeRef.current = false;
    setAwake(false);
    try {
      cbRef.current.onSleep?.();
    } catch {
      /* defensivo */
    }
  }, [clearSleepTimer]);

  const armSleep = useCallback(() => {
    clearSleepTimer();
    sleepTimer.current = setTimeout(() => {
      doSleep();
    }, Math.max(1000, sleepMs));
  }, [clearSleepTimer, doSleep, sleepMs]);

  const wake = useCallback(
    (command = "") => {
      const wasAwake = awakeRef.current;
      awakeRef.current = true;
      if (!wasAwake) setAwake(true);
      if (!wasAwake) {
        try {
          cbRef.current.onWake?.(command);
        } catch {
          /* defensivo */
        }
      } else if (command) {
        try {
          cbRef.current.onSpeech?.(command);
        } catch {
          /* defensivo */
        }
      }
      armSleep();
    },
    [armSleep],
  );

  const sleep = useCallback(() => {
    doSleep();
  }, [doSleep]);

  // Si se desactiva el modo, duerme y limpia (queda totalmente inerte).
  useEffect(() => {
    if (!enabled) {
      lastSeenRef.current = "";
      doSleep();
    }
    return () => clearSleepTimer();
  }, [enabled, doSleep, clearSleepTimer]);

  // Observa el transcript FINAL: dispara despertar / acumula comando.
  useEffect(() => {
    if (!enabled) return;
    const t = (transcript || "").trim();
    if (!t || t === lastSeenRef.current) return;
    lastSeenRef.current = t;

    if (awakeRef.current) {
      // Ya despierta: cualquier frase nueva es comando; reinicia el silencio.
      // Si vuelve a nombrarla, limpiamos el "aurora" del frente igualmente.
      const cmd = containsWake(t) ? stripWake(t) : t;
      wake(cmd);
      return;
    }
    if (containsWake(t)) {
      wake(stripWake(t));
    }
  }, [enabled, transcript, wake]);

  // Observa el transcript PARCIAL: sólo para mantener despierta (habla en curso)
  // y para un despertar temprano si la palabra clave ya asoma en el interim.
  useEffect(() => {
    if (!enabled) return;
    const it = (interim || "").trim();
    if (!it) return;
    if (awakeRef.current) {
      // Habla nueva en curso → posponer el sueño (no envía comando aún).
      armSleep();
      return;
    }
    if (containsWake(it)) {
      // Despertar temprano por la parcial; el comando llegará con el final.
      wake(stripWake(it));
    }
  }, [enabled, interim, wake, armSleep]);

  return { awake, wake, sleep };
}

export default useWakeWord;
