"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT · FEED DE EVENTOS → almacén vivo del OS (Ola 4 · Adenda 156)
 * SOP: architecture/astraura-158-ola4-runtime-y-pestanas.md §2.
 * ---------------------------------------------------------------------------
 * Los procesos de fondo del backend soberano (imaginación, enjambre, director,
 * orquestador, aprendizaje…) emiten eventos por el puente
 * `GET /api/starseed/events`. Este módulo:
 *   · sondea cada 30 s (pausado con `document.hidden`), local primero y nube
 *     si lo local no responde;
 *   · si el backend es anterior al puente (404), cae a `/api/notifications`
 *     clásico y adapta su forma;
 *   · deduplica con un conjunto «visto» persistente
 *     (`starseed.astraura158.events.seen.v1`, con recorte) y hace `ack` al
 *     backend de lo entregado (solo con puente real);
 *   · re-emite `starseed:astraura158-events` con el lote y el estado completo
 *     — incluido `byKind` (desglose `by_kind` del puente) y `unread` (el
 *     `unread_count` real que devuelve el backend, con fallback honesto al
 *     conteo local) — para superficies vivas (Trinity, Studio);
 *   · siembra la importación 1.58 (personalidades/agentes) la PRIMERA vez que
 *     ve un backend vivo (`ensureAstraura158Seeded`).
 *
 * ÚNICO DESTINO (Ola 4): las notificaciones de la IA tienen su propia pestaña
 * (`/agent?tab=astraura-158&sub=notificaciones`) — mezclarlas con el resto del
 * centro de notificaciones del OS (toasts incluidos) fue justo lo que el
 * usuario pidió dejar de hacer. Por eso este sondeo YA NO llama a
 * `notifyFromApp` por defecto: sigue siendo el ALMACÉN VIVO (estado + evento
 * `starseed:astraura158-events`, dedupe, ack), pero solo avisa por el centro
 * del OS / toasts si el usuario lo pidió explícitamente con la preferencia
 * `starseed.astraura158.notify.v1` en modo `"tab+os"` (por defecto `"tab"`:
 * solo su propia pestaña se entera). `getAstraura158NotifyMode()` /
 * `setAstraura158NotifyMode()` son la puerta a esa preferencia.
 *
 * `startAstraura158Feed()` se monta una vez en `app-globals.tsx` (singleton,
 * idempotente). `useAstraura158Feed()` para superficies React.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import { safeGet, safeSet } from "@/lib/safe-storage";
import { notifyFromApp } from "@/lib/notifications/app-notify";
import {
  ackAstraura158Events, astraura158LocalEnabled, fetchAstraura158Events, fetchAstraura158Manifest, fetchAstraura158Notifications,
  type Astraura158Event, type Astraura158Target,
} from "@/lib/astraura/astraura-158-client";
import { ensureAstraura158Seeded } from "@/lib/astraura/astraura-158-import";
import { getAstraura158NotifyMode } from "@/lib/astraura/astraura-158-notify";

export const ASTRAURA_158_APP_ID = "astraura-158";
export const ASTRAURA_158_EVENTS_EVENT = "starseed:astraura158-events";
export const ASTRAURA_158_SEEN_KEY = "starseed.astraura158.events.seen.v1";
export const ASTRAURA_158_FEED_MS = 30_000;
const SEEN_MAX = 600;
const NOTIFY_URL = "/agent?tab=astraura-158&sub=notificaciones";

// La preferencia «dónde avisar» vive en `astraura-158-notify.ts` (módulo puro,
// testeable sin React ni `notifyFromApp`); se re-exporta aquí porque este
// sondeo es quien la CONSUME (la respeta en cada tick, más abajo).
export { getAstraura158NotifyMode, setAstraura158NotifyMode, ASTRAURA_158_NOTIFY_MODE_KEY, type Astraura158NotifyMode } from "@/lib/astraura/astraura-158-notify";

export interface Astraura158FeedState {
  target: Astraura158Target | null;
  bridge: boolean;
  events: Astraura158Event[];
  unread: number;
  /** Desglose por tipo de proceso (`by_kind` del puente); `{}` sin puente o sin datos. */
  byKind: Record<string, number>;
  lastError: string;
  lastAt: number;
}

/* ───────────────────── seen-set persistente ───────────────────── */

function readSeen(): string[] {
  try {
    const raw = safeGet(ASTRAURA_158_SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(-SEEN_MAX) : [];
  } catch { return []; }
}

function writeSeen(list: string[]): void {
  try { safeSet(ASTRAURA_158_SEEN_KEY, JSON.stringify(list.slice(-SEEN_MAX))); } catch { /* */ }
}

/* ───────────────────── adaptación de formas ───────────────────── */

function levelOf(e: Astraura158Event): "info" | "success" | "warning" | "error" {
  const v = String(e.level ?? e.severity ?? "").toLowerCase();
  if (/error|critical|security/.test(v)) return "error";
  if (/warn|high/.test(v)) return "warning";
  if (/success|done|applied/.test(v)) return "success";
  return "info";
}

/** `/api/notifications` clásico → forma de evento del puente (fallback honesto). */
function eventsFromClassic(notifs: { id: string; title?: string; message?: string; severity?: string; category?: string; timestamp?: number; read?: boolean }[]): Astraura158Event[] {
  return notifs.map((n) => ({
    id: `classic-${n.id}`,
    ts: n.timestamp,
    level: n.severity,
    source: n.category ?? "backend",
    title: n.title,
    message: n.message,
    read: n.read,
  }));
}

/** Lee `by_kind` de la respuesta del puente sin fiarse de su forma (no está tipado). */
function sanitizeByKind(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const num = Number(n);
    if (k && Number.isFinite(num)) out[k] = num;
  }
  return out;
}

/* ───────────────────── singleton del sondeo ───────────────────── */

const state: Astraura158FeedState = { target: null, bridge: false, events: [], unread: 0, byKind: {}, lastError: "", lastAt: 0 };
let timer = 0;
let running = false;
let ticking = false;

interface EventsRead { ok: boolean; bridge: boolean; events: Astraura158Event[]; unreadCount?: number; byKind: Record<string, number>; error?: string }

async function readEventsFrom(target: Astraura158Target): Promise<EventsRead> {
  const bridged = await fetchAstraura158Events(target, undefined, 60);
  if (bridged.ok) {
    const byKind = sanitizeByKind((bridged.data as unknown as { by_kind?: unknown }).by_kind);
    return { ok: true, bridge: true, events: bridged.data.events ?? [], unreadCount: bridged.data.unread_count, byKind };
  }
  // 404/timeout → backend clásico: adapta `/api/notifications`.
  const classic = await fetchAstraura158Notifications(target);
  if (classic.ok) return { ok: true, bridge: false, events: eventsFromClassic(classic.data.notifications ?? []), unreadCount: classic.data.unread_count, byKind: {} };
  return { ok: false, bridge: false, events: [], byKind: {}, error: bridged.error || classic.error };
}

async function tick(): Promise<void> {
  if (ticking || typeof window === "undefined") return;
  ticking = true;
  try {
    const targets: Astraura158Target[] = astraura158LocalEnabled() ? ["local", "nube"] : ["nube"];
    let got: { target: Astraura158Target; bridge: boolean; events: Astraura158Event[]; unreadCount?: number; byKind: Record<string, number> } | null = null;
    let lastError = "";
    for (const t of targets) {
      const r = await readEventsFrom(t);
      if (r.ok) { got = { target: t, bridge: r.bridge, events: r.events, unreadCount: r.unreadCount, byKind: r.byKind }; break; }
      lastError = r.error ?? "sin conexión";
    }
    state.lastAt = Date.now();
    if (!got) { state.lastError = lastError; state.target = null; return; }
    state.lastError = "";
    state.target = got.target;
    state.bridge = got.bridge;
    state.events = got.events.slice(-120);
    state.unread = got.unreadCount ?? got.events.filter((e) => !e.read && !e.acked).length;
    state.byKind = got.byKind;

    // Preferencia del usuario: por defecto NADA sale de su propia pestaña.
    const notifyMode = getAstraura158NotifyMode();

    // Siembra 1.58 (una vez): con el backend vivo, importa personalidades/agentes.
    try {
      const manifest = await fetchAstraura158Manifest(got.target);
      if (manifest.ok) {
        // La siembra en sí NUNCA depende del modo (importa personalidades/agentes de
        // todas formas); solo el AVISO de que ocurrió queda sujeto a la preferencia.
        const seeded = ensureAstraura158Seeded(manifest.data);
        if (seeded && (seeded.personalities.created || seeded.agents.created) && notifyMode === "tab+os") {
          notifyFromApp({
            appId: ASTRAURA_158_APP_ID,
            title: "Astraura 1.58 integrada en el OS",
            body: `${seeded.personalities.created + seeded.personalities.updated} personalidades y ${seeded.agents.created + seeded.agents.updated} agentes del backend ya viven en tus bibliotecas.`,
            icon: "Binary",
            level: "success",
            dedupeKey: "seed-158",
            actions: [{ label: "Ver Studio 1.58", href: "/agent?tab=astraura-158" }],
          });
        }
      }
    } catch { /* siembra best-effort */ }

    // (Adenda 180) AUTO-detección de cerebros/cuentas en los almacenamientos del
    // dispositivo + auto-enlace + escaneo de medios: automática al ver el backend
    // vivo, desde CUALQUIER medio del OS. Máx. 1 vez al día por neurona;
    // best-effort y sin bloquear el feed.
    try {
      const K = "starseed.astraura158.autodetect.at";
      const last = Number(localStorage.getItem(K) || 0);
      if (Date.now() - last > 86_400_000) {
        localStorage.setItem(K, String(Date.now()));
        const t = got.target;
        void import("./astraura-158-client").then(async (c) => {
          await c.autoDetectAstraura158Brains(t).catch(() => null);
          await c.autoLinkAstraura158Brains(t).catch(() => null);
          await c.scanAstraura158StorageNow(t).catch(() => null);
        }).catch(() => { /* */ });
      }
    } catch { /* localStorage bloqueado: sin auto-detección persistida */ }

    // Novedades: dedupe persistente + ack al backend SIEMPRE (es la confirmación de
    // entrega, no un aviso); avisar por el centro del OS / toasts solo si se pidió.
    const seen = readSeen();
    const seenSet = new Set(seen);
    const fresh = got.events.filter((e) => e.id && !seenSet.has(e.id) && !e.read && !e.acked);
    if (fresh.length) {
      if (notifyMode === "tab+os") {
        const first = fresh[0];
        notifyFromApp({
          appId: ASTRAURA_158_APP_ID,
          title: fresh.length === 1 ? (first.title ?? "Proceso de fondo 1.58") : `${fresh.length} avisos de los procesos 1.58`,
          body: fresh.length === 1 ? (first.message ?? first.source ?? "") : fresh.slice(0, 3).map((e) => e.title ?? e.message ?? e.id).filter(Boolean).join(" · "),
          icon: "Binary",
          level: fresh.some((e) => levelOf(e) === "error") ? "error" : fresh.some((e) => levelOf(e) === "warning") ? "warning" : "info",
          dedupeKey: `events-${fresh[fresh.length - 1].id}`,
          actions: [{ label: "Abrir notificaciones 1.58", href: NOTIFY_URL }],
        });
      }
      writeSeen([...seen, ...fresh.map((e) => e.id)]);
      // ack de lo ENTREGADO (solo con puente real: el fallback clásico no tiene ack por evento).
      if (got.bridge) { try { await ackAstraura158Events(got.target, fresh.map((e) => e.id)); } catch { /* */ } }
    }

    try { window.dispatchEvent(new CustomEvent(ASTRAURA_158_EVENTS_EVENT, { detail: { ...state } })); } catch { /* */ }
  } finally {
    ticking = false;
  }
}

/** Arranca el sondeo (singleton, idempotente). Devuelve stop(). */
export function startAstraura158Feed(): () => void {
  if (typeof window === "undefined") return () => {};
  if (running) return stopAstraura158Feed;
  running = true;
  const loop = () => { if (!document.hidden) void tick(); };
  // Primer tick con margen para no competir con el arranque del OS.
  timer = window.setTimeout(() => { loop(); timer = window.setInterval(loop, ASTRAURA_158_FEED_MS) as unknown as number; }, 4_000) as unknown as number;
  const onVisible = () => { if (!document.hidden && Date.now() - state.lastAt > ASTRAURA_158_FEED_MS) void tick(); };
  document.addEventListener("visibilitychange", onVisible);
  cleanupVisibility = () => document.removeEventListener("visibilitychange", onVisible);
  return stopAstraura158Feed;
}

let cleanupVisibility: (() => void) | null = null;

export function stopAstraura158Feed(): void {
  if (timer) { window.clearTimeout(timer); window.clearInterval(timer); timer = 0; }
  cleanupVisibility?.();
  cleanupVisibility = null;
  running = false;
}

/** Instantánea actual (para superficies no reactivas). */
export function getAstraura158FeedState(): Astraura158FeedState {
  return { ...state, events: [...state.events], byKind: { ...state.byKind } };
}

/** Hook: estado vivo del feed (se actualiza con cada sondeo). */
export function useAstraura158Feed(): Astraura158FeedState {
  const [snap, setSnap] = useState<Astraura158FeedState>(() => getAstraura158FeedState());
  useEffect(() => {
    const h = () => setSnap(getAstraura158FeedState());
    window.addEventListener(ASTRAURA_158_EVENTS_EVENT, h);
    h();
    return () => window.removeEventListener(ASTRAURA_158_EVENTS_EVENT, h);
  }, []);
  return snap;
}
