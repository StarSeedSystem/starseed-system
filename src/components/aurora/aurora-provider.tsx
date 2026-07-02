"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/utils/supabase/client";
import { useAuroraEngine, type AuroraEngine, type ConversationEntry } from "@/lib/aurora/engine";
import { AURORA_CONVERSATION_EVENT } from "@/lib/aurora/aurora-orb-bus";

/**
 * Evento global emitido cuando cambia el estado reactivo de Aurora, para que
 * superficies fuera del árbol de AuroraProvider (Exocórtex del menú Zenith) se
 * refresquen vía el puente `window.STARSEED_AURORA.subscribe()`.
 */
export const AURORA_STATE_EVENT = "starseed:aurora-state";

// Marca de localStorage para no repetir el saludo de bienvenida en cada carga.
const GREETED_KEY = "starseed_aurora_greeted_at";
// Repite el saludo como mucho una vez cada 12 horas.
const GREET_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Motor de Aurora SUPERVISADO: el mismo AuroraEngine, pero con el ciclo de vida
 * de la voz blindado contra el "glitch loop" (encendido/apagado infinito).
 *
 * CAUSA RAÍZ del bug: el motor reinicia el SpeechRecognition en `onend` cada
 * ~250ms mientras `keepAlive` esté activo, SIN tope de reintentos ni backoff; en
 * errores fatales (`not-allowed`, captura de audio ocupada…) `onerror` apaga
 * `listening` pero el keep-alive interno vuelve a arrancar → parpadeo on/off
 * eterno sin voz. Además, `start()` repetidos dejan cadenas de reconocimiento
 * duplicadas que se abortan mutuamente, y el analizador de micrófono del orbe
 * (getUserMedia paralelo) abortaba la recognition en cada flip, realimentándolo.
 *
 * El SUPERVISOR corta el bucle desde fuera (el motor no se toca):
 *   · `start/stop/toggle` con guardas: nunca dos `start()` seguidos (flag
 *     isStarting) + backoff ≥800ms entre arranques + debounce del toggle.
 *   · WATCHDOG: cuenta caídas de escucha SIN habla; a la 5ª dentro de la
 *     ventana llama `engine.stop()` (lo único que apaga el keep-alive interno)
 *     y expone `voiceUnavailable` → "voz no disponible · toca para reintentar".
 *     NUNCA un loop infinito.
 *   · MATA-ZOMBIS: si la escucha se enciende sin que nadie la pidiera (cadena
 *     interna resucitada tras una parada), se apaga de raíz.
 */
export interface AuroraSupervisedEngine extends AuroraEngine {
  /** true → la voz quedó bloqueada tras reintentos fallidos (estado visible). */
  voiceUnavailable: boolean;
  /** Reintento explícito del usuario: limpia el estado y vuelve a escuchar. */
  retryVoice: () => void;
}

const AuroraContext = createContext<AuroraSupervisedEngine | null>(null);

// ── Constantes del supervisor ────────────────────────────────────────────────
/** Backoff mínimo entre arranques del reconocimiento (≥800ms). */
const START_COOLDOWN_MS = 800;
/** Debounce del toggle (evita dobles taps que crucen start/stop). */
const TOGGLE_DEBOUNCE_MS = 300;
/** Caídas de escucha sin habla toleradas antes de declarar la voz no disponible. */
const MAX_SILENT_DROPS = 5;
/** Ventana en la que las caídas consecutivas cuentan como el mismo glitch. */
const FLAP_WINDOW_MS = 10_000;
/** Válvula: si `onstart` nunca llega, libera el flag de arranque para reintentar. */
const STARTING_RELEASE_MS = 1600;

export function AuroraProvider({ children }: { children: ReactNode }) {
  const engine = useAuroraEngine();
  const engineRef = useRef<AuroraEngine>(engine);
  engineRef.current = engine;

  // ── Supervisor del ciclo de vida de la voz ─────────────────────────────────
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  /** ¿El usuario QUIERE que Aurora escuche ahora mismo? (intención explícita) */
  const wantListenRef = useRef(false);
  /** ¿Se detectó habla real (interim/transcript) desde el último arranque? */
  const speechSeenRef = useRef(false);
  const prevListeningRef = useRef(false);
  const guardRef = useRef({
    starting: false,
    lastStartAt: 0,
    lastToggleAt: 0,
    drops: 0,
    lastDropAt: 0,
  });

  const superStart = useCallback(() => {
    const g = guardRef.current;
    const now = Date.now();
    // Nunca dos start() encadenados ni arranques más rápidos que el backoff.
    if (g.starting || now - g.lastStartAt < START_COOLDOWN_MS) return;
    g.starting = true;
    g.lastStartAt = now;
    wantListenRef.current = true;
    speechSeenRef.current = false;
    setVoiceUnavailable(false);
    try { engineRef.current?.start(); } catch { /* */ }
    setTimeout(() => { g.starting = false; }, STARTING_RELEASE_MS);
  }, []);

  const superStop = useCallback(() => {
    const g = guardRef.current;
    wantListenRef.current = false;
    g.drops = 0;
    g.starting = false;
    // stop() del motor apaga su keep-alive interno: es el corte real del bucle.
    try { engineRef.current?.stop(); } catch { /* */ }
  }, []);

  const superToggle = useCallback(() => {
    // Interrumpir el TTS es siempre inmediato (mismo gesto de siempre).
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.speechSynthesis !== "undefined" &&
        window.speechSynthesis.speaking
      ) {
        engineRef.current?.interrupt();
        return;
      }
    } catch { /* */ }
    const g = guardRef.current;
    const now = Date.now();
    if (now - g.lastToggleAt < TOGGLE_DEBOUNCE_MS) return;
    g.lastToggleAt = now;
    if (engineRef.current?.listening || wantListenRef.current) superStop();
    else superStart();
  }, [superStart, superStop]);

  const retryVoice = useCallback(() => {
    const g = guardRef.current;
    g.drops = 0;
    g.lastDropAt = 0;
    g.lastStartAt = 0; // el gesto explícito del usuario salta el cooldown
    g.starting = false;
    setVoiceUnavailable(false);
    superStart();
  }, [superStart]);

  // WATCHDOG de flapping: observa las transiciones de `listening` del motor.
  useEffect(() => {
    const was = prevListeningRef.current;
    const is = engine.listening;
    prevListeningRef.current = is;
    const g = guardRef.current;

    if (is && !was) {
      // Escucha encendida: el arranque llegó (libera el flag de isStarting).
      g.starting = false;
      if (!wantListenRef.current) {
        // Cadena ZOMBI: el keep-alive interno resucitó tras una parada → apágala.
        try { engineRef.current?.stop(); } catch { /* */ }
      }
      return;
    }

    if (!is && was && wantListenRef.current) {
      // Caída inesperada mientras el usuario quería voz.
      if (speechSeenRef.current) {
        // Hubo habla real: es un fin de sesión sano, no un glitch.
        g.drops = 0;
        speechSeenRef.current = false;
        return;
      }
      const now = Date.now();
      g.drops = now - g.lastDropAt < FLAP_WINDOW_MS ? g.drops + 1 : 1;
      g.lastDropAt = now;
      if (g.drops >= MAX_SILENT_DROPS) {
        // Tope de reintentos sin habla: corta el bucle y hazlo VISIBLE.
        g.drops = 0;
        wantListenRef.current = false;
        try { engineRef.current?.stop(); } catch { /* */ }
        setVoiceUnavailable(true);
      }
    }
  }, [engine.listening]);

  // Habla real detectada → el ciclo es sano: resetea el contador de caídas.
  useEffect(() => {
    if (engine.interim || engine.transcript) {
      speechSeenRef.current = true;
      guardRef.current.drops = 0;
    }
  }, [engine.interim, engine.transcript]);

  // ── Emisor de conversación: un CustomEvent por CADA mensaje (voz o texto) ──
  // detail = { role: "user" | "aurora", text, ts }. Diff por identidad de las
  // entradas (el motor reutiliza los objetos al anexar), robusto al ring buffer.
  const seenConvoRef = useRef<WeakSet<ConversationEntry> | null>(null);
  if (seenConvoRef.current === null) seenConvoRef.current = new WeakSet();
  const convoInitRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = seenConvoRef.current!;
    const list = engine.conversation || [];
    if (!convoInitRef.current) {
      // Primer render: marca lo existente sin re-emitir historial.
      convoInitRef.current = true;
      for (const m of list) seen.add(m);
      return;
    }
    for (const m of list) {
      if (seen.has(m)) continue;
      seen.add(m);
      try {
        window.dispatchEvent(
          new CustomEvent(AURORA_CONVERSATION_EVENT, {
            detail: { role: m.role, text: m.text, ts: m.at },
          }),
        );
      } catch { /* */ }
    }
  }, [engine.conversation]);

  // Motor supervisado: mismo contrato + estado de voz no disponible.
  const supervised = useMemo<AuroraSupervisedEngine>(
    () => ({
      ...engine,
      start: superStart,
      stop: superStop,
      toggle: superToggle,
      voiceUnavailable,
      retryVoice,
    }),
    [engine, superStart, superStop, superToggle, voiceUnavailable, retryVoice],
  );
  const supervisedRef = useRef<AuroraSupervisedEngine>(supervised);
  supervisedRef.current = supervised;

  // ── Auto-inicio: Aurora saluda y se ofrece a guiar/actuar (como el Café). ──
  // Voz no bloqueante y descartable: solo habla si Aurora está activa, hay
  // sesión iniciada y no saludó recientemente. Nunca interrumpe la navegación.
  // DEFENSIVO SIN SESIÓN: en /login u onboarding simplemente no saluda.
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
          `Hola, soy ${name}. Tengo control total de StarSeed y sigo activa en segundo plano: ` +
          `puedo abrir cualquier sección, ventana, archivo o enlace, cambiar ajustes y lanzar agentes por ti, ` +
          `sin dejar de hablarte mientras lo hago. Solo dime qué quieres hacer.`;
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
      /** Envía texto al chat de Aurora (alias de runCommand). */
      send: async (text: string) => engineRef.current?.send(text),
      /** Transporte de voz: pausa la síntesis sin perder la sesión. */
      pauseSpeech: () => engineRef.current?.pauseSpeech(),
      /** Transporte de voz: reanuda la síntesis. */
      resumeSpeech: () => engineRef.current?.resumeSpeech(),
      /** Transporte de voz: adelanta a la respuesta siguiente del historial. */
      skipForward: () => engineRef.current?.skipForward(),
      /** Transporte de voz: retrocede a la respuesta anterior del historial. */
      skipBack: () => engineRef.current?.skipBack(),
      /** Interrumpe de inmediato lo que Aurora está diciendo. */
      interrupt: () => engineRef.current?.interrupt(),
      /** Hace hablar a Aurora (TTS) con un texto dado. */
      speak: (text: string) => engineRef.current?.speak(text),
      /** Activa/pausa/interrumpe la voz — SUPERVISADO (sin bucles de arranque). */
      toggle: () => supervisedRef.current?.toggle(),
      /** Enciende la escucha continua — SUPERVISADO (backoff + watchdog). */
      start: () => supervisedRef.current?.start(),
      /** Detiene la escucha — SUPERVISADO (apaga el keep-alive interno). */
      stop: () => supervisedRef.current?.stop(),
      /** Enciende/apaga Aurora globalmente (persistido). */
      setEnabled: (v: boolean) => engineRef.current?.setEnabled(v),
      /**
       * Instantánea del estado reactivo de Aurora, para que superficies FUERA del
       * árbol de AuroraProvider (p. ej. el Exocórtex del menú Zenith) muestren su
       * estado sin instanciar otro motor. Se combina con `subscribe`.
       */
      getState: () => {
        const e = engineRef.current;
        if (!e) return null;
        return {
          supported: e.supported,
          enabled: e.enabled,
          listening: e.listening,
          speaking: e.speaking,
          paused: e.paused,
          interim: e.interim,
          transcript: e.transcript,
          lastReply: e.lastReply,
          actionStatus: e.actionStatus,
          conversation: e.conversation,
          actionLog: e.actionLog,
          activePersonality: e.activePersonality,
          personalities: e.personalities,
          // Aditivo (v4): estado del supervisor de voz.
          voiceUnavailable: supervisedRef.current?.voiceUnavailable ?? false,
        };
      },
      /**
       * Suscribe a los cambios de estado de Aurora (evento `starseed:aurora-state`).
       * Devuelve la función de baja. Úsalo junto con `getState()` para re-leer.
       */
      subscribe: (cb: () => void) => {
        const on = () => { try { cb(); } catch { /* */ } };
        window.addEventListener(AURORA_STATE_EVENT, on);
        return () => window.removeEventListener(AURORA_STATE_EVENT, on);
      },
      /** Registra un listener de acciones. Devuelve una función para quitarlo. */
      onAction: (cb: (name: string, args: Record<string, unknown>) => void) => {
        subscribers.add(cb);
        return () => subscribers.delete(cb);
      },
      /** Versión del puente, para que la extensión negocie compatibilidad. */
      version: 4 as const,
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
          if ((d.type === "runCommand" || d.type === "send") && typeof d.text === "string") {
            await api.runCommand(d.text);
            reply(d.requestId, { ok: true });
            return;
          }
          // Transporte de voz desde la extensión.
          if (d.type === "pauseSpeech") { api.pauseSpeech(); reply(d.requestId, { ok: true }); return; }
          if (d.type === "resumeSpeech") { api.resumeSpeech(); reply(d.requestId, { ok: true }); return; }
          if (d.type === "skipForward") { api.skipForward(); reply(d.requestId, { ok: true }); return; }
          if (d.type === "skipBack") { api.skipBack(); reply(d.requestId, { ok: true }); return; }
          if (d.type === "interrupt") { api.interrupt(); reply(d.requestId, { ok: true }); return; }
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

  // Emite `starseed:aurora-state` cuando cambia el estado reactivo de Aurora.
  // Permite que el Exocórtex (fuera del árbol del provider) refleje la voz/chat
  // en vivo vía el puente, sin instanciar otro motor. Barato: sólo un evento.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.dispatchEvent(new CustomEvent(AURORA_STATE_EVENT)); } catch { /* */ }
  }, [
    engine.supported, engine.enabled, engine.listening, engine.speaking, engine.paused,
    engine.interim, engine.transcript, engine.lastReply, engine.actionStatus,
    engine.conversation, engine.actionLog, engine.activePersonality, engine.personalities,
    voiceUnavailable,
  ]);

  return <AuroraContext.Provider value={supervised}>{children}</AuroraContext.Provider>;
}

/**
 * Acceso al motor de Aurora (supervisado). Devuelve `null` si no hay provider
 * montado; los consumidores deben degradar con elegancia.
 */
export function useAurora(): AuroraSupervisedEngine | null {
  return useContext(AuroraContext);
}

export default AuroraProvider;
