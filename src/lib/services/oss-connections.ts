"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — CONEXIONES a servicios open-source (store por usuario/cerebro)
// ----------------------------------------------------------------------------
// El CATÁLOGO (`oss-services.ts`) describe QUÉ servicios existen y están
// preintegrados por defecto. Este módulo guarda las CONEXIONES concretas del
// usuario: por servicio, una o VARIAS conexiones, cada una con su endpoint /
// clave / webhook y un `scope` (usuario · cerebro · página · contexto). Así el
// usuario puede tener, p.ej., dos servidores Ollama distintos (uno en casa,
// otro en un cerebro) y elegir cuál es el "por defecto" para la función LLM en
// cada contexto.
//
// Persistencia (calcada de `settings-sync.ts`):
//   • Fuente de verdad offline: localStorage `starseed.oss.connections.v1`.
//   • Espejo opcional en la cuenta soberana: `user_settings.prefs.ossServices`
//     (Supabase). ADITIVO Y OPT-IN — nada se sube hasta llamar a push; nunca
//     lanza si no hay sesión o falta la tabla.
//
// Seguridad: las claves se guardan como VALOR DE CONEXIÓN del usuario (no se
// comparten con la red ni con otros usuarios; RLS por owner en la cuenta). Aun
// así, el panel avisa de que son credenciales sensibles.
//
// Todo SSR-safe y defensivo: acceso a window/localStorage tras guardas.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  OSS_SERVICES,
  findOssService,
  isKnownOssService,
  type OssService,
  type OssServiceCategory,
} from "@/lib/services/oss-services";

// ── Claves de persistencia ─────────────────────────────────────────────────

export const OSS_CONNECTIONS_KEY = "starseed.oss.connections.v1";
export const OSS_DEFAULTS_KEY = "starseed.oss.defaults.v1";
/** Rama de `user_settings.prefs` donde vive el espejo en la cuenta. */
export const OSS_PREFS_KEY = "ossServices";

// ── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Alcance de una conexión (a QUIÉN/QUÉ aplica):
 *  • "user"       → conexión personal del usuario (global).
 *  • "brain:<id>" → específica de un cerebro.
 *  • "page:<id>"  → específica de una página/entidad.
 *  • "context"    → conexión efímera/contextual (sesión de trabajo actual).
 */
export type OssScope = "user" | "context" | `brain:${string}` | `page:${string}`;

/** Una conexión concreta del usuario a un servicio del catálogo. */
export interface OssConnection {
  /** Id estable de la conexión. */
  id: string;
  /** Servicio del catálogo al que apunta (`OssService.id`). */
  serviceId: string;
  /** Etiqueta legible que pone el usuario ("Ollama de casa", "n8n del cerebro"). */
  label: string;
  /** Endpoint / URL base (según el servicio). */
  endpoint?: string;
  /** Clave/credencial (valor de conexión del usuario). */
  apiKey?: string;
  /** URL de webhook (para servicios de tipo webhook). */
  webhook?: string;
  /** Campos extra específicos del servicio (instanceUrl, path…). */
  extra?: Record<string, string>;
  /** Alcance de la conexión. */
  scope: OssScope;
  /** ¿Está activa esta conexión? */
  enabled: boolean;
  /** Epoch ms de creación. */
  createdAt: number;
  /** Epoch ms de última verificación exitosa (si se probó). */
  lastVerifiedAt?: number;
}

/**
 * Preferencia de "conexión por defecto" para una función (category) en un
 * scope dado. La clave del mapa es `${category}@${scope}` (ver `defaultKey`).
 */
export type OssDefaults = Record<string, string>; // clave → connectionId

/** Estado de una prueba de conexión. */
export interface OssTestResult {
  ok: boolean;
  status?: number;
  ms: number;
  message: string;
}

// ── Utilidades base (SSR-safe + defensivas) ─────────────────────────────────

function isClient(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  );
}

function readJson<T>(key: string): T | null {
  if (!isClient()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* cuota / modo privado: degradamos en silencio */
  }
}

function newId(prefix = "conn"): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* sin crypto: fallback */
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Normaliza un scope arbitrario a un `OssScope` válido (cae en "user"). */
export function normalizeScope(v: unknown): OssScope {
  if (typeof v !== "string") return "user";
  if (v === "user" || v === "context") return v;
  if (/^brain:.+/.test(v)) return v as OssScope;
  if (/^page:.+/.test(v)) return v as OssScope;
  return "user";
}

/** Clave estable para la preferencia por-defecto de una función en un scope. */
export function defaultKey(category: OssServiceCategory, scope: OssScope = "user"): string {
  return `${category}@${scope}`;
}

// ── Normalización de conexiones ──────────────────────────────────────────────

function normalizeConnection(raw: unknown): OssConnection | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<OssConnection>;
  const serviceId = typeof r.serviceId === "string" ? r.serviceId : "";
  if (!serviceId) return null;
  const extra =
    r.extra && typeof r.extra === "object"
      ? Object.fromEntries(
          Object.entries(r.extra as Record<string, unknown>)
            .filter(([, v]) => typeof v === "string")
            .map(([k, v]) => [k, v as string]),
        )
      : undefined;
  return {
    id: typeof r.id === "string" && r.id ? r.id : newId(),
    serviceId,
    label:
      typeof r.label === "string" && r.label.trim()
        ? r.label.trim()
        : findOssService(serviceId)?.name ?? serviceId,
    endpoint: typeof r.endpoint === "string" ? r.endpoint : undefined,
    apiKey: typeof r.apiKey === "string" ? r.apiKey : undefined,
    webhook: typeof r.webhook === "string" ? r.webhook : undefined,
    extra: extra && Object.keys(extra).length ? extra : undefined,
    scope: normalizeScope(r.scope),
    enabled: typeof r.enabled === "boolean" ? r.enabled : true,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    lastVerifiedAt:
      typeof r.lastVerifiedAt === "number" ? r.lastVerifiedAt : undefined,
  };
}

function normalizeConnections(raw: unknown): OssConnection[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map(normalizeConnection)
    .filter((c): c is OssConnection => !!c);
}

function normalizeDefaults(raw: unknown): OssDefaults {
  if (!raw || typeof raw !== "object") return {};
  const out: OssDefaults = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

// ── Lectura / escritura del store local ──────────────────────────────────────

/** Lee todas las conexiones del usuario (defensivo). */
export function readConnections(): OssConnection[] {
  return normalizeConnections(readJson<unknown>(OSS_CONNECTIONS_KEY));
}

/** Persiste la lista completa de conexiones. */
export function writeConnections(list: OssConnection[]): void {
  writeJson(OSS_CONNECTIONS_KEY, normalizeConnections(list));
  notifyChange();
}

/** Lee el mapa de conexiones-por-defecto por función/scope. */
export function readDefaults(): OssDefaults {
  return normalizeDefaults(readJson<unknown>(OSS_DEFAULTS_KEY));
}

/** Persiste el mapa de conexiones-por-defecto. */
export function writeDefaults(defs: OssDefaults): void {
  writeJson(OSS_DEFAULTS_KEY, normalizeDefaults(defs));
  notifyChange();
}

// ── Notificación de cambios (para que los hooks re-lean) ─────────────────────

const OSS_EVENT = "starseed:oss-connections";

function notifyChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OSS_EVENT));
  } catch {
    /* noop */
  }
}

// ── Operaciones CRUD sobre conexiones ────────────────────────────────────────

/**
 * Crea una conexión para un servicio. Defensivo: exige un `serviceId` conocido.
 * Devuelve la conexión creada (o null si el servicio no existe).
 */
export function addConnection(
  input: Partial<OssConnection> & { serviceId: string },
): OssConnection | null {
  if (!isKnownOssService(input.serviceId)) return null;
  const created = normalizeConnection({
    ...input,
    id: input.id || newId(),
    createdAt: Date.now(),
  });
  if (!created) return null;
  const list = readConnections();
  list.unshift(created);
  writeConnections(list);
  return created;
}

/** Actualiza una conexión por id. Devuelve la conexión actualizada o null. */
export function updateConnection(
  id: string,
  patch: Partial<Omit<OssConnection, "id" | "serviceId" | "createdAt">>,
): OssConnection | null {
  const list = readConnections();
  let updated: OssConnection | null = null;
  const next = list.map((c) => {
    if (c.id !== id) return c;
    updated = {
      ...c,
      ...patch,
      scope: patch.scope ? normalizeScope(patch.scope) : c.scope,
    };
    return updated;
  });
  if (updated) writeConnections(next);
  return updated;
}

/** Elimina una conexión por id. También limpia cualquier default que la use. */
export function removeConnection(id: string): void {
  const list = readConnections().filter((c) => c.id !== id);
  writeConnections(list);
  const defs = readDefaults();
  let changed = false;
  for (const k of Object.keys(defs)) {
    if (defs[k] === id) {
      delete defs[k];
      changed = true;
    }
  }
  if (changed) writeDefaults(defs);
}

/** Todas las conexiones de un servicio. */
export function connectionsForService(serviceId: string): OssConnection[] {
  return readConnections().filter((c) => c.serviceId === serviceId);
}

/** Todas las conexiones de un scope. */
export function connectionsForScope(scope: OssScope): OssConnection[] {
  const s = normalizeScope(scope);
  return readConnections().filter((c) => c.scope === s);
}

/**
 * Marca una conexión como la "por defecto" para una función (category) en un
 * scope. Valida que la conexión exista y sea de esa función.
 */
export function setDefaultFor(
  category: OssServiceCategory,
  connectionId: string,
  scope: OssScope = "user",
): boolean {
  const conn = readConnections().find((c) => c.id === connectionId);
  if (!conn) return false;
  const svc = findOssService(conn.serviceId);
  if (!svc || svc.category !== category) return false;
  const defs = readDefaults();
  defs[defaultKey(category, scope)] = connectionId;
  writeDefaults(defs);
  return true;
}

/** Quita la preferencia por defecto de una función en un scope. */
export function clearDefaultFor(
  category: OssServiceCategory,
  scope: OssScope = "user",
): void {
  const defs = readDefaults();
  const key = defaultKey(category, scope);
  if (key in defs) {
    delete defs[key];
    writeDefaults(defs);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// resolveServiceFor — FUNCIÓN PURA de resolución (la usarán las tools de gen.)
// ════════════════════════════════════════════════════════════════════════════

/** Qué devuelve la resolución de una función. */
export interface ResolvedService {
  /** El servicio del catálogo elegido. */
  service: OssService;
  /** La conexión activa elegida (o null si ninguna conexión aún). */
  connection: OssConnection | null;
  /** Endpoint efectivo a usar (conexión → defaultEndpoint del servicio). */
  endpoint: string;
  /** true si viene de una conexión explícita del usuario; false si es fallback. */
  fromUserConnection: boolean;
}

/**
 * Resuelve QUÉ servicio y conexión usar para una función (category), opcionalmente
 * priorizando un scope. Función PURA (lee el store local, sin DB), pensada para
 * que las tools de generación (LLM/STT/TTS/imagen/…) pregunten "¿con qué conecto?".
 *
 * Orden de preferencia:
 *   1) default explícito para (category, scope) → su conexión.
 *   2) default explícito para (category, "user") → su conexión.
 *   3) primera conexión ACTIVA de esa función en el scope pedido.
 *   4) primera conexión ACTIVA de esa función en "user".
 *   5) primera conexión ACTIVA de esa función en cualquier scope.
 *   6) sin conexiones: el primer servicio del catálogo de esa función,
 *      con su `defaultEndpoint` (o vacío si es browser-local).
 *
 * Nunca lanza: si no hay ningún servicio de esa función, devuelve null.
 */
export function resolveServiceFor(
  category: OssServiceCategory,
  scope: OssScope = "user",
): ResolvedService | null {
  const s = normalizeScope(scope);
  const conns = readConnections();
  const defs = readDefaults();

  const byId = (id: string | undefined) =>
    id ? conns.find((c) => c.id === id && c.enabled) ?? null : null;

  // 1 & 2 — defaults explícitos.
  let connection =
    byId(defs[defaultKey(category, s)]) ?? byId(defs[defaultKey(category, "user")]);

  // Conexiones activas de esta función.
  const activeOfCategory = conns.filter(
    (c) => c.enabled && findOssService(c.serviceId)?.category === category,
  );

  // 3, 4, 5 — primera conexión activa por preferencia de scope.
  if (!connection) {
    connection =
      activeOfCategory.find((c) => c.scope === s) ??
      activeOfCategory.find((c) => c.scope === "user") ??
      activeOfCategory[0] ??
      null;
  }

  // Determina el servicio: el de la conexión, o el primero del catálogo.
  const service = connection
    ? findOssService(connection.serviceId) ??
      OSS_SERVICES.find((x) => x.category === category) ??
      null
    : OSS_SERVICES.find((x) => x.category === category) ?? null;

  if (!service) return null;

  const endpoint =
    connection?.endpoint?.trim() ||
    (connection?.extra?.instanceUrl ?? "").trim() ||
    service.defaultEndpoint ||
    "";

  return {
    service,
    connection: connection ?? null,
    endpoint,
    fromUserConnection: !!connection,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// testConnection — sonda HTTP defensiva con timeout
// ════════════════════════════════════════════════════════════════════════════

/**
 * Prueba una conexión con un fetch defensivo y timeout. Para servicios con
 * `testPath` (p.ej. Ollama `/api/tags`) hace un GET a `endpoint + testPath`.
 * Para browser-local devuelve OK sin red (el "servidor" es el navegador).
 *
 * Nunca lanza: siempre devuelve un `OssTestResult`. Un fallo de red/tiempo se
 * reporta como `ok:false` con mensaje explicativo. Marca `lastVerifiedAt` en la
 * conexión si la prueba fue exitosa.
 */
export async function testConnection(
  connection: OssConnection,
  timeoutMs = 6000,
): Promise<OssTestResult> {
  const started =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = () =>
    Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        started,
    );

  const service = findOssService(connection.serviceId);
  if (!service) {
    return { ok: false, ms: elapsed(), message: "Servicio desconocido en el catálogo." };
  }

  // Servicios que corren en el navegador: no hay endpoint que sondear.
  if (service.connectionKind === "browser-local" && !connection.endpoint) {
    return {
      ok: true,
      ms: elapsed(),
      message: "Corre en el navegador: no requiere endpoint remoto.",
    };
  }

  const base = (connection.endpoint || service.defaultEndpoint || "").trim();
  if (!base) {
    return {
      ok: false,
      ms: elapsed(),
      message: "Falta el endpoint. Añade la URL base para poder probar.",
    };
  }

  const path = service.testPath ?? "";
  const url = path
    ? base.replace(/\/$/, "") + (path.startsWith("/") ? path : `/${path}`)
    : base;

  // AbortController para el timeout (SSR-safe: sólo se usa en cliente/tools).
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      }, timeoutMs)
    : null;

  try {
    const headers: Record<string, string> = {};
    if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller?.signal,
      // No mandamos cookies a endpoints de terceros.
      credentials: "omit",
      mode: "cors",
    });
    if (timer) clearTimeout(timer);
    const ok = res.ok;
    // Marca verificación exitosa en el store (best-effort).
    if (ok) {
      try {
        updateConnection(connection.id, { lastVerifiedAt: Date.now() });
      } catch {
        /* noop */
      }
    }
    return {
      ok,
      status: res.status,
      ms: elapsed(),
      message: ok
        ? `Conexión correcta (HTTP ${res.status}).`
        : `Respondió con HTTP ${res.status}. Revisa el endpoint o las credenciales.`,
    };
  } catch (e: unknown) {
    if (timer) clearTimeout(timer);
    const aborted =
      (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      ms: elapsed(),
      message: aborted
        ? `Tiempo de espera agotado (${timeoutMs} ms). ¿El servicio está levantado y accesible?`
        : `No se pudo conectar. Puede ser CORS, que el servicio no esté corriendo, o una URL incorrecta.`,
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Espejo opcional en la cuenta soberana (user_settings.prefs.ossServices)
// ════════════════════════════════════════════════════════════════════════════

export interface OssSyncResult {
  ok: boolean;
  reason?: "no-session" | "no-table" | "empty" | "error";
  message: string;
  updatedAt?: string;
}

async function getUserId(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Bundle que viaja a la cuenta (conexiones + defaults). */
function collectBundle(): { connections: OssConnection[]; defaults: OssDefaults } {
  return { connections: readConnections(), defaults: readDefaults() };
}

/**
 * Sube conexiones+defaults a `user_settings.prefs.ossServices` sin pisar el
 * resto de prefs (lee, mezcla, upsert). Nunca lanza.
 */
export async function pushOssConnections(): Promise<OssSyncResult> {
  const userId = await getUserId();
  if (!userId)
    return {
      ok: false,
      reason: "no-session",
      message: "Inicia sesión con tu cuenta StarSeed para sincronizar tus servicios.",
    };
  const bundle = collectBundle();
  if (!bundle.connections.length && !Object.keys(bundle.defaults).length)
    return { ok: false, reason: "empty", message: "No hay conexiones que subir todavía." };
  try {
    const sb = createClient();
    // Lee prefs actuales para no pisar otras ramas.
    const { data: current } = await sb
      .from("user_settings")
      .select("prefs")
      .eq("user_id", userId)
      .maybeSingle();
    const prefs =
      current?.prefs && typeof current.prefs === "object"
        ? (current.prefs as Record<string, unknown>)
        : {};
    prefs[OSS_PREFS_KEY] = bundle;
    const { error } = await sb
      .from("user_settings")
      .upsert(
        { user_id: userId, prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) {
      const missing = /relation .*user_settings.* does not exist/i.test(error.message);
      return {
        ok: false,
        reason: missing ? "no-table" : "error",
        message: missing
          ? "Falta crear la tabla user_settings en Supabase (ver settings-sync). Tus servicios siguen guardados localmente."
          : `No se pudo subir: ${error.message}`,
      };
    }
    return {
      ok: true,
      message: "Servicios guardados en tu cuenta StarSeed.",
      updatedAt: new Date().toISOString(),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      reason: "error",
      message: `Error de red al subir: ${(e as { message?: string })?.message ?? e}`,
    };
  }
}

/**
 * Descarga conexiones+defaults desde la cuenta y los aplica al store local.
 * Nunca lanza. Devuelve cuántas conexiones se aplicaron.
 */
export async function pullOssConnections(): Promise<OssSyncResult & { applied?: number }> {
  const userId = await getUserId();
  if (!userId)
    return {
      ok: false,
      reason: "no-session",
      message: "Inicia sesión con tu cuenta StarSeed para recuperar tus servicios.",
    };
  try {
    const sb = createClient();
    const { data, error } = await sb
      .from("user_settings")
      .select("prefs, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      const missing = /relation .*user_settings.* does not exist/i.test(error.message);
      return {
        ok: false,
        reason: missing ? "no-table" : "error",
        message: missing
          ? "Falta crear la tabla user_settings en Supabase (ver settings-sync)."
          : `No se pudo descargar: ${error.message}`,
      };
    }
    const prefs =
      data?.prefs && typeof data.prefs === "object"
        ? (data.prefs as Record<string, unknown>)
        : {};
    const branch = prefs[OSS_PREFS_KEY];
    if (!branch || typeof branch !== "object")
      return { ok: false, reason: "empty", message: "Tu cuenta aún no tiene servicios guardados." };
    const b = branch as { connections?: unknown; defaults?: unknown };
    const conns = normalizeConnections(b.connections);
    const defs = normalizeDefaults(b.defaults);
    writeConnections(conns);
    writeDefaults(defs);
    return {
      ok: true,
      message: `Servicios recuperados de tu cuenta (${conns.length}).`,
      applied: conns.length,
      updatedAt: data?.updated_at,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      reason: "error",
      message: `Error de red al descargar: ${(e as { message?: string })?.message ?? e}`,
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// useOssConnections() — hook de React (SSR-safe)
// ════════════════════════════════════════════════════════════════════════════

export interface UseOssConnections {
  /** Catálogo completo de servicios (referencia estable). */
  services: OssService[];
  /** Todas las conexiones del usuario. */
  connections: OssConnection[];
  /** Mapa de conexiones-por-defecto por función/scope. */
  defaults: OssDefaults;
  /** Crea una conexión (devuelve la creada o null). */
  addConnection: (
    input: Partial<OssConnection> & { serviceId: string },
  ) => OssConnection | null;
  /** Actualiza una conexión por id. */
  updateConnection: (
    id: string,
    patch: Partial<Omit<OssConnection, "id" | "serviceId" | "createdAt">>,
  ) => OssConnection | null;
  /** Elimina una conexión por id. */
  removeConnection: (id: string) => void;
  /** Conexiones de un servicio o de un scope (según el argumento). */
  connectionsFor: (serviceIdOrScope: string) => OssConnection[];
  /** Prueba una conexión (fetch defensivo + timeout). */
  testConnection: (connection: OssConnection, timeoutMs?: number) => Promise<OssTestResult>;
  /** Marca una conexión como la por defecto para una función/scope. */
  setDefaultFor: (
    category: OssServiceCategory,
    connectionId: string,
    scope?: OssScope,
  ) => boolean;
  /** Quita la preferencia por defecto de una función/scope. */
  clearDefaultFor: (category: OssServiceCategory, scope?: OssScope) => void;
  /** Resuelve la conexión activa para una función (pura, sin DB). */
  resolveServiceFor: (
    category: OssServiceCategory,
    scope?: OssScope,
  ) => ResolvedService | null;
  /** Sube el estado a la cuenta soberana. */
  pushToAccount: () => Promise<OssSyncResult>;
  /** Descarga el estado de la cuenta soberana. */
  pullFromAccount: () => Promise<OssSyncResult & { applied?: number }>;
  /** Fuerza una relectura del store local. */
  refresh: () => void;
}

/**
 * Hook reactivo sobre el store. Relee ante cambios locales (evento) y
 * cambios de otras pestañas (`storage`). SSR-safe: en el servidor devuelve el
 * catálogo y listas vacías; hidrata en el primer efecto del cliente.
 */
export function useOssConnections(): UseOssConnections {
  const [connections, setConnections] = useState<OssConnection[]>([]);
  const [defaults, setDefaults] = useState<OssDefaults>({});
  const mounted = useRef(false);

  const refresh = useCallback(() => {
    setConnections(readConnections());
    setDefaults(readDefaults());
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    const onChange = () => {
      if (mounted.current) refresh();
    };
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === OSS_CONNECTIONS_KEY ||
        e.key === OSS_DEFAULTS_KEY ||
        e.key === null
      ) {
        onChange();
      }
    };
    window.addEventListener(OSS_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      mounted.current = false;
      window.removeEventListener(OSS_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  const add = useCallback<UseOssConnections["addConnection"]>((input) => {
    const c = addConnection(input);
    refresh();
    return c;
  }, [refresh]);

  const update = useCallback<UseOssConnections["updateConnection"]>(
    (id, patch) => {
      const c = updateConnection(id, patch);
      refresh();
      return c;
    },
    [refresh],
  );

  const remove = useCallback<UseOssConnections["removeConnection"]>((id) => {
    removeConnection(id);
    refresh();
  }, [refresh]);

  const connectionsFor = useCallback<UseOssConnections["connectionsFor"]>(
    (serviceIdOrScope) => {
      // Si coincide con un scope válido, filtra por scope; si no, por servicio.
      if (
        serviceIdOrScope === "user" ||
        serviceIdOrScope === "context" ||
        /^brain:.+/.test(serviceIdOrScope) ||
        /^page:.+/.test(serviceIdOrScope)
      ) {
        return connections.filter((c) => c.scope === serviceIdOrScope);
      }
      return connections.filter((c) => c.serviceId === serviceIdOrScope);
    },
    [connections],
  );

  const setDefault = useCallback<UseOssConnections["setDefaultFor"]>(
    (category, connectionId, scope = "user") => {
      const ok = setDefaultFor(category, connectionId, scope);
      refresh();
      return ok;
    },
    [refresh],
  );

  const clearDefault = useCallback<UseOssConnections["clearDefaultFor"]>(
    (category, scope = "user") => {
      clearDefaultFor(category, scope);
      refresh();
    },
    [refresh],
  );

  const resolve = useCallback<UseOssConnections["resolveServiceFor"]>(
    (category, scope = "user") => resolveServiceFor(category, scope),
    // depende de connections/defaults para recomputar cuando cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connections, defaults],
  );

  return {
    services: OSS_SERVICES,
    connections,
    defaults,
    addConnection: add,
    updateConnection: update,
    removeConnection: remove,
    connectionsFor,
    testConnection,
    setDefaultFor: setDefault,
    clearDefaultFor: clearDefault,
    resolveServiceFor: resolve,
    pushToAccount: pushOssConnections,
    pullFromAccount: pullOssConnections,
    refresh,
  };
}
