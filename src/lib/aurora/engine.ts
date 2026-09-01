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
import { astrauraChat, announceLine, getIntelligenceSettings, type RouteRecord } from "@/ai/astraura/router";
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
  getActivePersonality,
} from "@/lib/aurora/personalities";
import { isHermioneActive, getHermioneNeuron } from "@/lib/aurora/hermione-bridge";
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
// `isMobileDevice` gobierna las reglas de STT en móvil (ver §Android más abajo).
import { isInstalledApp, isMobileDevice } from "@/lib/aurora/voice-autonomy";
// Descriptor de "Revertir cambios" (Adenda "Aurora siempre responde", jul-2026).
import type { AuroraUndoInfo } from "@/lib/aurora/undo";
// (Adenda 154) Trazas del enjambre Astraura 1.58-bit → meta del mensaje (capa pura).
import { astraura158MetaFromRaw, astraura158ToolMetas, isAstraura158Source } from "@/lib/astraura/astraura-158-meta";
// VOZ NATURAL + ESTILO VIVO (Adenda voz de Aurora, jul-2026): ranking de voces
// del navegador (neurales/premium primero, es-* preferente) y modulación
// emocional persistida en `starseed.aurora.voice.v1`. Módulos LIGEROS y
// SSR-safe: importarlos no carga nada pesado.
import { resolveBrowserVoice, elegirVozPorGenero, vozCoincideConGenero } from "@/lib/aurora/tts-oss/browser-voices";
import { getModoVoz, generoEfectivo, ajustesVozEfectivos } from "@/lib/aurora/voz-inicial";
import { resolveVoiceParams } from "@/lib/aurora/tts-oss/voice-style";
import {
  getVoiceConfig as getUnifiedVoiceConfig,
  currentPreferredVoiceGender,
} from "@/lib/aurora/tts-oss/voice-config";

type Voice = { name: string; lang: string; voiceURI: string; default?: boolean };

/** Una herramienta invocada durante la respuesta (para el metadato del mensaje). */
export interface ToolInvocationMeta {
  name: string;
  ok: boolean;
  /** Resumen corto (frase decible), recortado. */
  summary: string;
  /** Si esa invocación fue reversible, cómo deshacerla. */
  undo?: AuroraUndoInfo;
}

/**
 * Metadatos de UNA respuesta de Aurora (Adenda "Aurora siempre responde",
 * jul-2026): qué la atendió, cuánto costó, y qué hizo. Aditivo — mensajes
 * antiguos sin `meta` se leen con normalidad (queda `undefined`).
 * Ver architecture/astraura-inteligencia.md §17.3.
 */
export interface AuroraMessageMeta {
  /** Etiqueta de la fuente (p.ej. "Groq", "Aurora (respuesta local)"). */
  provider?: string;
  /** Etiqueta del modelo usado. */
  model?: string;
  /** ¿Fue gratis? */
  free?: boolean;
  /** true = respuesta LOCAL honesta (ninguna IA real respondió). */
  local?: boolean;
  /** Nº de fuentes probadas en esta llamada. */
  attempts?: number;
  /** Duración de la llamada ganadora, en ms. */
  ms?: number;
  /** Texto original del modelo (sin directivas parseadas) */
  modelText?: string;
  /** Dificultad estimada de la petición (0..1). */
  difficulty?: number;
  /** Por qué se eligió esa fuente (transparencia del router). */
  reason?: string;
  /** Herramientas invocadas durante esta respuesta (nombre + resultado). */
  tools?: ToolInvocationMeta[];
  /**
   * Clase especial de mensaje (Adenda 71-ter): "config-change" marca un divisor
   * sutil de "ajustes del chat actualizados". Aditivo; los mensajes normales no
   * lo llevan.
   */
  kind?: string;
  /**
   * Ruta COMPLETA elegida por el router de Astraura (RouteRecord), si el motor
   * la adjuntó (Adenda 97; lo pinta message-action-bar → "Transparencia y
   * Alternativas"). `modelId` es un alias aditivo que algunas superficies usan.
   */
  route?: RouteRecord & { modelId?: string };
  /** Tokens consumidos por la respuesta (si la fuente los reporta). */
  tokens?: number | string;
  /**
   * (Adenda 154) Trazas del enjambre Astraura 1.58-bit cuando ESA fuente
   * respondió: plan de ramificación, trazas de agentes, ejecuciones de
   * herramientas y personalidades que intervinieron. Lo pinta el modal «Ver
   * proceso» (sección «Ramificación y agentes 1.58»). Aditivo.
   */
  astraura158?: Astraura158Meta;
}

/** Trazas del enjambre 1.58 adjuntas a un mensaje (Adenda 154). */
export interface Astraura158Meta {
  /** Plan de ramificación tal cual lo emitió el backend (`branching_plan.plan`). */
  plan?: unknown;
  traces?: { agent: string; color?: string; thoughts: string[] }[];
  tools?: { tool: string; target?: string; success?: boolean; summary?: string }[];
  personalities?: { id?: string; name: string; color?: string }[];
}

/** Una entrada del historial de conversación (para el chat-widget). */
export interface ConversationEntry {
  role: "user" | "aurora";
  text: string;
  at: number;
  /** (Aditivo) Metadatos de proceso — solo respuestas de Aurora los llevan. */
  meta?: AuroraMessageMeta;
}

/** Una entrada del registro de acciones ejecutadas por Aurora. */
export interface ActionLogEntry {
  name: string;
  ok: boolean;
  message: string;
  at: number;
  /** (Aditivo) Si la acción es reversible, cómo deshacerla. */
  undo?: AuroraUndoInfo;
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
  /** ¿Aurora está procesando la respuesta (esperando a la IA)? */
  thinking: boolean;
  transcript: string;
  interim: string;
  lastReply: string;
  activePersonality: any;
  settings: AuroraSettings;
  voices: Voice[];
  personalities: any[];
  start: () => void;
  stop: () => void;
  toggle: () => void;
  speak: (text: string, forcePersonality?: any) => void;
  /**
   * Como `speak`, pero ENCOLA en vez de cancelar lo que ya está sonando: la
   * usa la voz en vivo por cláusulas (una llamada por cláusula de la MISMA
   * respuesta, mientras Astraura sigue escribiendo) para que ninguna
   * cláusula corte a la anterior a mitad de palabra. `speak` conserva su
   * semántica de siempre ("cancela y di esto YA") para el resto de
   * superficies.
   */
  speakQueued: (text: string, forcePersonality?: any) => void;
  runCommand: (transcript: string, opts?: { forceSource?: { sourceId: string; modelId: string } }) => Promise<void>;
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
  /**
   * Envía texto al motor como si el usuario hablara (chat por escrito).
   * `opts.forceSource` (aditivo): fuerza un proveedor/modelo concreto SOLO
   * para esta llamada (lo usa "Reintentar" del menú contextual de mensajes).
   */
  send: (text: string, opts?: { forceSource?: { sourceId: string; modelId: string } }) => Promise<void>;
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
  /**
   * Fallo FATAL del reconocimiento (o null si todo va bien). El supervisor lo
   * traduce a `voiceUnavailable` para que la UI NUNCA se quede sorda en
   * silencio: si el STT muere, el orbe lo dice y ofrece reintentar / dar
   * permiso. Ver §Android en `buildRecognition`.
   */
  sttFatal: SttFatal | null;
}

/**
 * Motivo por el que el reconocimiento de voz quedó FUERA DE JUEGO.
 *   · 'not-allowed' / 'service-not-allowed' → falta el PERMISO de micrófono.
 *   · 'audio-capture' → el micrófono está ocupado (otra app/pestaña) o no existe.
 *   · 'failed' → demasiados arranques rotos seguidos (el motor se rindió).
 */
export type SttFatal = "not-allowed" | "service-not-allowed" | "audio-capture" | "failed";

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
 * Momento del último LATIDO del dueño del testigo (ms). Ver `STT_OWNER_TTL_MS`.
 */
let sttOwnerTs = 0;

/**
 * Vida del testigo SIN latido. Regla del proyecto (memory/state.md): los guards
 * son TEMPORALES, nunca booleanos permanentes.
 *
 * `sttOwner` era permanente: si el dueño moría SIN pasar por `stop()` ni por la
 * limpieza del desmontaje (pestaña congelada, bundle viejo servido por el
 * service worker, excepción en el unmount), el testigo quedaba apuntando a una
 * instancia FANTASMA y `start()` volvía en silencio para siempre → Aurora SORDA
 * de forma permanente ("no escucha", sin ningún error visible). Con TTL, el
 * testigo caduca y cualquier instancia viva puede retomar la voz.
 */
const STT_OWNER_TTL_MS = 60_000;
/** Cada cuánto late el dueño para renovar su testigo. */
const STT_OWNER_HEARTBEAT_MS = 15_000;

/** ¿Puede `id` arrancar el STT? (testigo libre, propio, o CADUCADO). */
function canOwnStt(id: symbol): boolean {
  if (!sttOwner || sttOwner === id) return true;
  return Date.now() - sttOwnerTs > STT_OWNER_TTL_MS;
}

/** Toma (o renueva) el testigo del STT para `id`. */
function claimStt(id: symbol): void {
  sttOwner = id;
  sttOwnerTs = Date.now();
}

/** Suelta el testigo si pertenece a `id`. */
function releaseStt(id: symbol): void {
  if (sttOwner === id) {
    sttOwner = null;
    sttOwnerTs = 0;
  }
}

/**
 * UN SOLO MOTOR DE VOZ — registro del ÚNICO SpeechRecognition VIVO del documento.
 * ----------------------------------------------------------------------------
 * `sttOwner` impide que dos INSTANCIAS del motor arranquen a la vez, pero NO
 * impedía que UNA MISMA instancia tuviera DOS objetos SpeechRecognition vivos a
 * la vez, que es la causa real de «Aurora no escucha y se repite en bucle»:
 *
 *   · `onend` programa un reinicio con `setTimeout(() => next.start(), delay)`.
 *   · Si ANTES de que venza ese temporizador el usuario toca el orbe (o pulsa el
 *     micro del chat), `start()` construía OTRO reconocimiento y lo arrancaba…
 *     sin cancelar el reinicio pendiente. Al vencer, el objeto viejo TAMBIÉN
 *     arrancaba → DOS reconocimientos peleando por el micrófono → se abortan
 *     mutuamente (`aborted`) → ninguno entrega `onresult` («no escucha») y cada
 *     `onend` vuelve a programar otro reinicio («loop»).
 *
 * Solución: TODO arranque pasa por `startRecognitionExclusive`, que ABORTA de
 * verdad el reconocimiento vivo anterior antes de arrancar el nuevo. Así, en
 * todo el OS, solo puede haber UN SpeechRecognition escuchando.
 */
let liveRecognition: any = null;

/** Aborta (de verdad) el reconocimiento vivo, si lo hay. */
function abortLiveRecognition(): void {
  const prev = liveRecognition;
  liveRecognition = null;
  if (!prev) return;
  try { prev.onend = null; } catch { /* */ }
  try { prev.onerror = null; } catch { /* */ }
  try { prev.onresult = null; } catch { /* */ }
  try { prev.abort?.(); } catch { /* */ }
}

/**
 * Arranca `rec` como el ÚNICO reconocimiento vivo del documento (aborta el
 * anterior). Defensivo: nunca lanza.
 */
function startRecognitionExclusive(rec: any): void {
  if (!rec) return;
  if (liveRecognition && liveRecognition !== rec) abortLiveRecognition();
  liveRecognition = rec;
  try { rec.start(); } catch { /* ya iniciado / arranque solapado */ }
}

/** Da de baja `rec` del registro si es el vivo (lo llama su propio `onend`). */
function releaseRecognition(rec: any): void {
  if (liveRecognition === rec) liveRecognition = null;
}

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

/**
 * Limpieza del texto antes de hablar (Adenda 85): DOS variantes, EXTRAÍDA de
 * `speak()` para que `speakQueued()` (voz en vivo por cláusulas) limpie
 * EXACTAMENTE igual sin duplicar la regex a mano dentro de este archivo:
 *  · `clean` — para el NAVEGADOR (histórica): quita también la puntuación — la
 *    Web Speech API la lee mal ("punto", pausas raras) en algunas voces.
 *  · `cleanChain` — para la CADENA NEURAL/OSS: quita markdown/símbolos pero
 *    CONSERVA la puntuación de frase (. , ; : ! ? …) — la que marca la
 *    prosodia y la que usa el troceo por frases para hablar los turnos
 *    largos frase a frase.
 * ⚠️ Esta limpieza (rama `cleanChain`) está REPLICADA en voice-notes.ts
 * (`cleanTextForVoiceChain`) para hashear la nota de voz con el MISMO texto
 * que suena. Si cambias esta regex, cámbiala también allí o las notas de voz
 * dejarán de casar con su mensaje (Adenda 87). Pura: nunca lanza.
 */
function sanitizeSpeechText(text: string): { clean: string; cleanChain: string } {
  const sinDirectivas = (text || "").replace(/\[\[goto:[^\]]+\]\]/gi, "");
  let clean = sinDirectivas.replace(/[*_~`´#|><.,;:\-\[\](){}\\\/"—–]/g, " ");
  clean = clean.replace(/\s+/g, " ").trim();
  let cleanChain = sinDirectivas.replace(/[*_~`´#|><\[\](){}\\\/"]/g, " ");
  cleanChain = cleanChain.replace(/\s+/g, " ").trim();
  if (!clean && !cleanChain) return { clean: "", cleanChain: "" };
  if (!cleanChain) cleanChain = clean;
  if (!clean) clean = cleanChain;
  return { clean, cleanChain };
}

/**
 * Construye el `SpeechSynthesisUtterance` para `clean` con la resolución de
 * voz/rate/pitch/estilo de `speakWithBrowser` (voz fijada en la personalidad
 * → cadena rankeada del navegador → cadena histórica Mónica es-MX → es →
 * cualquiera, con preferencia de género femenino salvo pin/preferencia "m"
 * explícita). EXTRAÍDA como función pura (no cancela, no habla, no toca refs
 * ni estado de React — solo lee `window.speechSynthesis.getVoices()`) para
 * que `speakWithBrowser` (single-shot, cancela) y `speakWithBrowserQueued`
 * (encolado, NO cancela) construyan la MISMA voz sin duplicar la cadena.
 * Requiere que `window.speechSynthesis` exista (los llamantes ya lo comprueban).
 */
function resolveBrowserUtterance(clean: string, p: Personality): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = p.voice?.lang || "es-MX";
  // Mapear un par de parámetros sobre la entrega.
  const energia = Number(p.params?.energia ?? 60);
  const calidez = Number(p.params?.calidez ?? 70);
  const basePitch = Number(p.voice?.pitch ?? 1);
  const baseRate = Number(p.voice?.rate ?? 1);
  u.pitch = Math.max(0, Math.min(2, basePitch + (calidez - 50) / 250)); // calidez → +pitch leve
  u.rate = Math.max(0.1, Math.min(2, baseRate + (energia - 50) / 200)); // energía → +rate
  // (Adenda voz de Aurora) ESTILO EMOCIONAL VIVO: multiplica sobre la entrega
  // de la personalidad con el estilo persistido (evento
  // 'starseed:aurora-voice-style', herramienta ajustar_voz, sliders del panel).
  try {
    const style = resolveVoiceParams();
    u.rate = Math.max(0.1, Math.min(2, u.rate * style.rate));
    u.pitch = Math.max(0, Math.min(2, u.pitch * style.pitch));
    u.volume = style.volume;
  } catch { /* estilo no disponible → entrega histórica intacta */ }
  const all = window.speechSynthesis.getVoices() || [];
  // Voz: 1) la fijada en la personalidad → 2) la elegida/mejor RANKEADA del
  // navegador (config unificada; "" = automática = neurales/premium primero,
  // es-* preferente) → 3) cadena histórica (Mónica es-MX → es → cualquiera).
  let ranked: SpeechSynthesisVoice | null = null;
  try {
    ranked = resolveBrowserVoice(getUnifiedVoiceConfig().browserVoiceURI, all, u.lang || "es");
  } catch { ranked = null; }
  // GÉNERO FEMENINO — preferencia FUERTE (Adenda voz-femenina, 2026-07-21):
  // las personalidades incluidas en StarSeed son femeninas por defecto
  // (`currentPreferredVoiceGender()`, voice-config.ts). Con esa
  // preferencia recorremos la MISMA cadena histórica pero EXCLUYENDO en
  // cada eslabón los nombres masculinos conocidos (Jorge, Diego, Carlos,
  // Juan, Pablo, Enrique); si tras excluirlos no queda ninguna voz,
  // repetimos la cadena SIN excluir — mejor "voz equivocada" que dejar a
  // Aurora muda. Con preferencia "m" explícita la cadena es EXACTAMENTE
  // la histórica (comportamiento intacto). Nunca lanza: cualquier fallo
  // cae a la cadena de siempre.
  const isKnownMaleVoiceName = (x: unknown): boolean => {
    try {
      const name = (x as { name?: unknown } | null | undefined)?.name;
      return typeof name === "string" && /\b(jorge|diego|carlos|juan|pablo|enrique)\b/i.test(name);
    } catch {
      return false;
    }
  };
  const pinnedVoice: SpeechSynthesisVoice | undefined = p.voice?.voiceURI
    ? all.find((x) => x.voiceURI === p.voice.voiceURI)
    : undefined;
  const buildVoiceChain = (excludeMale: boolean): SpeechSynthesisVoice | null => {
    const ok = (x: SpeechSynthesisVoice | null | undefined): x is SpeechSynthesisVoice =>
      !!x && (!excludeMale || !isKnownMaleVoiceName(x));
    return (
      (ok(pinnedVoice) ? pinnedVoice : null)
      || (ok(ranked) ? ranked : null)
      || all.find((x) => ok(x) && /m[oó]nica/i.test(x.name) && /es[-_]MX/i.test(x.lang))
      || all.find((x) => ok(x) && /es[-_]MX/i.test(x.lang))
      || all.find((x) => ok(x) && x.lang === u.lang)
      || all.find((x) => ok(x) && (x.lang || "").toLowerCase().startsWith("es"))
      || null
    );
  };
  let wantFemale = true;
  try {
    wantFemale = currentPreferredVoiceGender() !== "m";
  } catch {
    wantFemale = true;
  }
  const v = wantFemale ? (buildVoiceChain(true) || buildVoiceChain(false)) : buildVoiceChain(false);
  if (v) u.voice = v;

  // (Adenda 194) MODO DE VOZ elegido en la bienvenida (femenina · masculina ·
  // neutra · autónoma). Manda sobre el ranking histórico: elige la mejor voz
  // del sistema de ESE género y aplica su modulación, de modo que las tres
  // suenen bien sin que nadie toque un ajuste. Una voz fijada a mano en la
  // personalidad sigue ganando (gesto explícito del usuario).
  try {
    const modo = getModoVoz();
    const gen = generoEfectivo(modo);
    let coincide = true;
    if (!p.voice?.voiceURI) {
      const elegida = elegirVozPorGenero(gen, all, u.lang || "es");
      if (elegida) { u.voice = elegida; coincide = vozCoincideConGenero(elegida, gen); }
    } else {
      coincide = vozCoincideConGenero(u.voice, gen);
    }
    // Los rasgos para la modulación autónoma viven en el PERFIL de personalidad
    // (no en la Personality del motor): se leen de forma defensiva.
    let rasgos: Record<string, number> | undefined;
    try {
      const act = (globalThis as unknown as { STARSEED_personality_traits?: Record<string, number> }).STARSEED_personality_traits;
      rasgos = act;
    } catch { rasgos = undefined; }
    const aj = ajustesVozEfectivos(rasgos, coincide);
    u.pitch = Math.max(0, Math.min(2, u.pitch * aj.pitch));
    u.rate = Math.max(0.1, Math.min(2, u.rate * aj.rate));
  } catch { /* sin modo elegido: queda la cadena de siempre */ }
  return u;
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
  // ¿Aurora está PROCESANDO la respuesta (esperando a la IA)? → animación de
  // carga en el orbe y los botones. Entre el fin de tu voz y el inicio del habla.
  const [thinking, setThinking] = useState(false);
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
  const conversationRef = useRef<ConversationEntry[]>([]);
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
  // ── Salud del STT (anti-loop) ─────────────────────────────────────────────
  // Contador de arranques ROTOS consecutivos (ver `buildRecognition`). Un ciclo
  // normal de Android (termina tras cada frase, o por silencio) NO cuenta como
  // roto: solo cuenta el reconocimiento que muere NADA MÁS arrancar sin audio.
  const sttRestartsRef = useRef<number>(0);
  const sttRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fallo fatal visible (permiso denegado / micro ocupado / se rindió).
  const [sttFatal, setSttFatal] = useState<SttFatal | null>(null);
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
  // ── COLA DE HABLA (voz en vivo por cláusulas) ──────────────────────────
  // A diferencia de `speak()` (que CANCELA todo lo anterior — correcto para
  // "lee esto YA": alertas de la malla, "leer este mensaje", cambiar de
  // conversación…), `speakQueued()` ENCOLA: cada cláusula de una MISMA
  // respuesta debe sonar completa antes de que empiece la siguiente, sin que
  // ninguna corte a la anterior. `ttsQueueRef` es la cola PROPIA del motor
  // (no la nativa de speechSynthesis): funciona igual por el navegador o por
  // un motor OSS, y con ella controlamos EXACTAMENTE cuándo se puede cerrar
  // la ventana anti-eco — no al `onend` de CADA cláusula (la reabriría entre
  // cláusulas y la siguiente podría oír a Astraura misma) sino solo cuando la
  // cola queda REALMENTE vacía (ver `advanceTtsQueue`). `ttsQueueBusyRef`
  // evita arrancar dos drenajes a la vez. `ttsQueueGenRef` se incrementa
  // cuando la cola se vacía a la fuerza (`interrupt()`/barge-in) para que una
  // cláusula que sigue en vuelo (su onend/onerror/watchdog puede llegar
  // igual tras el cancel()) no reviva un drenaje ya cancelado ni cierre el
  // turno equivocado.
  const ttsQueueRef = useRef<{ clean: string; cleanChain: string; p: Personality }[]>([]);
  const ttsQueueBusyRef = useRef<boolean>(false);
  const ttsQueueGenRef = useRef<number>(0);
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

    // VOZ · estilo vivo (Personalidades → modulación): instala el consumidor
    // GLOBAL de 'starseed:aurora-voice-style' UNA sola vez (idempotente). Import
    // perezoso y defensivo: si falla, Aurora habla igual con su estilo actual.
    void import("@/lib/aurora/tts-oss/voice-style")
      .then((m) => m.installVoiceStyleListener())
      .catch(() => { /* */ });
    // VOZ · preset ORGÁNICO por defecto (cálido/sereno, ritmo natural): siembra
    // `starseed.aurora.voice.v1` en el PRIMER arranque si el usuario no eligió
    // nada, para que Aurora ya suene orgánica de fábrica y sea ajustable.
    void import("@/lib/aurora/tts-oss/voice-config")
      .then((m) => m.ensureOrganicVoiceDefault())
      .catch(() => { /* */ });

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
      // speechSynthesis.cancel() ELIMINADO intencionalmente para permitir
      // continuidad de voz en segundo plano durante transiciones o soft reloads.
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
  // (Adenda 203) Cancelador del `resume()` periódico que evita el corte de
  // Chrome a los ~15 s de habla. Nombre propio: `keepAliveRef` ya existe y es
  // del MICRÓFONO — pisarlo apagaría la escucha para siempre.
  const ttsKeepAliveRef = useRef<null | (() => void)>(null);
  // Última petición de habla (texto + instante), para no duplicar locuciones.
  const ultimaPeticionRef = useRef<{ texto: string; t: number }>({ texto: "", t: 0 });
  // Texto que el navegador tiene ahora mismo sonando o en cola.
  const enVueloRef = useRef<string | null>(null);
  const clearKeepAlive = useCallback(() => {
    try { ttsKeepAliveRef.current?.(); } catch { /* */ }
    ttsKeepAliveRef.current = null;
  }, []);

  const speakWithBrowser = useCallback((clean: string, p: Personality) => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    if (p.provider !== "browser" && p.provider !== "astraura") {
      const ok = speakPremium(clean, p);
      if (ok) return; // si tuviera implementación premium real
    }

    try {
      const synth = window.speechSynthesis;
      // (Adenda 204) Si YA está sonando —o en cola— exactamente este texto, no
      // se vuelve a empezar. `speakWithBrowser` arranca cancelando, así que una
      // segunda petición del mismo texto mataría la locución en curso y el
      // usuario no oiría nada: es justo el fallo que se reprodujo en vivo (una
      // locución con `error: "canceled"` y otra que ya no llegaba a sonar).
      if ((synth.speaking || synth.pending) && enVueloRef.current === clean) return;
      enVueloRef.current = clean;
      // ── (Adenda 203) EL ENCALLE DE CHROME ────────────────────────────────
      // Diagnóstico en vivo: la locución se creaba con su voz correcta y
      // `speechSynthesis.speaking` pasaba a true, pero `onstart` NO disparaba
      // NUNCA y no salía ni un sonido. Es el fallo conocido de Chrome (macOS
      // sobre todo): `cancel()` y `speak()` en el MISMO tick dejan la cola del
      // motor encallada. Aquí se hacía exactamente eso.
      // Ahora: cancelar → ceder un tick → `resume()` (por si quedó en pausa) →
      // hablar. Y si aun así no arranca en 1,2 s, un reintento limpio.
      synth.cancel();
      const u = resolveBrowserUtterance(clean, p);
      let arranco = false;
      u.onstart = () => {
        arranco = true;
        setSpeaking(true); setPaused(false); emitAuroraSpeak("start");
        markTtsSpeaking(true); // anti-eco GLOBAL: ignora la voz propia
      };
      // Cada límite de palabra/frase impulsa el latido del glow del Orbe.
      u.onboundary = () => emitAuroraSpeak("boundary");
      u.onend = () => { if (enVueloRef.current === clean) enVueloRef.current = null; clearKeepAlive(); finishTts(); };
      u.onerror = () => { if (enVueloRef.current === clean) enVueloRef.current = null; clearKeepAlive(); finishTts(); };
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
      ttsWatchdogRef.current = setTimeout(() => { clearKeepAlive(); finishTts(); }, estMs);

      // Chrome corta el habla sola a los ~15 s. Un `resume()` periódico mientras
      // suena evita que la guía se quede a medias en las frases largas.
      const keepAlive = window.setInterval(() => {
        try { if (synth.speaking) synth.resume(); } catch { /* */ }
      }, 9000);
      ttsKeepAliveRef.current = () => window.clearInterval(keepAlive);

      const lanzar = () => {
        try { synth.resume(); } catch { /* */ }
        synth.speak(u);
      };
      // El tick de respiro es lo que desencalla el motor.
      window.setTimeout(() => {
        lanzar();
        // (Adenda 204) Reintento MUY conservador. El de la 203 cancelaba a los
        // 1,2 s "por si acaso" y, como el motor de macOS tarda más que eso en
        // arrancar un texto largo, mataba la locución que iba a empezar: cuatro
        // intentos seguidos cancelándose y silencio absoluto.
        // Ahora solo se reintenta ante la firma REAL del encalle: no arrancó Y
        // no hay nada sonando NI en cola. Si está `pending`, está a punto de
        // hablar: no se toca.
        window.setTimeout(() => {
          if (arranco || synth.speaking || synth.pending) return;
          try { lanzar(); } catch { /* */ }
        }, 1800);
      }, 90);
      setPaused(false);
    } catch {
      finishTts();
    }
  }, [speakPremium, finishTts, clearKeepAlive]);

  // speak — Punto de entrada del habla de Aurora. ADITIVO Y DEFENSIVO:
  //   1) Limpia el texto (quita marcadores [[goto:...]]).
  //   2) Si el usuario eligió un MOTOR DE VOZ OSS (Kokoro/Kitten) y está listo,
  //      delega en él manteniendo el medio-dúplex (mic off + anti-eco) y el
  //      LATIDO del orbe (emitAuroraSpeak start/boundary/end) alrededor del audio.
  //   3) Si el motor OSS no aplica / no está disponible / falla, cae a la voz del
  //      navegador (speakWithBrowser) — comportamiento histórico intacto.
  const speak = useCallback((text: string, forcePersonality?: any, vibeVoiceScript?: string | null) => {
    if (typeof window === "undefined") return;
    // Limpieza (Adenda 85), ver `sanitizeSpeechText` — compartida con
    // `speakQueued()` para que ambas rutas limpien EXACTAMENTE igual.
    const { clean, cleanChain } = sanitizeSpeechText(text);
    if (!clean && !cleanChain) return;

    // ── (Adenda 204) UNA VOZ POR TEXTO ────────────────────────────────────
    // Diagnóstico en vivo: al empezar la guía salían CUATRO locuciones del
    // mismo saludo y las tres primeras morían con `error: "canceled"` — cada
    // `speakWithBrowser` arranca cancelando, así que peticiones solapadas del
    // MISMO texto se matan entre sí y no se oye nada. Pasa en cuanto dos
    // caminos piden lo mismo casi a la vez (arranque del rito + narración del
    // paso, o un doble render en desarrollo).
    // Si ya hay en vuelo una petición con este mismo texto, se ignora la nueva.
    const ahora = Date.now();
    if (ultimaPeticionRef.current.texto === clean && ahora - ultimaPeticionRef.current.t < 5000) {
      return;
    }
    ultimaPeticionRef.current = { texto: clean, t: ahora };

    const p = forcePersonality || activeRef.current;

    const runBrowser = () => speakWithBrowser(clean, p);

    // Intento OSS (asíncrono, import dinámico). Nunca lanza; si declina → navegador.
    void (async () => {
      let handedOff = false;
      // ── (Adenda 202) PLAZO DE ARRANQUE ────────────────────────────────────
      // Fallo reportado en vivo: «no se escucha ninguna voz». Causa real: la
      // cadena OSS intenta sus motores EN SERIE y, con los Spaces de HF caídos
      // (503), cada eslabón tarda segundos en rendirse. Hasta que la cadena
      // entera declinaba, el suelo del navegador no llegaba a sonar — o llegaba
      // tan tarde que ya no correspondía a la pantalla.
      // Ahora hay un plazo: si en RELEVO_MS nadie ha empezado a sonar, habla el
      // navegador. Si un motor OSS despierta después, se corta en su `onStart`
      // para que jamás suenen dos voces a la vez.
      const RELEVO_MS = 2500;
      let relevoNavegador = false;
      let relevoTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        relevoTimer = null;
        if (handedOff) return;
        relevoNavegador = true;
        runBrowser();
      }, RELEVO_MS);
      const clearRelevo = () => {
        if (relevoTimer) { clearTimeout(relevoTimer); relevoTimer = null; }
      };
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
        const spoke = await speakWithConfiguredEngine(cleanChain, {
          onStart: () => {
            // El navegador ya tomó el relevo: este motor llegó tarde y NO habla.
            if (relevoNavegador) {
              void import("@/lib/aurora/tts-oss/speak-router")
                .then((m) => m.stopConfiguredEngine())
                .catch(() => null);
              return;
            }
            clearRelevo();
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
            // Watchdog de seguridad. Con el habla TROCEADA (Adenda 85) un turno
            // largo dura minutos DE VERDAD: el tope pasa de 45 s a 4 min para no
            // cortar a Aurora a mitad de párrafo (sigue protegiendo de audios
            // que jamás terminan; onEnd lo limpia siempre).
            clearOssWatchdog();
            const estMs = Math.min(240000, 8000 + cleanChain.length * 95);
            ossWatchdog = setTimeout(() => { clearBoundary(); finishTts(); }, estMs);
          },
          onEnd: () => {
            clearBoundary();
            clearOssWatchdog();
            // finishTts cierra el turno: apaga glow, anti-eco y reanuda escucha.
            finishTts();
          },
          onError: () => { /* no fatal: si además declina, caemos a navegador abajo */ },
          // Guion multi-locutor VibeVoice: si viene y el motor activo es VibeVoice,
          // runLink lo usa en vez del texto limpio (varias voces en un diálogo).
          multiSpeakerScript: vibeVoiceScript ?? undefined,
        });

        if (spoke && !relevoNavegador) return; // el motor OSS se hizo cargo del turno.

        // Declinó (motor navegador, no disponible, o fallo antes de sonar).
        clearRelevo();
        clearBoundary();
        clearOssWatchdog();
        if (relevoNavegador) return; // ya lo dijo el navegador: no se repite.
        if (!handedOff) {
          // Nunca llegó a hablar → voz del navegador, turno limpio.
          runBrowser();
        } else {
          // Improbable: arrancó pero devolvió false → cierra el turno con dignidad.
          finishTts();
        }
      } catch {
        // El import/enrutador falló → comportamiento histórico intacto.
        clearRelevo();
        clearBoundary();
        clearOssWatchdog();
        if (relevoNavegador) return;
        if (!handedOff) runBrowser();
        else finishTts();
      }
    })();
  }, [speakWithBrowser, finishTts]);

  // speakWithBrowserQueued — habla `clean` por el navegador SIN cancelar lo
  // que ya esté sonando o en cola: usa la MISMA resolución de voz que
  // `speakWithBrowser` (vía `resolveBrowserUtterance`) pero llama a
  // `speechSynthesis.speak()` SIN `cancel()` antes — el navegador ENCOLA de
  // forma nativa cuando se llama así varias veces seguidas (spec de la Web
  // Speech API: mientras no haya `cancel()` de por medio, cada utterance
  // nueva se añade al final y suena tras la anterior). Esta es la pieza que
  // arregla la regresión reportada: antes, cada cláusula pasaba por
  // `speakWithBrowser`, que SIEMPRE cancela — la cláusula N+1 mataba a la N
  // a mitad de palabra (arranca, se corta, reinicia, nunca completa una
  // frase). Aquí, ninguna cláusula toca a otra.
  //
  // `onDone` se llama EXACTAMENTE UNA VEZ, al terminar/fallar ESTA cláusula
  // (onend/onerror) — nunca cierra el turno por su cuenta (no toca el
  // anti-eco ni llama a `finishTts`): eso lo decide `advanceTtsQueue`, que es
  // quien sabe si queda más cola pendiente. Devuelve `false` si no pudo ni
  // empezar (SSR, sin speechSynthesis, o excepción al construir/hablar la
  // utterance) — el llamador debe entonces avanzar la cola él mismo.
  const speakWithBrowserQueued = useCallback((clean: string, p: Personality, onDone: () => void): boolean => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return false;
    if (p.provider !== "browser" && p.provider !== "astraura") {
      const ok = speakPremium(clean, p);
      // Hoy `speakPremium` es un stub que SIEMPRE devuelve `false` (ver su
      // definición arriba): esta rama nunca se toma en la práctica — igual
      // que en `speakWithBrowser`. Si alguna vez se implementa de verdad,
      // tendrá que llamar a `onDone()` al terminar, o la cola se quedaría
      // esperando para siempre.
      if (ok) return true;
    }
    try {
      const u = resolveBrowserUtterance(clean, p);
      u.onstart = () => {
        setSpeaking(true); setPaused(false); emitAuroraSpeak("start");
      };
      // Cada límite de palabra/frase impulsa el latido del glow del Orbe.
      u.onboundary = () => emitAuroraSpeak("boundary");
      u.onend = () => onDone();
      u.onerror = () => onDone();
      window.speechSynthesis.speak(u); // ENCOLA (sin cancel()): ver comentario de arriba
      setPaused(false);
      return true;
    } catch {
      return false;
    }
  }, [speakPremium]);

  // advanceTtsQueue — drena la cola de habla: saca la siguiente cláusula
  // pendiente y la habla con la MISMA cadena que `speak()` (motor OSS
  // primero, navegador como suelo) pero SIN cancelar nada — cada cláusula
  // ENCOLA. Cuando esa cláusula termina de verdad (onend/onerror/watchdog) se
  // llama a sí misma para sacar la siguiente: el anti-eco permanece ABIERTO
  // durante todo ese relevo, así el micrófono NUNCA se reabre entre
  // cláusulas de la MISMA respuesta. Solo cuando la cola queda REALMENTE
  // vacía se cierra el turno de verdad (`finishTts`): apaga el anti-eco y
  // reanuda la escucha.
  //
  // Este es "el punto delicado": `finishTts()` HOY se dispara al `onend` de
  // UNA utterance; con cola, cerrar el micrófono a la primera dejaría que
  // Astraura se oyera a sí misma en las cláusulas siguientes. La garantía
  // aquí es doble: (1) NINGÚN camino de una cláusula individual llama a
  // `finishTts` — ni `speakWithBrowserQueued` ni el `onEnd`/watchdog del
  // intento OSS de abajo lo hacen; TODOS terminan en `onDone` →
  // `advanceTtsQueue`. (2) `advanceTtsQueue` solo cierra el turno en la rama
  // `!next` (el `shift()` de la cola devolvió `undefined`: no queda NADA
  // pendiente). Como cada cláusula, sin excepción, pasa por este mismo
  // relevo antes de poder seguir a la siguiente, el anti-eco no puede
  // cerrarse "de más" (mientras aún queda cola) ni quedarse abierto "de
  // menos" (en cuanto la cola se vacía, esta misma llamada lo cierra — no
  // hay ninguna otra ruta que debiera cerrarlo y no lo haga).
  //
  // `gen` es la "generación" de la cola en el momento en que ESTE relevo
  // arrancó: si `interrupt()` vacía la cola a la fuerza mientras una cláusula
  // suena, incrementa `ttsQueueGenRef` — cuando esa cláusula por fin termine
  // (o su watchdog dispare), su `gen` ya no coincidirá con la generación
  // vigente y esta función no hace NADA: ni revive una cola que ya no existe,
  // ni vuelve a cerrar (ni reabre la escucha) un turno que `interrupt()` ya
  // cerró por su cuenta. Mismo patrón que `recGenRef` (arriba) para el
  // reconocimiento — anti bucle competitivo.
  const advanceTtsQueue = useCallback((gen: number) => {
    if (gen !== ttsQueueGenRef.current) return; // cola obsoleta: interrupt()/barge-in ya la vació
    const next = ttsQueueRef.current.shift();
    if (!next) {
      // Cola REALMENTE vacía: AHORA sí termina el turno completo.
      ttsQueueBusyRef.current = false;
      finishTts();
      return;
    }
    if (typeof window === "undefined") { advanceTtsQueue(gen); return; } // SSR defensivo

    let handedOff = false;
    let settled = false;
    const onDone = () => {
      if (settled) return; // idempotente: onend/onerror/watchdog nunca avanzan dos veces
      settled = true;
      if (ttsWatchdogRef.current) { clearTimeout(ttsWatchdogRef.current); ttsWatchdogRef.current = null; }
      advanceTtsQueue(gen);
    };

    // Abre (o mantiene abierta) la ventana anti-eco YA, antes de intentar
    // sonar ESTA cláusula — igual que hace `speak()` con cada llamada suya
    // (la apertura eager de `speakWithBrowser` y el `onStart` OSS de
    // `speak()`). Repetirlo en cada cláusula es idempotente (ya está abierta
    // desde la cláusula anterior) y barato; lo que importa es que nada aquí
    // abajo la CIERRA hasta la rama `!next` de arriba.
    markTtsSpeaking(true);
    pausedForTtsRef.current = true;
    recGenRef.current++;
    try { recognitionRef.current?.abort?.(); } catch { /* */ }

    // Watchdog de ESTA cláusula (no del turno completo): si ni el motor OSS
    // ni el navegador disparan su fin, avanza la cola igual — nunca se queda
    // atascada por una cláusula que nunca cierra. Cláusulas son cortas (ver
    // `splitClauses`: tope de ~14 palabras), así que el tope de 30s de
    // `speakWithBrowser` (no el de 4 min que usa `speak()` para un mensaje
    // OSS entero sin trocear) es más que sobrado y recupera la cola antes.
    if (ttsWatchdogRef.current) clearTimeout(ttsWatchdogRef.current);
    const estMs = Math.min(30000, 1600 + next.cleanChain.length * 80);
    ttsWatchdogRef.current = setTimeout(onDone, estMs);

    void (async () => {
      try {
        const { speakWithConfiguredEngine } = await import("@/lib/aurora/tts-oss/speak-router");
        const spoke = await speakWithConfiguredEngine(next.cleanChain, {
          onStart: () => {
            handedOff = true;
            setSpeaking(true); setPaused(false); emitAuroraSpeak("start");
          },
          onEnd: () => onDone(),
          onError: () => { /* si aún no había empezado, cae al navegador abajo */ },
        });
        if (spoke) return; // el motor OSS se hizo cargo de ESTA cláusula (onDone llegará por su onEnd)
        if (!handedOff) {
          const started = speakWithBrowserQueued(next.clean, next.p, onDone);
          if (!started) onDone();
        } else {
          // Improbable: arrancó pero devolvió false → cierra ESTA cláusula
          // con dignidad y sigue con la siguiente.
          onDone();
        }
      } catch {
        if (!handedOff) {
          const started = speakWithBrowserQueued(next.clean, next.p, onDone);
          if (!started) onDone();
        } else {
          onDone();
        }
      }
    })();
  }, [finishTts, speakWithBrowserQueued]);

  // speakQueued — como `speak()`, pero ENCOLA en vez de cancelar: la usa la
  // VOZ EN VIVO por cláusulas (`chat-surface.tsx` → `streaming-voice.ts`, una
  // llamada por cláusula de la MISMA respuesta mientras Astraura sigue
  // escribiendo). `speak()` se queda intacto para el resto de superficies
  // (MessageActionBar, alertas de la malla, multichat, "leer última
  // respuesta"…), que quieren "cancela lo que suene y di esto YA" — esa
  // semántica sigue siendo la correcta para ellas.
  const speakQueued = useCallback((text: string, forcePersonality?: any) => {
    if (typeof window === "undefined") return;
    // Misma limpieza que `speak()` (`sanitizeSpeechText`, compartida: una
    // sola fuente para ambas rutas).
    const { clean, cleanChain } = sanitizeSpeechText(text);
    if (!clean && !cleanChain) return;
    const p = forcePersonality || activeRef.current;
    ttsQueueRef.current.push({ clean, cleanChain, p });
    if (!ttsQueueBusyRef.current) {
      // Nadie está drenando ahora mismo → arranca el relevo con ESTA
      // cláusula. Si YA había un drenaje en curso, no hace falta hacer nada
      // más: la cláusula recién encolada la recogerá `advanceTtsQueue` en
      // cuanto la cláusula actual termine (su `onDone` vuelve a llamarse a
      // sí misma y hace `shift()` sobre la cola).
      ttsQueueBusyRef.current = true;
      advanceTtsQueue(ttsQueueGenRef.current);
    }
  }, [advanceTtsQueue]);

  // ── historial de respuestas + conversación ──
  // Registra una respuesta de Aurora en el historial (para el transporte y el chat).
  // `meta` es OPCIONAL y ADITIVO: si el llamador no la pasa (reglas
  // deterministas del motor, sin modelo de por medio), igualmente se adjunta
  // un meta MÍNIMO honesto, para que "Ver proceso" nunca quede vacío sin
  // explicación. Las respuestas que sí pasaron por `astrauraChat` llevan el
  // meta real (proveedor/modelo/intentos/duración/dificultad/herramientas).
  const pushReply = useCallback((text: string, meta?: AuroraMessageMeta) => {
    const t = (text || "").trim();
    if (!t) return;
    setLastReply(t);
    setReplyHistory((prev) => {
      const next = [...prev, t].slice(-HISTORY_LIMIT);
      replyHistoryRef.current = next;
      return next;
    });
    historyIndexRef.current = -1; // -1 = al final (última respuesta)
    const entryMeta: AuroraMessageMeta = meta ?? { local: true, reason: "Regla determinista del motor (sin modelo de IA)." };
    setConversation((prev) => {
      const next = [...prev, { role: "aurora" as const, text: t, at: Date.now(), meta: entryMeta }].slice(-HISTORY_LIMIT);
      conversationRef.current = next;
      return next;
    });
  }, []);

  // Registra lo que el usuario dijo/escribió.
  const pushUser = useCallback((text: string) => {
    const t = (text || "").trim();
    if (!t) return;
    setConversation((prev) => {
      const next = [...prev, { role: "user" as const, text: t, at: Date.now() }].slice(-HISTORY_LIMIT);
      conversationRef.current = next;
      return next;
    });
  }, []);

  // Registra una acción ejecutada (para el panel del chat).
  const pushAction = useCallback((entry: ActionLogEntry) => {
    setActionLog((prev) => [...prev, entry].slice(-HISTORY_LIMIT));
  }, []);

  // ── transporte de voz (Reproducir / Pausar / Adelantar / Retroceder) ──
  const pauseSpeech = useCallback(() => {
    if (typeof window === "undefined") return;
    try { if (typeof window.speechSynthesis !== "undefined") window.speechSynthesis.pause(); } catch { /* */ }
    // (Adenda 169 · fix bucle de voz) La ruta de voz por defecto es el mixer
    // OmniVoice (WebAudio), NO speechSynthesis. Pausar solo este último dejaba
    // el mixer sonando en loop y el streaming seguía metiendo cláusulas. Al
    // pausar hay que cortar TAMBIÉN el mixer (igual que hace `interrupt`).
    void import("@/lib/aurora/tts-oss/speak-router")
      .then((m) => m.stopConfiguredEngine())
      .catch(() => { /* */ });
    setPaused(true);
  }, []);

  const resumeSpeech = useCallback(() => {
    if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
    try { window.speechSynthesis.resume(); setPaused(false); } catch { /* */ }
  }, []);

  const interrupt = useCallback(() => {
    if (typeof window === "undefined") return;
    // Vacía la COLA de habla encolada (barge-in real: nada de lo que quedaba
    // pendiente debe sonar después de esto). La generación se incrementa
    // PRIMERO: una cláusula que sigue en vuelo puede disparar su
    // onend/onerror/watchdog DESPUÉS del cancel() de abajo — con la
    // generación ya obsoleta, `advanceTtsQueue` la reconoce como tal y no
    // hace nada (ni revive la cola, ni cierra el turno una segunda vez).
    ttsQueueGenRef.current++;
    ttsQueueRef.current = [];
    ttsQueueBusyRef.current = false;
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
    pushAction({ name: nm, ok: !!res.ok, message: res.message || "", at: Date.now(), undo: res.undo });
    if (res.message) {
      pushReply(res.message, { local: true, reason: "Acción directa (puente/extensión)", tools: [{ name: nm, ok: !!res.ok, summary: res.message.slice(0, 200), undo: res.undo }] });
      speak(res.message);
    }
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
  // Marca temporal del runCommand en curso (0 = libre). Guard de solapamiento
  // BASADO EN TIEMPO: se AUTO-LIBERA a los 60s aunque algo interno se colgara,
  // para que Aurora NUNCA se quede sorda ("ni reconoce nada") de forma permanente.
  const runningRef = useRef<number>(0);
  const runCommand = useCallback(async (
    raw: string,
    opts?: { forceSource?: { sourceId: string; modelId: string } },
  ) => {
    // GUARD ANTI-SOLAPAMIENTO: si Aurora YA está procesando una respuesta (hace
    // menos de 60s), no lanzamos otra en paralelo. Sin esto, mientras Aurora
    // "piensa" el micrófono puede captar más frases y disparar runCommands
    // concurrentes → pile-up que se percibe como "oye pero no responde y el
    // reproductor se reinicia en loop". El tope temporal evita el bloqueo eterno.
    const nowRun = Date.now();
    if (runningRef.current && nowRun - runningRef.current < 60_000) return;
    runningRef.current = nowRun;
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

    // ── Adenda 70 · Puente Hermione ──
    // Si la personalidad activa es Hermione y su neurona servidor (esta Mac)
    // está ONLINE, DELEGAMOS el mensaje al puente: NO generamos respuesta local
    // (Astraura). El reenvío ya ocurre en appendMessage al guardar el mensaje
    // del usuario, y la respuesta de Hermes vuelve por astraura_messages en
    // tiempo real y se muestra en el chat. Esto elimina la doble respuesta
    // (que el usuario percibía como "el mensaje se reinicia antes de completar")
    // y hace que Hermione conteste de verdad. Si la neurona no está online,
    // degradamos a Astraura normal (comportamiento previo, sin romper nada).
    if (isHermioneActive(getActivePersonality()?.id)) {
      let neuron: { online?: boolean } | null = null;
      try { neuron = await getHermioneNeuron(); } catch { neuron = null; }
      if (neuron?.online) {
        // El puente entregará la respuesta; no respondemos con Aurora.
        return;
      }
    }

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
      // SELECCIÓN AUTOMÁTICA DE HERRAMIENTAS (toggle, Ajustes → Inteligencia):
      // con `autoTools:false` Aurora conversa sin evaluar/ofrecer ninguna tool.
      const autoToolsOn = getIntelligenceSettings().autoTools !== false;
      let toolsSection = "";
      if (autoToolsOn) {
        try { toolsSection = await auroraToolsActionPromptSection(brainIdRef.current); } catch { toolsSection = ""; }
      }
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
      // Se incluye el historial reciente (conversationRef) antes del mensaje actual.
      // Así mantenemos el contexto continuo en los comandos de voz.
      const historyMessages = conversationRef.current.map((msg): ChatMessage => ({
        role: msg.role === 'aurora' ? 'assistant' : 'user',
        content: msg.text,
      }));
      if (historyMessages.length > 0 && historyMessages[historyMessages.length - 1].role === 'user' && historyMessages[historyMessages.length - 1].content === text) {
        historyMessages.pop();
      }
      const messages: ChatMessage[] = [
        { role: "system", content: system },
        ...historyMessages,
        { role: "user", content: text },
      ];
      const temperature = 0.4 + (Number(activeRef.current.params?.creatividad ?? 60) / 100) * 0.6;
      setThinking(true); // ← animación de carga en el orbe mientras espera a la IA
      // Router agéntico gratis-primero (auto) o proveedor clásico (manual).
      // `forceSource` (opcional): "Reintentar" del menú contextual de mensajes
      // fuerza un proveedor/modelo concreto para ESTA llamada.
      // Timeout incrementado a 60s (Ollama puede tardar en cargar el modelo, o cloud ser lento)
      // ── Conversación activa REAL (Adenda 71-ter · I1) ──────────────────────
      // El orbe debe pasar chatId + chatConfig REALES de aurora_conversations
      // para que la personalidad POR CHAT y la config del menú unificado (modelo
      // fijado, skills, conexiones, sentidos, memorias) también gobiernen la voz.
      // Si no hay conversación activa, se crea una (surface "orb"). Defensivo.
      let orbChatId: string | undefined;
      let orbChatConfig:
        | { provider?: string | null; skills?: string[]; connections?: string[]; senses?: Record<string, boolean>; memoryScope?: string }
        | undefined;
      try {
        const conv = await import("@/lib/aurora/conversations");
        orbChatId = conv.getActiveConversationId() ?? undefined;
        if (!orbChatId) {
          const created = await conv.ensureActiveConversation({ surface: "orb", kind: "aurora" });
          orbChatId = created.id;
        }
        const active = conv.cachedConversations().find((c) => c.id === orbChatId);
        const cfg = (active?.meta as { config?: typeof orbChatConfig } | null | undefined)?.config;
        if (cfg && typeof cfg === "object") orbChatConfig = cfg;
      } catch { /* sin conversación: el router degrada a global */ }

      // (Adenda 154) 120 s en vez de 60 s: el SISTEMA PRIMARIO (Astraura
      // 1.58-bit) corre BitNet/Ollama en CPU — en una neurona modesta la
      // carga del modelo + un ciclo de ramificación multiagente puede superar
      // el minuto; abortar antes tiraba respuestas que SÍ iban a llegar y
      // obligaba al failover a repetir la petición en una fuente de nube.
      const abortCtrl = new AbortController();
      const timeoutId = setTimeout(() => abortCtrl.abort(), 120000);

      const res = await astrauraChat({
        messages,
        temperature,
        brainId: brainIdRef.current,
        chatId: orbChatId,
        chatConfig: orbChatConfig,
        onStatus: (s) => { if (s) setStatus(s); },
        forceSource: opts?.forceSource,
        signal: abortCtrl.signal,
      }).finally(() => clearTimeout(timeoutId));
      setThinking(false); // ya llegó la respuesta
      let reply = (res?.text || "").trim();
      // TRANSPARENCIA: La fuente y las alternativas se calcularon, pero ya no se 
      // adjuntan automáticamente al texto. Se guardan en los metadatos (route) para 
      // ser inspeccionados en el botón de información del mensaje.
      // (Eliminada la inyección de announceLine en el reply).

      // 1) Directivas de ACCIÓN [[ACCION: nombre {json}]] — el control real del OS.
      //    Las extraemos, las quitamos del discurso, y las ejecutamos. Cada una
      //    se recoge también en `toolMetas` (metadato del mensaje: §17.3).
      const directives = parseDirectives(reply);
      reply = stripDirectives(reply);
      const ctx = buildActionCtx();
      const actionMsgs: string[] = [];
      const toolMetas: ToolInvocationMeta[] = [];
      for (const d of directives) {
        const r = await executeDirective(d, ctx);
        pushAction({ name: d.name, ok: !!r.ok, message: r.message || "", at: Date.now(), undo: r.undo });
        if (r.message) actionMsgs.push(r.message);
        toolMetas.push({ name: d.name, ok: !!r.ok, summary: (r.message || "").slice(0, 200), undo: r.undo });
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
      // (Adenda 154) Trazas del enjambre 1.58 si respondió el sistema primario
      // (mismo criterio que `sendAuroraTurn`): sus herramientas cuentan junto a
      // las directivas del OS. Defensivo: cualquier fallo deja el meta como antes.
      let astraura158: AuroraMessageMeta["astraura158"];
      try {
        if (isAstraura158Source(res?.route?.sourceId)) {
          astraura158 = astraura158MetaFromRaw(res?.raw) ?? undefined;
          for (const t of astraura158ToolMetas(astraura158)) toolMetas.push(t);
        }
      } catch { astraura158 = undefined; }
      // Metadatos de PROCESO (§17.3): proveedor/modelo/intentos/duración/
      // dificultad + herramientas invocadas. Siempre se adjunta algo honesto,
      // incluso si `res.route` faltara por algún motivo defensivo.
      const meta: AuroraMessageMeta = {
        provider: res?.route?.sourceLabel,
        model: res?.route?.modelLabel,
        free: res?.route?.free,
        local: res?.route?.local,
        attempts: res?.route?.attempts,
        ms: res?.route?.ms,
        difficulty: res?.route?.difficulty,
        reason: res?.route?.reason,
        tools: toolMetas.length ? toolMetas : undefined,
        // Adenda 97: la ruta COMPLETA para la barra de acciones («Transparencia
        // y Alternativas»); antes el campo existía pero nadie lo rellenaba.
        route: res?.route ?? undefined,
        ...(astraura158 ? { astraura158 } : {}),
      };
      pushReply(reply, meta);
      speak(reply, undefined, res?.vibeVoiceScript ?? null);
    } catch (e: any) {
      // GARANTÍA DE RESPUESTA: ni aquí se vuelca un error crudo. Mensaje
      // siempre honesto + accionable (nunca un stack/JSON en bruto).
      const raw = (e?.message ? String(e.message) : "").trim();
      const network = /failed to fetch|networkerror|load failed/i.test(raw);
      const m = network
        ? "No pude conectar con ninguna fuente de inteligencia (parece un corte de red). Revisa tu conexión, o activa un modelo local (Ollama) en Ajustes → Inteligencia, y vuelve a intentarlo."
        : `Tuve un problema técnico inesperado y no completé la respuesta${raw ? ` (${raw.slice(0, 160)})` : ""}. Puedes reformular tu mensaje, revisar Ajustes → Inteligencia, o probar otra fuente.`;
      pushReply(m, { local: true, reason: network ? "Sin conexión con ninguna fuente" : "Excepción inesperada del motor" });
      speak(m);
    }
    } finally {
      // Libera el guard SIEMPRE (aunque hubiera return anticipado o error): así
      // el siguiente turno del usuario se procesa con normalidad.
      runningRef.current = 0;
      setThinking(false); // apaga la animación de carga pase lo que pase
    }
  }, [router, speak, setEnabled, buildActionCtx, pushUser, pushReply, pushAction, routeContext]);

  const runCommandRef = useRef(runCommand);
  useEffect(() => { runCommandRef.current = runCommand; }, [runCommand]);

  // ── STT (con operación en SEGUNDO PLANO) ──
  // ==========================================================================
  // §ANDROID — POR QUÉ AURORA NO ESCUCHABA EN EL MÓVIL (Adenda 67 · P0-3)
  // ==========================================================================
  // El `SpeechRecognition` de Android NO es una sesión larga como en escritorio:
  //
  //   1. TERMINA SOLO tras CADA frase (aunque pidas `continuous`), y
  //   2. TERMINA SOLO por SILENCIO a los pocos segundos, con `error:'no-speech'`.
  //
  // Es decir: en Android, **acabar sin haber oído nada es el estado NORMAL**, no
  // un fallo. El auto-reinicio ya existía, pero la CONTABILIDAD DE SALUD estaba
  // mal: contaba como "reinicio fallido" cualquier ciclo sin resultado
  // (`sttLastResultAtRef`). Como el usuario NO habla todo el rato, bastaban ~6
  // ciclos de silencio (≈30-45 s de uso normal) para que el motor se rindiera:
  //     keepAliveRef = false  →  el micrófono se apagaba PARA SIEMPRE,
  // en SILENCIO (sin `voiceUnavailable`, sin aviso). El orbe seguía pintado y
  // Aurora, sorda. En escritorio no pasaba porque `continuous = true` mantiene
  // la sesión abierta y casi no hay ciclos `no-speech`.
  //
  // CORRECCIÓN:
  //   · Un ciclo que ESCUCHÓ de verdad (duró ≥ HEALTHY_RUN_MS) o que terminó por
  //     `no-speech` / `aborted` / fin limpio es SANO → se reinicia rápido y NO
  //     suma al contador de fallos (así el mic vive indefinidamente en Android).
  //   · Solo cuenta como ROTO el reconocimiento que muere NADA MÁS arrancar sin
  //     audio (la firma real del bucle competitivo: dos STT peleando por el mic).
  //   · Errores FATALES (`not-allowed`, `service-not-allowed`, `audio-capture`) NO
  //     se reintentan a ciegas: se exponen (`sttFatal`) para que el orbe pida el
  //     permiso o avise. Aurora nunca vuelve a quedarse sorda EN SILENCIO.
  //   · En móvil JAMÁS abrimos un `getUserMedia` paralelo (analizador del halo,
  //     precarga de permiso): compite por el micrófono y deja sordo al STT.
  //     Ver `isMobileDevice()` en `voice-autonomy.ts`.
  //
  // `keepAliveRef` distingue una parada deliberada (stop) de un fin natural de
  // sesión (que reanudamos).
  const buildRecognition = useCallback(() => {
    if (typeof window === "undefined") return null;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const rec = new SR();
    // Esta reconocimiento toma la GENERACIÓN vigente. Su onend solo reinicia si
    // sigue siendo la más reciente (evita reinicios en paralelo competitivos).
    const gen = ++recGenRef.current;
    // Móvil (Android/iOS): `continuous` NO es fiable → ciclo corto + reinicio.
    const isMobile = isMobileDevice();
    /** Un reconocimiento que vivió ≥ esto SÍ estuvo escuchando de verdad. */
    const HEALTHY_RUN_MS = 900;
    /** Arranques rotos seguidos tolerados antes de rendirse (y AVISAR). */
    const MAX_BROKEN_RESTARTS = 8;
    // Salud de ESTE reconocimiento (local: nada que se contamine entre ciclos).
    let startedAt = 0;
    let sawResult = false;
    let lastErr = "";

    rec.lang = activeRef.current.voice?.lang || "es-MX";
    rec.interimResults = true;
    // Móvil: NO continuo (Android termina tras cada frase; lo reiniciamos aquí).
    rec.continuous = !isMobile;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      if (gen !== recGenRef.current) { try { rec.abort?.(); } catch { /* */ } return; }
      startedAt = Date.now();
      setListening(true); setInterim("");
    };
    rec.onerror = (e: any) => {
      if (gen !== recGenRef.current) return; // reconocimiento obsoleto: ignora
      const err = String(e?.error || "");
      lastErr = err;
      // FATALES: no se reintentan a ciegas. Los exponemos para que la UI pida el
      // permiso de micrófono (gesto del usuario) o avise de que el mic está
      // ocupado. Antes 'not-allowed' caía en el auto-reinicio → bucle invisible.
      if (err === "not-allowed" || err === "service-not-allowed" || err === "audio-capture") {
        keepAliveRef.current = false;
        sttRestartsRef.current = 0;
        setSttFatal(err as SttFatal);
        setListening(false);
        return;
      }
      // 'no-speech' | 'aborted' | 'network' → transitorios: los gestiona `onend`.
    };
    rec.onend = () => {
      // Este reconocimiento ya no escucha: suéltalo del registro del ÚNICO
      // reconocimiento vivo (si aún figuraba como tal).
      releaseRecognition(rec);
      // OBSOLETO: si ya no es la generación vigente, no hace NADA (otro
      // reconocimiento más reciente manda) → no hay reinicios en paralelo.
      if (gen !== recGenRef.current) return;
      setInterim("");
      if (sttRestartTimerRef.current) { clearTimeout(sttRestartTimerRef.current); sttRestartTimerRef.current = null; }
      // MEDIO-DÚPLEX: si el reconocimiento se detuvo porque Aurora va a hablar /
      // está hablando, NO reiniciamos aquí. Lo reanudará `finishTts` cuando
      // termine el habla (evita que el micro capte su propia voz).
      if (pausedForTtsRef.current || ttsGuardActive()) {
        setListening(false);
        return;
      }
      // Fallo fatal (permiso/micro): ya lo trató `onerror`. No reintentamos.
      if (lastErr === "not-allowed" || lastErr === "service-not-allowed" || lastErr === "audio-capture") {
        setListening(false);
        return;
      }
      // Reinicio automático si Aurora debe seguir escuchando (2º plano / sesión).
      if (keepAliveRef.current && typeof window !== "undefined") {
        // ── CONTABILIDAD DE SALUD (la clave del bug de Android) ──
        // SANO = oyó algo, o estuvo escuchando de verdad (≥ HEALTHY_RUN_MS), o
        // terminó por silencio / abort limpio. En Android esto es lo NORMAL:
        // jamás debe penalizar ni apagar el micrófono.
        const ranMs = startedAt ? Date.now() - startedAt : 0;
        const healthy =
          sawResult ||
          ranMs >= HEALTHY_RUN_MS ||
          lastErr === "no-speech" ||
          lastErr === "aborted" ||
          lastErr === "";
        if (healthy) sttRestartsRef.current = 0;
        else sttRestartsRef.current += 1; // murió al nacer: firma del bucle real

        if (sttRestartsRef.current > MAX_BROKEN_RESTARTS) {
          // Nos rendimos, pero NUNCA en silencio: el supervisor lo convierte en
          // "voz no disponible · toca para reintentar".
          keepAliveRef.current = false;
          sttRestartsRef.current = 0;
          setSttFatal("failed");
          setListening(false);
          return;
        }

        // Reinicio RÁPIDO cuando el ciclo fue sano (Android necesita reengancharse
        // enseguida o se pierde el principio de la frase siguiente). Con ciclos
        // rotos, backoff progresivo para no martillar el micrófono.
        const delay = sttRestartsRef.current === 0
          ? (isMobile ? 320 : 260)
          : Math.min((isMobile ? 700 : 500) + sttRestartsRef.current * 300, 2500);
        try {
          const next = buildRecognition();
          if (next) {
            recognitionRef.current = next;
            // Generación de ESTE reinicio programado. Si antes de que venza el
            // temporizador alguien arranca otro reconocimiento (toque en el
            // orbe, micro del chat, wake-word…), la generación avanza y este
            // arranque queda CANCELADO: si no, se sumaba un SEGUNDO
            // reconocimiento vivo que peleaba por el micrófono con el nuevo (se
            // abortaban mutuamente → «no escucha» + reinicios en bucle).
            const nextGen = recGenRef.current;
            sttRestartTimerRef.current = setTimeout(() => {
              sttRestartTimerRef.current = null;
              if (nextGen !== recGenRef.current) return; // obsoleto: no arranques
              if (!keepAliveRef.current) return;         // parada deliberada
              if (pausedForTtsRef.current || ttsGuardActive()) return; // medio-dúplex
              startRecognitionExclusive(next);
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
      // este ciclo es SANO y se resetea el backoff anti-loop.
      sawResult = true;
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
        // MEDIO-DÚPLEX EXPLÍCITO (fix 2026-07-23): al capturar la frase final,
        // DESHABILITAMOS la escucha DE INMEDIATO para procesar la respuesta de
        // Aurora sin que el micro capte ruido ni se reinicie la escucha a mitad
        // de su respuesta. Se reactiva sola al terminar el habla (finishTts) o
        // si el usuario vuelve a pulsar hablar / interrumpe con un nuevo mensaje.
        try { rec.stop(); } catch { /* */ }
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
    // Guard singleton TEMPORAL: si otra instancia VIVA posee el testigo del STT,
    // esta cede (no arranca un segundo reconocimiento → no se duplican acciones).
    // Si el testigo está CADUCADO (dueño fantasma), lo retomamos: nunca dejamos a
    // Aurora sorda para siempre por un guard permanente.
    if (!canOwnStt(instanceIdRef.current)) return;
    claimStt(instanceIdRef.current);
    setSttFatal(null); // arranque nuevo: limpia el fallo fatal anterior
    keepAliveRef.current = true; // mantener vivo a través de la navegación
    // CANCELA cualquier reinicio PROGRAMADO: si no, al vencer arrancaba un
    // reconocimiento VIEJO en paralelo al que creamos aquí → dos motores de voz
    // peleando por el micrófono (se abortan → «no escucha» → bucle de reinicios).
    if (sttRestartTimerRef.current) {
      clearTimeout(sttRestartTimerRef.current);
      sttRestartTimerRef.current = null;
    }
    sttRestartsRef.current = 0;
    // Medio-dúplex: reanudar la escucha limpia cualquier pausa por TTS pendiente.
    pausedForTtsRef.current = false;
    const rec = buildRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    // Arranque EXCLUSIVO: aborta de verdad el reconocimiento vivo anterior (un
    // `stop()` es asíncrono y lo dejaba reteniendo el micro un rato más).
    startRecognitionExclusive(rec);
  }, [buildRecognition]);

  // Mantén `startRef` apuntando a la última versión de `start` (para finishTts).
  useEffect(() => { startRef.current = start; }, [start]);

  const stop = useCallback(() => {
    keepAliveRef.current = false; // parada deliberada: no reanudar
    pausedForTtsRef.current = false;
    if (sttRestartTimerRef.current) { clearTimeout(sttRestartTimerRef.current); sttRestartTimerRef.current = null; }
    if (ttsWatchdogRef.current) { clearTimeout(ttsWatchdogRef.current); ttsWatchdogRef.current = null; }
    sttRestartsRef.current = 0;
    // Invalida la generación: el `onend` del reconocimiento que paramos queda
    // OBSOLETO y no puede programar otro reinicio.
    recGenRef.current++;
    try { recognitionRef.current?.stop?.(); } catch { /* */ }
    // Y suéltalo del registro del ÚNICO reconocimiento vivo (cinturón y tirantes:
    // su `onend` también lo hace, pero puede tardar en llegar).
    abortLiveRecognition();
    // Libera el testigo del STT para que cualquier instancia pueda retomarlo.
    releaseStt(instanceIdRef.current);
    setListening(false);
  }, []);

  // Mantén `stopNowRef` apuntando a la última versión de `stop` (para el corte
  // del micrófono en WEB al desactivar/expirar la conversación).
  useEffect(() => { stopNowRef.current = stop; }, [stop]);

  // LATIDO del testigo del STT: mientras esta instancia lo posea, lo renueva. Si
  // la instancia muere sin ejecutar la limpieza (pestaña congelada, bundle viejo
  // del SW), el testigo deja de latir y CADUCA a los 60s → otra instancia puede
  // retomar la voz. Al desmontar, lo suelta de inmediato.
  useEffect(() => {
    const id = instanceIdRef.current;
    const beat = setInterval(() => {
      if (sttOwner === id) sttOwnerTs = Date.now();
    }, STT_OWNER_HEARTBEAT_MS);
    return () => {
      clearInterval(beat);
      releaseStt(id);
    };
  }, []);

  const toggle = useCallback(() => {
    // Si Aurora está hablando, un toque la INTERRUMPE y se pone a ESCUCHAR
    // (barge-in): corta el TTS y arranca el reconocimiento en el mismo gesto,
    // para que el usuario pueda "cortar" a Aurora y hablar. (Antes solo cortaba.)
    if (typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined" && window.speechSynthesis.speaking) {
      interrupt();
      if (!listening) start();
      return;
    }
    if (listening) stop();
    else start();
  }, [listening, start, stop, interrupt]);

  // Envía texto al motor como si el usuario hablara (para el chat por escrito).
  const send = useCallback(async (text: string, opts?: { forceSource?: { sourceId: string; modelId: string } }) => {
    // Escribir/enviar texto es interacción explícita → modo ACTIVA.
    try { engageNowRef.current(); } catch { /* */ }
    await runCommandRef.current(text, opts);
  }, []);

  return useMemo(
    () => ({
      supported,
      enabled,
      listening,
      speaking,
      thinking,
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
      speakQueued,
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
      // Fallo fatal del STT (permiso / micro ocupado / se rindió) — el supervisor
      // lo convierte en `voiceUnavailable` visible. Nunca sorda en silencio.
      sttFatal,
    }),
    [
      supported, enabled, listening, speaking, thinking, transcript, interim, lastReply, actionStatus,
      activePersonality, settings, listVoicesNow, personalities,
      start, stop, toggle, speak, speakQueued, runCommand, runDirectives, runAction, setActivePersonality, setEnabled, reloadPersonalities,
      paused, pauseSpeech, resumeSpeech, toggleSpeech, skipForward, skipBack, interrupt,
      replyHistory, conversation, send, actionLog,
      engaged, engage, disengage, sttFatal,
    ]
  );
}
