"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASTRAURA 1.58-BIT · FEED DE EVENTOS → notificaciones especiales del OS
 * (Ola 3 · Adenda 155). SOP: architecture/astraura-158-sistema-primario.md §14.
 * ---------------------------------------------------------------------------
 * Los procesos de fondo del backend soberano (imaginación, enjambre, director,
 * orquestador, almacenamiento…) emiten eventos por el puente
 * `GET /api/starseed/events`. Este módulo:
 *   · sondea cada 30 s (pausado con `document.hidden`), local primero y nube
 *     si lo local no responde;
 *   · si el backend es anterior al puente (404), cae a `/api/notifications`
 *     clásico y adapta su forma;
 *   · deduplica con un conjunto «visto» persistente
 *     (`starseed.astraura158.events.seen.v1`, con recorte) y empuja lo nuevo al
 *     centro de notificaciones del OS (`notifyFromApp`, appId "astraura-158")
 *     con acción → `/agent?tab=astraura-158&sub=notificaciones`;
 *   · re-emite `starseed:astraura158-events` con el lote para superficies vivas
 *     (Trinity, Studio) y hace `ack` de lo entregado cuando el puente existe;
 *   · siembra la importación 1.58 (personalidades/agentes) la PRIMERA vez que
 *     ve un backend vivo (`ensureAstraura158Seeded`).
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

export const ASTRAURA_158_APP_ID = "astraura-158";
export const ASTRAURA_158_EVENTS_EVENT = "starseed:astraura158-events";
export const ASTRAURA_158_SEEN_KEY = "starseed.astraura158.events.seen.v1";
export const ASTRAURA_158_FEED_MS = 30_000;
const SEEN_MAX = 600;
const NOTIFY_URL = "/agent?tab=astraura-158&sub=notificaciones";

export interface Astraura158FeedState {
  target: Astraura158Target | null;
  bridge: boolean;
  events: Astraura158Event[];
  unread: number;
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

/* ───────────────────── singleton del sondeo ───────────────────── */

const state: Astraura158FeedState = { target: null, bridge: false, events: [], unread: 0, lastError: "", lastAt: 0 };
let timer = 0;
let running = false;
let ticking = false;

async function readEventsFrom(target: Astraura158Target): Promise<{ ok: boolean; bridge: boolean; events: Astraura158Event[]; error?: string }> {
  const bridged = await fetchAstraura158Events(target, undefined, 60);
  if (bridged.ok) return { ok: true, bridge: true, events: bridged.data.events ?? [] };
  // 404/timeout → backend clásico: adapta `/api/notifications`.
  const classic = await fetchAstraura158Notifications(target);
  if (classic.ok) return { ok: true, bridge: false, events: eventsFromClassic(classic.data.notifications ?? []) };
  return { ok: false, bridge: false, events: [], error: bridged.error || classic.error };
}

async function tick(): Promise<void> {
  if (ticking || typeof window === "undefined") return;
  ticking = true;
  try {
    const targets: Astraura158Target[] = astraura158LocalEnabled() ? ["local", "nube"] : ["nube"];
    let got: { target: Astraura158Target; bridge: boolean; events: Astraura158Event[] } | null = null;
    let lastError = "";
    for (const t of targets) {
      const r = await readEventsFrom(t);
      if (r.ok) { got = { target: t, bridge: r.bridge, events: r.events }; break; }
      lastError = r.error ?? "sin conexión";
    }
    state.lastAt = Date.now();
    if (!got) { state.lastError = lastError; state.target = null; return; }
    state.lastError = "";
    state.target = got.target;
    state.bridge = got.bridge;
    state.events = got.events.slice(-120);
    state.unread = got.events.filter((e) => !e.read && !e.acked).length;

    // Siembra 1.58 (una vez): con el backend vivo, importa personalidades/agentes.
    try {
      const manifest = await fetchAstraura158Manifest(got.target);
      if (manifest.ok) {
        const seeded = ensureAstraura158Seeded(manifest.data);
        if (seeded && (seeded.personalities.created || seeded.agents.created)) {
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

    // Novedades → centro de notificaciones (dedupe por id persistente).
    const seen = readSeen();
    const seenSet = new Set(seen);
    const fresh = got.events.filter((e) => e.id && !seenSet.has(e.id) && !e.read && !e.acked);
    if (fresh.length) {
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
  return { ...state, events: [...state.events] };
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
