"use client";

/**
 * StarSeed OS — Astraura · PROVEEDORES DE SINCRONIZACIÓN por cuenta
 * ============================================================================
 * Interfaz de proveedor (adapter) + registro para que CADA cuenta elija DÓNDE
 * se sincronizan sus preferencias (`SYNCED_KEYS` de `lib/settings-sync.ts`):
 *
 *   · "official"     — Supabase oficial de StarSeed (comportamiento de HOY:
 *                       delega 100% en `settings-sync.ts`/`utils/supabase/client`
 *                       tal cual). ES EL DEFAULT: nada cambia si el usuario no
 *                       toca esta pantalla.
 *   · "own-supabase" — Supabase PROPIO del usuario (su URL + anon key): mismo
 *                       esquema `user_settings(user_id, prefs, updated_at)`,
 *                       pero contra el proyecto que el usuario configure. El
 *                       usuario gestiona su propia auth en ese proyecto (aquí
 *                       solo probamos alcanzar la tabla; no sustituye el login
 *                       de StarSeed).
 *   · "local"        — Sin red: espejo en este dispositivo (localStorage) +
 *                       exportar/importar un archivo de respaldo real (File
 *                       System Access API cuando el navegador la soporta,
 *                       descarga/subida de archivo si no). Útil para modo
 *                       offline/soberanía máxima o como copia de seguridad.
 *
 * EXTENSIBLE: añadir un proveedor nuevo (WebDAV/Drive/…) es implementar
 * `SyncProvider` y registrarlo en `SYNC_PROVIDERS`. La UI (`/servidores`) y el
 * resto del OS lo recogen solos.
 *
 * NO ROMPE EL SYNC ACTUAL: mientras el usuario no elija explícitamente otro
 * proveedor, `activeSyncProviderId()` devuelve "official" y todo se comporta
 * EXACTAMENTE como hasta ahora (mismas funciones de `settings-sync.ts`).
 *
 * Persistencia: `starseed.sync.provider.v1` (SYNC_PROVIDER_VERSION para
 * futuras migraciones, patrón DEFAULTS_VERSION del repo). Aditivo: NO está en
 * `SYNCED_KEYS` a propósito — la elección de proveedor es POR DISPOSITIVO/
 * cuenta local (si viajase con el sync oficial y el usuario cambiase a un
 * proveedor propio inalcanzable desde otro dispositivo, se quedaría sin poder
 * volver a "official" fácilmente; mejor que cada dispositivo decida).
 */

import { createClient as createOfficialClient } from "@/utils/supabase/client";
import * as officialSync from "@/lib/settings-sync";
import { SYNCED_KEYS, type SyncResult } from "@/lib/settings-sync";

/* ═══════════════════════════ Tipos del contrato ═══════════════════════════ */

export type SyncProviderId = "official" | "own-supabase" | "local" | string;

export interface SyncConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Contrato que cualquier proveedor de sincronización debe implementar. Un
 * proveedor NO tiene por qué usar Supabase (de ahí `push`/`pull` genéricos);
 * el registro de abajo trae 3 implementaciones (oficial/propio/local) y deja
 * la puerta abierta a más (WebDAV, Drive…).
 */
export interface SyncProvider {
  id: SyncProviderId;
  label: string;
  description: string;
  /** ¿Necesita configuración (URL/clave) antes de poder usarse? */
  needsConfig: boolean;
  /** Campos de configuración que la UI debe pedir (vacío si no hace falta). */
  configFields: { key: string; label: string; placeholder?: string; secret?: boolean }[];
  /** Prueba de conexión con la config ACTUAL guardada para este proveedor. */
  testConnection: () => Promise<SyncConnectionTestResult>;
  /** Sube las preferencias locales al destino de este proveedor. */
  push: () => Promise<SyncResult>;
  /** Descarga las preferencias del destino y las aplica a localStorage. */
  pull: () => Promise<SyncResult & { applied?: string[] }>;
}

/* ═══════════════════════════ Config por proveedor ═══════════════════════════ */

const CONFIG_KEY = "starseed.sync.providers.config.v1";

interface OwnSupabaseConfig {
  url?: string;
  anonKey?: string;
}

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAllConfig(): Record<string, Record<string, string>> {
  if (!isClient()) return {};
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeAllConfig(next: Record<string, Record<string, string>>): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  } catch {
    /* cuota/modo privado: degrada en silencio */
  }
}

/** Lee la config guardada de un proveedor concreto (o {} si no hay). */
export function getProviderConfig(providerId: SyncProviderId): Record<string, string> {
  const all = readAllConfig();
  return all[providerId] ?? {};
}

/** Guarda (merge) la config de un proveedor concreto. */
export function setProviderConfig(providerId: SyncProviderId, patch: Record<string, string>): void {
  const all = readAllConfig();
  all[providerId] = { ...(all[providerId] ?? {}), ...patch };
  writeAllConfig(all);
}

/* ═══════════════════════════ Proveedor: Supabase oficial ═══════════════════════════
 * Comportamiento de HOY, sin ningún cambio: delega en settings-sync.ts, que a
 * su vez usa `utils/supabase/client.ts` (proyecto oficial de StarSeed vía env).
 */
const officialProvider: SyncProvider = {
  id: "official",
  label: "Supabase oficial de StarSeed",
  description:
    "El comportamiento de siempre: tu cuenta soberana StarSeed (Nexus · Café · OS comparten la misma). No requiere configuración.",
  needsConfig: false,
  configFields: [],
  testConnection: async () => {
    try {
      const supabase = createOfficialClient();
      const { data, error } = await supabase.auth.getUser();
      if (error) return { ok: false, message: `No se pudo verificar la sesión: ${error.message}` };
      if (!data?.user?.id) return { ok: false, message: "No has iniciado sesión con tu cuenta StarSeed." };
      return { ok: true, message: "Conectado a tu cuenta StarSeed oficial." };
    } catch (e: any) {
      return { ok: false, message: `Error de red: ${e?.message ?? e}` };
    }
  },
  push: () => officialSync.pushPreferences(),
  pull: () => officialSync.pullPreferences(),
};

/* ═══════════════════════════ Proveedor: Supabase propio ═══════════════════════════
 * El usuario aporta SU URL + anon key. Mismo esquema `user_settings` (el mismo
 * SQL documentado en settings-sync.ts), pero contra SU proyecto. Requiere que
 * el usuario tenga sesión en su propio proyecto para que RLS deje escribir; si
 * su proyecto no exige auth (RLS abierta), funciona igualmente sin login ahí.
 */
async function ownSupabaseClient() {
  const cfg = getProviderConfig("own-supabase") as OwnSupabaseConfig;
  if (!cfg.url || !cfg.anonKey) return null;
  const { createClient } = await import("@supabase/supabase-js");
  try {
    return createClient(cfg.url, cfg.anonKey);
  } catch {
    return null;
  }
}

/** Bundle local (mismas SYNCED_KEYS que settings-sync.ts) para push genérico. */
function collectLocalBundle(): Record<string, unknown> {
  const bundle: Record<string, unknown> = {};
  if (typeof window === "undefined") return bundle;
  for (const key of SYNCED_KEYS) {
    const raw = window.localStorage.getItem(key);
    if (raw != null) {
      try { bundle[key] = JSON.parse(raw); } catch { bundle[key] = raw; }
    }
  }
  return bundle;
}

/** Aplica un bundle de prefs (solo SYNCED_KEYS conocidas) al localStorage. */
function applyBundle(prefs: Record<string, unknown>): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(prefs)) {
    if (!(SYNCED_KEYS as readonly string[]).includes(key)) continue;
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value);
      window.localStorage.setItem(key, serialized);
      applied.push(key);
    } catch { /* clave individual ignorada */ }
  }
  return applied;
}

/**
 * Id de "cuenta" local usado como clave de fila en un Supabase PROPIO (no hay
 * garantía de que el usuario tenga auth ahí). Estable por dispositivo/navegador
 * mientras no se borre localStorage; suficiente para un backend soberano
 * propio de un único usuario/instalación.
 */
const OWN_ROW_ID_KEY = "starseed.sync.own-supabase.row-id.v1";
function ownRowId(): string {
  if (!isClient()) return "local";
  try {
    let id = window.localStorage.getItem(OWN_ROW_ID_KEY);
    if (!id) {
      id = `starseed-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.localStorage.setItem(OWN_ROW_ID_KEY, id);
    }
    return id;
  } catch {
    return "local";
  }
}

const ownSupabaseProvider: SyncProvider = {
  id: "own-supabase",
  label: "Supabase propio",
  description:
    "Tu propio proyecto Supabase (URL + clave anónima). Crea la tabla user_settings con el mismo esquema documentado en settings-sync.ts. Útil para soberanía total de tus datos.",
  needsConfig: true,
  configFields: [
    { key: "url", label: "URL del proyecto", placeholder: "https://tuproyecto.supabase.co" },
    { key: "anonKey", label: "Clave anónima (anon key)", placeholder: "eyJhbGciOi…", secret: true },
  ],
  testConnection: async () => {
    const cfg = getProviderConfig("own-supabase") as OwnSupabaseConfig;
    if (!cfg.url || !cfg.anonKey) return { ok: false, message: "Falta la URL y/o la clave anónima." };
    const client = await ownSupabaseClient();
    if (!client) return { ok: false, message: "No se pudo crear el cliente (revisa la URL/clave)." };
    try {
      const { error } = await client.from("user_settings").select("user_id").limit(1);
      if (error) {
        const missing = /relation .*user_settings.* does not exist/i.test(error.message);
        return {
          ok: false,
          message: missing
            ? "Conectado, pero falta crear la tabla user_settings en tu proyecto (ver settings-sync.ts)."
            : `No se pudo consultar: ${error.message}`,
        };
      }
      return { ok: true, message: "Conexión correcta a tu Supabase propio." };
    } catch (e: any) {
      return { ok: false, message: `Error de red: ${e?.message ?? e}` };
    }
  },
  push: async () => {
    const client = await ownSupabaseClient();
    if (!client) return { ok: false, reason: "error", message: "Configura URL + clave anónima primero." };
    const prefs = collectLocalBundle();
    if (Object.keys(prefs).length === 0) return { ok: false, reason: "empty", message: "No hay preferencias locales que subir todavía." };
    try {
      const { error } = await client
        .from("user_settings")
        .upsert({ user_id: ownRowId(), prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) {
        const missing = /relation .*user_settings.* does not exist/i.test(error.message);
        return {
          ok: false,
          reason: missing ? "no-table" : "error",
          message: missing
            ? "Falta crear la tabla user_settings en tu proyecto Supabase propio."
            : `No se pudo subir: ${error.message}`,
        };
      }
      return { ok: true, message: "Preferencias guardadas en tu Supabase propio.", updatedAt: new Date().toISOString() };
    } catch (e: any) {
      return { ok: false, reason: "error", message: `Error de red al subir: ${e?.message ?? e}` };
    }
  },
  pull: async () => {
    const client = await ownSupabaseClient();
    if (!client) return { ok: false, reason: "error", message: "Configura URL + clave anónima primero." };
    try {
      const { data, error } = await client
        .from("user_settings")
        .select("prefs, updated_at")
        .eq("user_id", ownRowId())
        .maybeSingle();
      if (error) {
        const missing = /relation .*user_settings.* does not exist/i.test(error.message);
        return {
          ok: false,
          reason: missing ? "no-table" : "error",
          message: missing ? "Falta crear la tabla user_settings en tu proyecto." : `No se pudo descargar: ${error.message}`,
        };
      }
      if (!data?.prefs || typeof data.prefs !== "object") {
        return { ok: false, reason: "empty", message: "Tu Supabase propio aún no tiene preferencias guardadas." };
      }
      const applied = applyBundle(data.prefs as Record<string, unknown>);
      return { ok: true, message: `Ajustes recuperados de tu Supabase propio (${applied.length}).`, applied, updatedAt: data.updated_at };
    } catch (e: any) {
      return { ok: false, reason: "error", message: `Error de red al descargar: ${e?.message ?? e}` };
    }
  },
};

/* ═══════════════════════════ Proveedor: Local / dispositivo ═══════════════════════════
 * Sin red: el "push" exporta un archivo de respaldo (JSON) — File System Access
 * API si el navegador la soporta, si no, descarga clásica. El "pull" invita a
 * elegir un archivo (File System Access o <input type=file> vía Promise) y
 * aplica su contenido. No sincroniza ENTRE dispositivos por sí solo: es un
 * espejo/backup soberano 100% local, y la base para un futuro conector de
 * carpeta (File System Access) si el usuario quiere un directorio vivo.
 */
const LOCAL_BACKUP_FILENAME = "starseed-preferencias.json";

type FileSystemAccessWindow = Window & {
  showSaveFilePicker?: (opts?: unknown) => Promise<{
    createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
  }>;
  showOpenFilePicker?: (opts?: unknown) => Promise<{ getFile: () => Promise<File> }[]>;
};

async function exportLocalBackup(json: string): Promise<{ ok: boolean; message: string }> {
  if (typeof window === "undefined") return { ok: false, message: "No disponible en el servidor." };
  const w = window as FileSystemAccessWindow;
  try {
    if (typeof w.showSaveFilePicker === "function") {
      const handle = await w.showSaveFilePicker({
        suggestedName: LOCAL_BACKUP_FILENAME,
        types: [{ description: "Preferencias StarSeed", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return { ok: true, message: "Copia de seguridad guardada en el archivo elegido." };
    }
  } catch (e: any) {
    // Cancelado por el usuario u otro fallo del picker: cae a descarga clásica.
    if (e?.name === "AbortError") return { ok: false, message: "Guardado cancelado." };
  }
  try {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = LOCAL_BACKUP_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, message: "Copia de seguridad descargada." };
  } catch (e: any) {
    return { ok: false, message: `No se pudo exportar: ${e?.message ?? e}` };
  }
}

async function importLocalBackup(): Promise<{ ok: boolean; text?: string; message: string }> {
  if (typeof window === "undefined") return { ok: false, message: "No disponible en el servidor." };
  const w = window as FileSystemAccessWindow;
  try {
    if (typeof w.showOpenFilePicker === "function") {
      const [handle] = await w.showOpenFilePicker({
        types: [{ description: "Preferencias StarSeed", accept: { "application/json": [".json"] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      const text = await file.text();
      return { ok: true, text, message: "Archivo leído." };
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, message: "Importación cancelada." };
  }
  // Fallback: <input type="file"> clásico envuelto en una promesa.
  return new Promise((resolve) => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve({ ok: false, message: "No se eligió ningún archivo." }); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ ok: true, text: String(reader.result ?? ""), message: "Archivo leído." });
        reader.onerror = () => resolve({ ok: false, message: "No se pudo leer el archivo." });
        reader.readAsText(file);
      };
      input.click();
    } catch (e: any) {
      resolve({ ok: false, message: `No se pudo abrir el selector: ${e?.message ?? e}` });
    }
  });
}

const localProvider: SyncProvider = {
  id: "local",
  label: "Local / este dispositivo",
  description:
    "Sin red: exporta/importa un archivo de respaldo de tus preferencias en este equipo (File System Access donde el navegador lo soporte). Máxima soberanía; no sincroniza solo entre dispositivos.",
  needsConfig: false,
  configFields: [],
  testConnection: async () => {
    const supported = typeof window !== "undefined" && typeof (window as FileSystemAccessWindow).showSaveFilePicker === "function";
    return {
      ok: true,
      message: supported
        ? "Disponible: tu navegador soporta guardar/abrir archivos directamente."
        : "Disponible con descarga/subida de archivo clásica (tu navegador no soporta File System Access).",
    };
  },
  push: async () => {
    const prefs = collectLocalBundle();
    if (Object.keys(prefs).length === 0) return { ok: false, reason: "empty", message: "No hay preferencias locales que exportar todavía." };
    const json = JSON.stringify({ prefs, updated_at: new Date().toISOString() }, null, 2);
    const res = await exportLocalBackup(json);
    return { ok: res.ok, reason: res.ok ? undefined : "error", message: res.message, updatedAt: res.ok ? new Date().toISOString() : undefined };
  },
  pull: async () => {
    const res = await importLocalBackup();
    if (!res.ok || !res.text) return { ok: false, reason: "error", message: res.message };
    try {
      const parsed = JSON.parse(res.text);
      const prefs = parsed?.prefs && typeof parsed.prefs === "object" ? parsed.prefs : parsed;
      if (!prefs || typeof prefs !== "object") return { ok: false, reason: "empty", message: "El archivo no tiene un formato reconocible." };
      const applied = applyBundle(prefs as Record<string, unknown>);
      return { ok: true, message: `Ajustes recuperados del archivo (${applied.length}).`, applied, updatedAt: parsed?.updated_at };
    } catch {
      return { ok: false, reason: "error", message: "El archivo no es un JSON válido." };
    }
  },
};

/* ═══════════════════════════ Registro ═══════════════════════════ */

/** Registro de proveedores disponibles. Añadir uno nuevo = un objeto más aquí. */
export const SYNC_PROVIDERS: SyncProvider[] = [officialProvider, ownSupabaseProvider, localProvider];

export function getSyncProvider(id: SyncProviderId): SyncProvider {
  return SYNC_PROVIDERS.find((p) => p.id === id) ?? officialProvider;
}

/* ═══════════════════════════ Selección activa (por dispositivo/cuenta) ═══════════════════════════ */

export const ACTIVE_PROVIDER_KEY = "starseed.sync.provider.v1";
/** Versión del esquema de selección (patrón DEFAULTS_VERSION del repo). */
export const SYNC_PROVIDER_SCHEMA_VERSION = 1;

interface StoredSelection {
  version: number;
  providerId: SyncProviderId;
}

/**
 * Proveedor de sincronización ACTIVO para este dispositivo/cuenta. Por
 * defecto "official" (comportamiento de HOY): el usuario tiene que elegir
 * explícitamente otro para que algo cambie. Nunca lanza.
 */
export function activeSyncProviderId(): SyncProviderId {
  if (!isClient()) return "official";
  try {
    const raw = window.localStorage.getItem(ACTIVE_PROVIDER_KEY);
    if (!raw) return "official";
    const p = JSON.parse(raw) as Partial<StoredSelection>;
    if (p && typeof p.providerId === "string" && p.providerId) return p.providerId;
    return "official";
  } catch {
    return "official";
  }
}

/** Cambia el proveedor activo de sincronización de este dispositivo/cuenta. */
export function setActiveSyncProvider(id: SyncProviderId): void {
  if (!isClient()) return;
  try {
    const payload: StoredSelection = { version: SYNC_PROVIDER_SCHEMA_VERSION, providerId: id };
    window.localStorage.setItem(ACTIVE_PROVIDER_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent(SYNC_PROVIDER_EVENT, { detail: { providerId: id } }));
  } catch {
    /* cuota/modo privado: degrada en silencio */
  }
}

/** Evento emitido al cambiar de proveedor activo (para refrescar paneles). */
export const SYNC_PROVIDER_EVENT = "starseed:sync-provider-changed";

/** Azúcar: el proveedor activo ya resuelto a su implementación. */
export function activeSyncProvider(): SyncProvider {
  return getSyncProvider(activeSyncProviderId());
}
