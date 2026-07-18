"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEURONAS — cada dispositivo de la cuenta es cerebro Y servidor.
 * ---------------------------------------------------------------------------
 * Todo dispositivo que inicia sesión con la cuenta StarSeed se registra como
 * una NEURONA: un canal de transmisión con sus capacidades (cómputo local,
 * almacenamiento, terminal, sentidos, energía) conectado a los mismos
 * cerebros y memorias. Las neuronas online se ven, se configuran y se piden
 * archivos/contexto entre sí; juntas multiplican las capacidades de la red
 * personal (sistema nervioso del usuario).
 *
 * Persistencia:
 *   · Identidad del dispositivo → localStorage `starseed.neuron.device-id`.
 *   · Registro vivo → tabla Supabase `neuron_devices` (RLS por owner);
 *     heartbeat en `last_seen_at` ⇒ online = visto hace < 3 min.
 *   · Preferencias/permisos por dispositivo → `starseed.neurons.prefs.v1`
 *     (viaja con la cuenta vía settings-sync → user_settings).
 *
 * PREDETERMINADO: TODO ACTIVO — máxima interconexión y sincronización.
 * El usuario puede restringir cada permiso por neurona en Ajustes → Astraura
 * → Neuronas. Defensivo y SSR-safe: si falta tabla o sesión, degrada a
 * "solo este dispositivo" sin romper nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from "@/utils/supabase/client";
// Id de dispositivo del motor de sync (realtime-sync/entity-state). Se publica
// en las capacidades de la neurona para poder dirigirle broadcasts de cuenta
// (p. ej. "Solicitar archivo a esta neurona" → evento 'file-request').
import { deviceId as syncDeviceId } from "@/lib/sync/entity-state";

export const NEURON_DEVICE_ID_KEY = "starseed.neuron.device-id";
export const NEURON_PREFS_KEY = "starseed.neurons.prefs.v1";
export const NEURON_EVENT = "starseed:neurons";
/** Visto hace menos de esto ⇒ online. */
export const ONLINE_WINDOW_MS = 3 * 60_000;
const HEARTBEAT_MS = 60_000;

export type NeuronKind = "desktop" | "laptop" | "mobile" | "tablet" | "server" | "other";

export interface NeuronCapabilities {
  platform: string;          // "macOS", "Android", "Windows", "Linux", "iOS"…
  browser?: string;          // "Chrome 148"…
  webgpu?: boolean;          // puede correr WebLLM
  chromeAi?: boolean;        // Prompt API integrada
  cores?: number;            // núcleos lógicos
  memoryGb?: number;         // memoria aproximada (navigator.deviceMemory)
  storageQuotaGb?: number;   // cuota de almacenamiento del navegador
  storageUsedGb?: number;
  touch?: boolean;
  installedApp?: boolean;    // PWA instalada (escucha de fondo, más autonomía)
  ollama?: boolean;          // servidor local Ollama detectado
  lmstudio?: boolean;        // servidor local LM Studio detectado
  battery?: { level?: number; charging?: boolean }; // contexto energético
  /** deviceId del motor de sync (entity-state) — destino de broadcasts de
   *  cuenta como 'file-request'. Distinto del id de neurona (histórico). */
  syncDeviceId?: string;
  /** Auto-vinculación Hermes↔OS (Adenda 71-bis): bridge de sincronización con
   *  la sesión Hermes de esta neurona. */
  bridge?: {
    mode?: "external-hermes" | "none";
    hermesWs?: string;
    servesPersonalities?: string[];
    autoLinked?: boolean;
  };
  hermesInstalled?: boolean;
}

/** Permisos de la neurona. PREDETERMINADO: todo true (máxima interconexión). */
export interface NeuronPermissions {
  /** Servir cómputo/IA local (Ollama, WebLLM) al resto de neuronas. */
  compute: boolean;
  /** Servir/replicar archivos y memorias (almacenamiento). */
  storage: boolean;
  /** Sincronizar contexto, memorias y configuraciones en vivo. */
  sync: boolean;
  /** Aceptar órdenes de agentes (terminal / control del dispositivo). */
  agent: boolean;
  /** Compartir sentidos (mic/cámara/pantalla) con Aurora si se piden. */
  senses: boolean;
  /** Recibir notificaciones/despertares de otras neuronas. */
  wake: boolean;
}

export const DEFAULT_PERMISSIONS: NeuronPermissions = {
  compute: true, storage: true, sync: true, agent: true, senses: true, wake: true,
};

/** Rol funcional de la neurona dentro de la red personal. */
export type NeuronRole = "cerebro" | "servidor" | "ambos";

/** Config del servidor casero CasaOS declarado por una neurona (SOP §6b). */
export interface NeuronCasaOS {
  /** URL del panel: http://<ip>:<puerto> (por defecto puerto 80). */
  url?: string;
  /** Conector activado por el usuario. */
  enabled?: boolean;
}

/**
 * AJUSTES por neurona (además de los 6 permisos). Persisten en la MISMA clave
 * `starseed.neurons.prefs.v1` (viaja con la cuenta vía settings-sync).
 * PREDETERMINADO: todo activo, rol "ambos" (cerebro+servidor).
 */
export interface NeuronSettings {
  /** Aceptar "Solicitar archivo a esta neurona" (FileRequestListener lo respeta). */
  fileRequests?: boolean;
  /** Permitir control de pantalla por voz (herramientas screen-control de Aurora). */
  screenVoice?: boolean;
  /** Escucha de fondo de Aurora en este dispositivo (efectiva solo en app instalada). */
  auroraListening?: boolean;
  /** Rol: cerebro (cómputo/contexto) · servidor (almacén/servicios) · ambos. */
  role?: NeuronRole;
  /** Notas libres del usuario sobre esta neurona. */
  notes?: string;
  /** Servidor casero CasaOS de esta neurona (SOP §6b). */
  casaos?: NeuronCasaOS;
}

export const DEFAULT_SETTINGS: NeuronSettings = {
  fileRequests: true, screenVoice: true, auroraListening: true, role: "ambos",
};

export interface Neuron {
  id: string;
  owner?: string;
  name: string;
  kind: NeuronKind;
  capabilities: NeuronCapabilities;
  permissions: NeuronPermissions;
  last_seen_at?: string;
  created_at?: string;
  /** Derivado: visto hace < ONLINE_WINDOW_MS. */
  online?: boolean;
  /** Derivado: ¿es ESTE dispositivo? */
  isThisDevice?: boolean;
}

/* ───────────────────── Identidad del dispositivo ───────────────────── */

function uuid(): string {
  try { return crypto.randomUUID(); } catch {
    return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function thisDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(NEURON_DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      window.localStorage.setItem(NEURON_DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function detectPlatform(): { platform: string; kind: NeuronKind; browser: string } {
  if (typeof navigator === "undefined") return { platform: "desconocido", kind: "other", browser: "" };
  const ua = navigator.userAgent || "";
  const platform =
    /android/i.test(ua) ? "Android" :
    /iphone|ipod/i.test(ua) ? "iOS" :
    /ipad/i.test(ua) ? "iPadOS" :
    /mac os x|macintosh/i.test(ua) ? "macOS" :
    /windows/i.test(ua) ? "Windows" :
    /linux/i.test(ua) ? "Linux" : "otro";
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const kind: NeuronKind =
    platform === "Android" || platform === "iOS" ? "mobile" :
    platform === "iPadOS" ? "tablet" :
    touch ? "tablet" :
    "desktop";
  const bm = ua.match(/(Chrome|Firefox|Safari|Edg)\/(\d+)/);
  const browser = bm ? `${bm[1] === "Edg" ? "Edge" : bm[1]} ${bm[2]}` : "";
  return { platform, kind, browser };
}

async function probeLocal(url: string, ms = 900): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

/** Detecta las capacidades de ESTE dispositivo (todas las sondas defensivas). */
export async function detectCapabilities(): Promise<NeuronCapabilities> {
  const { platform, browser } = detectPlatform();
  const caps: NeuronCapabilities = { platform, browser };
  try { caps.webgpu = !!(navigator as any).gpu; } catch { /* */ }
  try { caps.chromeAi = typeof window !== "undefined" && !!(window as any).LanguageModel; } catch { /* */ }
  try { caps.cores = navigator.hardwareConcurrency || undefined; } catch { /* */ }
  try { caps.memoryGb = (navigator as any).deviceMemory || undefined; } catch { /* */ }
  try { caps.touch = window.matchMedia?.("(pointer: coarse)").matches; } catch { /* */ }
  try {
    caps.installedApp = window.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch { /* */ }
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      caps.storageQuotaGb = Math.round(((est.quota ?? 0) / 1e9) * 10) / 10;
      caps.storageUsedGb = Math.round(((est.usage ?? 0) / 1e9) * 10) / 10;
    }
  } catch { /* */ }
  try {
    const bat = await (navigator as any).getBattery?.();
    if (bat) caps.battery = { level: Math.round((bat.level ?? 0) * 100), charging: !!bat.charging };
  } catch { /* */ }
  // Puente con el motor de sync: permite dirigir broadcasts (file-request…)
  // a esta neurona usando su deviceId de entity-state.
  try { caps.syncDeviceId = syncDeviceId(); } catch { /* */ }
  // Servidores locales (solo tiene sentido sondear en el propio dispositivo).
  caps.ollama = await probeLocal("http://localhost:11434/api/tags");
  caps.lmstudio = await probeLocal("http://localhost:1234/v1/models");
  return caps;
}

function defaultName(caps: NeuronCapabilities, kind: NeuronKind): string {
  const emoji = kind === "mobile" ? "📱" : kind === "tablet" ? "📱" : kind === "server" ? "🖥" : "💻";
  return `${emoji} ${caps.platform}${caps.browser ? ` · ${caps.browser}` : ""}`;
}

/* ───────────────────── Preferencias locales (sincronizadas) ───────────────────── */

interface NeuronPrefs {
  /** deviceId → permisos personalizados. Ausente ⇒ DEFAULT (todo activo). */
  permissions: Record<string, Partial<NeuronPermissions>>;
  /** deviceId → nombre personalizado. */
  names: Record<string, string>;
  /** deviceId → ajustes (solicitudes de archivos, rol, notas, CasaOS…). */
  settings: Record<string, NeuronSettings>;
}

function readPrefs(): NeuronPrefs {
  if (typeof window === "undefined") return { permissions: {}, names: {}, settings: {} };
  try {
    const raw = window.localStorage.getItem(NEURON_PREFS_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return {
      permissions: p?.permissions && typeof p.permissions === "object" ? p.permissions : {},
      names: p?.names && typeof p.names === "object" ? p.names : {},
      settings: p?.settings && typeof p.settings === "object" ? p.settings : {},
    };
  } catch {
    return { permissions: {}, names: {}, settings: {} };
  }
}

function writePrefs(p: NeuronPrefs): void {
  try {
    window.localStorage.setItem(NEURON_PREFS_KEY, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent(NEURON_EVENT));
  } catch { /* */ }
}

export function permissionsFor(deviceId: string): NeuronPermissions {
  const prefs = readPrefs();
  return { ...DEFAULT_PERMISSIONS, ...(prefs.permissions[deviceId] ?? {}) };
}

export function setPermission(deviceId: string, key: keyof NeuronPermissions, value: boolean): void {
  const prefs = readPrefs();
  prefs.permissions[deviceId] = { ...(prefs.permissions[deviceId] ?? {}), [key]: value };
  writePrefs(prefs);
  // Reflejo remoto best-effort (no bloquea la UI).
  void upsertRemote({ id: deviceId, permissions: permissionsFor(deviceId) });
}

export function setNeuronName(deviceId: string, name: string): void {
  const prefs = readPrefs();
  prefs.names[deviceId] = name.trim();
  writePrefs(prefs);
  void upsertRemote({ id: deviceId, name: name.trim() });
}

/** Ajustes de una neurona con los DEFAULTS aplicados (nunca lanza). */
export function settingsFor(deviceId: string): NeuronSettings {
  const prefs = readPrefs();
  return { ...DEFAULT_SETTINGS, ...(prefs.settings[deviceId] ?? {}) };
}

/**
 * Mezcla (merge no destructivo) un parche de ajustes de una neurona y lo
 * persiste en `starseed.neurons.prefs.v1` (viaja con la cuenta). `casaos`
 * también se mezcla en profundidad para no perder url/enabled.
 */
export function setNeuronSettings(deviceId: string, patch: Partial<NeuronSettings>): void {
  const prefs = readPrefs();
  const current = prefs.settings[deviceId] ?? {};
  prefs.settings[deviceId] = {
    ...current,
    ...patch,
    ...(patch.casaos ? { casaos: { ...(current.casaos ?? {}), ...patch.casaos } } : {}),
  };
  writePrefs(prefs);
}

/** ¿ESTE dispositivo acepta solicitudes de archivos? (FileRequestListener). */
export function allowsFileRequests(): boolean {
  const id = thisDeviceId();
  if (!id) return true;
  return settingsFor(id).fileRequests !== false;
}

/* ───────────────────── Registro remoto (Supabase) ───────────────────── */

async function getOwner(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch { return null; }
}

async function upsertRemote(patch: Partial<Neuron> & { id: string }): Promise<void> {
  const owner = await getOwner();
  if (!owner || !patch.id) return;
  try {
    const supabase = createClient();
    await supabase.from("neuron_devices").upsert(
      {
        id: patch.id,
        owner,
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.kind ? { kind: patch.kind } : {}),
        ...(patch.capabilities ? { capabilities: patch.capabilities } : {}),
        ...(patch.permissions ? { permissions: patch.permissions } : {}),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch { /* tabla ausente / offline: degradación silenciosa */ }
}

/**
 * Registra/actualiza ESTE dispositivo como neurona y arranca el heartbeat.
 * Idempotente; llamar una vez por sesión (p. ej. desde el provider de Aurora
 * o el panel de Neuronas). Nunca lanza.
 */
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
export async function ensureThisNeuron(): Promise<Neuron | null> {
  if (typeof window === "undefined") return null;
  const id = thisDeviceId();
  if (!id) return null;
  const { kind } = detectPlatform();
  const capabilities = await detectCapabilities();
  // AUTO-ENLACE HERMES (Adenda 71-bis · 2026-07-17): el OS DETECTA esta neurona
  // y OFRECE/INSTALA la sincronización con Hermes automáticamente, sin que el
  // usuario configure nada. Marca el bridge Hermes y vincula permisos completos
  // (sync OS↔Hermes en ambos sentidos) en el registro de la neurona.
  capabilities.bridge = {
    mode: "external-hermes",
    hermesWs: process.env.NEXT_PUBLIC_HERMIONE_WS || "ws://localhost:8787",
    servesPersonalities: ["hermione"],
    autoLinked: true,
  };
  capabilities.hermesInstalled = true;
  const prefs = readPrefs();
  const name = prefs.names[id] || defaultName(capabilities, kind);
  const perms = permissionsFor(id);
  perms.sync = true;
  const neuron: Neuron = {
    id, name, kind, capabilities,
    permissions: perms,
    isThisDevice: true, online: true,
  };
  void upsertRemote(neuron);
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void upsertRemote({ id });
    }, HEARTBEAT_MS);
  }
  return neuron;
}

/**
 * linkHermesToNeuron — AUTO-VINCULACIÓN Hermes↔OS (Adenda 71-bis · 2026-07-17).
 *
 * El OS DETECTA cada neurona conectada (online en `neuron_devices`) y OFRECE /
 * INSTALA la sincronización con Hermes automáticamente: marca el bridge Hermes
 * en sus capacidades y vincula permisos completos (`sync`) para que los chats
 * de Hermione en el OS se sincronicen con los mensajes de Hermes en CUALQUIER
 * dispositivo de la cuenta, en ambos sentidos, sin configuración manual.
 *
 * Usa el cliente autenticado (RLS owner) → la neurona debe pertenecer a la
 * cuenta. Nunca lanza.
 */
export async function linkHermesToNeuron(neuronId: string): Promise<boolean> {
  if (!neuronId) return false;
  try {
    const supabase = createClient();
    const { data: row } = await supabase
      .from("neuron_devices")
      .select("capabilities, permissions")
      .eq("id", neuronId)
      .maybeSingle();
    const caps = (row?.capabilities as Record<string, any>) || {};
    caps.bridge = {
      mode: "external-hermes",
      hermesWs: process.env.NEXT_PUBLIC_HERMIONE_WS || "ws://localhost:8787",
      servesPersonalities: ["hermione"],
      autoLinked: true,
    };
    caps.hermesInstalled = true;
    const perms = (row?.permissions as Record<string, any>) || {};
    perms.sync = true;
    await supabase
      .from("neuron_devices")
      .update({ capabilities: caps, permissions: perms, last_seen_at: new Date().toISOString() })
      .eq("id", neuronId);
    return true;
  } catch {
    return false;
  }
}

/** ¿Esta neurona tiene el bridge Hermes vinculado? (para ofrecer/ocultar botón). */
export function isHermesLinked(capabilities?: Record<string, any> | null): boolean {
  const b = capabilities?.bridge;
  return !!b && (b.mode === "external-hermes" || capabilities?.hermesInstalled === true);
}

/** Lista TODAS las neuronas de la cuenta (esta primero). Nunca lanza. */
export async function listNeurons(): Promise<Neuron[]> {
  const meId = thisDeviceId();
  const local = await ensureThisNeuron();
  const owner = await getOwner();
  if (!owner) return local ? [local] : [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("neuron_devices")
      .select("id, name, kind, capabilities, permissions, last_seen_at, created_at")
      .order("last_seen_at", { ascending: false });
    if (error || !Array.isArray(data)) return local ? [local] : [];
    const prefs = readPrefs();
    const now = Date.now();
    const out = data.map((row: any): Neuron => ({
      id: String(row.id),
      name: prefs.names[row.id] || String(row.name || "Dispositivo"),
      kind: (row.kind as NeuronKind) || "other",
      capabilities: row.capabilities ?? {},
      permissions: { ...DEFAULT_PERMISSIONS, ...(row.permissions ?? {}), ...(prefs.permissions[row.id] ?? {}) },
      last_seen_at: row.last_seen_at,
      created_at: row.created_at,
      online: row.last_seen_at ? now - Date.parse(row.last_seen_at) < ONLINE_WINDOW_MS : false,
      isThisDevice: row.id === meId,
    }));
    // Este dispositivo primero; luego online; luego por última conexión.
    return out.sort((a, b) =>
      Number(b.isThisDevice) - Number(a.isThisDevice) ||
      Number(b.online) - Number(a.online) ||
      Date.parse(b.last_seen_at ?? "0") - Date.parse(a.last_seen_at ?? "0"),
    );
  } catch {
    return local ? [local] : [];
  }
}

/** Elimina una neurona del registro (no borra nada en el dispositivo). */
export async function removeNeuron(id: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from("neuron_devices").delete().eq("id", id);
    return !error;
  } catch { return false; }
}

/** Resumen del enjambre para Aurora ("tienes 3 neuronas, 2 online…"). */
export function summarizeNeurons(list: Neuron[]): string {
  if (!list.length) return "Sin neuronas registradas todavía.";
  const online = list.filter((n) => n.online);
  const withAI = list.filter((n) => n.capabilities?.ollama || n.capabilities?.lmstudio || n.capabilities?.webgpu);
  return `${list.length} neurona${list.length === 1 ? "" : "s"} en tu cuenta · ${online.length} online · ${withAI.length} con IA local.`;
}
