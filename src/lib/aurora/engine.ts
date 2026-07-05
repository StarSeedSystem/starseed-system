"use client";

/**
 * useAuroraEngine — el motor de voz de Aurora (la voz de Astraura).
 * STT vía Web Speech API, TTS vía speechSynthesis, enrutado de comandos
 * en español + fallback a Astraura. SSR-safe: todo acceso a window/navigator
 * va dentro de efectos o manejadores de eventos con guardas typeof.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { loadConfigs } from "@/ai/client/providerStore";
// ROUTER GRATIS-PRIMERO: Aurora elige automáticamente el mejor modelo
// disponible por tarea (gratis primero, servicios del usuario prioritarios),
// con failover y transparencia. En modo "manual" delega en chat() clásico.
import { astrauraChat, announceLine, getIntelligenceSettings } from "@/ai/astraura/router";
import type { ChatMessage } from "@/ai/providers/types";
import {
  DEFAULT_PERSONALITY,
  DEFAULT_SETTINGS,
  buildSystemPrompt,
  type AuroraSettings,
  type Personality,
} from "@/lib/aurora/types";
import {
  createQuickMemory,
  getSettings,
  listPersonalities,
  saveSettings,
  searchMemories,
} from "@/lib/aurora/personalities";
import {
  actionsSystemPromptSection,
  auroraToolsActionPromptSection,
  runDirectivesFromText,
  parseDirectives,
  stripDirectives,
  executeDirective,
  OS_ROUTES,
  type AuroraActionContext,
  type AuroraActionResult,
  type AuroraDirective,
} from "@/lib/aurora/actions";
// Puente de glow: el Orbe de Aurora late al ritmo del habla escuchando estos
// eventos (el TTS del navegador no expone amplitud). Aditivo y defensivo.
import { emitAuroraSpeak } from "@/lib/aurora/aurora-orb-bus";
// Corrección fonética de términos propios (Astraura, Exocórtex, StarSeed…): el
// STT los destroza; los reparamos ANTES de rutear/enviar. Determinista y barato.
import { normalizeStarseedTerms } from "@/lib/aurora/term-normalizer";
// Conocimiento del ecosistema (áreas, tríada, enlaces) para el prompt de Astraura.
import { buildSystemKnowledge } from "@/lib/aurora/system-knowledge";
// Detección de la palabra "Aurora" para el modo pasivo (fondo silencioso).
import { containsWake, stripWake } from "@/lib/aurora/wake-word";
// ¿App instalada? Solo ahí mantenemos el micrófono abierto en 2º plano; en la
// web, al terminar la conversación se APAGA (no hay escucha de fondo).
import { isInstalledApp } from "@/lib/aurora/voice-autonomy";

type Voice = { name: string; lang: string; voiceURI: string; default?: boolean };

/** Una entrada del historial de conversación (para el chat-widget). */
export interface ConversationEntry {
  role: "user" | "aurora";
  text: string;
  at: number;
}

/** Una entrada del registro de acciones ejecutadas por Aurora. */
export interface ActionLogEntry {
  name: string;
  ok: boolean;
  message: string;
  at: number;
}

/** Cuántas respuestas/entradas guardamos como mucho (ring buffer). */
const HISTORY_LIMIT = 50;

const ROUTES: { keys: string[]; path: string }[] = [
  { keys: ["memorias 3d", "memoria 3d", "mapa 3d", "mapa tridimensional", "grafo 3d"], path: "/memorias-3d" },
  { keys: ["memorias", "memoria", "memory hub"], path: "/memorias" },
  { keys: ["baúles", "baules", "baúl", "baul", "bóvedas", "bovedas"], path: "/baules" },
  { keys: ["wiki", "okf"], path: "/wiki" },
  { keys: ["proveedor", "proveedores", "ia & modelos", "modelos", "ajustes de ia"], path: "/proveedor" },
  { keys: ["sincronización", "sincronizacion", "syncthing", "sync"], path: "/sincronizacion" },
  { keys: ["agentes", "agente", "telegram", "vps", "agent"], path: "/agent" },
  { keys: ["inicio", "dashboard", "panel", "principal"], path: "/dashboard" },
  { keys: ["escritorio", "escritorios", "desktop", "mis escritorios", "pantalla principal"], path: "/escritorios" },
];

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function matchRoute(t: string): string | null {
  const n = norm(t);
  for (const r of ROUTES) {
    for (const k of r.keys) {
      if (n.includes(norm(k))) return r.path;
    }
  }
  return null;
}

export interface AuroraEngine {
  supported: boolean;
  enabled: boolean;
  listening: boolean;
  speaking: boolean;
  transcript: string;
  interim: string;
  lastReply: string;
  activePersonality: Personality;
  settings: AuroraSettings;
  voices: Voice[];
  personalities: Personality[];
  start: () => void;
  stop: () => void;
  toggle: () => void;
  speak: (text: string) => void;
  runCommand: (transcript: string) => Promise<void>;
  /** ¿La síntesis de voz está pausada (transporte)? */
  paused: boolean;
  /** Pausa la voz de Aurora (TTS) sin perder la sesión. */
  pauseSpeech: () => void;
  /** Reanuda la voz de Aurora (TTS) tras una pausa. */
  resumeSpeech: () => void;
  /** Reproduce/pausa la voz (toggle del transporte). */
  toggleSpeech: () => void;
  /** Adelanta: vuelve a leer la respuesta siguiente del historial. */
  skipForward: () => void;
  /** Retrocede: vuelve a leer la respuesta anterior del historial. */
  skipBack: () => void;
  /** Interrumpe de inmediato lo que Aurora está diciendo. */
  interrupt: () => void;
  /** Historial de respuestas de Aurora (para el transporte y el chat). */
  replyHistory: string[];
  /** Historial completo de la conversación (tú / Aurora). */
  conversation: ConversationEntry[];
  /** Envía texto al motor como si el usuario hablara (chat por escrito). */
  send: (text: string) => Promise<void>;
  /** Registro de acciones ejecutadas por Aurora (para el panel del chat). */
  actionLog: ActionLogEntry[];
  /** Lo que Aurora está haciendo ahora mismo ("Abriendo Pizarras…"), o "". */
  actionStatus: string;
  /** Ejecuta directivas [[ACCION:...]] desde un texto (p. ej. una extensión). */
  runDirectives: (text: string) => Promise<AuroraActionResult[]>;
  /** Ejecuta una acción por nombre + args (puente para la extensión). */
  runAction: (name: string, args?: Record<string, unknown>) => Promise<AuroraActionResult>;
  setActivePersonality: (p: Personality) => void;
  setEnabled: (v: boolean) => void;
  reloadPersonalities: () => Promise<void>;
  /** ¿Modo ACTIVA (engaged)? En fondo pasivo es false (solo espera "Aurora"). */
  engaged: boolean;
  /** Enciende el modo activo (lo llama el toque del orbe y el wake-word). */
  engage: () => void;
  /** Vuelve al fondo pasivo silencioso sin apagar el micrófono. */
  disengage: () => void;
}

/**
 * Guard SINGLETON a nivel de módulo: garantiza que SOLO una instancia del motor
 * ejecute el reconocimiento de voz aunque se carguen dos Auroras al mismo tiempo
 * (bundle viejo+nuevo del service worker, StrictMode en dev, doble montaje). Sin
 * él, dos SpeechRecognition disparan `onresult`→`runCommand` en paralelo y las
 * ACCIONES SE DUPLICAN. El primer motor que arranca toma el testigo; los demás
 * quedan como seguidores (no arrancan su propio reconocimiento). El testigo se
 * libera al parar/desmontar el dueño.
 */
let sttOwner: symbol | null = null;

/**
 * Guard de ECO a NIVEL DE MÓDULO (compartido por CUALQUIER instancia del motor y
 * por CUALQUIER ruta de voz). Mientras Aurora habla (TTS) —o durante un breve
 * cooldown— el reconocimiento DESCARTA lo que capta: es su propia voz, no un
 * comando del usuario. Ser global es la clave: aunque existan dos instancias o
 * la voz salga por otra vía, TODAS suprimen a la vez → no se auto-responde ni
 * entra en loop. El canal del micrófono NO se reinicia; solo se ignora el audio
 * propio.
 */
let ttsSpeakingGlobal = false;
let ttsGuardUntilGlobal = 0;
function ttsGuardActive(): boolean {
  return ttsSpeakingGlobal || Date.now() < ttsGuardUntilGlobal;
}
/** Llamado por speak() en TODAS sus rutas: abre/cierra la ventana anti-eco. */
function markTtsSpeaking(on: boolean): void {
  ttsSpeakingGlobal = on;
  if (!on) ttsGuardUntilGlobal = Date.now() + 800; // cola de eco tras hablar
}

export function useAuroraEngine(): AuroraEngine {
  const router = useRouter();
  const pathname = usePathname();
  // Identidad única de ESTA instancia (para el guard singleton del STT).
  const instanceIdRef = useRef<symbol>(Symbol("aurora-engine"));
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabledState] = useState<boolean>(DEFAULT_SETTINGS.enabled);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [settings, setSettings] = useState<AuroraSettings>({ ...DEFAULT_SETTINGS });
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activePersonality, setActivePersonalityState] = useState<Personality>({ ...DEFAULT_PERSONALITY });
  const [voices, setVoices] = useState<Voice[]>([]);
  const [paused, setPaused] = useState(false);
  const [replyHistory, setReplyHistory] = useState<string[]>([]);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  // ── DOS NIVELES: fondo PASIVO (solo escucha la palabra "Aurora", SILENCIOSO,
  //    sin indicador activo) vs ACTIVA (engaged: procesa lo que digas, con el
  //    halo encendido). El micrófono está SIEMPRE abierto en pasivo, pero el
  //    reconocimiento no actúa hasta oír "aurora" o hasta que tocas el orbe.
  const [engaged, setEngagedState] = useState(false);
  const engagedRef = useRef(false);
  const engagedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Refs a las funciones engage/touch/stop (definidas abajo) para usarlas dentro
  // de buildRecognition/idle sin problemas de orden de declaración.
  const engageNowRef = useRef<() => void>(() => {});
  const touchEngagedRef = useRef<() => void>(() => {});
  const stopNowRef = useRef<() => void>(() => {});
  /** Segundos de silencio en modo ACTIVA antes de volver al fondo pasivo. */
  const ENGAGED_IDLE_MS = 30_000;

  const recognitionRef = useRef<any>(null);
  const activeRef = useRef<Personality>(activePersonality);
  const enabledRef = useRef<boolean>(enabled);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mantener-vivo: si está activo, el reconocimiento se reinicia solo al terminar
  // (clave para que la voz NO se corte al navegar entre rutas/secciones del OS).
  const keepAliveRef = useRef<boolean>(false);
  // ── Anti-loop de Android (STT) ──
  // En Android Chrome `continuous=true` no es fiable: `onend` se dispara al
  // instante sin resultados y el auto-reinicio entra en bucle ("escuchando sin
  // reconocer"). Estos refs implementan un backoff y un tope de reinicios sin
  // habla para NO martillar el micrófono y dejar que el supervisor muestre el
  // reintento en vez de un loop infinito.
  const sttRestartsRef = useRef<number>(0);
  const sttLastResultAtRef = useRef<number>(0);
  const sttRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // (La supresión de eco es GLOBAL: ttsGuardActive() a nivel de módulo, arriba.)
  // ── MEDIO-DÚPLEX (anti auto-escucha DEFINITIVO) ──
  // Mientras Aurora HABLA, DETENEMOS el reconocimiento (no solo ignoramos): el
  // micrófono deja de alimentar al reconocedor, así es IMPOSIBLE que se oiga a sí
  // misma. Al terminar de hablar, se reanuda. `pausedForTtsRef` marca esa pausa
  // para que el `onend` del reconocimiento NO reinicie por su cuenta. El watchdog
  // cubre el bug de Chrome donde `utterance.onend` a veces no dispara.
  const pausedForTtsRef = useRef<boolean>(false);
  const ttsWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── CONTADOR DE GENERACIÓN del reconocimiento (anti bucle competitivo) ──
  // Cada reconocimiento creado toma una "generación". SOLO la generación vigente
  // (la más reciente) puede reiniciarse en su `onend`. Cuando reemplazamos el
  // reconocimiento (start/stop/medio-dúplex), incrementamos la generación → el
  // `onend` del reconocimiento viejo queda OBSOLETO y no arranca otro en paralelo
  // (esa era la causa del "se reinicia en loop y no escucha").
  const recGenRef = useRef<number>(0);
  // Índice del historial para Adelantar/Retroceder (-1 = última respuesta).
  const historyIndexRef = useRef<number>(-1);
  // Espejo del historial de respuestas, para el transporte sin depender del render.
  const replyHistoryRef = useRef<string[]>([]);
  // Ruta/contexto actual, para que Aurora sepa dónde está el usuario.
  const pathnameRef = useRef<string>("");
  // Cerebro activo para resolver las HERRAMIENTAS DE INTEGRACIÓN (aditivo).
  // undefined ⇒ se usa la config global de integraciones (comportamiento neutro).
  const brainIdRef = useRef<string | undefined>(undefined);
  useEffect(() => { activeRef.current = activePersonality; }, [activePersonality]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { pathnameRef.current = pathname || ""; }, [pathname]);

  // ── feature detection + carga inicial (SSR-safe) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR && typeof window.speechSynthesis !== "undefined");

    const refreshVoices = () => {
      try {
        if (typeof window.speechSynthesis === "undefined") return;
        const list = window.speechSynthesis.getVoices() || [];
        setVoices(list.map((v) => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, default: v.default })));
      } catch { /* */ }
    };
    refreshVoices();
    try {
      if (typeof window.speechSynthesis !== "undefined") {
        window.speechSynthesis.onvoiceschanged = refreshVoices;
      }
    } catch { /* */ }

    (async () => {
      const [s, ps] = await Promise.all([getSettings(), listPersonalities()]);
      setSettings(s);
      setEnabledState(!!s.enabled);
      setPersonalities(ps);
      const act = (s.active_personality && ps.find((p) => p.id === s.active_personality)) || ps[0] || { ...DEFAULT_PERSONALITY };
      setActivePersonalityState(act);
    })();

    // Resolución DEFENSIVA del cerebro activo (para las tools de integración).
    // Import dinámico: si no hay sesión / falla, deja brainId = undefined (config
    // global). Nunca bloquea ni rompe nada del motor de voz.
    (async () => {
      try {
        const mod: any = await import("@/lib/brains/brains");
        const sel = (await mod?.getSelection?.("aurora", "")) as { brain_id?: string } | null;
        if (sel?.brain_id) brainIdRef.current = sel.brain_id;
      } catch { /* sin cerebro activo: usamos la config global */ }
    })();

    return () => {
      keepAliveRef.current = false; // desmontaje real: no reanudar el reconocimiento
      try { recognitionRef.current?.stop?.(); } catch { /* */ }
      try { if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel(); } catch { /* */ }
    };
  }, []);

  const reloadPersonalities = useCallback(async () => {
    const ps = await listPersonalities();
    setPersonalities(ps);
    setActivePersonalityState((cur) => (cur.id ? ps.find((p) => p.id === cur.id) || cur : cur));
  }, []);

  const listVoicesNow = useCallback((): Voice[] => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return voices;
    try {
      return (window.speechSynthesis.getVoices() || []).map((v) => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, default: v.default }));
    } catch {
      return voices;
    }
  }, [voices]);

  // ── TTS ──
  const speakPremium = useCallback((text: string, p: Personality) => {
    // Scaffold: sin clave en la bóveda, degradamos a navegador + aviso.
    toast.message("Voz premium: requiere clave en la bóveda", {
      description: "Configura la clave del proveedor para usar voz premium. Usando la voz del navegador.",
    });
    return false;
  }, []);

  // Referencia a `start()` (definido más abajo) para reanudar la escucha tras el
  // habla sin problemas de orden de declaración.
  const startRef = useRef<() => void>(() => {});

  // finishTts — cierra el turno de habla de Aurora (medio-dúplex): apaga el
  // guard anti-eco y REANUDA la escucha si el usuario la tenía activa. Idempotente
  // (lo llaman tanto `utterance.onend` como el watchdog).
  const finishTts = useCallback(() => {
    if (ttsWatchdogRef.current) { clearTimeout(ttsWatchdogRef.current); ttsWatchdogRef.current = null; }
    setSpeaking(false);
    emitAuroraSpeak("end");
    markTtsSpeaking(false); // + cola de eco de 800ms
    if (pausedForTtsRef.current) {
      pausedForTtsRef.current = false;
      if (keepAliveRef.current) {
        // Respiro para que muera la cola de audio antes de volver a escuchar.
        setTimeout(() => {
          if (keepAliveRef.current && !ttsSpeakingGlobal && !pausedForTtsRef.current) {
            try { startRef.current(); } catch { /* */ }
          }
        }, 350);
      }
    }
  }, []);

  // speakWithBrowser — habla con la Web Speech API del navegador (comportamiento
  // HISTÓRICO, intacto). Se invoca directamente o como fallback del motor OSS.
  const speakWithBrowser = useCallback((clean: string, p: Personality) => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    if (p.provider !== "browser" && p.provider !== "astraura") {
      const ok = speakPremium(clean, p);
      if (ok) return; // si tuviera implementación premium real
    }

    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = p.voice?.lang || "es-MX";
      // Mapear un par de parámetros sobre la entrega.
      const energia = Number(p.params?.energia ?? 60);
      const calidez = Number(p.params?.calidez ?? 70);
      const basePitch = Number(p.voice?.pitch ?? 1);
      const baseRate = Number(p.voice?.rate ?? 1);
      u.pitch = Math.max(0, Math.min(2, basePitch + (calidez - 50) / 250)); // calidez → +pitch leve
      u.rate = Math.max(0.1, Math.min(2, baseRate + (energia - 50) / 200)); // energía → +rate
      const all = window.speechSynthesis.getVoices() || [];
      const v = (p.voice?.voiceURI && all.find((x) => x.voiceURI === p.voice.voiceURI))
        || all.find((x) => /m[oó]nica/i.test(x.name) && /es[-_]MX/i.test(x.lang))
        || all.find((x) => /es[-_]MX/i.test(x.lang))
        || all.find((x) => x.lang === u.lang)
        || all.find((x) => (x.lang || "").toLowerCase().startsWith("es"))
        || null;
      if (v) u.voice = v;
      u.onstart = () => {
        setSpeaking(true); setPaused(false); emitAuroraSpeak("start");
        markTtsSpeaking(true); // anti-eco GLOBAL: ignora la voz propia
      };
      // Cada límite de palabra/frase impulsa el latido del glow del Orbe.
      u.onboundary = () => emitAuroraSpeak("boundary");
      u.onend = () => { finishTts(); };
      u.onerror = () => { finishTts(); };
      // Abre la ventana anti-eco YA (antes de onstart) para cubrir el arranque
      // del habla: el micrófono no debe procesar ni el primer fonema propio.
      markTtsSpeaking(true);
      // MEDIO-DÚPLEX: DETÉN el micrófono mientras Aurora habla (no basta con
      // ignorar; hay que dejar de escuchar para que no se oiga a sí misma).
      // Invalida la generación para que el onend del reconocimiento abortado NO
      // reinicie (lo reanudará finishTts al terminar el habla).
      pausedForTtsRef.current = true;
      recGenRef.current++;
      try { recognitionRef.current?.abort?.(); } catch { /* */ }
      // Watchdog: si `utterance.onend` no dispara (bug conocido de Chrome con
      // textos largos), reanuda igualmente tras una duración estimada.
      if (ttsWatchdogRef.current) clearTimeout(ttsWatchdogRef.current);
      const estMs = Math.min(30000, 1600 + clean.length * 80);
      ttsWatchdogRef.current = setTimeout(() => { finishTts(); }, estMs);
      window.speechSynthesis.speak(u);
      setPaused(false);
    } catch {
      finishTts();
    }
  }, [speakPremium, finishTts]);

  // speak — Punto de entrada del habla de Aurora. ADITIVO Y DEFENSIVO:
  //   1) Limpia el texto (quita marcadores [[goto:...]]).
  //   2) Si el usuario eligió un MOTOR DE VOZ OSS (Kokoro/Kitten) y está listo,
  //      delega en él manteniendo el medio-dúplex (mic off + anti-eco) y el
  //      LATIDO del orbe (emitAuroraSpeak start/boundary/end) alrededor del audio.
  //   3) Si el motor OSS no aplica / no está disponible / falla, cae a la voz del
  //      navegador (speakWithBrowser) — comportamiento histórico intacto.
  const speak = useCallback((text: string) => {
    if (typeof window === "undefined") return;
    const clean = (text || "").replace(/\[\[goto:[^\]]+\]\]/gi, "").trim();
    if (!clean) return;
    const p = activeRef.current;

    const runBrowser = () => speakWithBrowser(clean, p);

    // Intento OSS (asíncrono, import dinámico). Nunca lanza; si declina → navegador.
    void (async () => {
      let handedOff = false;
      // Latido del orbe mientras suena el audio OSS (el <audio> no expone amplitud):
      // pulsos periódicos de "boundary" que el bus de glow ya sabe interpretar.
      let boundaryTimer: ReturnType<typeof setInterval> | null = null;
      const clearBoundary = () => {
        if (boundaryTimer) { clearInterval(boundaryTimer); boundaryTimer = null; }
      };
      // Watchdog: si el onEnd del audio OSS nunca llega, reanuda igualmente.
      let ossWatchdog: ReturnType<typeof setTimeout> | null = null;
      const clearOssWatchdog = () => {
        if (ossWatchdog) { clearTimeout(ossWatchdog); ossWatchdog = null; }
      };

      try {
        const { speakWithConfiguredEngine } = await import("@/lib/aurora/tts-oss/speak-router");
        const spoke = await speakWithConfiguredEngine(clean, {
          onStart: () => {
            handedOff = true;
            // Corta cualquier voz nativa por si acaso (una sola voz a la vez).
            try { if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel(); } catch { /* */ }
            setSpeaking(true); setPaused(false); emitAuroraSpeak("start");
            // Anti-eco GLOBAL + medio-dúplex: deja de escuchar mientras habla.
            markTtsSpeaking(true);
            pausedForTtsRef.current = true;
            recGenRef.current++;
            try { recognitionRef.current?.abort?.(); } catch { /* */ }
            // Impulsa el latido del orbe ~cada 240ms mientras dura el audio.
            clearBoundary();
            boundaryTimer = setInterval(() => emitAuroraSpeak("boundary"), 240);
            // Watchdog de seguridad (misma heurística que el navegador).
            clearOssWatchdog();
            const estMs = Math.min(45000, 2000 + clean.length * 90);
            ossWatchdog = setTimeout(() => { clearBoundary(); finishTts(); }, estMs);
          },
          onEnd: () => {
            clearBoundary();
            clearOssWatchdog();
            // finishTts cierra el turno: apaga glow, anti-eco y reanuda escucha.
            finishTts();
          },
          onError: () => { /* no fatal: si además declina, caemos a navegador abajo */ },
        });

        if (spoke) return; // el motor OSS se hizo cargo del turno completo.

        // Declinó (motor navegador, no disponible, o fallo antes de sonar).
        clearBoundary();
        clearOssWatchdog();
        if (!handedOff) {
          // Nunca llegó a hablar → voz del navegador, turno limpio.
          runBrowser();
        } else {
          // Improbable: arrancó pero devolvió false → cierra el turno con dignidad.
          finishTts();
        }
      } catch {
        // El import/enrutador falló → comportamiento histórico intacto.
        clearBoundary();
        clearOssWatchdog();
        if (!handedOff) runBrowser();
        else finishTts();
      }
    })();
  }, [speakWithBrowser, finishTts]);

  // ── historial de respuestas + conversación ──
  // Registra una respuesta de Aurora en el historial (para el transporte y el chat).
  const pushReply = useCallback((text: string) => {
    const t = (text || "").trim();
    if (!t) return;
    setLastReply(t);
    setReplyHistory((prev) => {
      const next = [...prev, t].slice(-HISTORY_LIMIT);
      replyHistoryRef.current = next;
      return next;
    });
    historyIndexRef.current = -1; // -1 = al final (última respuesta)
    setConversation((prev) => [...prev, { role: "aurora" as const, text: t, at: Date.now() }].slice(-HISTORY_LIMIT));
  }, []);

  // Registra lo que el usuario dijo/escribió.
  const pushUser = useCallback((text: string) => {
    const t = (text || "").trim();
    if (!t) return;
    setConversation((prev) => [...prev, { role: "user" as const, text: t, at: Date.now() }].slice(-HISTORY_LIMIT));
  }, []);

  // Registra una acción ejecutada (para el panel del chat).
  const pushAction = useCallback((entry: ActionLogEntry) => {
    setActionLog((prev) => [...prev, entry].slice(-HISTORY_LIMIT));
  }, []);

  // ── transporte de voz (Reproducir / Pausar / Adelantar / Retroceder) ──
  const pauseSpeech = useCallback(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    try { window.speechSynthesis.pause(); setPaused(true); } catch { /* */ }
  }, []);

  const resumeSpeech = useCallback(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    try { window.speechSynthesis.resume(); setPaused(false); } catch { /* */ }
  }, []);

  const interrupt = useCallback(() => {
    if (typeof window === "undefined") return;
    try { if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.cancel(); } catch { /* */ }
    // También corta cualquier voz OSS en curso (Kokoro/Kitten). Fire-and-forget.
    void import("@/lib/aurora/tts-oss/speak-router")
      .then((m) => m.stopConfiguredEngine())
      .catch(() => { /* */ });
    setSpeaking(false);
    setPaused(false);
    // Cancelar el habla también cierra el turno TTS y reanuda la escucha
    // (medio-dúplex): el navegador puede no disparar utterance.onend al cancelar.
    finishTts();
  }, [finishTts]);

  const toggleSpeech = useCallback(() => {
    // Si está hablando y no pausada → pausa; si está pausada → reanuda;
    // si no hay nada en curso → vuelve a leer la última respuesta.
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    if (paused) { resumeSpeech(); return; }
    if (window.speechSynthesis.speaking) { pauseSpeech(); return; }
    const hist = replyHistoryRef.current;
    if (hist.length) speak(hist[hist.length - 1]);
  }, [paused, pauseSpeech, resumeSpeech, speak]);

  // Re-lee la respuesta del historial en la posición dada (clamp + lectura).
  const speakAtIndex = useCallback((idx: number) => {
    const hist = replyHistoryRef.current;
    if (!hist.length) return;
    const clamped = Math.max(0, Math.min(hist.length - 1, idx));
    historyIndexRef.current = clamped;
    speak(hist[clamped]);
  }, [speak]);

  const skipBack = useCallback(() => {
    const hist = replyHistoryRef.current;
    if (!hist.length) return;
    const cur = historyIndexRef.current === -1 ? hist.length - 1 : historyIndexRef.current;
    speakAtIndex(cur - 1);
  }, [speakAtIndex]);

  const skipForward = useCallback(() => {
    const hist = replyHistoryRef.current;
    if (!hist.length) return;
    const cur = historyIndexRef.current === -1 ? hist.length - 1 : historyIndexRef.current;
    speakAtIndex(cur + 1);
  }, [speakAtIndex]);

  // ── persistir enabled / active_personality ──
  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    setSettings((s) => ({ ...s, enabled: v }));
    void saveSettings({ enabled: v });
  }, []);

  const setActivePersonality = useCallback((p: Personality) => {
    setActivePersonalityState(p);
    if (p.id) {
      setSettings((s) => ({ ...s, active_personality: p.id! }));
      void saveSettings({ active_personality: p.id });
    }
  }, []);

  // ── acciones (control del OS) ──
  // Muestra un estado efímero de lo que Aurora hace ("Abriendo Pizarras…").
  const setStatus = useCallback((status: string) => {
    setActionStatus(status || "");
    if (statusTimer.current) clearTimeout(statusTimer.current);
    if (status) {
      statusTimer.current = setTimeout(() => setActionStatus(""), 4000);
    }
  }, []);

  // Construye el contexto que reciben los ejecutores de acción.
  const buildActionCtx = useCallback((): AuroraActionContext => ({
    router: {
      push: (href: string) => { try { router.push(href); } catch { /* */ } },
      replace: (href: string) => { try { router.replace(href); } catch { /* */ } },
      back: () => { try { router.back(); } catch { /* */ } },
      forward: () => { try { router.forward(); } catch { /* */ } },
    },
    onStatus: (status: string) => setStatus(status),
    // Cerebro activo (si lo hay) para resolver las tools de integración.
    brainId: brainIdRef.current,
  }), [router, setStatus]);

  // Ejecuta todas las directivas [[ACCION:...]] de un texto (devuelve resultados).
  const runDirectives = useCallback(async (text: string): Promise<AuroraActionResult[]> => {
    const { results } = await runDirectivesFromText(text, buildActionCtx());
    return results;
  }, [buildActionCtx]);

  // Ejecuta una acción por nombre + args (puente directo para la extensión).
  const runAction = useCallback(async (
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<AuroraActionResult> => {
    const nm = (name || "").toLowerCase();
    const directive: AuroraDirective = { name: nm, args, raw: "" };
    const res = await executeDirective(directive, buildActionCtx());
    pushAction({ name: nm, ok: !!res.ok, message: res.message || "", at: Date.now() });
    if (res.message) { pushReply(res.message); speak(res.message); }
    return res;
  }, [buildActionCtx, speak, pushAction, pushReply]);

  // ── contexto de la ruta actual (para que Aurora sepa dónde está el usuario) ──
  const routeContext = useCallback((): string => {
    const path = pathnameRef.current || "/";
    const label = OS_ROUTES.find((r) => r.path === path)?.label
      || OS_ROUTES.find((r) => path.startsWith(r.path) && r.path !== "/")?.label
      || null;
    return label ? `${label} (${path})` : path;
  }, []);

  // ── enrutado de comandos ──
  // ¿Aurora está procesando una respuesta ahora mismo? (guard de solapamiento).
  const runningRef = useRef(false);
  const runCommand = useCallback(async (raw: string) => {
    // GUARD ANTI-SOLAPAMIENTO: si Aurora YA está procesando una respuesta, no
    // lanzamos otra en paralelo. Sin esto, mientras Aurora "piensa" el micrófono
    // puede captar más frases y disparar runCommands concurrentes → pile-up que
    // se percibe como "oye pero no responde y el reproductor se reinicia en loop".
    if (runningRef.current) return;
    runningRef.current = true;
    try {
    // Corrección fonética de términos StarSeed (idempotente): cubre también el
    // texto ESCRITO (send) y refuerza el de voz. Si algo falla, usa el original.
    let base = raw || "";
    try { base = normalizeStarseedTerms(base); } catch { base = raw || ""; }
    const text = base.trim();
    if (!text) return;
    setTranscript(text);
    pushUser(text);
    const n = norm(text);

    // navegación directa
    if (/(abre|abrir|ve a|vete a|lleva a|llevame a|llévame a|ir a|navega|muestra|mostrar)/.test(n)) {
      const path = matchRoute(text);
      if (path) {
        try { router.push(path); } catch { /* */ }
        const msg = `Abriendo ${path.replace("/", "") || "inicio"}.`;
        pushReply(msg);
        speak(msg);
        return;
      }
    }

    // leer pantalla
    if (n.includes("lee la pantalla") || n.includes("leer pantalla") || n.includes("lee pantalla")) {
      let content = "";
      if (typeof document !== "undefined") {
        content = (document.querySelector("main") as HTMLElement | null)?.innerText || document.body?.innerText || "";
      }
      const trimmed = content.replace(/\s+/g, " ").trim().slice(0, 600) || "No hay contenido visible para leer.";
      pushReply(trimmed);
      speak(trimmed);
      return;
    }

    // ayuda
    if (n.includes("que puedes hacer") || n.includes("qué puedes hacer") || n.includes("ayuda") || n.includes("comandos")) {
      const help =
        "Tengo control total del OS: puedo abrir cualquier área, sección, ventana, archivo o enlace, cambiar ajustes y lanzar agentes y skills por ti. Sigo activa en segundo plano mientras navego y te hablo. Solo dime qué quieres hacer.";
      pushReply(help);
      speak(help);
      return;
    }

    // activar / desactivar
    if (/(activa|enciende|activar).*(aurora)/.test(n)) {
      setEnabled(true);
      const m = "Aurora activada.";
      pushReply(m); speak(m); return;
    }
    if (/(desactiva|apaga|desactivar|silencia).*(aurora)/.test(n)) {
      const m = "Aurora desactivada.";
      pushReply(m); speak(m);
      setEnabled(false);
      return;
    }

    // buscar memorias
    const busca = text.match(/busca(?:r)?\s+(.+)/i);
    if (busca) {
      const q = busca[1].trim();
      const res = await searchMemories(q, 5);
      const names = res.map((r) => r.name).join(", ");
      const m = res.length
        ? `Encontré ${res.length} memoria${res.length === 1 ? "" : "s"}: ${names}.`
        : `No encontré memorias para "${q}".`;
      pushReply(m); speak(m); return;
    }

    // crear memoria
    const crea = text.match(/crea(?:r)?\s+(?:una\s+)?memoria\s+(?:llamada\s+)?(.+)/i);
    if (crea) {
      const name = crea[1].trim();
      const ok = await createQuickMemory(name);
      const m = ok ? `Memoria "${name}" creada.` : `No pude crear la memoria "${name}".`;
      pushReply(m); speak(m);
      return;
    }

    // ── decisiones / sistema ontocrático (StarSeed) ──
    // votos pendientes: navega a /decisiones y confirma por voz
    if (
      n.includes("mis votos pendientes") ||
      n.includes("que tengo que votar") ||
      n.includes("qué tengo que votar")
    ) {
      try { router.push("/decisiones"); } catch { /* */ }
      const m = "Abriendo tus decisiones pendientes.";
      pushReply(m); speak(m); return;
    }
    // crear / proponer una propuesta
    if (
      n.includes("crea una propuesta") ||
      n.includes("nueva propuesta") ||
      n.includes("proponer")
    ) {
      try { router.push("/decisiones"); } catch { /* */ }
      const m = "Abriendo decisiones.";
      pushReply(m); speak(m); return;
    }
    // decisiones / propuestas / votaciones / ontocracia
    if (
      n.includes("decisiones") ||
      n.includes("propuestas") ||
      n.includes("votaciones") ||
      n.includes("ontocracia")
    ) {
      try { router.push("/decisiones"); } catch { /* */ }
      const m = "Abriendo decisiones.";
      pushReply(m); speak(m); return;
    }

    // ── visión local (SmolVLM2): "¿qué ves?", "describe la pantalla", "mira la
    //    cámara"… ANTES del fallback a Astraura. Import DINÁMICO para no cargar
    //    Transformers.js salvo que se use de verdad. Aditivo y defensivo: ante
    //    cualquier fallo, seguimos al fallback de Astraura con normalidad.
    try {
      const { maybeHandleVisionCommand } = await import("@/lib/aurora/senses/vision-sense");
      const visionReply = await maybeHandleVisionCommand(text);
      if (visionReply) {
        pushReply(visionReply);
        speak(visionReply);
        return;
      }
    } catch { /* la visión es opcional: si falla, continúa al fallback */ }

    // ── fallback: Astraura ──
    try {
      // En modo MANUAL exigimos un proveedor activo (comportamiento clásico).
      // En modo AUTO (predeterminado) Aurora SIEMPRE tiene inteligencia:
      // encuentra la mejor fuente gratuita disponible aunque no haya config.
      if (getIntelligenceSettings().mode === "manual" && !loadConfigs().some((c) => c.enabled)) {
        const m = "No tengo un proveedor de IA activo. Configúralo en Proveedor para que pueda conversar contigo.";
        pushReply(m); speak(m); return;
      }
      // Inyectamos el contexto de ruta + reafirmamos el control total para que
      // Aurora NUNCA se niegue a navegar/operar y entienda dónde está el usuario.
      const contextNote =
        `CONTEXTO ACTUAL — El usuario está en: ${routeContext()}. ` +
        "Sigues activa en segundo plano desde tu botón flotante: navegar/operar NO te detiene. " +
        "Recuerda tu control total: si algo se hace en el OS, hazlo tú con [[ACCION:...]]; nunca le pidas que vaya él a otra parte.";
      // Sección ADITIVA con las herramientas de integración disponibles para el
      // cerebro activo (vacía si no hay ninguna configurada → prompt idéntico).
      let toolsSection = "";
      try { toolsSection = await auroraToolsActionPromptSection(brainIdRef.current); } catch { toolsSection = ""; }
      // Conocimiento del ecosistema (áreas, tríada, enlaces canónicos) para que
      // Aurora entienda cada contexto/sección y responda/actúe interconectando.
      let knowledge = "";
      try { knowledge = buildSystemKnowledge(routeContext()); } catch { knowledge = ""; }
      const system =
        buildSystemPrompt(activeRef.current) + "\n\n" +
        actionsSystemPromptSection() +
        (toolsSection ? "\n\n" + toolsSection : "") +
        (knowledge ? "\n\n" + knowledge : "") + "\n\n" +
        contextNote;
      const messages: ChatMessage[] = [
        { role: "system", content: system },
        { role: "user", content: text },
      ];
      const temperature = 0.4 + (Number(activeRef.current.params?.creatividad ?? 60) / 100) * 0.6;
      // Router agéntico gratis-primero (auto) o proveedor clásico (manual).
      const res = await astrauraChat({
        messages,
        temperature,
        brainId: brainIdRef.current,
        onStatus: (s) => { if (s) setStatus(s); },
      });
      let reply = (res?.text || "").trim();
      // TRANSPARENCIA: si la fuente cambió (o el usuario quiere oírlo siempre),
      // Aurora menciona qué modelo usó y sus alternativas. Aditivo y opcional.
      try {
        const announce = announceLine(res?.route);
        if (announce) reply = reply ? `${reply}\n\n${announce}` : announce;
      } catch { /* */ }

      // 1) Directivas de ACCIÓN [[ACCION: nombre {json}]] — el control real del OS.
      //    Las extraemos, las quitamos del discurso, y las ejecutamos.
      const directives = parseDirectives(reply);
      reply = stripDirectives(reply);
      const ctx = buildActionCtx();
      const actionMsgs: string[] = [];
      for (const d of directives) {
        const r = await executeDirective(d, ctx);
        pushAction({ name: d.name, ok: !!r.ok, message: r.message || "", at: Date.now() });
        if (r.message) actionMsgs.push(r.message);
      }

      // 2) Compatibilidad: directiva antigua de navegación [[goto:/ruta]].
      const goto = reply.match(/\[\[goto:\s*(\/[^\]\s]+)\s*\]\]/i);
      if (goto) {
        try { router.push(goto[1]); } catch { /* */ }
        reply = reply.replace(/\[\[goto:[^\]]+\]\]/i, "").trim();
      }

      // El discurso final: lo que dijo el modelo (ya sin directivas) o, si solo
      // emitió acciones, el resumen honesto de lo que Aurora hizo.
      reply = reply.trim() || actionMsgs.join(" ") || "Hecho.";
      pushReply(reply);
      speak(reply);
    } catch (e: any) {
      const d = (e?.message ? String(e.message) : "").trim();
      const m = d && !/failed to fetch|networkerror|load failed/i.test(d)
        ? `Astraura: ${d}`
        : "No pude contactar a Astraura. Revisa tu proveedor de IA en Ajustes → IA & Modelos.";
      pushReply(m); speak(m);
    }
    } finally {
      // Libera el guard SIEMPRE (aunque hubiera return anticipado o error): así
      // el siguiente turno del usuario se procesa con normalidad.
      runningRef.current = false;
    }
  }, [router, speak, setEnabled, buildActionCtx, pushUser, pushReply, pushAction, routeContext]);

  const runCommandRef = useRef(runCommand);
  useEffect(() => { runCommandRef.current = runCommand; }, [runCommand]);

  // ── STT (con operación en SEGUNDO PLANO) ──
  // `continuous = true` + auto-reinicio en `onend` mantienen el micrófono vivo
  // de forma continua. Como el motor vive en el layout global, navegar entre
  // rutas/secciones NO desmonta el reconocimiento: Aurora sigue escuchando y
  // hablando mientras opera. `keepAliveRef` distingue una parada deliberada
  // (stop) de un fin natural de sesión (que reanudamos).
  const buildRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    // Esta reconocimiento toma la GENERACIÓN vigente. Su onend solo reinicia si
    // sigue siendo la más reciente (evita reinicios en paralelo competitivos).
    const gen = ++recGenRef.current;
    // Detección de móvil/Android: en estos, `continuous` NO es fiable.
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const isAndroid = /android/i.test(ua);
    const isMobile = isAndroid || /iphone|ipad|ipod|mobile/i.test(ua) ||
      (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
    rec.lang = activeRef.current.voice?.lang || "es-MX";
    rec.interimResults = true;
    // Móvil: NO continuo (Android reinicia solo tras cada frase, con backoff).
    rec.continuous = !isMobile;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      if (gen !== recGenRef.current) { try { rec.abort?.(); } catch { /* */ } return; }
      setListening(true); setInterim("");
    };
    rec.onerror = (e: any) => {
      if (gen !== recGenRef.current) return; // reconocimiento obsoleto: ignora
      // 'no-speech' / 'aborted' son transitorios: si seguimos vivos, reanudamos.
      const err = e?.error;
      if (keepAliveRef.current && err !== "not-allowed" && err !== "service-not-allowed") {
        // Deja que onend gestione el reinicio (con backoff).
        return;
      }
      setListening(false);
    };
    rec.onend = () => {
      // OBSOLETO: si ya no es la generación vigente, no hace NADA (otro
      // reconocimiento más reciente manda) → no hay reinicios en paralelo.
      if (gen !== recGenRef.current) return;
      setInterim("");
      if (sttRestartTimerRef.current) { clearTimeout(sttRestartTimerRef.current); sttRestartTimerRef.current = null; }
      // MEDIO-DÚPLEX: si el reconocimiento se detuvo porque Aurora va a hablar /
      // está hablando, NO reiniciamos aquí. Lo reanudará `resumeListeningAfterTts`
      // cuando termine el habla (evita que el micro capte su propia voz).
      if (pausedForTtsRef.current || ttsGuardActive()) {
        setListening(false);
        return;
      }
      // Reinicio automático si Aurora debe seguir escuchando (segundo plano),
      // PERO con backoff y tope de reinicios sin habla para no entrar en loop.
      if (keepAliveRef.current && typeof window !== "undefined") {
        const now = Date.now();
        // Si Aurora estaba HABLANDO, el fin de escucha es esperado (medio-dúplex):
        // NO cuenta como "caída sin habla" → no penaliza el watchdog.
        const sawResultRecently = now - sttLastResultAtRef.current < 15_000 || ttsGuardActive();
        if (sawResultRecently) sttRestartsRef.current = 0; // ciclo sano
        else sttRestartsRef.current += 1;

        // Tras 6 reinicios seguidos SIN habla, paramos de martillar: dejamos que
        // el supervisor del provider muestre "voz no disponible · reintentar".
        if (sttRestartsRef.current > 6) {
          keepAliveRef.current = false;
          sttRestartsRef.current = 0;
          setListening(false);
          return;
        }

        // Backoff progresivo: base 500ms (700ms en móvil) → hasta ~2.5s.
        const base = isMobile ? 700 : 500;
        const delay = Math.min(base + sttRestartsRef.current * 300, 2500);
        try {
          const next = buildRecognition();
          if (next) {
            recognitionRef.current = next;
            sttRestartTimerRef.current = setTimeout(() => {
              try { next.start(); } catch { /* */ }
            }, delay);
            return;
          }
        } catch { /* */ }
      }
      setListening(false);
    };
    rec.onresult = (e: any) => {
      if (gen !== recGenRef.current) return; // reconocimiento obsoleto: ignora
      // ANTI-ECO GLOBAL: si Aurora está hablando (o en el cooldown posterior),
      // descarta lo captado — es su propia voz, no un comando del usuario. El
      // canal del micrófono sigue abierto; solo se ignora el texto propio.
      if (ttsGuardActive()) {
        return;
      }
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      // Cualquier resultado (incluso interino) prueba que el micro SÍ funciona:
      // resetea el backoff anti-loop.
      sttLastResultAtRef.current = Date.now();
      sttRestartsRef.current = 0;

      // ── MODO PASIVO (fondo): NO procesamos nada como comando ni mostramos el
      //    interim; solo esperamos oír "aurora". Al oírla, ACTIVAMOS (engaged) y,
      //    si la frase trae algo más ("aurora, abre el café"), lo ejecutamos. ──
      if (!engagedRef.current) {
        const heard = finalText || interimText;
        if (containsWake(heard)) {
          engageNowRef.current(); // enciende modo activo (+ halo)
          if (finalText) {
            const rest = stripWake(finalText);
            if (rest && rest.trim().length > 1) {
              setInterim("");
              void runCommandRef.current(rest);
            }
          }
        }
        return; // en pasivo, ignora todo lo demás (silencioso)
      }

      // ── MODO ACTIVO (engaged): conversación normal ──
      touchEngagedRef.current(); // reinicia el temporizador de inactividad
      if (interimText) setInterim(interimText);
      if (finalText) {
        setInterim("");
        // Corrección fonética de términos StarSeed (voz): "astral aura" →
        // "Astraura", "exo corte" → "Exocórtex"… antes de rutear/enviar.
        let corrected = finalText;
        try { corrected = normalizeStarseedTerms(finalText); } catch { corrected = finalText; }
        void runCommandRef.current(corrected);
      }
    };
    return rec;
  }, []);

  // ── Control del modo ACTIVA (engaged) ──
  // touchEngaged: reinicia el temporizador de inactividad; tras ENGAGED_IDLE_MS
  // sin habla, Aurora vuelve al fondo pasivo (silencioso) automáticamente.
  const touchEngaged = useCallback(() => {
    if (engagedTimerRef.current) clearTimeout(engagedTimerRef.current);
    engagedTimerRef.current = setTimeout(() => {
      engagedRef.current = false;
      setEngagedState(false);
      setInterim("");
      // WEB: al terminar la conversación, APAGA el micrófono (no hay fondo).
      // App instalada: se queda en fondo pasivo esperando "Aurora".
      if (!isInstalledApp()) { try { stopNowRef.current(); } catch { /* */ } }
    }, ENGAGED_IDLE_MS);
  }, []);

  // engage: ENCIENDE el modo activo (halo + procesar lo que digas). Lo llama el
  // wake-word ("aurora") y el toque del orbe. Idempotente.
  const engage = useCallback(() => {
    engagedRef.current = true;
    setEngagedState(true);
    touchEngaged();
  }, [touchEngaged]);

  // disengage: vuelve al fondo pasivo (silencioso) sin apagar el micrófono.
  const disengage = useCallback(() => {
    engagedRef.current = false;
    setEngagedState(false);
    if (engagedTimerRef.current) { clearTimeout(engagedTimerRef.current); engagedTimerRef.current = null; }
    setInterim("");
    // WEB: desactivar también APAGA el micrófono (sin escucha de fondo).
    if (!isInstalledApp()) { try { stopNowRef.current(); } catch { /* */ } }
  }, []);

  useEffect(() => { engageNowRef.current = engage; touchEngagedRef.current = touchEngaged; }, [engage, touchEngaged]);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Tu navegador no soporta reconocimiento de voz."); return; }
    // Guard singleton: si otra instancia ya posee el testigo del STT, esta cede
    // (no arranca un segundo reconocimiento → no se duplican las acciones).
    if (sttOwner && sttOwner !== instanceIdRef.current) return;
    sttOwner = instanceIdRef.current;
    keepAliveRef.current = true; // mantener vivo a través de la navegación
    try { recognitionRef.current?.stop?.(); } catch { /* */ }
    // Medio-dúplex: reanudar la escucha limpia cualquier pausa por TTS pendiente.
    pausedForTtsRef.current = false;
    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    try { rec.start(); } catch { /* ya iniciado */ }
  }, [buildRecognition]);

  // Mantén `startRef` apuntando a la última versión de `start` (para finishTts).
  useEffect(() => { startRef.current = start; }, [start]);

  const stop = useCallback(() => {
    keepAliveRef.current = false; // parada deliberada: no reanudar
    pausedForTtsRef.current = false;
    if (sttRestartTimerRef.current) { clearTimeout(sttRestartTimerRef.current); sttRestartTimerRef.current = null; }
    if (ttsWatchdogRef.current) { clearTimeout(ttsWatchdogRef.current); ttsWatchdogRef.current = null; }
    sttRestartsRef.current = 0;
    try { recognitionRef.current?.stop?.(); } catch { /* */ }
    // Libera el testigo del STT para que cualquier instancia pueda retomarlo.
    if (sttOwner === instanceIdRef.current) sttOwner = null;
    setListening(false);
  }, []);

  // Mantén `stopNowRef` apuntando a la última versión de `stop` (para el corte
  // del micrófono en WEB al desactivar/expirar la conversación).
  useEffect(() => { stopNowRef.current = stop; }, [stop]);

  // Al desmontar la instancia dueña del STT, libera el testigo.
  useEffect(() => {
    const id = instanceIdRef.current;
    return () => { if (sttOwner === id) sttOwner = null; };
  }, []);

  const toggle = useCallback(() => {
    // Si Aurora está hablando, un toque la interrumpe (botón = activar/pausar/interrumpir).
    if (typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking) {
      interrupt();
      return;
    }
    if (listening) stop();
    else start();
  }, [listening, start, stop, interrupt]);

  // Envía texto al motor como si el usuario hablara (para el chat por escrito).
  const send = useCallback(async (text: string) => {
    // Escribir/enviar texto es interacción explícita → modo ACTIVA.
    try { engageNowRef.current(); } catch { /* */ }
    await runCommandRef.current(text);
  }, []);

  return useMemo(
    () => ({
      supported,
      enabled,
      listening,
      speaking,
      transcript,
      interim,
      lastReply,
      actionStatus,
      activePersonality,
      settings,
      voices: listVoicesNow(),
      personalities,
      start,
      stop,
      toggle,
      speak,
      runCommand,
      runDirectives,
      runAction,
      setActivePersonality,
      setEnabled,
      reloadPersonalities,
      // transporte de voz + segundo plano + historial
      paused,
      pauseSpeech,
      resumeSpeech,
      toggleSpeech,
      skipForward,
      skipBack,
      interrupt,
      replyHistory,
      conversation,
      send,
      actionLog,
      // DOS NIVELES: estado activo (engaged) + control.
      engaged,
      engage,
      disengage,
    }),
    [
      supported, enabled, listening, speaking, transcript, interim, lastReply, actionStatus,
      activePersonality, settings, listVoicesNow, personalities,
      start, stop, toggle, speak, runCommand, runDirectives, runAction, setActivePersonality, setEnabled, reloadPersonalities,
      paused, pauseSpeech, resumeSpeech, toggleSpeech, skipForward, skipBack, interrupt,
      replyHistory, conversation, send, actionLog,
      engaged, engage, disengage,
    ]
  );
}
