/**
 * StarSeed OS — Red Mesh · MONITOR DE SALUD DUAL (Adenda 97 · SOP §4.1).
 * ============================================================================
 * Mide la salud de las DOS rutas y publica `LinkHealth` (0..1, EMA) al store:
 *
 *   · Wi-Fi/Internet: navigator.onLine + sonda HEAD ligera con presupuesto de
 *     tiempo (3,5 s). Latencia EMA + pérdida en ventana de 10 + jitter.
 *     Cadencia ADAPTATIVA: 60 s sana · 20 s degradada · inmediata en eventos
 *     online/offline. La sonda usa el PROPIO origen (cero dependencias de
 *     terceros; funciona igual en Vercel, Cloud Run o localhost).
 *
 *   · Mesh: no sondea el aire (eso costaría airtime): deriva la salud de lo
 *     que YA sabemos — radio conectada, nodos online, SNR medio de la
 *     vecindad y utilización de canal del propio radio (telemetría).
 *
 * SSR-safe, defensivo, coste cero sin arrancar (start explícito). NUNCA lanza.
 */

import {
  HEALTH_EMA_ALPHA,
  WIFI_PROBE_DEGRADED_MS,
  WIFI_PROBE_HEALTHY_MS,
  WIFI_PROBE_TIMEOUT_MS,
} from "./constants";
import { getMeshState, setMeshState } from "./store";
import type { LinkHealth } from "./types";

/* ── Estado interno (módulo singleton) ─────────────────────────────────────── */

let started = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let emaLatency: number | null = null;
let emaJitter = 0;
/** Ventana móvil de resultados de sonda (true = ok). */
const lossWindow: boolean[] = [];
const LOSS_WINDOW_SIZE = 10;

function ema(prev: number | null, value: number, alpha = HEALTH_EMA_ALPHA): number {
  return prev === null ? value : prev * (1 - alpha) + value * alpha;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/* ── Wi-Fi ─────────────────────────────────────────────────────────────────── */

/** URL de sonda: el propio origen (HEAD barato). Configurable en el futuro. */
function probeUrl(): string {
  try {
    return `${window.location.origin}/favicon.ico`;
  } catch {
    return "/favicon.ico";
  }
}

async function probeWifiOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    recordProbe(false, WIFI_PROBE_TIMEOUT_MS);
    return;
  }
  const t0 = performance.now();
  let ok = false;
  try {
    const res = await fetch(`${probeUrl()}?ss-health=1`, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(WIFI_PROBE_TIMEOUT_MS),
    });
    ok = res.ok || res.status === 404; // 404 también prueba conectividad real
  } catch {
    ok = false;
  }
  recordProbe(ok, performance.now() - t0);
}

function recordProbe(ok: boolean, latencyMs: number): void {
  lossWindow.push(ok);
  while (lossWindow.length > LOSS_WINDOW_SIZE) lossWindow.shift();
  if (ok) {
    const prev = emaLatency;
    emaLatency = ema(emaLatency, latencyMs);
    if (prev !== null) emaJitter = ema(emaJitter, Math.abs(latencyMs - prev), 0.4);
  }
  publishWifiHealth();
  scheduleNextProbe();
}

/** Puntuación Wi-Fi ∈ [0,1]: latencia + pérdida + estabilidad (SOP §4.2). */
export function computeWifiScore(latencyMs: number | null, loss: number, jitterMs: number): number {
  if (latencyMs === null) return 0;
  const fLat = clamp01(1 - (latencyMs - 80) / 1_800); // 80 ms→1 · ~1,9 s→0
  const fLoss = clamp01(1 - loss * 1.6); // 62 % pérdida → 0
  const fStab = clamp01(1 - jitterMs / 900);
  return clamp01(0.5 * fLat + 0.35 * fLoss + 0.15 * fStab);
}

function publishWifiHealth(): void {
  const okCount = lossWindow.filter(Boolean).length;
  const loss = lossWindow.length ? 1 - okCount / lossWindow.length : 1;
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const score = offline ? 0 : computeWifiScore(emaLatency, loss, emaJitter);
  const detail = offline
    ? "sin conexión (navigator.onLine)"
    : emaLatency === null
      ? "midiendo…"
      : `${Math.round(emaLatency)} ms · pérdida ${(loss * 100).toFixed(0)} %`;
  const wifiHealth: LinkHealth = {
    score,
    latencyMs: emaLatency ?? undefined,
    loss,
    detail,
    at: Date.now(),
  };
  setMeshState({ wifiHealth });
}

function scheduleNextProbe(): void {
  if (!started || typeof window === "undefined") return;
  if (probeTimer) clearTimeout(probeTimer);
  const { wifiHealth } = getMeshState();
  const healthy = wifiHealth.score >= 0.55;
  probeTimer = setTimeout(
    () => void probeWifiOnce(),
    healthy ? WIFI_PROBE_HEALTHY_MS : WIFI_PROBE_DEGRADED_MS,
  );
}

/* ── Mesh (derivada, cero airtime) ─────────────────────────────────────────── */

/** Puntuación mesh ∈ [0,1]: enlace + vecindad + hueco de canal (SOP §4.2). */
export function computeMeshScore(input: {
  connected: boolean;
  onlineNodes: number;
  avgSnr: number | null;
  channelUtilPct: number | null;
}): number {
  if (!input.connected) return 0;
  // SNR −20 dB→0 · +10 dB→1 (rango del propio firmware Meshtastic).
  const fLink = input.avgSnr === null ? 0.45 : clamp01((input.avgSnr + 20) / 30);
  const fNodes = clamp01(input.onlineNodes / 4); // 4+ vecinos = malla sana
  const fUtil = input.channelUtilPct === null ? 0.7 : clamp01(1 - input.channelUtilPct / 60);
  return clamp01(0.45 * fLink + 0.3 * fNodes + 0.25 * fUtil);
}

/** Recalcula y publica la salud mesh a partir del estado actual del store. */
export function refreshMeshHealth(): void {
  try {
    const s = getMeshState();
    const connected = s.status === "ready" || s.status === "degraded";
    const online = s.nodes.filter((n) => !n.isSelf && n.presence === "online");
    const snrs = online.map((n) => n.snr).filter((v): v is number => typeof v === "number");
    const avgSnr = snrs.length ? snrs.reduce((a, b) => a + b, 0) / snrs.length : null;
    const util = s.self?.channelUtilization ?? null;
    const score = computeMeshScore({
      connected,
      onlineNodes: online.length,
      avgSnr,
      channelUtilPct: util,
    });
    const detail = !connected
      ? "sin radio"
      : `${online.length} nodo${online.length === 1 ? "" : "s"}` +
        (avgSnr !== null ? ` · SNR ${avgSnr.toFixed(1)} dB` : "") +
        (util !== null ? ` · canal ${util.toFixed(0)} %` : "");
    const meshHealth: LinkHealth = { score, detail, at: Date.now() };
    setMeshState({ meshHealth });
  } catch {
    /* */
  }
}

/* ── Ciclo de vida ─────────────────────────────────────────────────────────── */

/** Arranca el monitor (idempotente). Coste: una sonda HEAD/min como mucho. */
export function startHealthMonitor(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    window.addEventListener("online", () => void probeWifiOnce());
    window.addEventListener("offline", () => {
      recordProbe(false, WIFI_PROBE_TIMEOUT_MS);
    });
  } catch {
    /* */
  }
  void probeWifiOnce();
}

export function stopHealthMonitor(): void {
  started = false;
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
}

/** Fuerza una sonda Wi-Fi YA (p. ej. tras desconectar el radio). Nunca lanza. */
export function probeWifiNow(): void {
  if (!started) return;
  void probeWifiOnce();
}
