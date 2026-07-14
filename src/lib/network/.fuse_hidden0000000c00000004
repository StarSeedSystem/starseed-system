"use client";

/*
 * device-registry — Registro HONESTO de dispositivos de la CUENTA + inferencia
 * de "misma red" por IP pública compartida.
 * ---------------------------------------------------------------------------
 * LÍMITE REAL DEL NAVEGADOR (por qué esto es así):
 *   Una página web NO puede escanear la LAN ni leer la IP privada del equipo
 *   (los navegadores lo bloquean por privacidad y ofuscan con mDNS `.local`).
 *   Por tanto, la "detección de dispositivos en la misma red" se hace de forma
 *   honesta: (1) cada dispositivo del usuario se REGISTRA en su CUENTA
 *   (Supabase `user_settings.prefs.devices[]`) con un id persistente + su IP
 *   PÚBLICA (obtenida de un echo público) + pistas (userAgent, plataforma,
 *   última vez visto). (2) Los dispositivos que comparten la MISMA IP pública
 *   se INFIEREN "en la misma red" y se ofrecen para sincronización directa.
 *   (3) La conexión directa real es P2P WebRTC, con señalización vía la cuenta
 *   (ver `lan-sync.ts`).
 *
 * Alineado con CLAUDE.md (Identidad Soberana · tolerancia a fallos):
 *   - LOCAL ES ESPEJO: localStorage guarda id de dispositivo + snapshot.
 *   - CUENTA ES LA VERDAD COMPARTIDA: sin sesión → degrada a solo-local.
 *   - MERGE NO DESTRUCTIVO: nunca pisa otras claves de `prefs`; deduplica por id.
 *   - DEFENSIVO / SSR-SAFE: sin `window`, sin red o sin tabla → nunca rompe.
 *
 * Persistencia (jsonb `prefs`, merge no destructivo):
 *   prefs.devices → DeviceInfo[]   (lista de dispositivos de la cuenta)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */
/* Claves de localStorage                                             */
/* ------------------------------------------------------------------ */

const LS_DEVICE_ID = "starseed.device.id";
const LS_DEVICE_MIRROR = "starseed.device.self"; // espejo del propio DeviceInfo
const LS_DEVICES_MIRROR = "starseed.network.devices"; // espejo de la lista completa
const LS_AUTODETECT = "starseed.network.autodetect"; // "1" | "0" (default: on)

/** Clave dentro de `prefs` donde vive la lista de dispositivos. */
const PREFS_DEVICES_KEY = "devices";

/* ------------------------------------------------------------------ */
/* Tipos                                                             */
/* ------------------------------------------------------------------ */

export interface DeviceInfo {
  /** Id persistente del dispositivo (localStorage `starseed.device.id`). */
  id: string;
  /** Etiqueta legible (editable por el usuario; por defecto derivada). */
  label: string;
  /** Plataforma aproximada (navigator.platform / userAgentData). */
  platform: string;
  /** userAgent recortado (pista, no identifica de forma única). */
  userAgent: string;
  /** IP pública detectada por echo público (o null si no se pudo). */
  publicIp: string | null;
  /** Última vez visto (epoch ms). */
  lastSeen: number;
}

/* ------------------------------------------------------------------ */
/* Helpers de bajo nivel (SSR-safe)                                  */
/* ------------------------------------------------------------------ */

function isClient(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRaw(key: string): string | null {
  if (!isClient()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

/** UUID razonable con fallback si crypto.randomUUID no está disponible. */
function makeId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* noop */
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Id persistente de ESTE dispositivo (se crea la primera vez). */
export function getDeviceId(): string {
  const existing = readRaw(LS_DEVICE_ID);
  if (existing && existing.trim()) return existing;
  const id = makeId();
  writeRaw(LS_DEVICE_ID, id);
  return id;
}

/* ------------------------------------------------------------------ */
/* Pistas del dispositivo                                            */
/* ------------------------------------------------------------------ */

interface UAData {
  platform?: string;
  brands?: Array<{ brand: string }>;
}

function detectPlatform(): string {
  if (!isClient()) return "desconocida";
  try {
    const nav = navigator as Navigator & { userAgentData?: UAData };
    const uad = nav.userAgentData;
    if (uad?.platform) return uad.platform;
    if (typeof navigator.platform === "string" && navigator.platform) return navigator.platform;
  } catch {
    /* noop */
  }
  return "desconocida";
}

function detectUserAgent(): string {
  if (!isClient()) return "";
  try {
    return (navigator.userAgent || "").slice(0, 180);
  } catch {
    return "";
  }
}

/** Etiqueta amigable por defecto derivada de plataforma + navegador. */
function defaultLabel(platform: string, ua: string): string {
  const p = (platform || "").toLowerCase();
  let os = "Dispositivo";
  if (p.includes("mac") || /mac os/i.test(ua)) os = "Mac";
  else if (p.includes("win")) os = "Windows";
  else if (p.includes("android") || /android/i.test(ua)) os = "Android";
  else if (p.includes("linux")) os = "Linux";
  else if (p.includes("iphone") || /iphone/i.test(ua)) os = "iPhone";
  else if (p.includes("ipad") || /ipad/i.test(ua)) os = "iPad";

  let browser = "";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";

  return browser ? `${os} · ${browser}` : os;
}

/* ------------------------------------------------------------------ */
/* IP pública (echo público, defensivo, con timeout)                 */
/* ------------------------------------------------------------------ */

/**
 * getPublicIp — intenta obtener la IP PÚBLICA vía un echo público
 * (https://api.ipify.org?format=json). Con timeout y try/catch. Si no hay red
 * o falla, devuelve null. NUNCA bloquea la app.
 *
 * Nota honesta: esto NO revela la IP privada/LAN (imposible en el navegador);
 * es la IP pública de salida, que compartimos entre dispositivos de la misma
 * red para inferir "misma red".
 */
export async function getPublicIp(timeoutMs = 4000): Promise<string | null> {
  if (!isClient()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try {
      ctrl.abort();
    } catch {
      /* noop */
    }
  }, timeoutMs);
  try {
    const res = await fetch("https://api.ipify.org?format=json", {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: unknown };
    const ip = typeof json?.ip === "string" ? json.ip.trim() : "";
    return ip || null;
  } catch {
    return null; // sin red / bloqueado / timeout → honesto: no lo sabemos
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Sesión / prefs                                                    */
/* ------------------------------------------------------------------ */

async function getUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function normalizeDevice(x: unknown): DeviceInfo | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id) return null;
  return {
    id: o.id,
    label: typeof o.label === "string" && o.label ? o.label : "Dispositivo",
    platform: typeof o.platform === "string" ? o.platform : "desconocida",
    userAgent: typeof o.userAgent === "string" ? o.userAgent : "",
    publicIp: typeof o.publicIp === "string" && o.publicIp ? o.publicIp : null,
    lastSeen: typeof o.lastSeen === "number" ? o.lastSeen : 0,
  };
}

function parseDeviceList(raw: unknown): DeviceInfo[] {
  if (!Array.isArray(raw)) return [];
  const out: DeviceInfo[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const d = normalizeDevice(item);
    if (d && !seen.has(d.id)) {
      seen.add(d.id);
      out.push(d);
    }
  }
  return out;
}

/** Lee la lista de dispositivos guardada en `prefs.devices` (o []). */
async function fetchRemoteDevices(userId: string): Promise<DeviceInfo[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("prefs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.prefs || typeof data.prefs !== "object") return [];
    const prefs = data.prefs as Record<string, unknown>;
    return parseDeviceList(prefs[PREFS_DEVICES_KEY]);
  } catch {
    return [];
  }
}

/**
 * Sube la lista de dispositivos a `prefs.devices` haciendo MERGE NO DESTRUCTIVO
 * del resto de `prefs` (dashboards, library, installed, settings…).
 */
async function pushDevices(userId: string, devices: DeviceInfo[]): Promise<void> {
  try {
    const supabase = createClient();
    let prefs: Record<string, unknown> = {};
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("prefs")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.prefs && typeof data.prefs === "object") {
        prefs = { ...(data.prefs as Record<string, unknown>) };
      }
    } catch {
      /* mezclamos sobre objeto vacío si no se pudo leer */
    }
    prefs[PREFS_DEVICES_KEY] = devices;
    await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    /* best-effort: nunca rompemos */
  }
}

/* ------------------------------------------------------------------ */
/* Construcción / merge del propio dispositivo                       */
/* ------------------------------------------------------------------ */

/** Snapshot ACTUAL de este dispositivo (con IP pública si se pudo). */
export async function buildThisDevice(existingLabel?: string): Promise<DeviceInfo> {
  const id = getDeviceId();
  const platform = detectPlatform();
  const userAgent = detectUserAgent();
  const publicIp = await getPublicIp();
  const label = existingLabel?.trim() || defaultLabel(platform, userAgent);
  return { id, label, platform, userAgent, publicIp, lastSeen: Date.now() };
}

/** Lee el espejo local del propio dispositivo (rápido, sin red). */
export function readMirrorSelf(): DeviceInfo | null {
  const raw = readRaw(LS_DEVICE_MIRROR);
  if (!raw) return null;
  try {
    return normalizeDevice(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Lee el espejo local de la lista completa (rápido, sin red). */
export function readMirrorDevices(): DeviceInfo[] {
  const raw = readRaw(LS_DEVICES_MIRROR);
  if (!raw) return [];
  try {
    return parseDeviceList(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Combina lista existente con `self` (dedup por id, actualiza lastSeen/IP). */
function mergeSelfInto(list: DeviceInfo[], self: DeviceInfo): DeviceInfo[] {
  const map = new Map<string, DeviceInfo>();
  for (const d of list) map.set(d.id, d);
  const prev = map.get(self.id);
  map.set(self.id, {
    ...prev,
    ...self,
    // Conserva la etiqueta editada por el usuario si `self` no trae una nueva.
    label: self.label || prev?.label || "Dispositivo",
    // Conserva IP previa si el echo falló esta vez (mejor que perderla).
    publicIp: self.publicIp ?? prev?.publicIp ?? null,
    lastSeen: self.lastSeen,
  });
  return Array.from(map.values());
}

export interface RegisterResult {
  thisDevice: DeviceInfo;
  devices: DeviceInfo[];
  /** true si se persistió en la cuenta; false si solo quedó en local. */
  synced: boolean;
}

/**
 * registerThisDevice — registra/actualiza ESTE dispositivo.
 *  - Construye el snapshot (id persistente + IP pública si se pudo).
 *  - Si hay sesión: mezcla en `prefs.devices[]` (dedup por id) y sube (merge no
 *    destructivo). Refresca lastSeen/publicIp. Espejo en localStorage.
 *  - Sin sesión: solo espejo local (degradación honesta).
 */
export async function registerThisDevice(): Promise<RegisterResult> {
  // Etiqueta previa (si el usuario la editó) desde el espejo local.
  const prevLabel = readMirrorSelf()?.label;
  const self = await buildThisDevice(prevLabel);

  // Espejo local siempre (aunque no haya sesión).
  writeRaw(LS_DEVICE_MIRROR, JSON.stringify(self));

  const userId = await getUserId();
  if (!userId) {
    // Sin sesión: la "lista" es solo este dispositivo, en local.
    const localList = mergeSelfInto(readMirrorDevices(), self);
    writeRaw(LS_DEVICES_MIRROR, JSON.stringify(localList));
    return { thisDevice: self, devices: localList, synced: false };
  }

  const remote = await fetchRemoteDevices(userId);
  const merged = mergeSelfInto(remote, self);
  await pushDevices(userId, merged);
  writeRaw(LS_DEVICES_MIRROR, JSON.stringify(merged));
  return { thisDevice: self, devices: merged, synced: true };
}

/**
 * listDevices — lee la lista de dispositivos de la cuenta (o el espejo local si
 * no hay sesión). No escribe nada.
 */
export async function listDevices(): Promise<DeviceInfo[]> {
  const userId = await getUserId();
  if (!userId) return readMirrorDevices();
  const remote = await fetchRemoteDevices(userId);
  if (remote.length) writeRaw(LS_DEVICES_MIRROR, JSON.stringify(remote));
  return remote;
}

/**
 * sameNetworkDevices — filtra los dispositivos que comparten la IP PÚBLICA de
 * `self` (excluyéndose a sí mismo). Estos son los que se infiere que están "en
 * tu red" (misma red de salida). Si no conocemos la IP pública propia, no
 * podemos inferir → lista vacía (honesto).
 */
export function sameNetworkDevices(devices: DeviceInfo[], self: DeviceInfo | null): DeviceInfo[] {
  if (!self || !self.publicIp) return [];
  return devices.filter((d) => d.id !== self.id && !!d.publicIp && d.publicIp === self.publicIp);
}

/* ------------------------------------------------------------------ */
/* Preferencia: detección automática                                 */
/* ------------------------------------------------------------------ */

/** Lee la preferencia de auto-detección (default: ON). */
export function getAutoDetect(): boolean {
  const raw = readRaw(LS_AUTODETECT);
  if (raw === null) return true; // predeterminado: activado
  return raw !== "0";
}

/** Persiste la preferencia de auto-detección (local + `prefs` best-effort). */
export function setAutoDetectPref(on: boolean): void {
  writeRaw(LS_AUTODETECT, on ? "1" : "0");
  // Best-effort a la cuenta (no bloqueante): guarda bandera junto a devices.
  void (async () => {
    const userId = await getUserId();
    if (!userId) return;
    try {
      const supabase = createClient();
      let prefs: Record<string, unknown> = {};
      try {
        const { data } = await supabase
          .from("user_settings")
          .select("prefs")
          .eq("user_id", userId)
          .maybeSingle();
        if (data?.prefs && typeof data.prefs === "object") {
          prefs = { ...(data.prefs as Record<string, unknown>) };
        }
      } catch {
        /* noop */
      }
      const net = (prefs.network && typeof prefs.network === "object" ? { ...(prefs.network as Record<string, unknown>) } : {});
      net.autoDetect = on;
      prefs.network = net;
      await supabase
        .from("user_settings")
        .upsert(
          { user_id: userId, prefs, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
    } catch {
      /* best-effort */
    }
  })();
}

/* ------------------------------------------------------------------ */
/* Hook: useDeviceNetwork                                             */
/* ------------------------------------------------------------------ */

export interface DeviceNetworkState {
  /** Snapshot de ESTE dispositivo (o null hasta la primera carga). */
  thisDevice: DeviceInfo | null;
  /** Todos los dispositivos de la cuenta (o solo local sin sesión). */
  devices: DeviceInfo[];
  /** Los que comparten IP pública con este (inferidos "en tu red"). */
  sameNetwork: DeviceInfo[];
  /** ¿Hay sesión Supabase? (define si sincroniza o degrada a local). */
  hasSession: boolean;
  /** ¿Se pudo detectar la IP pública propia? (define si podemos inferir red). */
  hasPublicIp: boolean;
  /** true mientras carga/registra la primera vez. */
  loading: boolean;
  /** Preferencia de auto-detección (persistida). */
  autoDetect: boolean;
  setAutoDetect: (on: boolean) => void;
  /** Vuelve a registrar este dispositivo y recargar la lista. */
  refresh: () => Promise<void>;
}

/**
 * useDeviceNetwork — estado reactivo de dispositivos + inferencia de red.
 *
 * Comportamiento:
 *  - Hidrata inmediato desde el espejo local (sin parpadeo, SSR-safe).
 *  - Si `autoDetect` está ON: al montar registra ESTE dispositivo una vez
 *    (defensivo) y refresca la lista. Sin spam de red.
 *  - `refresh()` fuerza un nuevo registro (útil tras cambiar de red).
 *  - `setAutoDetect(on)` persiste la preferencia; si pasa a ON, registra ya.
 */
export function useDeviceNetwork(): DeviceNetworkState {
  const [thisDevice, setThisDevice] = useState<DeviceInfo | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoDetect, setAutoDetectState] = useState(true);
  const didAutoRegister = useRef(false);

  // Hidratación síncrona desde el espejo local (evita parpadeo/SSR mismatch).
  useEffect(() => {
    setThisDevice(readMirrorSelf());
    setDevices(readMirrorDevices());
    setAutoDetectState(getAutoDetect());
  }, []);

  const doRegister = useCallback(async () => {
    setLoading(true);
    try {
      const res = await registerThisDevice();
      setThisDevice(res.thisDevice);
      setDevices(res.devices);
      setHasSession(res.synced);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await doRegister();
  }, [doRegister]);

  // Auto-registro una sola vez al montar, si la preferencia está activada.
  useEffect(() => {
    if (!isClient()) return;
    if (didAutoRegister.current) return;
    if (!getAutoDetect()) {
      setLoading(false);
      return;
    }
    didAutoRegister.current = true;
    void doRegister();
  }, [doRegister]);

  const setAutoDetect = useCallback(
    (on: boolean) => {
      setAutoDetectState(on);
      setAutoDetectPref(on);
      if (on) void doRegister(); // al activar, registra ya
    },
    [doRegister],
  );

  const sameNetwork = useMemo(
    () => sameNetworkDevices(devices, thisDevice),
    [devices, thisDevice],
  );

  return {
    thisDevice,
    devices,
    sameNetwork,
    hasSession,
    hasPublicIp: !!thisDevice?.publicIp,
    loading,
    autoDetect,
    setAutoDetect,
    refresh,
  };
}
