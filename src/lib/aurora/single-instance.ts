"use client";

/**
 * single-instance — garantiza que SOLO UN sistema Aurora esté activo a la vez.
 * ----------------------------------------------------------------------------
 * El usuario pidió: "solo puede haber una Aurora" — el asistente principal que
 * administra todos los chats, memorias, contextos y servicios; cualquier otro
 * asistente abierto desde cualquier contexto corre BAJO el mismo sistema.
 *
 * Dos capas de defensa:
 *   1. STT singleton (engine.ts, mismo documento) → una sola escucha activa.
 *   2. LÍDER ENTRE PESTAÑAS (este módulo): elección de líder por heartbeat en
 *      localStorage (funciona en cualquier navegador; no requiere BroadcastChannel).
 *      Si abres el OS en dos pestañas/ventanas, SOLO la líder ejerce de Aurora
 *      activa (voz + acciones); las demás quedan como espejo pasivo y ceden el
 *      micrófono. Al cerrarse la líder, otra toma el relevo en ~pocos segundos.
 *
 * SSR-safe y defensivo: si algo falla, se asume líder (nunca deja al usuario sin
 * Aurora). No introduce dependencias.
 */

const LEADER_KEY = "starseed.aurora.leader.v1";
const HEARTBEAT_MS = 2000; // late cada 2s
const STALE_MS = 5000; // sin latido > 5s → el líder se considera muerto
export const AURORA_LEADER_EVENT = "starseed:aurora-leader";

interface LeaderRecord {
  id: string;
  ts: number;
}

let myId = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let isLeaderNow = true;
let started = false;

function readRecord(): LeaderRecord | null {
  try {
    const raw = window.localStorage.getItem(LEADER_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw);
    if (r && typeof r.id === "string" && typeof r.ts === "number") return r;
  } catch {
    /* noop */
  }
  return null;
}

function writeRecord(): void {
  try {
    window.localStorage.setItem(LEADER_KEY, JSON.stringify({ id: myId, ts: Date.now() }));
  } catch {
    /* noop */
  }
}

function emitLeaderChange(): void {
  try {
    window.dispatchEvent(new CustomEvent(AURORA_LEADER_EVENT, { detail: { isLeader: isLeaderNow } }));
  } catch {
    /* noop */
  }
}

/** ¿Es ESTA pestaña la Aurora líder (la que ejerce de asistente activo)? */
export function isAuroraLeader(): boolean {
  return isLeaderNow;
}

function evaluate(): void {
  const rec = readRecord();
  const now = Date.now();
  const wasLeader = isLeaderNow;

  if (!rec) {
    // No hay líder → nos proclamamos.
    isLeaderNow = true;
    writeRecord();
  } else if (rec.id === myId) {
    isLeaderNow = true;
    writeRecord();
  } else if (now - rec.ts > STALE_MS) {
    // El líder registrado lleva demasiado sin latir → lo relevamos.
    isLeaderNow = true;
    writeRecord();
  } else {
    // Hay otra líder viva → cedemos (espejo pasivo).
    isLeaderNow = false;
  }

  if (wasLeader !== isLeaderNow) emitLeaderChange();
}

/**
 * Inicia la elección de líder. Idempotente. Devuelve una función de baja que, si
 * éramos líderes, libera el registro para que otra pestaña tome el relevo al vuelo.
 */
export function startAuroraLeaderElection(): () => void {
  if (typeof window === "undefined") return () => {};
  if (started) return stopAuroraLeaderElection;
  started = true;
  myId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  evaluate();
  heartbeatTimer = setInterval(evaluate, HEARTBEAT_MS);

  // Reevalúa al volver el foco/visibilidad (relevo rápido si la líder se fue).
  const onFocus = () => evaluate();
  const onVisible = () => { if (document.visibilityState === "visible") evaluate(); };
  const onStorage = (e: StorageEvent) => { if (e.key === LEADER_KEY) evaluate(); };
  const onUnload = () => {
    // Si somos líder, borramos el registro para que el relevo sea inmediato.
    try {
      const rec = readRecord();
      if (rec?.id === myId) window.localStorage.removeItem(LEADER_KEY);
    } catch { /* */ }
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("storage", onStorage);
  window.addEventListener("beforeunload", onUnload);
  window.addEventListener("pagehide", onUnload);

  cleanupFns = () => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("beforeunload", onUnload);
    window.removeEventListener("pagehide", onUnload);
  };

  return stopAuroraLeaderElection;
}

let cleanupFns: (() => void) | null = null;

export function stopAuroraLeaderElection(): void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  cleanupFns?.();
  cleanupFns = null;
  try {
    const rec = readRecord();
    if (rec?.id === myId) window.localStorage.removeItem(LEADER_KEY);
  } catch { /* */ }
  started = false;
}

/** Suscríbete a cambios de liderazgo. Devuelve la función de baja. */
export function subscribeAuroraLeader(cb: (isLeader: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const on = () => cb(isLeaderNow);
  window.addEventListener(AURORA_LEADER_EVENT, on);
  return () => window.removeEventListener(AURORA_LEADER_EVENT, on);
}
