"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Dispositivos como servidores (presencia / capacidades)
// ----------------------------------------------------------------
// Modela cada dispositivo/sesión online como un "servidor" con:
//   • presencia (online/offline),
//   • capacidades (terminal, memoria, archivos, IA),
//   • enlaces a sus memorias (raíces de `starseed.memory.roots.v1`).
//
// La presencia REAL se gestiona con Supabase Realtime Presence en
// `devices-panel.tsx` (canal `starseed:devices`). Este módulo aporta:
//   • tipos compartidos (DeviceServer, DeviceCapability),
//   • el payload de ESTE dispositivo (identidad estable + capacidades),
//   • `listDevices()` — snapshot defensivo (sólo este dispositivo) para
//     cuando la presencia no está disponible (degradación elegante).
//
// SSR-safe ("use client") y defensivo (guards / try-catch en todo I/O).
// ════════════════════════════════════════════════════════════════

import { readRoots } from "@/lib/memory-sync/connect";

/** Capacidades que un dispositivo expone como servidor del OS. */
export type DeviceCapability = "terminal" | "memoria" | "archivos" | "ia";

/** Catálogo legible de capacidades (etiqueta + descripción + emoji). */
export const DEVICE_CAPABILITIES: { id: DeviceCapability; label: string; blurb: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", blurb: "Consola integrada del OS (sandbox).", icon: "⌨️" },
  { id: "memoria", label: "Memoria", blurb: "Raíces de memoria conectadas.", icon: "🧠" },
  { id: "archivos", label: "Archivos", blurb: "Ficheros y folders accesibles.", icon: "🗂️" },
  { id: "ia", label: "IA", blurb: "Runtimes / proveedores de IA disponibles.", icon: "✨" },
];

/** Una memoria enlazada de un dispositivo (vista ligera de un root). */
export interface DeviceMemoryRef {
  id: string;
  name: string;
  branches: number;
}

/** Un dispositivo/sesión modelado como servidor. */
export interface DeviceServer {
  /** Id estable por navegador/dispositivo (persistido en localStorage). */
  id: string;
  /** Nombre legible (navegador · plataforma). */
  name: string;
  /** Presencia: true si está online ahora. */
  online: boolean;
  /** Capacidades expuestas. */
  capabilities: DeviceCapability[];
  /** Memorias conectadas (raíces) de este dispositivo. */
  memories: DeviceMemoryRef[];
  /** Nº de ficheros/recursos accesibles (estimado; 0 si desconocido). */
  files: number;
  /** ¿Es ESTE dispositivo (el navegador actual)? */
  isSelf: boolean;
  /** Marca de tiempo de presencia (epoch ms). */
  lastSeen: number;
  /** User-agent o pista de plataforma (opcional). */
  platform?: string;
}

/** Clave de localStorage del id estable de ESTE dispositivo. */
const DEVICE_ID_KEY = "starseed.device.id.v1";

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Genera (y persiste) un id estable para este dispositivo/navegador. */
export function getDeviceId(): string {
  if (!isClient()) return "device-ssr";
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    let id = "";
    try {
      if (typeof crypto !== "undefined" && "randomUUID" in crypto) id = crypto.randomUUID();
    } catch {
      /* sin crypto */
    }
    if (!id) id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `dev-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** Deriva un nombre legible del navegador/plataforma actual. */
export function getDeviceName(): string {
  if (typeof navigator === "undefined") return "Este dispositivo";
  const ua = navigator.userAgent || "";
  let browser = "Navegador";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = "Safari";

  let os = "";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os x|macintosh/i.test(ua)) os = "macOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/linux/i.test(ua)) os = "Linux";

  return os ? `${browser} · ${os}` : browser;
}

/** Lee las memorias conectadas de este dispositivo (raíces) de forma defensiva. */
export function readDeviceMemories(): DeviceMemoryRef[] {
  try {
    const roots = readRoots();
    return roots.map((r) => ({
      id: r.id,
      name: r.name,
      branches: Array.isArray(r.branches) ? r.branches.length : 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Calcula las capacidades de ESTE dispositivo. `terminal` siempre está
 * presente (esta consola). `memoria`/`archivos` dependen de si hay raíces
 * conectadas. `ia` se incluye porque el OS expone runtimes de IA en cliente.
 */
export function computeSelfCapabilities(): DeviceCapability[] {
  const caps: DeviceCapability[] = ["terminal", "ia"];
  const mems = readDeviceMemories();
  if (mems.length > 0) {
    caps.push("memoria");
    caps.push("archivos");
  }
  return caps;
}

/** Payload de presencia que se «trackea» en el canal `starseed:devices`. */
export interface DevicePresencePayload {
  deviceId: string;
  name: string;
  capabilities: DeviceCapability[];
  memories: DeviceMemoryRef[];
  files: number;
  platform?: string;
  online_at: string;
}

/** Construye el payload de presencia de ESTE dispositivo (defensivo). */
export function buildSelfPresence(): DevicePresencePayload {
  const memories = readDeviceMemories();
  return {
    deviceId: getDeviceId(),
    name: getDeviceName(),
    capabilities: computeSelfCapabilities(),
    memories,
    files: memories.reduce((acc, m) => acc + m.branches, 0),
    platform: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    online_at: new Date().toISOString(),
  };
}

/** Convierte un payload de presencia en un DeviceServer renderizable. */
export function presenceToDevice(p: DevicePresencePayload, selfId: string): DeviceServer {
  return {
    id: p.deviceId,
    name: p.name,
    online: true,
    capabilities: Array.isArray(p.capabilities) ? p.capabilities : [],
    memories: Array.isArray(p.memories) ? p.memories : [],
    files: typeof p.files === "number" ? p.files : 0,
    isSelf: p.deviceId === selfId,
    lastSeen: Date.parse(p.online_at) || Date.now(),
    platform: p.platform,
  };
}

/**
 * Snapshot defensivo de dispositivos cuando NO hay presencia disponible:
 * devuelve únicamente ESTE dispositivo (degradación elegante). El panel
 * usa la presencia real de Supabase para ver los demás.
 */
export async function listDevices(): Promise<DeviceServer[]> {
  if (!isClient()) return [];
  const memories = readDeviceMemories();
  const self: DeviceServer = {
    id: getDeviceId(),
    name: getDeviceName(),
    online: true,
    capabilities: computeSelfCapabilities(),
    memories,
    files: memories.reduce((acc, m) => acc + m.branches, 0),
    isSelf: true,
    lastSeen: Date.now(),
    platform: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
  return [self];
}
