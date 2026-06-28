"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuroraEngine, type AuroraEngine } from "@/lib/aurora/engine";

const AuroraContext = createContext<AuroraEngine | null>(null);

// Marca de localStorage para no repetir el saludo de bienvenida en cada carga.
const GREETED_KEY = "starseed_aurora_greeted_at";
// Repite el saludo como mucho una vez cada 12 horas.
const GREET_TTL_MS = 12 * 60 * 60 * 1000;

export function AuroraProvider({ children }: { children: ReactNode }) {
  const engine = useAuroraEngine();
  const engineRef = useRef<AuroraEngine>(engine);
  engineRef.current = engine;

  // ── Auto-inicio: Aurora saluda y se ofrece a guiar/actuar (como el Café). ──
  // Voz no bloqueante y descartable: solo habla si Aurora está activa, hay
  // sesión iniciada y no saludó recientemente. Nunca interrumpe la navegación.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const alreadyGreeted = (): boolean => {
      try {
        const raw = localStorage.getItem(GREETED_KEY);
        if (!raw) return false;
        const at = Number(raw);
        return Number.isFinite(at) && Date.now() - at < GREET_TTL_MS;
      } catch {
        return false;
      }
    };

    const markGreeted = () => {
      try { localStorage.setItem(GREETED_KEY, String(Date.now())); } catch { /* */ }
    };

    const tryGreet = async () => {
      try {
        // Solo con sesión iniciada.
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        if (cancelled || !data?.user?.id) return;

        const eng = engineRef.current;
        // Respeta el ajuste del usuario: si Aurora está apagada, no hablamos.
        if (!eng?.enabled) return;
        if (alreadyGreeted()) return;

        const name = eng.activePersonality?.name || "Aurora";
        const greeting =
          `Hola, soy ${name}. Puedo abrir y controlar todo StarSeed por ti: ` +
          `tus pizarras, tu tablero, memorias, el mapa mental o publicar algo. Solo dime qué quieres hacer.`;
        markGreeted();
        // Voz suave; si no hay soporte de voz, no pasa nada (degrada en silencio).
        try { eng.speak(greeting); } catch { /* */ }
      } catch {
        /* defensivo: nunca rompemos la carga */
      }
    };

    // Pequeño retraso para no competir con el arranque de la app.
    const t = setTimeout(() => { void tryGreet(); }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  // ── Puente para una futura extensión de navegador ──────────────────────────
  // Expone window.STARSEED_AURORA = { runAction, runDirectives, onAction } y
  // escucha mensajes window.postMessage con { source: "starseed-aurora-extension" }
  // para que una extensión pueda PILOTAR a Aurora y controlar la página/navegador
  // directamente. TODO el control en-app funciona SIN extensión; esto es aditivo.
  useEffect(() => {
    if (typeof window === "undefined") return;

    type ActionMessage = {
      source?: string;
      type?: string;
      action?: string;
      name?: string;
      args?: Record<string, unknown>;
      text?: string;
      requestId?: string;
    };

    // Suscriptores que la extensión (o cualquiera) puede registrar para recibir
    // notificaciones de cada acción ejecutada.
    const subscribers = new Set<(name: string, args: Record<string, unknown>) => void>();

    const api = {
      /** Ejecuta una acción por nombre + args. Devuelve el resultado. */
      runAction: async (name: string, args: Record<string, unknown> = {}) => {
        for (const cb of subscribers) { try { cb(name, args); } catch { /* */ } }
        return engineRef.current?.runAction(name, args);
      },
      /** Ejecuta directivas [[ACCION:...]] embebidas en un texto. */
      runDirectives: async (text: string) => engineRef.current?.runDirectives(text),
      /** Envía texto como si el usuario hablara (rutea comandos + Astraura). */
      runCommand: async (text: string) => engineRef.current?.runCommand(text),
      /** Registra un listener de acciones. Devuelve una función para quitarlo. */
      onAction: (cb: (name: string, args: Record<string, unknown>) => void) => {
        subscribers.add(cb);
        return () => subscribers.delete(cb);
      },
      /** Versión del puente, para que la extensión negocie compatibilidad. */
      version: 1 as const,
    };

    try {
      (window as any).STARSEED_AURORA = api;
    } catch { /* */ }

    const onMessage = (e: MessageEvent) => {
      const d = e?.data as ActionMessage | undefined;
      if (!d || d.source !== "starseed-aurora-extension") return;
      void (async () => {
        try {
          if (d.type === "runDirectives" && typeof d.text === "string") {
            const results = await api.runDirectives(d.text);
            reply(d.requestId, { ok: true, results });
            return;
          }
          if (d.type === "runCommand" && typeof d.text === "string") {
            await api.runCommand(d.text);
            reply(d.requestId, { ok: true });
            return;
          }
          const name = d.action || d.name;
          if (name) {
            const res = await api.runAction(name, d.args || {});
            reply(d.requestId, { ok: !!res?.ok, result: res });
          }
        } catch (err) {
          reply(d.requestId, { ok: false });
        }
      })();
    };

    // Responde a la extensión por el mismo canal (postMessage a la ventana).
    const reply = (requestId: string | undefined, payload: Record<string, unknown>) => {
      if (!requestId) return;
      try {
        window.postMessage(
          { source: "starseed-aurora", type: "result", requestId, ...payload },
          window.location.origin,
        );
      } catch { /* */ }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      try { delete (window as any).STARSEED_AURORA; } catch { /* */ }
    };
  }, []);

  return <AuroraContext.Provider value={engine}>{children}</AuroraContext.Provider>;
}

/**
 * Acceso al motor de Aurora. Devuelve `null` si no hay provider montado;
 * los consumidores deben degradar con elegancia.
 */
export function useAurora(): AuroraEngine | null {
  return useContext(AuroraContext);
}

export default AuroraProvider;
