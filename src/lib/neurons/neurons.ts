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
 *     heartbeat en `last_seen_at` ⇒ online = visto hace < 12 min.
 *     (2026-09-29 · contrato «consumo») El latido es cada 5 min, SOLO en la pestaña
 *     líder y nunca con el dispositivo oculto; `listNeurons()` comparte una caché de
 *     5 min entre todos sus llamadores y ya NO re-registra el dispositivo en cada
 *     lectura (antes: upsert + 2 `getUser()` + select cada 20 s por pestaña).
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
// Id de dispositivo de la malla LoRa/faros (federation.ts) — Ola 366 (malla de
// neuronas): se publica junto a `syncDeviceId` en las capacidades para que la
// malla WebRTC y los faros de la red sináptica puedan casar "esta neurona" con
// "este faro" sin inventar una cuarta identidad. Ver `identidad-dispositivo.ts`.
import { deviceId as meshDeviceId } from "@/ai/astraura/mesh/federation";
// Config de conectividad portátil (Adenda 100): señales/internet por neurona.
// Solo tipo ⇒ se borra en compilación (sin dependencia circular en runtime).
import type { ConnectivityConfig } from "@/ai/astraura/mesh";
// Contrato «consumo» (2026-09-29): id de cuenta sin red y bucles de fondo con líder/visibilidad/freno.
import { uidActual } from "@/lib/consumo/usuario";
import { frenoActivo } from "@/lib/consumo/freno";
import { crearBucle, falloDe, type BucleFondo, type FalloConsulta } from "@/lib/network/bucle-fondo";
// (2026-10-09 · «una neurona por dispositivo») Medios de la neurona, huella del aparato y alias de
// las neuronas fusionadas: ver `medio.ts`, `huella.ts`, `maquina.ts` y `fusion-alias.ts`.
import { describirMedio, fusionarMedios, type RegistroMedio } from "@/lib/neurons/medio";
import { pantallaDe } from "@/lib/neurons/huella";
import { huellaMaquina } from "@/lib/neurons/maquina";
import { neuronaVigente } from "@/lib/neurons/fusion-alias";
import { adoptarNeurona } from "@/lib/network/identidad-dispositivo";

export const NEURON_DEVICE_ID_KEY = "starseed.neuron.device-id";
export const NEURON_PREFS_KEY = "starseed.neurons.prefs.v1";
export const NEURON_EVENT = "starseed:neurons";
/**
 * Visto hace menos de esto ⇒ online. 12 min = dos latidos y medio de margen (el latido es
 * cada 5 min): una pestaña que tarda un poco más en latir no parpadea a «offline».
 */
export const ONLINE_WINDOW_MS = 12 * 60_000;
/** Cadencia del latido (solo pestaña líder y dispositivo visible). */
export const HEARTBEAT_MS = 5 * 60_000;
/** Cada cuántos latidos se vuelve a subir la ficha completa (capacidades, nombre…): 30 min. */
const LATIDOS_POR_FICHA = 6;
/** Vida de la caché compartida de `listNeurons()`. */
export const LISTA_CACHE_MS = 5 * 60_000;

export type NeuronKind = "desktop" | "laptop" | "mobile" | "tablet" | "server" | "other";

export interface NeuronCapabilities {
  platform: string;          // "macOS", "Android", "Windows", "Linux", "iOS"…
  browser?: string;          // "Chrome 148"…
  webgpu?: boolean;          // puede correr WebLLM
  webgl2?: boolean;          // contexto WebGL2 disponible (aceleración gráfica)
  gpuRenderer?: string;      // cadena del GPU (WEBGL_debug_renderer_info) — p.ej. "Apple M2"
  gpuVendor?: string;        // fabricante del GPU (p.ej. "Apple", "NVIDIA", "Intel")
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
  /** deviceId de la malla LoRa/faros (federation.ts) — Ola 366 (malla de
   *  neuronas): casa esta neurona con sus faros de `os_mesh_relay` y su fila
   *  de `os_mesh_topology` sin depender solo de `owner_id`. */
  meshDeviceId?: string;
  /** Auto-vinculación Hermes↔OS (Adenda 71-bis): bridge de sincronización con
   *  la sesión Hermes de esta neurona. */
  bridge?: {
    mode?: "external-hermes" | "none";
    hermesWs?: string;
    servesPersonalities?: string[];
    autoLinked?: boolean;
  };
  hermesInstalled?: boolean;
  /**
   * Backend Astraura 1.58-bit detectado en esta neurona (Adenda 153). Se publica
   * en `neuron_devices.capabilities` para que otras neuronas de la cuenta puedan
   * descubrir dónde corre el sistema primario (patrón del bridge Hermes).
   */
  astraura158?: {
    online: boolean;
    endpoint: string;
    model?: string;
    /** true si el backend reporta binario BitNet compilado. */
    bitnet?: boolean;
  };
  /** (2026-10-09) Pantalla «AxB@dpr» con los lados ordenados: la ven igual todos los medios del aparato. */
  pantalla?: string;
  /** (2026-10-09) Zona horaria IANA del aparato. */
  zona?: string;
  /** (2026-10-09) Huella corta del nombre de máquina (solo app nativa y servidor local la conocen). */
  maquina?: string;
  /**
   * (2026-10-09) MEDIOS de esta neurona: cada forma de abrir el OS en el aparato (Chrome en
   * Vercel, localhost, app instalada, app nativa…), con su última ficha. Clave = id del medio.
   */
  medios?: Record<string, RegistroMedio>;
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
  /** Señales y conectividad portátil de esta neurona (Adenda 100). */
  connectivity?: ConnectivityConfig;
  /** Sincronizar memorias de los cerebros con esta neurona (ausente ⇒ ON). */
  syncBrains?: boolean;
  /** Sincronizar datos de la biblioteca de la cuenta (ausente ⇒ ON). */
  syncLibrary?: boolean;
  /** Sincronizar con las demás neuronas de la cuenta (ausente ⇒ ON). */
  syncNeurons?: boolean;
  /** Sincronizar con neuronas externas a la cuenta (ausente ⇒ OFF). */
  syncExternal?: boolean;
  /** Ubicación declarada por el usuario (texto libre: ciudad, sala, "casa"…). Adenda 114. */
  location?: string;
  /** Ofrecer internet público a los servidores comunitarios del OS con los recursos de esta neurona. */
  offerPublicInternet?: boolean;
  /** Puerto específico para vínculos privados personalizables (cuando ofrece servicio). */
  publicPort?: number;
  /**
   * Endpoint del backend Astraura 1.58-bit para ESTA neurona (Adenda 153):
   * local (`http://127.0.0.1:8000`, por defecto), LAN, túnel cloudflared o
   * Cloud Run propio. `enabled:false` apaga la fuente local en esta neurona.
   */
  astraura158?: { endpoint?: string; enabled?: boolean };
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
  // GPU: renderer/vendor por WEBGL_debug_renderer_info (net-new, Adenda 109). Da
  // el modelo aproximado del GPU para estimar si un modelo local corre fluido.
  try {
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const gl2 = canvas.getContext("webgl2");
      const gl = (gl2 || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      caps.webgl2 = !!gl2;
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number } | null;
        if (dbg) {
          const r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
          const v = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          if (r) caps.gpuRenderer = String(r).slice(0, 90);
          if (v) caps.gpuVendor = String(v).slice(0, 60);
        }
      }
    }
  } catch { /* */ }
  try { caps.chromeAi = typeof window !== "undefined" && !!(window as any).LanguageModel; } catch { /* */ }
  try { caps.cores = navigator.hardwareConcurrency || undefined; } catch { /* */ }
  // Huella del aparato (2026-10-09): pantalla y zona las ven igual todos sus medios.
  try { caps.pantalla = pantallaDe(window.screen?.width, window.screen?.height, window.devicePixelRatio); } catch { /* */ }
  try { caps.zona = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { /* */ }
  try { caps.maquina = await huellaMaquina(); } catch { /* */ }
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
  // Puente con la malla LoRa/faros: permite casar esta neurona con sus faros
  // de la red sináptica (Ola 366 · malla de neuronas). Ver identidad-dispositivo.ts.
  try { caps.meshDeviceId = meshDeviceId(); } catch { /* */ }
  // Servidores locales (solo tiene sentido sondear en el propio dispositivo).
  caps.ollama = await probeLocal("http://localhost:11434/api/tags");
  caps.lmstudio = await probeLocal("http://localhost:1234/v1/models");
  // Backend Astraura 1.58-bit (Adenda 153): sonda honesta a /api/status en el
  // endpoint declarado por la neurona (o el local por defecto). Publica modelo
  // y si hay BitNet compilado; nunca lanza.
  try {
    const endpoint = astraura158EndpointOf(thisDeviceId());
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${endpoint}/api/status`, { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { engine?: { active_model?: string; bitnet_cpp_installed?: boolean } } | null;
      caps.astraura158 = {
        online: true,
        endpoint,
        model: typeof j?.engine?.active_model === "string" ? j.engine.active_model.slice(0, 80) : undefined,
        bitnet: !!j?.engine?.bitnet_cpp_installed,
      };
    } else {
      caps.astraura158 = { online: false, endpoint };
    }
  } catch {
    try { caps.astraura158 = { online: false, endpoint: astraura158EndpointOf(thisDeviceId()) }; } catch { /* */ }
  }
  return caps;
}

/** Endpoint Astraura 1.58 efectivo de una neurona (ajuste propio o local). Adenda 153. */
export function astraura158EndpointOf(deviceId: string): string {
  try {
    const s = settingsFor(deviceId).astraura158;
    if (s && s.enabled !== false && typeof s.endpoint === "string" && s.endpoint.trim()) {
      return s.endpoint.trim().replace(/\/+$/, "");
    }
  } catch { /* */ }
  return "http://127.0.0.1:8000";
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
    ...(patch.astraura158 ? { astraura158: { ...(current.astraura158 ?? {}), ...patch.astraura158 } } : {}),
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

/** Cuenta con sesión (sin red: `uidActual()` lee la sesión guardada). */
async function getOwner(): Promise<string | null> {
  try {
    return await uidActual();
  } catch { return null; }
}

/**
 * Funde la ficha remota de una neurona con la de ESTE medio (puro, exportado para pruebas):
 *  · rasgos del aparato: gana el valor definido más nuevo (los `undefined`/vacíos no pisan);
 *  · `medios`: unión por id, con el más reciente de cada uno (ver `fusionarMedios`).
 */
export function combinarCapacidades(
  remotas: Record<string, unknown> | null | undefined,
  locales: NeuronCapabilities,
  ahora: number = Date.now(),
): NeuronCapabilities {
  const base: Record<string, unknown> = remotas && typeof remotas === "object" ? { ...remotas } : {};
  for (const [k, v] of Object.entries(locales)) {
    if (k === "medios") continue;
    if (v === undefined || v === null || v === "") continue;
    base[k] = v;
  }
  const medios = fusionarMedios(
    (remotas?.medios as Record<string, RegistroMedio> | undefined) ?? null,
    locales.medios ?? {},
    ahora,
  );
  if (Object.keys(medios).length) base.medios = medios;
  return base as unknown as NeuronCapabilities;
}

/** Sube (upsert) la fila de la neurona. Devuelve el fallo de la consulta, si lo hubo. Nunca lanza. */
async function upsertRemote(patch: Partial<Neuron> & { id: string }): Promise<FalloConsulta | null> {
  const owner = await getOwner();
  if (!owner || !patch.id) return null;
  try {
    const supabase = createClient();
    // (2026-10-09) Varios medios del MISMO aparato comparten la fila: la ficha nueva se FUNDE con
    // la que hay (los medios de los demás no se pierden; un medio que no ve la memoria o el nombre
    // de máquina no borra lo que otro sí vio). Una lectura cada 30 min por medio.
    if (patch.capabilities) {
      try {
        const actual = await supabase.from("neuron_devices").select("capabilities").eq("id", patch.id).maybeSingle();
        const remotas = (actual as { data?: { capabilities?: Record<string, unknown> } | null }).data?.capabilities ?? null;
        patch = { ...patch, capabilities: combinarCapacidades(remotas, patch.capabilities) };
      } catch { /* sin lectura: sube la propia */ }
    }
    const res = await supabase.from("neuron_devices").upsert(
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
    const fallo = falloDe(res as { error?: unknown; status?: number });
    // Un cambio de nombre/permisos/ficha debe verse ya en la lista de esta pestaña.
    if (!fallo && (patch.name || patch.kind || patch.capabilities || patch.permissions)) invalidarListaNeuronas();
    return fallo;
  } catch (e) {
    return { message: e instanceof Error ? e.message : "sin red" };
  }
}

/* ── Latido (contrato «consumo») ─────────────────────────────────────────── */

let neuronaLocal: Neuron | null = null;
/** Cuándo se midió `neuronaLocal` (para no repetir las sondas locales en el primer latido). */
let neuronaLocalEn = 0;
let neuronaLocalEnVuelo: Promise<Neuron | null> | null = null;
let latido: BucleFondo | null = null;
let latidosDesdeFicha = 0;

/** Construye la ficha local de ESTE dispositivo (sondas locales, sin Supabase). */
async function construirNeuronaLocal(id: string): Promise<Neuron> {
  const { kind } = detectPlatform();
  const capabilities = await detectCapabilities();
  // AUTO-ENLACE HERMES (Adenda 71-bis; HONESTO desde Adenda 118): solo se marca
  // el bridge Hermes cuando hay un endpoint REAL configurado por env
  // (NEXT_PUBLIC_HERMIONE_WS). Antes se fijaba en TODA neurona apuntando a un
  // `ws://localhost:8787` que casi nunca existe, declarando «Hermes instalado»
  // en falso y haciendo que los consumidores del bridge intentaran conectar a la
  // nada. El enlace explícito iniciado por el usuario sigue en linkHermesToNeuron().
  const hermesWs = process.env.NEXT_PUBLIC_HERMIONE_WS;
  if (hermesWs) {
    capabilities.bridge = {
      mode: "external-hermes",
      hermesWs,
      servesPersonalities: ["hermione"],
      autoLinked: true,
    };
    capabilities.hermesInstalled = true;
  }
  // Este medio, al día, dentro de la lista de medios de la neurona (2026-10-09).
  try {
    const m = describirMedio();
    if (m.id) {
      const { id: mid, ...registro } = m;
      capabilities.medios = { [mid]: { ...registro, visto: new Date().toISOString() } };
    }
  } catch { /* sin medio */ }
  const prefs = readPrefs();
  const name = prefs.names[id] || defaultName(capabilities, kind);
  const perms = permissionsFor(id);
  perms.sync = true;
  return {
    id, name, kind, capabilities,
    permissions: perms,
    isThisDevice: true, online: true,
  };
}

/**
 * Una vuelta del latido: la PRIMERA (y una de cada `LATIDOS_POR_FICHA`) sube la ficha
 * completa con las capacidades recién medidas; el resto solo `last_seen_at`.
 */
async function latirUnaVez(idInicial: string): Promise<{ fallo: FalloConsulta | null }> {
  // ¿Fusionaron esta neurona con otra desde otro medio? Se adopta antes de latir (si no, el
  // latido volvería a crear la fila borrada y el duplicado reaparecería).
  const id = resolverAliasEsteMedio() || idInicial;
  if (latidosDesdeFicha % LATIDOS_POR_FICHA === 0) {
    const reciente = neuronaLocal && neuronaLocal.id === id && Date.now() - neuronaLocalEn < 60_000;
    const fresca = reciente && neuronaLocal ? neuronaLocal : await construirNeuronaLocal(id);
    neuronaLocal = fresca;
    neuronaLocalEn = Date.now();
    latidosDesdeFicha += 1;
    return { fallo: await upsertRemote(fresca) };
  }
  latidosDesdeFicha += 1;
  // Latido ligero: ACTUALIZA la hora de la fila; nunca crea una fila vacía (así nacían las
  // neuronas «fantasma» sin nombre ni capacidades). Si la fila no existe, sube la ficha entera.
  const owner = await getOwner();
  if (!owner) return { fallo: null };
  try {
    const res = await createClient()
      .from("neuron_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    const fallo = falloDe(res as { error?: unknown; status?: number });
    if (fallo) return { fallo };
    const filas = (res as { data?: unknown[] | null }).data;
    if (Array.isArray(filas) && filas.length > 0) return { fallo: null };
  } catch (e) {
    return { fallo: { message: e instanceof Error ? e.message : "sin red" } };
  }
  const idVigente = resolverAliasEsteMedio() || id;
  const ficha = neuronaLocal && neuronaLocal.id === idVigente ? neuronaLocal : await construirNeuronaLocal(idVigente);
  neuronaLocal = ficha;
  neuronaLocalEn = Date.now();
  return { fallo: await upsertRemote(ficha) };
}

/**
 * Si el id de neurona de ESTE medio fue fusionado con otro (registro sincronizado de la cuenta),
 * lo adopta ya y devuelve el id vigente; si no, devuelve el actual. Nunca lanza.
 */
export function resolverAliasEsteMedio(): string {
  try {
    const actual = thisDeviceId();
    if (!actual) return "";
    const vigente = neuronaVigente(actual);
    if (vigente && vigente !== actual) {
      const r = adoptarNeurona(vigente);
      if (r.ok) {
        neuronaLocal = null;
        cacheLista = null;
        try {
          window.dispatchEvent(new CustomEvent("starseed:neurona-adoptada", { detail: { anterior: actual, adoptada: vigente, motivo: "fusion" } }));
          window.dispatchEvent(new CustomEvent(NEURON_EVENT));
        } catch { /* */ }
        return vigente;
      }
    }
    return actual;
  } catch {
    return "";
  }
}

/** Solo pruebas: para el latido y olvida la ficha local (cada prueba empieza de cero). */
export function _detenerLatidoParaPruebas(): void {
  latido?.detener();
  latido = null;
  latidosDesdeFicha = 0;
  neuronaLocal = null;
  neuronaLocalEn = 0;
  neuronaLocalEnVuelo = null;
  cacheLista = null;
  listaParada = false;
  listaAvisada = false;
}

/**
 * Registra ESTE dispositivo como neurona y arranca el latido. Idempotente y barato: la
 * primera llamada mide las capacidades (sondas locales) y arranca el bucle; las siguientes
 * devuelven la ficha ya medida SIN tocar la red. El registro remoto lo hace el latido, solo
 * en la pestaña líder, cada `HEARTBEAT_MS`, y nunca con el dispositivo oculto (ver
 * `bucle-fondo.ts`). Un 400/404 (tabla o columna ausente) lo para hasta recargar. Nunca lanza.
 */
export async function ensureThisNeuron(): Promise<Neuron | null> {
  if (typeof window === "undefined") return null;
  const id = resolverAliasEsteMedio() || thisDeviceId();
  if (!id) return null;
  if (neuronaLocal && neuronaLocal.id === id) return neuronaLocal;
  if (!neuronaLocalEnVuelo) {
    neuronaLocalEnVuelo = construirNeuronaLocal(id)
      .then((n) => {
        neuronaLocal = n;
        neuronaLocalEn = Date.now();
        return n;
      })
      .catch(() => null)
      .finally(() => {
        neuronaLocalEnVuelo = null;
      });
  }
  const neuron = await neuronaLocalEnVuelo;
  if (!latido) {
    latido = crearBucle({
      nombre: "neuronas · latido",
      consulta: "upsert neuron_devices (last_seen_at)",
      intervaloMs: HEARTBEAT_MS,
      // El id se relee en cada vuelta: una adopción o fusión lo cambia sin recargar.
      tarea: () => latirUnaVez(thisDeviceId() || id),
    });
    latido.iniciar();
  }
  return neuron ?? neuronaLocal;
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
    invalidarListaNeuronas();
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

/**
 * ¿Esta neurona sincroniza los chats de Hermione? (Adenda 74). PREDETERMINADO:
 * activo cuando tiene Hermes; solo se apaga si el usuario lo puso en false.
 */
export function neuronHermioneSyncEnabled(capabilities?: Record<string, any> | null): boolean {
  return capabilities?.hermioneSync !== false;
}

/**
 * Activa/desactiva la sincronización de chats de Hermione EN ESTA NEURONA.
 * Persiste en `neuron_devices.capabilities.hermioneSync` (update jsonb, sin DDL).
 * Cliente autenticado (RLS owner). Nunca lanza.
 */
export async function setNeuronHermioneSync(neuronId: string, on: boolean): Promise<boolean> {
  if (!neuronId) return false;
  try {
    const supabase = createClient();
    const { data: row } = await supabase
      .from("neuron_devices")
      .select("capabilities")
      .eq("id", neuronId)
      .maybeSingle();
    const caps = (row?.capabilities as Record<string, any>) || {};
    caps.hermioneSync = on;
    const { error } = await supabase
      .from("neuron_devices")
      .update({ capabilities: caps, last_seen_at: new Date().toISOString() })
      .eq("id", neuronId);
    if (!error) invalidarListaNeuronas();
    if (!error && typeof window !== "undefined") {
      try { window.dispatchEvent(new Event(NEURON_EVENT)); } catch { /* */ }
    }
    return !error;
  } catch {
    return false;
  }
}

/* ── Caché compartida de la lista (contrato «consumo») ───────────────────── */

interface CacheLista {
  owner: string;
  en: number;
  filas: Array<Record<string, unknown>>;
}
let cacheLista: CacheLista | null = null;
let listaEnVuelo: Promise<{ filas: Array<Record<string, unknown>> | null; fallo: FalloConsulta | null }> | null = null;
/** La lectura de `neuron_devices` devolvió 400/404: no se vuelve a pedir hasta recargar. */
let listaParada = false;
let listaAvisada = false;

/** Olvida la caché: la próxima `listNeurons()` vuelve a leer (tras una mutación propia). */
export function invalidarListaNeuronas(): void {
  cacheLista = null;
}

function pestanaOculta(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** Lee `neuron_devices` (una sola petición en vuelo aunque la pidan 5 superficies a la vez). */
async function leerFilasNeuronas(): Promise<{ filas: Array<Record<string, unknown>> | null; fallo: FalloConsulta | null }> {
  if (!listaEnVuelo) {
    listaEnVuelo = (async () => {
      try {
        const supabase = createClient();
        const res = await supabase
          .from("neuron_devices")
          .select("id, name, kind, capabilities, permissions, last_seen_at, created_at")
          .order("last_seen_at", { ascending: false });
        const fallo = falloDe(res as { error?: unknown; status?: number });
        if (fallo || !Array.isArray(res.data)) return { filas: null, fallo };
        return { filas: res.data as Array<Record<string, unknown>>, fallo: null };
      } catch (e) {
        return { filas: null, fallo: { message: e instanceof Error ? e.message : "sin red" } };
      } finally {
        listaEnVuelo = null;
      }
    })();
  }
  return listaEnVuelo;
}

/**
 * Lista TODAS las neuronas de la cuenta (esta primero). Nunca lanza.
 *
 * (2026-09-29) Comparte una caché de `LISTA_CACHE_MS` entre todos sus llamadores (malla,
 * widgets, paneles); con la pestaña oculta o el freno remoto activo devuelve lo último que
 * tenga sin tocar la red. `{ fresco: true }` fuerza la lectura (botón «Actualizar»).
 */
export async function listNeurons(opts?: { fresco?: boolean }): Promise<Neuron[]> {
  const meId = thisDeviceId();
  const local = await ensureThisNeuron();
  const owner = await getOwner();
  if (!owner) return local ? [local] : [];
  try {
    let filas: Array<Record<string, unknown>> | null = null;
    const cache = cacheLista && cacheLista.owner === owner ? cacheLista : null;
    const vigente = cache && Date.now() - cache.en < LISTA_CACHE_MS;
    let frenado = false;
    try {
      frenado = frenoActivo();
    } catch {
      frenado = false;
    }
    // Se lee de la red solo si se puede (sin freno ni parada) y hace falta: no hay caché, se
    // pidió fresca, o caducó con la pestaña a la vista. Si no, lo último que haya.
    const puedeLeer = !frenado && !listaParada;
    const hayQueLeer = !cache || !!opts?.fresco || (!vigente && !pestanaOculta());
    if (!puedeLeer || !hayQueLeer) {
      filas = cache?.filas ?? null;
    } else {
      const { filas: leidas, fallo } = await leerFilasNeuronas();
      if (fallo && (fallo.status === 400 || fallo.status === 404)) {
        listaParada = true;
        if (!listaAvisada) {
          listaAvisada = true;
          console.warn(
            `[consumo] neuronas · lista: «select neuron_devices» responde HTTP ${fallo.status}` +
              `${fallo.code ? ` · ${fallo.code}` : ""}${fallo.message ? ` (${fallo.message})` : ""}. ` +
              "No se vuelve a pedir hasta recargar la página.",
          );
        }
      }
      if (leidas) cacheLista = { owner, en: Date.now(), filas: leidas };
      filas = leidas ?? cache?.filas ?? null;
    }
    if (!filas) return local ? [local] : [];
    const data = filas;
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
    if (!error) invalidarListaNeuronas();
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
