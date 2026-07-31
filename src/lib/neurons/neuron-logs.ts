"use client";

/**
 * StarSeed OS — LOGS POR NEURONA (Adenda 114).
 * ============================================================================
 * Bitácora ligera e independiente por neurona (dispositivo): eventos de red,
 * sincronización, descargas, servicio, avisos y errores propios de ESA neurona.
 * Buffer circular acotado en localStorage (por deviceId), para poder revisar el
 * estado de cada neurona vinculada a la cuenta. Módulo LIVIANO. SSR-safe. Nunca lanza.
 */

import { safeGet, safeSet } from "@/lib/safe-storage";

export const NEURON_LOGS_KEY = "starseed.neurons.logs.v1";
export const NEURON_LOGS_EVENT = "starseed:neuron-logs";

export type NeuronLogLevel = "info" | "warn" | "error" | "sync" | "net" | "server";

export interface NeuronLogEntry {
  at: number;
  level: NeuronLogLevel;
  msg: string;
}

/** Máximo de entradas por neurona (buffer circular). */
export const MAX_LOGS_PER_NEURON = 120;

function nowSafe(): number {
  try { return Date.now(); } catch { return 0; }
}

function read(): Record<string, NeuronLogEntry[]> {
  try {
    const raw = safeGet(NEURON_LOGS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== "object") return {};
    const out: Record<string, NeuronLogEntry[]> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        out[k] = v
          .filter((e): e is NeuronLogEntry => !!e && typeof e === "object" && typeof (e as NeuronLogEntry).msg === "string")
          .slice(-MAX_LOGS_PER_NEURON);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: Record<string, NeuronLogEntry[]>): void {
  try {
    safeSet(NEURON_LOGS_KEY, JSON.stringify(map));
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(NEURON_LOGS_EVENT, { detail: {} }));
  } catch {
    /* */
  }
}

/** Registra un evento en la bitácora de una neurona (acota al máximo). */
export function logNeuron(deviceId: string, level: NeuronLogLevel, msg: string): void {
  if (!deviceId || !msg) return;
  const map = read();
  const list = map[deviceId] ?? [];
  list.push({ at: nowSafe(), level, msg: String(msg).slice(0, 240) });
  map[deviceId] = list.slice(-MAX_LOGS_PER_NEURON);
  write(map);
}

/** Devuelve la bitácora de una neurona (más reciente primero). */
export function getNeuronLogs(deviceId: string): NeuronLogEntry[] {
  const list = read()[deviceId] ?? [];
  return [...list].reverse();
}

export function clearNeuronLogs(deviceId: string): void {
  const map = read();
  if (map[deviceId]) {
    delete map[deviceId];
    write(map);
  }
}

export function subscribeNeuronLogs(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(NEURON_LOGS_EVENT, h);
  return () => window.removeEventListener(NEURON_LOGS_EVENT, h);
}
