"use client";

/**
 * StarSeed OS — Aurora · Hook del wake-word ACÚSTICO LOCAL
 * ----------------------------------------------------------------------------
 * Envuelve `porcupine-wake.ts` en un hook reactivo y SSR-safe para el panel del
 * Exocórtex. Gestiona:
 *   · El opt-in persistido (`starseed.aurora.wake.acoustic`) y su AccessKey.
 *   · El ciclo de vida del detector: arranca al activarse (y si `active`), lo
 *     detiene al desactivarse o al desmontar. Reinicia si cambia el AccessKey.
 *   · Estado para la UI: engine efectivo, status (idle/starting/listening/…),
 *     último error, y marca de tiempo del último despertar (para un destello).
 *
 * NO instancia Aurora ni toca su motor: el detector, al disparar, activa la voz
 * de Aurora por el puente global (ver `porcupine-wake.ts`). El hook sólo cablea.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAcousticWakeSupported,
  readAcousticWake,
  readPorcupineKey,
  setAcousticWake,
  setPorcupineKey,
  startAcousticWake,
  stopAcousticWake,
  subscribeAcousticWake,
  hasWebAssembly,
  type AcousticWakeEngine,
  type AcousticWakeSession,
  type AcousticWakeStatus,
} from "@/lib/aurora/wake-acoustic/porcupine-wake";

export interface UseAcousticWakeOptions {
  /**
   * Gate externo: además del opt-in, sólo escuchamos si esto es `true` (p. ej.
   * cuando Aurora está encendida y soportada). Por defecto `true`.
   */
  active?: boolean;
  /**
   * Callback opcional al despertar (además de que el detector active la voz de
   * Aurora por el puente). Recibe el motor que detectó.
   */
  onWake?: (engine: AcousticWakeEngine) => void;
}

export interface UseAcousticWakeState {
  /** Opt-in persistido (default OFF). */
  enabled: boolean;
  /** Activa/desactiva el opt-in (persiste + notifica). */
  setEnabled: (on: boolean) => void;
  /** AccessKey de Picovoice (persistido). Vacío ⇒ respaldo simple. */
  accessKey: string;
  /** Guarda/borra el AccessKey (persiste; reinicia el detector si procede). */
  setAccessKey: (key: string) => void;
  /** ¿El navegador admite captura para el wake-word acústico? */
  supported: boolean;
  /** ¿Hay WebAssembly? (necesario para Porcupine; el respaldo no lo necesita). */
  wasm: boolean;
  /** Estado del detector para la UI. */
  status: AcousticWakeStatus;
  /** Motor efectivo actual ("porcupine" | "energy") o null si inactivo. */
  engine: AcousticWakeEngine | null;
  /** Último error no fatal (o cadena vacía). */
  error: string;
  /** Marca de tiempo (ms) del último despertar, para un destello en la UI. */
  lastWakeAt: number;
  /** ¿El detector está escuchando ahora mismo? */
  listening: boolean;
}

/** Hook reactivo que cablea el wake-word acústico con el panel. SSR-safe. */
export function useAcousticWake(opts: UseAcousticWakeOptions = {}): UseAcousticWakeState {
  const { active = true, onWake } = opts;

  const [enabled, setEnabledState] = useState(false);
  const [accessKey, setAccessKeyState] = useState("");
  const [supported, setSupported] = useState(false);
  const [wasm, setWasm] = useState(false);
  const [status, setStatus] = useState<AcousticWakeStatus>("idle");
  const [engine, setEngine] = useState<AcousticWakeEngine | null>(null);
  const [error, setError] = useState("");
  const [lastWakeAt, setLastWakeAt] = useState(0);

  const sessionRef = useRef<AcousticWakeSession | null>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  // Init + suscripción al opt-in (sincroniza entre pestañas).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabledState(readAcousticWake());
    setAccessKeyState(readPorcupineKey());
    setSupported(isAcousticWakeSupported());
    setWasm(hasWebAssembly());
    return subscribeAcousticWake(setEnabledState);
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setAcousticWake(on);
    setEnabledState(on); // optimista
  }, []);

  const setAccessKey = useCallback((key: string) => {
    setPorcupineKey(key);
    setAccessKeyState((key || "").trim());
  }, []);

  // ¿Debemos estar escuchando? opt-in + gate externo + soporte.
  const shouldListen = enabled && active && supported;

  // Ciclo de vida del detector. Se re-evalúa si cambian shouldListen o la clave
  // (cambiar la clave reinicia para conmutar Porcupine ↔ respaldo).
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!shouldListen) {
      // Detener si había sesión.
      try {
        sessionRef.current?.stop();
      } catch {
        /* */
      }
      stopAcousticWake();
      sessionRef.current = null;
      setEngine(null);
      if (status !== "unsupported") setStatus("idle");
      return;
    }

    let cancelled = false;
    setError("");
    (async () => {
      try {
        const session = await startAcousticWake({
          accessKey: accessKey || undefined,
          onWake: (eng) => {
            setLastWakeAt(Date.now());
            try {
              onWakeRef.current?.(eng);
            } catch {
              /* */
            }
          },
          onStatus: (s) => {
            if (!cancelled) setStatus(s);
          },
          onError: (m) => {
            if (!cancelled) setError(m);
          },
        });
        if (cancelled) {
          try {
            session.stop();
          } catch {
            /* */
          }
          return;
        }
        sessionRef.current = session;
        try {
          setEngine(session.engine());
        } catch {
          /* */
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setStatus("error");
          setError(String((e as { message?: string })?.message || e || "error"));
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        sessionRef.current?.stop();
      } catch {
        /* */
      }
      stopAcousticWake();
      sessionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldListen, accessKey]);

  const listening = status === "listening" && shouldListen;

  return {
    enabled,
    setEnabled,
    accessKey,
    setAccessKey,
    supported,
    wasm,
    status,
    engine,
    error,
    lastWakeAt,
    listening,
  };
}

export default useAcousticWake;
