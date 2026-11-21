"use client";

/**
 * StarSeed OS · FEED DE PARÁMETROS DE LA ORBE DESDE 1.58b
 * -------------------------------------------------------
 * Sondea el backend Astraura 1.58-bit para obtener el vector visual
 * (`turbulence`, `spikiness`, `symmetry`, `hueShift`, `breath`) y lo
 * publica en el canal `params` del bus de la orbe (`quantum-orb-bus.ts`).
 *
 * El backend expone `GET /api/starseed/orb/params` (vía proxy
 * `/api/ai/astraura-158/...`). Polling cada 5 s, pausado con
 * `document.hidden`. Idempotente: `startOrbeParamsFeed()` devuelve `stop()`.
 */

import { astraura158LocalEnabled, fetchAstraura158Manifest, type Astraura158Target } from "@/lib/astraura/astraura-158-client";
import { emitQuantumOrbParams } from "@/lib/aurora/quantum-orb-bus";
import type { QuantumOrbParams } from "@/lib/aurora/quantum-orb-theme";

export const ORBE_PARAMS_FEED_MS = 5_000;
export const ORBE_PARAMS_EVENT = "starseed:orbe-params";

export interface OrbeParamsFeedState {
  target: Astraura158Target | null;
  params: QuantumOrbParams | null;
  lastError: string;
  lastAt: number;
}

interface OrbeParamsResponse {
  ok: boolean;
  params?: Partial<QuantumOrbParams>;
  error?: string;
}

const state: OrbeParamsFeedState = { target: null, params: null, lastError: "", lastAt: 0 };
let timer = 0;
let running = false;
let ticking = false;

async function readParamsFrom(target: Astraura158Target): Promise<OrbeParamsResponse> {
  try {
    const res = await fetch(`/api/ai/astraura-158/api/starseed/orb/params`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { params?: Partial<QuantumOrbParams> };
    return { ok: true, params: data.params };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "sin conexión" };
  }
}

async function tick(): Promise<void> {
  if (ticking || typeof window === "undefined") return;
  ticking = true;
  try {
    const targets: Astraura158Target[] = astraura158LocalEnabled() ? ["local", "nube"] : ["nube"];
    let got: { target: Astraura158Target; params: Partial<QuantumOrbParams> } | null = null;
    let lastError = "";
    for (const t of targets) {
      const r = await readParamsFrom(t);
      if (r.ok && r.params) { got = { target: t, params: r.params }; break; }
      lastError = r.error ?? "sin conexión";
    }
    state.lastAt = Date.now();
    if (!got) { state.lastError = lastError; state.target = null; return; }
    state.lastError = "";
    state.target = got.target;
    const merged = {
      turbulence: got.params.turbulence ?? 0.35,
      spikiness: got.params.spikiness ?? 0.4,
      symmetry: got.params.symmetry ?? 0.6,
      hueShift: got.params.hueShift ?? 0.5,
      breath: got.params.breath ?? 0.5,
    } satisfies QuantumOrbParams;
    state.params = merged;
    emitQuantumOrbParams(merged);
    try { window.dispatchEvent(new CustomEvent(ORBE_PARAMS_EVENT, { detail: { ...state } })); } catch { /* */ }
  } finally {
    ticking = false;
  }
}

export function startOrbeParamsFeed(): () => void {
  if (typeof window === "undefined") return () => {};
  if (running) return stopOrbeParamsFeed;
  running = true;
  const loop = () => { if (!document.hidden) void tick(); };
  timer = window.setTimeout(() => { loop(); timer = window.setInterval(loop, ORBE_PARAMS_FEED_MS) as unknown as number; }, 2_000) as unknown as number;
  const onVisible = () => { if (!document.hidden && Date.now() - state.lastAt > ORBE_PARAMS_FEED_MS) void tick(); };
  document.addEventListener("visibilitychange", onVisible);
  cleanupVisibility = () => document.removeEventListener("visibilitychange", onVisible);
  return stopOrbeParamsFeed;
}

let cleanupVisibility: (() => void) | null = null;

export function stopOrbeParamsFeed(): void {
  if (timer) { window.clearTimeout(timer); window.clearInterval(timer); timer = 0; }
  cleanupVisibility?.();
  cleanupVisibility = null;
  running = false;
}

export function getOrbeParamsFeedState(): OrbeParamsFeedState {
  return { ...state, params: state.params ? { ...state.params } : null };
}