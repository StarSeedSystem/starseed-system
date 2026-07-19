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
import { useAuroraEngine, type AuroraEngine, type ConversationEntry } from "@/lib/aurora/engine";
import { AURORA_CONVERSATION_EVENT } from "@/lib/aurora/aurora-orb-bus";
import {
  autonomyDisabled,
  queryMicPermission,
  isInstalledApp,
  isMobileDevice,
} from "@/lib/aurora/voice-autonomy";
import {
  startAuroraLeaderElection,
  isAuroraLeader,
  subscribeAuroraLeader,
} from "@/lib/aurora/single-instance";
import {
  getCapabilities,
  getCapabilitiesWithMic,
  withMicPermission,
  requestMaxAccess,
  type CapabilityReport,
} from "@/lib/aurora/capabilities";
// Host del modal de instalación de modelos (opt-in, descarga en 2º plano).
import { InstallModelModalHost } from "@/components/aurora/install-model-modal";
// Banner de actualización dentro de la app (sin reinstalar).
import { UpdateBanner } from "@/components/pwa/update-banner";

/**
 * Evento global emitido cuando cambia el estado reactivo de Aurora, para que
 * superficies fuera del árbol de AuroraProvider (Exocórtex del menú Zenith) se
 * refresquen vía el puente `window.STARSEED_AURORA.subscribe()`.
 */
export const AURORA_STATE_EVENT = "starseed:aurora-state";

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
  /**
   * Capacidades del entorno (STT/TTS/mediaDevices/secureContext/navegador…) +
   * `voiceMode` ('full' | 'tts-only' | 'text-only'). SSR-safe; se recalcula tras
   * pedir permisos. La UI la usa para adaptarse con honestidad a cada navegador.
   */
  capabilities: CapabilityReport;
  /**
   * Pide el MÁXIMO acceso posible (micrófono → pantalla completa opcional) EN EL
   * ORDEN correcto; si el micrófono queda concedido, arranca la escucha por el
   * flujo SUPERVISADO y saluda. Nace de un gesto del usuario. Nunca lanza.
   */
  requestAccess: (opts?: { wantFullscreen?: boolean }) => Promise<void>;
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
  /**
   * Capacidades del entorno. SSR-safe: arranca con el informe conservador
   * ('text-only') de getCapabilities() en servidor y se refina en cliente tras
   * el montaje (y de nuevo tras pedir permisos, que puede subir/bajar el modo).
   */
  const [capabilities, setCapabilities] = useState<CapabilityReport>(() => getCapabilities());
  useEffect(() => {
    // Recalcula ya en cliente (window disponible): detecta STT/TTS reales y
    // CONSULTA el permiso de micrófono de verdad (Permissions API) en vez de
    // suponerlo. Con el permiso denegado, `voiceMode` deja de mentir ('full').
    setCapabilities(getCapabilities());
    let alive = true;
    void getCapabilitiesWithMic()
      .then((c) => { if (alive) setCapabilities(c); })
      .catch(() => { /* nos quedamos con el informe base */ });
    return () => { alive = false; };
  }, []);
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

  /** Ref a `requestAccess` (definido más abajo) para usarlo desde `retryVoice`. */
  const requestAccessRef = useRef<(opts?: { wantFullscreen?: boolean }) => Promise<void>>(
    async () => {},
  );

  const retryVoice = useCallback(() => {
    const g = guardRef.current;
    g.drops = 0;
    g.lastDropAt = 0;
    g.lastStartAt = 0; // el gesto explícito del usuario salta el cooldown
    g.starting = false;
    setVoiceUnavailable(false);
    // MÓVIL sin permiso concedido: reintentar NO es volver a arrancar un STT que
    // volverá a fallar — es PEDIR EL PERMISO, y este toque es el gesto que el
    // navegador exige. (Android: `SpeechRecognition.start()` sin permiso solo
    // devuelve 'not-allowed'.) Con permiso, arranque normal supervisado.
    if (isMobileDevice() && capabilities.micPermission !== "granted") {
      void requestAccessRef.current();
      return;
    }
    superStart();
  }, [superStart, capabilities.micPermission]);

  /**
   * requestAccess — Pide el MÁXIMO acceso posible (micrófono → pantalla completa
   * opcional) desde un gesto del usuario. Si el micrófono queda concedido y hay
   * reconocimiento de voz, arranca la escucha por el flujo SUPERVISADO y saluda.
   * Refresca `capabilities` con el resultado. Todo defensivo: nunca lanza.
   */
  const requestAccess = useCallback(async (opts?: { wantFullscreen?: boolean }) => {
    let result: Awaited<ReturnType<typeof requestMaxAccess>> | null = null;
    try {
      result = await requestMaxAccess({
        fromUserGesture: true,
        wantFullscreen: opts?.wantFullscreen ?? false,
      });
    } catch {
      result = null;
    }
    // Recalcula el informe de capacidades CON el permiso real (el micrófono pudo
    // cambiar el modo: concedido → 'full'; denegado → 'tts-only' honesto).
    const micGranted = result?.mic === "granted";
    const fresh = withMicPermission(
      getCapabilities(),
      micGranted ? "granted" : result?.mic === "denied" ? "denied" : "unknown",
    );
    setCapabilities(fresh);

    const eng = engineRef.current;
    if (!eng?.enabled) return;

    // Con micrófono concedido + reconocimiento presente → arranca la escucha
    // por el flujo supervisado (backoff/watchdog). En móvil, `requestMaxAccess`
    // ya dejó un respiro tras soltar el stream de sondeo: el micrófono está
    // libre para que lo tome el SpeechRecognition (si no, Android da
    // 'audio-capture' y Aurora nace sorda).
    if (micGranted && fresh.hasSpeechRecognition && eng.supported !== false) {
      const g = guardRef.current;
      g.lastStartAt = 0; // el gesto explícito del usuario salta el cooldown
      g.starting = false;
      try { superStart(); } catch { /* */ }
    }
    // NO saludamos al arrancar (petición del usuario): Aurora se mantiene en
    // segundo plano con el micrófono y los sentidos LISTOS pero EN SILENCIO.
    // Solo habla DESPUÉS de que el usuario hable (o escriba). Sin sonidos de
    // arranque, sin abrir chat/reproductor, sin conversación iniciada por ella.
  }, [superStart]);
  useEffect(() => { requestAccessRef.current = requestAccess; }, [requestAccess]);

  // ── FALLO FATAL DEL STT → estado VISIBLE ──────────────────────────────────
  // El motor avisa cuando el reconocimiento queda fuera de juego (permiso
  // denegado, micrófono ocupado, o se rindió tras arranques rotos). Sin esto,
  // Aurora se quedaba SORDA EN SILENCIO en Android: el orbe seguía "normal" y
  // nada volvía a arrancar el micrófono jamás. Ahora se ve y se puede reintentar
  // (y en móvil el reintento PIDE el permiso, que es lo que suele faltar).
  useEffect(() => {
    const fatal = engine.sttFatal;
    if (!fatal) return;
    wantListenRef.current = false;
    guardRef.current.drops = 0;
    guardRef.current.starting = false;
    setVoiceUnavailable(true);
    if (fatal === "not-allowed" || fatal === "service-not-allowed") {
      setCapabilities((c) => withMicPermission(c, "denied"));
    }
  }, [engine.sttFatal]);

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
  // detail = { role: "user" | "aurora", text, ts, meta? }. `meta` (aditivo,
  // jul-2026): metadatos de proceso de la respuesta (proveedor/modelo/
  // intentos/duración/dificultad/herramientas) — ausente en mensajes de
  // usuario y en registros antiguos, nunca rompe a quien no lo lea. Diff por
  // identidad de las entradas (el motor reutiliza los objetos al anexar),
  // robusto al ring buffer.
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
            detail: { role: m.role, text: m.text, ts: m.at, meta: m.meta },
          }),
        );
      } catch { /* */ }
    }
  }, [engine.conversation]);

  // Motor supervisado: mismo contrato + estado de voz no disponible + capacidades.
  const supervised = useMemo<AuroraSupervisedEngine>(
    () => ({
      ...engine,
      start: superStart,
      stop: superStop,
      toggle: superToggle,
      voiceUnavailable,
      retryVoice,
      capabilities,
      requestAccess,
    }),
    [engine, superStart, superStop, superToggle, voiceUnavailable, retryVoice, capabilities, requestAccess],
  );
  const supervisedRef = useRef<AuroraSupervisedEngine>(supervised);
  supervisedRef.current = supervised;

  // ── UNA SOLA AURORA: elección de líder entre pestañas ──────────────────────
  // Solo la pestaña LÍDER ejerce de Aurora activa (voz + micrófono). Las demás
  // ceden el micrófono. Al perder/ganar liderazgo, se detiene/retoma la escucha.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stop = startAuroraLeaderElection();
    const unsub = subscribeAuroraLeader((leader) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (!leader) {
        // Perdimos el liderazgo → soltamos el micrófono (otra pestaña manda).
        try { superStop(); } catch { /* */ }
      } else if (
        isInstalledApp() && !autonomyDisabled() && eng.enabled && wantListenRef.current === false &&
        getCapabilities().hasSpeechRecognition && eng.supported !== false
      ) {
        // Ganamos el liderazgo (SOLO app instalada, con fondo activo) → retomamos.
        try { superStart(); } catch { /* */ }
      }
    });
    return () => { unsub(); stop(); };
  }, [superStart, superStop]);

  // ── AUTONOMÍA DE VOZ: Aurora arranca sola y habla, como antes (sin menús). ──
  // 1) Si el micrófono YA está concedido → auto-escucha al cargar + saluda.
  // 2) Si no → un único handler de PRIMER GESTO pide permiso, arranca la
  //    escucha y suelta el saludo (el TTS está bloqueado antes del gesto).
  // 3) Respeta el toggle del usuario (enabled) y la preferencia de autonomía.
  // 4) Móvil: pausa la escucha con la pestaña oculta; la reanuda al volver.
  // Todo pasa por el flujo SUPERVISADO (superStart) → sin glitch-loop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let cleanupGesture: (() => void) | null = null;

    const beginAutonomy = () => {
      if (cancelled) return;
      const eng = engineRef.current;
      if (!eng?.enabled) return;
      // UNA SOLA AURORA ACTIVA: si esta pestaña NO es la líder, cede (no escucha).
      if (!isAuroraLeader()) return;
      const caps = getCapabilities();
      // ARRANQUE PASIVO Y SILENCIOSO (petición del usuario): solo dejamos el
      // micrófono/sentidos LISTOS escuchando en segundo plano donde EXISTE
      // reconocimiento de voz (Chrome/Edge/Safari). En Firefox/WebView sin STT
      // NO intentamos escuchar (evita error/flapping) → chat de texto + TTS.
      // Aurora NO saluda ni abre chat/reproductor: hablará solo cuando el
      // usuario le hable o escriba.
      if (caps.hasSpeechRecognition && eng.supported !== false) {
        try { superStart(); } catch { /* */ }
      }
    };

    // Handler de primer gesto (una sola vez): cubre navegadores que exigen
    // interacción para micrófono/TTS (todos los móviles y Chrome de escritorio).
    const armFirstGesture = () => {
      const onGesture = () => {
        cleanupGesture?.();
        cleanupGesture = null;
        beginAutonomy();
      };
      const opts: AddEventListenerOptions = { once: true, passive: true, capture: true };
      window.addEventListener("pointerdown", onGesture, opts);
      window.addEventListener("keydown", onGesture, opts);
      window.addEventListener("touchstart", onGesture, opts);
      cleanupGesture = () => {
        window.removeEventListener("pointerdown", onGesture, opts as EventListenerOptions);
        window.removeEventListener("keydown", onGesture, opts as EventListenerOptions);
        window.removeEventListener("touchstart", onGesture, opts as EventListenerOptions);
      };
    };

    const init = async () => {
      // Si el usuario apagó Aurora o la autonomía, no auto-arrancamos (pero el
      // orbe sigue disponible para tocar).
      if (autonomyDisabled()) return;
      // ESCUCHA DE FONDO SOLO EN LA APP INSTALADA. En la web (pestaña normal) NO
      // arrancamos el micrófono en 2º plano — Aurora escucha ÚNICAMENTE al PULSAR
      // el orbe. Así se elimina el bucle/tono del reconocimiento de fondo del
      // navegador. (Petición del usuario.)
      if (!isInstalledApp()) return;
      const perm = await queryMicPermission();
      if (cancelled) return;
      if (perm === "denied") return; // no insistimos; el orbe mostrará reintento
      if (perm === "granted") {
        // Permiso concedido de sesiones anteriores → arranca ya (pequeño retraso
        // para no competir con el montaje). El saludo (TTS) puede necesitar
        // gesto igualmente; si falla, se re-oye en el primer toque.
        setTimeout(beginAutonomy, 1200);
        // Además armamos el gesto por si el TTS quedó bloqueado (re-saluda).
        armFirstGesture();
      } else {
        // 'prompt' o 'unknown' → esperamos el primer gesto para pedir permiso.
        armFirstGesture();
      }
    };

    void init();

    // Pausa/reanuda la escucha según visibilidad (móvil: batería + estabilidad).
    const onVisibility = () => {
      const eng = engineRef.current;
      if (!eng) return;
      if (document.visibilityState === "hidden") {
        if (eng.listening) { try { eng.stop?.(); } catch { /* */ } }
      } else if (document.visibilityState === "visible") {
        if (!autonomyDisabled() && eng.enabled && wantListenRef.current && !eng.listening) {
          try { superStart(); } catch { /* */ }
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      cleanupGesture?.();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [superStart]);

  // ── NEURONAS + AUTONOMÍA + DEFAULTS + UPDATES + PWA (ola Astraura 2026-07) ──
  // Al montar Aurora, todo por import dinámico y defensivo (si algo falla, no
  // afecta a la voz ni al chat):
  //   1) registra ESTE dispositivo como neurona (cerebro+servidor, todo activo);
  //   2) arranca la auto-mejora (sugerencias gratis-primero);
  //   3) SIEMBRA los defaults recomendados de la Biblioteca para TODA cuenta
  //      (incl. existentes, vía sync) sin pisar las elecciones del usuario;
  //   4) captura el evento de instalación PWA (para "Instalar StarSeed");
  //   5) vigila si hay una versión nueva del sistema y avisa.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let stopped = false;
    void (async () => {
      try {
        const neurons = await import("@/lib/neurons/neurons");
        if (!stopped) await neurons.ensureThisNeuron();
      } catch { /* sin cuenta/tabla: seguimos como dispositivo único */ }
      try {
        // Auto-instalación + sincronización de la personalidad Hermione (Adenda 74):
        // si la cuenta tiene una neurona con Hermes en línea, instala Hermione y
        // arranca el watcher robusto (salvaguarda anti-mudo, carpeta, cerebro).
        const hermione = await import("@/lib/aurora/hermione-autosync");
        if (!stopped) hermione.startHermioneAutosync();
      } catch { /* sin sesión/red: el botón manual sigue como respaldo */ }
      try {
        const autonomy = await import("@/ai/astraura/autonomy");
        if (!stopped) autonomy.startAutonomy(30);
      } catch { /* */ }
      try {
        const seed = await import("@/lib/library/defaults-seed");
        if (!stopped) await seed.ensureDefaultsSeeded();
      } catch { /* la biblioteca sigue usable sin sembrar */ }
      try {
        // Grafos de memorias + cerebros avanzados (Adenda 66): Astraura
        // escucha chat/sync/Biblioteca y genera/actualiza memorias sola
        // (debounced, solo en cerebros en modo 'write'). Ver
        // architecture/cerebros-memorias-graphify.md §6. Aditivo/idempotente.
        const memInt = await import("@/ai/astraura/memory-intelligence");
        if (!stopped) memInt.startMemoryIntelligenceAutoUpdate();
      } catch { /* */ }
      try {
        const dev = await import("@/lib/install/device-install");
        if (!stopped) dev.initPwaCapture?.();
      } catch { /* */ }
      try {
        const upd = await import("@/lib/notifications/update-notifications");
        if (!stopped) upd.startUpdateWatch?.();
      } catch { /* */ }
    })();
    return () => {
      stopped = true;
      void import("@/ai/astraura/autonomy").then((a) => a.stopAutonomy()).catch(() => {});
    };
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
      speak: (text: string, forcePersonality?: any) => engineRef.current?.speak(text, forcePersonality),
      /** Activa/pausa/interrumpe la voz — SUPERVISADO (sin bucles de arranque). */
      toggle: () => supervisedRef.current?.toggle(),
      /** Enciende la escucha continua — SUPERVISADO (backoff + watchdog). */
      start: () => supervisedRef.current?.start(),
      /** Detiene la escucha — SUPERVISADO (apaga el keep-alive interno). */
      stop: () => supervisedRef.current?.stop(),
      /** Enciende/apaga Aurora globalmente (persistido). */
      setEnabled: (v: boolean) => engineRef.current?.setEnabled(v),
      /**
       * Pide el MÁXIMO acceso posible (micrófono → pantalla completa opcional)
       * desde un gesto; si el micrófono queda concedido, arranca la escucha
       * supervisada y saluda. Refresca las capacidades. Nunca lanza.
       */
      requestAccess: (opts?: { wantFullscreen?: boolean }) =>
        supervisedRef.current?.requestAccess(opts),
      /** Informe actual de capacidades del entorno (STT/TTS/… + voiceMode). */
      getCapabilities: () => supervisedRef.current?.capabilities ?? getCapabilities(),
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
          // Aditivo (v5): capacidades del entorno + modo de voz efectivo.
          capabilities: supervisedRef.current?.capabilities ?? getCapabilities(),
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
      version: 5 as const,
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
    voiceUnavailable, capabilities,
  ]);

  return (
    <AuroraContext.Provider value={supervised}>
      {children}
      {/* Modal de oferta de instalación de modelos (opt-in): escucha el evento
          global `starseed:astraura-offer-install` y se muestra cuando procede.
          La descarga sigue en 2º plano; Aurora funciona con la mejor alternativa
          gratis mientras. NO bloquea nada. */}
      <InstallModelModalHost />
      {/* Aviso de versión nueva (se aplica dentro de la app, sin reinstalar). */}
      <UpdateBanner />
    </AuroraContext.Provider>
  );
}

/**
 * Acceso al motor de Aurora (supervisado). Devuelve `null` si no hay provider
 * montado; los consumidores deben degradar con elegancia.
 */
export function useAurora(): AuroraSupervisedEngine | null {
  return useContext(AuroraContext);
}

export default AuroraProvider;
