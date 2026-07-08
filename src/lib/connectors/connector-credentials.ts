/*
 * Conectores · Credenciales por usuario + Modo de selección
 * ---------------------------------------------------------------------------
 * Contrato compartido entre el Hub de Conectores por usuario (UI) y el router
 * de Astraura (src/ai/astraura/provider-resolution.ts / router.ts) para que
 * cada usuario pueda conectar OPCIONALMENTE sus propias cuentas/credenciales
 * por servicio, sin que el sistema deje de funcionar con los defaults
 * gratis/OSS (CLAUDE.md · §3 Ciberdelia + §6 Invariantes · Identidad Soberana).
 *
 * DOS ALMACENES SEPARADOS A PROPÓSITO:
 *
 *  1) CREDENCIALES  → localStorage['starseed.connectors.creds.v1']
 *     Secreto/local. Vive SOLO en este navegador. JAMÁS se añade a
 *     `SYNCED_KEYS` / `SYNCED_PREFIXES` (ver src/lib/settings-sync.ts) ni a
 *     ningún otro mecanismo de sincronización de cuenta — mismo patrón que
 *     `starseed.ai.providers` (src/ai/client/providerStore.ts). Si algún día
 *     se quiere un respaldo cifrado opcional, debe ser un mecanismo EXPLÍCITO
 *     y aparte, nunca el sync automático de preferencias.
 *
 *  2) MODO DE SELECCIÓN → localStorage['starseed.connectors.mode.v1']
 *     NO es secreto (solo dice "prefiero automático / mi cuenta / solo
 *     gratis"), así que SÍ viaja con la cuenta vía `SYNCED_KEYS`.
 *
 * Categorías y catálogo de servicios: este módulo NO los redefine ni
 * duplica — reutiliza `ConnectorCategory` de `./model` (y `BUILTIN_CONNECTORS`
 * de `./registry` para quien consuma este store) como fuente de verdad única.
 *
 * Todo SSR-safe y defensivo: nada lanza; sin `window` degrada a valores
 * neutros. Notifica cambios con el evento 'starseed:connectors' (mismo
 * nombre que usa `./store`, a propósito: cualquier UI de conectores puede
 * escuchar un único evento para refrescarse, sin acoplarse entre módulos).
 */

import type { ConnectorCategory } from "./model";

// ════════════════════════════════════════════════════════════════
//  Utilidades SSR-safe (autocontenidas, sin depender de otros módulos)
// ════════════════════════════════════════════════════════════════

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
    /* cuota / modo privado: degrada en silencio */
  }
}

/** Evento único para toda UI de conectores (compartido con `./store`). */
export const CONNECTORS_PREFS_EVENT = "starseed:connectors";

function notify(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(CONNECTORS_PREFS_EVENT));
  } catch {
    /* noop */
  }
}

// ════════════════════════════════════════════════════════════════
//  1) CREDENCIALES por servicio — LOCAL, NUNCA SINCRONIZADO
// ════════════════════════════════════════════════════════════════

export const CONNECTOR_CREDENTIALS_KEY = "starseed.connectors.creds.v1";

/** Credenciales/config que el usuario pegó para UN servicio (por su id). */
export interface ConnectorCredentialData {
  /** Campos libres (token, endpoint, workspace…) según lo que pida el servicio. */
  fields: Record<string, string>;
  /** Si el usuario activó explícitamente esta cuenta propia. */
  enabled: boolean;
  /** ISO de la última modificación (diagnóstico). */
  updatedAt?: string;
}

/** Mapa persistido: id de servicio → sus credenciales/config de usuario. */
export type ConnectorCredentialsMap = Record<string, ConnectorCredentialData>;

function isCredentialData(x: unknown): x is ConnectorCredentialData {
  return !!x && typeof x === "object" && typeof (x as { enabled?: unknown }).enabled === "boolean";
}

function coerceCredentialsMap(raw: unknown): ConnectorCredentialsMap {
  const out: ConnectorCredentialsMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCredentialData(val)) continue;
    const rawFields = (val as ConnectorCredentialData).fields;
    const fields: Record<string, string> =
      rawFields && typeof rawFields === "object"
        ? Object.fromEntries(
            Object.entries(rawFields as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : {};
    out[id] = {
      fields,
      enabled: !!val.enabled,
      updatedAt: typeof val.updatedAt === "string" ? val.updatedAt : undefined,
    };
  }
  return out;
}

/** Lee TODO el mapa de credenciales locales (defensivo; {} si SSR/vacío/corrupto). */
export function allConnectorCredentials(): ConnectorCredentialsMap {
  return coerceCredentialsMap(readJson<unknown>(CONNECTOR_CREDENTIALS_KEY));
}

/** Lee las credenciales guardadas de UN servicio (o null si no hay nada). */
export function connectorCredentials(serviceId: string): ConnectorCredentialData | null {
  const map = allConnectorCredentials();
  return map[serviceId] ?? null;
}

/**
 * Fija/parcha las credenciales de un servicio (merge sobre lo existente).
 * Si se aportan `fields` con algún valor no vacío y no se especifica
 * `enabled`, se activa automáticamente (mismo criterio que `setConnectorConfig`
 * del hub clásico en `./store`, para que la experiencia sea consistente).
 * Persiste SOLO en este navegador y notifica `CONNECTORS_PREFS_EVENT`.
 */
export function setConnectorCredentials(
  serviceId: string,
  data: Partial<Pick<ConnectorCredentialData, "fields" | "enabled">>,
): ConnectorCredentialData {
  const map = allConnectorCredentials();
  const prev = map[serviceId] ?? { fields: {}, enabled: false };
  const nextFields = data.fields ? { ...prev.fields, ...data.fields } : prev.fields;
  const gotValue = Object.values(data.fields ?? {}).some((v) => (v ?? "").trim().length > 0);
  const next: ConnectorCredentialData = {
    fields: nextFields,
    enabled: data.enabled !== undefined ? data.enabled : gotValue ? true : prev.enabled,
    updatedAt: new Date().toISOString(),
  };
  map[serviceId] = next;
  writeJson(CONNECTOR_CREDENTIALS_KEY, map);
  notify();
  return next;
}

/** Olvida por completo las credenciales de un servicio (desconectar de verdad). */
export function clearConnectorCredentials(serviceId: string): void {
  const map = allConnectorCredentials();
  if (!(serviceId in map)) return;
  delete map[serviceId];
  writeJson(CONNECTOR_CREDENTIALS_KEY, map);
  notify();
}

/** ¿El usuario conectó su propia cuenta para este servicio (activada)? */
export function hasConnectorCredentials(serviceId: string): boolean {
  return !!connectorCredentials(serviceId)?.enabled;
}

// ════════════════════════════════════════════════════════════════
//  2) MODO DE SELECCIÓN — sincronizado con la cuenta (SIN secretos)
// ════════════════════════════════════════════════════════════════

export const CONNECTOR_MODE_KEY = "starseed.connectors.mode.v1";

/**
 * Cómo elige Astraura el conector activo de una categoría:
 *  • "auto"        → Astraura decide (por defecto): usa tu cuenta conectada
 *                    cuando encaja con la tarea; si no, el motor gratis/OSS.
 *  • "prefer-own"  → si conectaste una cuenta en esa categoría, se usa SIEMPRE
 *                    que esté disponible, por delante del motor gratis.
 *  • "only-free"   → nunca se usan cuentas de terceros, aunque las conectes;
 *                    solo gratis / propio / código abierto.
 */
export type ConnectorMode = "auto" | "prefer-own" | "only-free";

export const CONNECTOR_MODE_DEFAULT: ConnectorMode = "auto";

const VALID_MODES = new Set<ConnectorMode>(["auto", "prefer-own", "only-free"]);

function isValidMode(v: unknown): v is ConnectorMode {
  return typeof v === "string" && VALID_MODES.has(v as ConnectorMode);
}

/** Preferencia de modo: global + overrides opcionales por categoría. */
export interface ConnectorModePrefs {
  global: ConnectorMode;
  /**
   * Override por categoría. La clave normalmente es un `ConnectorCategory`
   * de `./model`, pero se deja como `string` para no acoplar este store a esa
   * unión (p.ej. grupos del hub sin categoría formal todavía).
   */
  perCategory?: Record<string, ConnectorMode>;
}

function coerceModePrefs(raw: unknown): ConnectorModePrefs {
  if (!raw || typeof raw !== "object") return { global: CONNECTOR_MODE_DEFAULT };
  const r = raw as Partial<ConnectorModePrefs>;
  const global = isValidMode(r.global) ? r.global : CONNECTOR_MODE_DEFAULT;
  const perCategory: Record<string, ConnectorMode> = {};
  if (r.perCategory && typeof r.perCategory === "object") {
    for (const [k, v] of Object.entries(r.perCategory as Record<string, unknown>)) {
      if (isValidMode(v)) perCategory[k] = v;
    }
  }
  return Object.keys(perCategory).length ? { global, perCategory } : { global };
}

/** Lee la preferencia de modo completa (defensivo; nunca lanza). */
export function getConnectorModePrefs(): ConnectorModePrefs {
  return coerceModePrefs(readJson<unknown>(CONNECTOR_MODE_KEY));
}

/**
 * Modo EFECTIVO para una categoría (o el global si no se pide categoría o no
 * hay override). Acepta cualquier string además de `ConnectorCategory` para no
 * acoplarse a esa unión.
 */
export function getConnectorMode(categoryId?: string | ConnectorCategory): ConnectorMode {
  const prefs = getConnectorModePrefs();
  if (categoryId && prefs.perCategory?.[categoryId]) return prefs.perCategory[categoryId];
  return prefs.global;
}

/**
 * Fija el modo. Sin `categoryId` → cambia el GLOBAL. Con `categoryId` → fija
 * un override solo para esa categoría (el resto sigue el global). Persiste y
 * notifica `CONNECTORS_PREFS_EVENT`.
 */
export function setConnectorMode(mode: ConnectorMode, categoryId?: string | ConnectorCategory): void {
  if (!isValidMode(mode)) return;
  const prefs = getConnectorModePrefs();
  if (!categoryId) {
    writeJson(CONNECTOR_MODE_KEY, { global: mode, perCategory: prefs.perCategory });
  } else {
    const perCategory = { ...(prefs.perCategory ?? {}), [categoryId]: mode };
    writeJson(CONNECTOR_MODE_KEY, { global: prefs.global, perCategory });
  }
  notify();
}

/** Quita el override de una categoría (vuelve a heredar el modo global). */
export function clearConnectorModeOverride(categoryId: string | ConnectorCategory): void {
  const prefs = getConnectorModePrefs();
  if (!prefs.perCategory || !(categoryId in prefs.perCategory)) return;
  const perCategory = { ...prefs.perCategory };
  delete perCategory[categoryId];
  writeJson(CONNECTOR_MODE_KEY, {
    global: prefs.global,
    perCategory: Object.keys(perCategory).length ? perCategory : undefined,
  });
  notify();
}
