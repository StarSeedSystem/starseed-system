"use client";

/**
 * StarSeed OS — Bus del Orbe de Aurora
 * ----------------------------------------------------------------------------
 * Estado compartido y utilidades SSR-safe para el nuevo Orbe (esfera + estrella
 * de 4 puntas) de Aurora:
 *
 *   1. POSICIÓN  — persistida en localStorage; el orbe es movible y se recuerda
 *      dónde lo dejó el usuario en cualquier ruta/tamaño.
 *   2. VISIBILIDAD — el orbe puede arrastrarse a una zona de descarte y ocultarse;
 *      se reactiva desde el Exocórtex (sección "Chat de Aurora"). Un pequeño bus
 *      de eventos mantiene sincronizados el orbe y la sección de reactivación,
 *      incluso entre pestañas (evento `storage`).
 *   3. GLOW REACTIVO — helpers para (a) suscribirse a los eventos de voz que el
 *      motor emite al hablar (`aurora:speak`), y (b) conectar de forma opcional y
 *      defensiva un `AnalyserNode` al micrófono mientras Aurora escucha, para que
 *      la iluminación del orbe responda a amplitud/tono reales. Todo degrada con
 *      gracia: sin permiso de micro o sin Web Audio, el orbe respira suavemente.
 *
 * 100% aditivo y defensivo: nada aquí rompe el funcionamiento actual de Aurora.
 */

// En MÓVIL nunca abrimos un getUserMedia paralelo (compite con el STT).
import { isMobileDevice } from "@/lib/aurora/voice-autonomy";

// ── Claves de localStorage ───────────────────────────────────────────────────
export const AURORA_ORB_POS_KEY = "starseed.aurora.orb.pos.v1";
export const AURORA_ORB_HIDDEN_KEY = "starseed.aurora.orb.hidden.v1";
/**
 * PREFERENCIA persistida del BOTÓN FLOTANTE de Aurora (el orbe) — default ON.
 * Distinta de `hidden`: `hidden` es un descarte de SESIÓN (arrastrar a la
 * papelera); `fab.enabled` es la preferencia estable, sincronizada con la cuenta
 * (SYNCED_KEYS) y por defecto TRUE → el orbe aparece en TODAS las secciones del
 * OS y la Red salvo que el usuario lo apague en el Exocórtex o en Ajustes de
 * Aurora. Si es false, el orbe no se monta (pero Aurora sigue accesible desde el
 * Exocórtex/Zenith y la sección Astraura).
 */
export const AURORA_ORB_FAB_KEY = "starseed.aurora.fab.enabled.v1";

// ── Eventos internos (mismo tab) ─────────────────────────────────────────────
export const AURORA_ORB_VISIBILITY_EVENT = "starseed:aurora-orb-visibility";
/** Evento (mismo tab) al cambiar la preferencia del botón flotante. */
export const AURORA_ORB_FAB_EVENT = "starseed:aurora-orb-fab";
/** Evento de voz emitido por el motor (engine.ts) para animar el glow. */
export const AURORA_SPEAK_EVENT = "aurora:speak";
/**
 * Evento emitido por CADA mensaje de la conversación con Aurora (usuario y
 * Aurora, por voz o por texto). detail = { role, text, ts }. Lo emite el
 * AuroraProvider observando el historial del motor; cualquier superficie
 * (Exocórtex, extensiones, agentes) puede escucharlo sin acoplarse al motor.
 */
export const AURORA_CONVERSATION_EVENT = "aurora:conversation";
/**
 * Evento para abrir el chat completo de Aurora en el EXOCÓRTEX (menú Zenith).
 * Lo dispara el orbe (clic derecho / opción de chat); el widget además abre la
 * cortina Zenith vía usePerimeter para que la petición aterrice ya visible.
 */
export const AURORA_EXOCORTEX_OPEN_EVENT = "starseed:open-aurora-exocortex";

export interface AuroraConversationDetail {
  role: "user" | "aurora";
  text: string;
  ts: number;
  /**
   * (Aditivo, jul-2026) Metadatos de proceso de la respuesta —
   * proveedor/modelo/intentos/duración/dificultad/herramientas. Tipado como
   * `unknown` a propósito: este bus es genérico y NO se acopla al motor
   * (`engine.ts::AuroraMessageMeta`); los consumidores que quieran el detalle
   * completo lo narrowean ellos mismos (ver `aurora-chat-log.ts`).
   */
  meta?: unknown;
}

/** Emite el evento de conversación (defensivo, SSR-safe). */
export function emitAuroraConversation(detail: AuroraConversationDetail): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<AuroraConversationDetail>(AURORA_CONVERSATION_EVENT, { detail }),
    );
  } catch {
    /* defensivo */
  }
}

/** Suscribe a los mensajes de la conversación. Devuelve la función de baja. */
export function subscribeAuroraConversation(
  cb: (detail: AuroraConversationDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const on = (e: Event) => {
    const d = (e as CustomEvent<AuroraConversationDetail>).detail;
    if (d && typeof d.text === "string") cb(d);
  };
  window.addEventListener(AURORA_CONVERSATION_EVENT, on);
  return () => window.removeEventListener(AURORA_CONVERSATION_EVENT, on);
}

export type AuroraSpeakPhase = "start" | "boundary" | "end";

export interface AuroraOrbPosition {
  /** Posición como fracción del viewport (0..1), robusta ante cambios de tamaño. */
  xRatio: number;
  yRatio: number;
}

/** Posición por defecto: esquina inferior-derecha (como el FAB clásico). */
export const DEFAULT_ORB_POSITION: AuroraOrbPosition = { xRatio: 0.9, yRatio: 0.88 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ── Posición ─────────────────────────────────────────────────────────────────
export function readOrbPosition(): AuroraOrbPosition {
  if (typeof window === "undefined") return { ...DEFAULT_ORB_POSITION };
  try {
    const raw = window.localStorage.getItem(AURORA_ORB_POS_KEY);
    if (!raw) return { ...DEFAULT_ORB_POSITION };
    const p = JSON.parse(raw) as Partial<AuroraOrbPosition>;
    if (typeof p?.xRatio === "number" && typeof p?.yRatio === "number") {
      return { xRatio: clamp01(p.xRatio), yRatio: clamp01(p.yRatio) };
    }
  } catch {
    /* defensivo */
  }
  return { ...DEFAULT_ORB_POSITION };
}

export function writeOrbPosition(pos: AuroraOrbPosition): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      AURORA_ORB_POS_KEY,
      JSON.stringify({ xRatio: clamp01(pos.xRatio), yRatio: clamp01(pos.yRatio) }),
    );
  } catch {
    /* defensivo */
  }
}

// ── Visibilidad (ocultar / reactivar) ────────────────────────────────────────
export function readOrbHidden(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AURORA_ORB_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Oculta o muestra el orbe y avisa a los suscriptores (orbe + Exocórtex). */
export function setOrbHidden(hidden: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AURORA_ORB_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    /* defensivo */
  }
  try {
    window.dispatchEvent(
      new CustomEvent<boolean>(AURORA_ORB_VISIBILITY_EVENT, { detail: hidden }),
    );
  } catch {
    /* defensivo */
  }
}

/**
 * Suscribe un callback a los cambios de visibilidad del orbe (mismo tab vía
 * CustomEvent, otros tabs vía `storage`). Devuelve la función de limpieza.
 */
export function subscribeOrbVisibility(cb: (hidden: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<boolean>).detail;
    cb(!!detail);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_ORB_HIDDEN_KEY) cb(readOrbHidden());
  };
  window.addEventListener(AURORA_ORB_VISIBILITY_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AURORA_ORB_VISIBILITY_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

// ── Botón flotante de Aurora: preferencia estable (default ON) ───────────────
/** ¿Está habilitado el botón flotante (orbe)? Por defecto TRUE. SSR-safe. */
export function readFabEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Solo "0" apaga: cualquier otra cosa (ausente, "1", basura) = habilitado.
    return window.localStorage.getItem(AURORA_ORB_FAB_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Habilita/deshabilita el botón flotante y avisa a orbe + Exocórtex + Ajustes. */
export function setFabEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AURORA_ORB_FAB_KEY, enabled ? "1" : "0");
  } catch {
    /* defensivo */
  }
  try {
    window.dispatchEvent(new CustomEvent<boolean>(AURORA_ORB_FAB_EVENT, { detail: enabled }));
  } catch {
    /* defensivo */
  }
}

/** Suscribe a cambios del botón flotante (mismo tab + otros tabs). */
export function subscribeFabEnabled(cb: (enabled: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb(!!(e as CustomEvent<boolean>).detail);
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_ORB_FAB_KEY) cb(readFabEnabled());
  };
  window.addEventListener(AURORA_ORB_FAB_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AURORA_ORB_FAB_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

// ── CHAT COMPLETO abierto (Exocórtex / Zenith) ───────────────────────────────
/**
 * UNA SOLA SUPERFICIE DE CHAT A LA VEZ.
 *
 * Causa raíz del bug «el chat de Aurora se duplica»: el orbe (AuroraWidget)
 * montaba sus superficies conversacionales (reproductor resumido, globo,
 * mini-popover) SIN saber si el CHAT COMPLETO (AuroraChatSection, dentro de la
 * cortina Zenith) ya estaba abierto. Resultado: el usuario veía el chat
 * principal (con todas las pestañas) y, debajo, un segundo chat más simple
 * repitiendo la MISMA conversación.
 *
 * Este bus lo resuelve en el origen: la sección del chat completo se REGISTRA
 * mientras está montada y el orbe se suscribe para callar sus superficies. Es un
 * CONTADOR (no un booleano) para soportar varios montajes simultáneos sin que
 * uno al desmontarse "apague" al otro.
 */
export const AURORA_FULLCHAT_EVENT = "starseed:aurora-fullchat";

let fullChatMounts = 0;

function emitFullChat(): void {
  try {
    window.dispatchEvent(
      new CustomEvent<boolean>(AURORA_FULLCHAT_EVENT, { detail: fullChatMounts > 0 }),
    );
  } catch {
    /* defensivo */
  }
}

/**
 * Registra (o da de baja) una superficie de CHAT COMPLETO de Aurora. Llámalo con
 * `true` al montar y con `false` al desmontar — siempre en pareja.
 */
export function setAuroraFullChatOpen(open: boolean): void {
  if (typeof window === "undefined") return;
  const before = fullChatMounts > 0;
  fullChatMounts = Math.max(0, fullChatMounts + (open ? 1 : -1));
  const after = fullChatMounts > 0;
  if (before !== after) emitFullChat();
}

/** ¿Hay un chat COMPLETO de Aurora abierto ahora mismo? */
export function isAuroraFullChatOpen(): boolean {
  return fullChatMounts > 0;
}

/** Suscribe un callback al estado del chat completo. Devuelve la limpieza. */
export function subscribeAuroraFullChat(cb: (open: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const on = (e: Event) => cb(!!(e as CustomEvent<boolean>).detail);
  window.addEventListener(AURORA_FULLCHAT_EVENT, on);
  return () => window.removeEventListener(AURORA_FULLCHAT_EVENT, on);
}

// ── Glow: eventos de voz del motor (TTS) ─────────────────────────────────────
/**
 * Emite un pulso de voz para el glow del orbe. Lo llama el motor (engine.ts) en
 * el arranque/fin de la síntesis y en cada límite de palabra (`onboundary`), de
 * modo que el orbe LATA al ritmo del habla aunque el TTS no exponga amplitud.
 * Seguro de llamar en cualquier entorno.
 */
export function emitAuroraSpeak(phase: AuroraSpeakPhase): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<AuroraSpeakPhase>(AURORA_SPEAK_EVENT, { detail: phase }),
    );
  } catch {
    /* defensivo */
  }
}

export function subscribeAuroraSpeak(
  cb: (phase: AuroraSpeakPhase) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const on = (e: Event) => cb((e as CustomEvent<AuroraSpeakPhase>).detail);
  window.addEventListener(AURORA_SPEAK_EVENT, on);
  return () => window.removeEventListener(AURORA_SPEAK_EVENT, on);
}

// ── Glow: analizador de micrófono (amplitud + bandas reales) ─────────────────
export interface MicAnalyser {
  /**
   * Lee el nivel actual: `level` 0..1 (amplitud RMS) y `bands` con energía por
   * banda (graves/medios/agudos) 0..1 para desplazar color/forma del orbe.
   */
  read: () => { level: number; bands: [number, number, number] };
  /** Libera esta referencia (refcount; el stream real se cierra en diferido). */
  stop: () => void;
}

/**
 * SINGLETON compartido del micrófono para el glow.
 *
 * ⚠️ Lección del bug del "glitch loop": abrir/cerrar un `getUserMedia` paralelo
 * en cada flip de `listening` ABORTA el SpeechRecognition activo en Chrome y
 * realimenta su bucle interno de reinicios (el orbe se enciende y apaga sin que
 * la voz funcione). Por eso:
 *
 *   1. UN solo stream/AudioContext compartido por referencia contada: los flips
 *      rápidos de escucha reutilizan la misma captura (cero churn de permisos).
 *   2. TEARDOWN DIFERIDO (~1.6s): al soltar la última referencia no cerramos el
 *      stream de inmediato; si la escucha vuelve en ese lapso, se reutiliza.
 *   3. COOLDOWN tras fallo (45s; 2º fallo 120s; 3º → deshabilitado de sesión):
 *      jamás martilleamos getUserMedia en bucle.
 *   4. `disableMicAnalyserForSession()`: si el orbe detecta que el analizador
 *      COMPITE con el reconocimiento (la escucha cae justo tras conectar), se
 *      prescinde de él para toda la sesión y la luz cae al latido `aurora:speak`.
 */
interface MicShared {
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  bins: number;
  // TS ≥5.7 tipa los TypedArray por su buffer: el AnalyserNode exige ArrayBuffer.
  freq: Uint8Array;
  time: Uint8Array;
}

let micShared: MicShared | null = null;
let micBuilding: Promise<MicShared | null> | null = null;
let micRefs = 0;
let micTeardownTimer: ReturnType<typeof setTimeout> | null = null;
let micDisabledForSession = false;
let micFailStreak = 0;
let micRetryAfter = 0;

/** Cuánto esperamos antes de cerrar de verdad el stream sin referencias. */
const MIC_RELEASE_DELAY_MS = 1600;

function micTeardownNow(): void {
  const s = micShared;
  micShared = null;
  micRefs = 0;
  if (micTeardownTimer) { clearTimeout(micTeardownTimer); micTeardownTimer = null; }
  if (!s) return;
  try { s.source.disconnect(); } catch { /* */ }
  try { s.analyser.disconnect(); } catch { /* */ }
  try { s.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
  try { void s.ctx.close(); } catch { /* */ }
}

/**
 * Prescinde del analizador para TODA la sesión (p. ej. cuando compite con el
 * SpeechRecognition). El orbe degrada al latido por eventos + respiración.
 */
export function disableMicAnalyserForSession(): void {
  micDisabledForSession = true;
  micTeardownNow();
}

/** ¿Está el analizador deshabilitado (fallo persistente o competencia)? */
export function isMicAnalyserDisabled(): boolean {
  return micDisabledForSession;
}

async function buildMicShared(): Promise<MicShared | null> {
  try {
    // MÓVIL (Android/iOS): NO abrir un getUserMedia paralelo para el analizador.
    // El micrófono del móvil tiene UN solo dueño: esta captura compite con el
    // `SpeechRecognition` y provoca el loop "escuchando sin reconocer" (Aurora
    // sorda). Regla del proyecto (Adenda 67 · P0-3): en móvil, CERO getUserMedia
    // retenido. La iluminación del orbe cae al latido por eventos de voz.
    if (isMobileDevice()) {
      micDisabledForSession = true;
      return null;
    }
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const md = navigator?.mediaDevices;
    if (!AudioCtx || !md || typeof md.getUserMedia !== "function") return null;

    const stream = await md.getUserMedia({ audio: true });
    const ctx = new AudioCtx();
    // Algunos navegadores arrancan el contexto suspendido.
    try { if (ctx.state === "suspended") await ctx.resume(); } catch { /* */ }

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    source.connect(analyser);

    const bins = analyser.frequencyBinCount;
    return {
      stream,
      ctx,
      source,
      analyser,
      bins,
      freq: new Uint8Array(bins),
      time: new Uint8Array(bins),
    };
  } catch {
    return null;
  }
}

/**
 * Adquiere una referencia al analizador compartido del micrófono. Resuelve
 * `null` si no hay soporte/permiso, si estamos en cooldown tras un fallo o si
 * quedó deshabilitado para la sesión — en todos los casos el orbe degrada con
 * gracia (latido por `aurora:speak` + respiración). Llama `stop()` al terminar.
 */
export async function acquireMicAnalyser(): Promise<MicAnalyser | null> {
  if (typeof window === "undefined") return null;
  if (micDisabledForSession || Date.now() < micRetryAfter) return null;

  if (!micShared) {
    // Una sola construcción concurrente: los demás esperan la misma promesa.
    if (!micBuilding) {
      micBuilding = buildMicShared().finally(() => { micBuilding = null; });
    }
    const built = await micBuilding;
    if (micDisabledForSession) {
      // Se deshabilitó mientras construíamos: limpia y desiste.
      if (built) {
        try { built.stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
        try { void built.ctx.close(); } catch { /* */ }
      }
      return null;
    }
    if (!built) {
      micFailStreak += 1;
      micRetryAfter = Date.now() + (micFailStreak >= 2 ? 120_000 : 45_000);
      if (micFailStreak >= 3) micDisabledForSession = true;
      return null;
    }
    micFailStreak = 0;
    micShared = micShared || built;
  }

  if (micTeardownTimer) { clearTimeout(micTeardownTimer); micTeardownTimer = null; }
  micRefs += 1;
  let released = false;

  const read = () => {
    const s = micShared;
    if (!s) return { level: 0, bands: [0, 0, 0] as [number, number, number] };
    try {
      s.analyser.getByteTimeDomainData(s.time as any);
      s.analyser.getByteFrequencyData(s.freq as any);
      // Amplitud RMS (0..1) del dominio temporal.
      let sum = 0;
      for (let i = 0; i < s.bins; i++) {
        const v = (s.time[i] - 128) / 128;
        sum += v * v;
      }
      const level = Math.min(1, Math.sqrt(sum / s.bins) * 2.2);
      // Tres bandas simples (graves/medios/agudos) del espectro.
      const third = Math.max(1, Math.floor(s.bins / 3));
      const bandAvg = (from: number, to: number) => {
        let acc = 0;
        const a = Math.max(0, from);
        const b = Math.min(s.bins, to);
        for (let i = a; i < b; i++) acc += s.freq[i];
        return (b - a > 0 ? acc / (b - a) : 0) / 255;
      };
      const bands: [number, number, number] = [
        bandAvg(0, third),
        bandAvg(third, third * 2),
        bandAvg(third * 2, s.bins),
      ];
      return { level, bands };
    } catch {
      return { level: 0, bands: [0, 0, 0] as [number, number, number] };
    }
  };

  const stop = () => {
    if (released) return;
    released = true;
    micRefs = Math.max(0, micRefs - 1);
    if (micRefs === 0 && micShared) {
      if (micTeardownTimer) clearTimeout(micTeardownTimer);
      micTeardownTimer = setTimeout(() => {
        if (micRefs === 0) micTeardownNow();
      }, MIC_RELEASE_DELAY_MS);
    }
  };

  return { read, stop };
}

/**
 * @deprecated Alias de compatibilidad: usa `acquireMicAnalyser()` (singleton
 * compartido). Se conserva para no romper importadores externos.
 */
export const createMicAnalyser = acquireMicAnalyser;
