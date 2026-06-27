"use client";

/**
 * SERVICE ROUTES — modelo universal de "proveedor tri-fuente" de StarSeed OS.
 *
 * Para CUALQUIER funcionalidad (dominio: "ai", "storage", "senses", "memory",
 * "mail", "maps", …) el usuario puede elegir su(s) fuente(s) de servicio entre
 * tres opciones SELECCIONABLES SIMULTÁNEAMENTE e interconectadas:
 *
 *   • propio    — Servidor propio (tu endpoint/instancia autoalojada).
 *   • starseed  — Servidor StarSeed (la infraestructura de la red).
 *   • externo   — Servidor externo (un proveedor de terceros).
 *
 * Cada fuente tiene su propia configuración (endpoint, referencia de clave,
 * parámetros) y un `weight`. La forma en que las fuentes habilitadas se mezclan
 * o enrutan se define con la MODULACIÓN:
 *
 *   • prioridad — se usa la fuente habilitada de mayor prioridad (orden);
 *                 las demás quedan como respaldo manual.
 *   • balanceo  — se reparte la carga entre las fuentes según su `weight`.
 *   • fusion    — se consultan varias fuentes y se fusionan/combinan resultados.
 *   • failover  — se intenta la primaria; si falla, se cae a la siguiente.
 *
 * Persistencia: tabla `service_routes(owner, domain, sources jsonb,
 * modulation jsonb, updated_at)` con índice único (owner, domain), RLS por
 * owner y Realtime habilitado. Patrón calcado de `lib/senses/senses.ts`:
 * uid() + normalize + defaults + upsert(onConflict) + espejo en window.
 *
 * SEGURIDAD DE CLAVES: NUNCA se guardan secretos en claro. `key_ref` es una
 * REFERENCIA simbólica a una clave que vive cifrada en la bóveda del navegador
 * (ver `ai/client/keyStorage.ts`, AES-GCM + PBKDF2). La fila sólo almacena el
 * nombre/identificador de la referencia, jamás el secreto.
 *
 * SSR-safe: todo acceso a window va detrás de guardas `typeof window`.
 */

import { createClient } from "@/utils/supabase/client";
import { onTableChange, type RealtimePayload } from "@/lib/realtime/realtime";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type SourceKind = "propio" | "starseed" | "externo";

export type ModulationMode = "prioridad" | "balanceo" | "fusion" | "failover";

/** Una fuente de servicio para un dominio. */
export interface ServiceSource {
  kind: SourceKind;
  /** ¿Está activa esta fuente? Las tres pueden estar activas a la vez. */
  enabled: boolean;
  /** Peso relativo (para balanceo/fusión) y orden implícito de prioridad. */
  weight: number;
  /** Endpoint/base URL de la fuente (vacío para StarSeed por defecto). */
  endpoint: string;
  /** REFERENCIA a una clave en la bóveda local (NUNCA el secreto en claro). */
  key_ref: string;
  /** Parámetros y dinámica específica de la fuente (modelo, región, etc.). */
  config: Record<string, unknown>;
}

/** Configuración de modulación: cómo se mezclan/enrutan las fuentes activas. */
export interface Modulation {
  mode: ModulationMode;
  /** Notas opcionales del usuario sobre la dinámica de enrutado. */
  note?: string;
}

/** Fila de `service_routes`. */
export interface ServiceRoute {
  domain: string;
  sources: ServiceSource[];
  modulation: Modulation;
  updated_at?: string;
}

// ── Defaults sensatos (StarSeed ON; propio/externo disponibles OFF) ──────────

const KIND_ORDER: SourceKind[] = ["propio", "starseed", "externo"];

/** Crea una fuente por defecto para un `kind`. */
export function defaultSource(kind: SourceKind): ServiceSource {
  const enabled = kind === "starseed"; // StarSeed habilitado por defecto.
  return {
    kind,
    enabled,
    weight: enabled ? 1 : 0,
    endpoint: "",
    key_ref: "",
    config: {},
  };
}

/** Conjunto de fuentes por defecto (las tres, sólo StarSeed activa). */
export function defaultSources(): ServiceSource[] {
  return KIND_ORDER.map((k) => defaultSource(k));
}

export function defaultModulation(): Modulation {
  return { mode: "prioridad" };
}

/** Ruta por defecto para un dominio. */
export function defaultRoute(domain: string): ServiceRoute {
  return {
    domain,
    sources: defaultSources(),
    modulation: defaultModulation(),
  };
}

// ── Normalización (tolerante a datos parciales/antiguos) ─────────────────────

const VALID_MODES: ModulationMode[] = [
  "prioridad",
  "balanceo",
  "fusion",
  "failover",
];

function normalizeSource(raw: unknown, kind: SourceKind): ServiceSource {
  const base = defaultSource(kind);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<ServiceSource>;
  return {
    kind,
    enabled: typeof r.enabled === "boolean" ? r.enabled : base.enabled,
    weight:
      typeof r.weight === "number" && Number.isFinite(r.weight)
        ? Math.max(0, r.weight)
        : base.weight,
    endpoint: typeof r.endpoint === "string" ? r.endpoint : base.endpoint,
    key_ref: typeof r.key_ref === "string" ? r.key_ref : base.key_ref,
    config:
      r.config && typeof r.config === "object"
        ? (r.config as Record<string, unknown>)
        : {},
  };
}

/** Garantiza exactamente una fuente por cada kind, en orden estable. */
export function normalizeSources(raw: unknown): ServiceSource[] {
  const list = Array.isArray(raw) ? raw : [];
  const byKind = new Map<SourceKind, unknown>();
  for (const item of list) {
    const k = (item as { kind?: string } | null)?.kind;
    if (k === "propio" || k === "starseed" || k === "externo") {
      if (!byKind.has(k)) byKind.set(k, item);
    }
  }
  return KIND_ORDER.map((k) => normalizeSource(byKind.get(k), k));
}

export function normalizeModulation(raw: unknown): Modulation {
  if (!raw || typeof raw !== "object") return defaultModulation();
  const r = raw as Partial<Modulation>;
  const mode =
    r.mode && VALID_MODES.includes(r.mode as ModulationMode)
      ? (r.mode as ModulationMode)
      : "prioridad";
  const note = typeof r.note === "string" ? r.note : undefined;
  return note ? { mode, note } : { mode };
}

function normalizeRoute(domain: string, raw: unknown): ServiceRoute {
  if (!raw || typeof raw !== "object") return defaultRoute(domain);
  const r = raw as Partial<ServiceRoute> & {
    sources?: unknown;
    modulation?: unknown;
  };
  return {
    domain,
    sources: normalizeSources(r.sources),
    modulation: normalizeModulation(r.modulation),
    updated_at: typeof r.updated_at === "string" ? r.updated_at : undefined,
  };
}

// ── Espejo en window (lectores sin DB, p.ej. motores de enrutado) ────────────

declare global {
  interface Window {
    STARSEED_routes?: Record<string, ServiceRoute>;
  }
}

function mirrorToWindow(route: ServiceRoute) {
  if (typeof window === "undefined") return;
  try {
    const map = window.STARSEED_routes ?? {};
    map[route.domain] = route;
    window.STARSEED_routes = map;
    window.dispatchEvent(
      new CustomEvent("starseed:route", { detail: route }),
    );
  } catch {
    /* noop */
  }
}

// ── Helpers Supabase ─────────────────────────────────────────────────────────

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Carga la ruta de un dominio (o defaults si no existe / sin sesión) y la
 * espeja en window para lectores sin DB.
 */
export async function loadRoute(domain: string): Promise<ServiceRoute> {
  try {
    const owner = await uid();
    if (!owner) {
      const def = defaultRoute(domain);
      mirrorToWindow(def);
      return def;
    }
    const sb = createClient();
    const { data } = await sb
      .from("service_routes")
      .select("sources, modulation, updated_at")
      .eq("owner", owner)
      .eq("domain", domain)
      .maybeSingle();
    const route = normalizeRoute(domain, data ?? null);
    mirrorToWindow(route);
    return route;
  } catch {
    const def = defaultRoute(domain);
    mirrorToWindow(def);
    return def;
  }
}

/**
 * Guarda (upsert por owner+domain) las fuentes y la modulación de un dominio.
 * Espeja optimistamente en window y devuelve la fila normalizada.
 */
export async function saveRoute(
  domain: string,
  sources: ServiceSource[],
  modulation: Modulation,
): Promise<ServiceRoute | null> {
  const normalized: ServiceRoute = {
    domain,
    sources: normalizeSources(sources),
    modulation: normalizeModulation(modulation),
  };
  // Espejo optimista para que el resto de la UI reaccione de inmediato.
  mirrorToWindow(normalized);
  try {
    const owner = await uid();
    if (!owner) return normalized;
    const sb = createClient();
    const { data } = await sb
      .from("service_routes")
      .upsert(
        {
          owner,
          domain,
          sources: normalized.sources,
          modulation: normalized.modulation,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner,domain" },
      )
      .select("sources, modulation, updated_at")
      .maybeSingle();
    const saved = normalizeRoute(domain, data ?? normalized);
    mirrorToWindow(saved);
    return saved;
  } catch {
    return normalized;
  }
}

/**
 * Suscripción Realtime a los cambios de la ruta de un dominio. Devuelve una
 * función de limpieza. SSR-safe (no-op en el servidor). El callback recibe la
 * ruta ya normalizada cuando llega un INSERT/UPDATE; en DELETE recibe defaults.
 */
export function onRouteChange(
  domain: string,
  cb: (route: ServiceRoute) => void,
): () => void {
  if (typeof window === "undefined" || !domain) return () => {};
  return onTableChange(
    "service_routes",
    { filter: `domain=eq.${domain}`, event: "*" },
    (payload: RealtimePayload) => {
      const type = payload?.eventType;
      if (type === "DELETE") {
        const def = defaultRoute(domain);
        mirrorToWindow(def);
        cb(def);
        return;
      }
      const row = (payload?.new ?? null) as unknown;
      const route = normalizeRoute(domain, row);
      mirrorToWindow(route);
      cb(route);
    },
  );
}

// ── Utilidades de enrutado (lectura pura, sin DB) ────────────────────────────

/** Fuentes activas de una ruta, ordenadas por peso descendente (prioridad). */
export function activeSources(route: ServiceRoute): ServiceSource[] {
  return route.sources
    .filter((s) => s.enabled)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Resuelve el destino efectivo de un dominio según su modulación. Lee el espejo
 * de window (sin DB) y cae a defaults si no existe. Devuelve la lista de fuentes
 * que el motor debería usar y la fuente primaria, según el modo:
 *   • prioridad/failover → primaria = mayor peso; resto como respaldo.
 *   • balanceo/fusion    → todas las activas participan.
 */
export function resolveRoute(domain: string): {
  mode: ModulationMode;
  primary: ServiceSource | null;
  participants: ServiceSource[];
} {
  let route: ServiceRoute;
  if (typeof window !== "undefined" && window.STARSEED_routes?.[domain]) {
    route = normalizeRoute(domain, window.STARSEED_routes[domain]);
  } else {
    route = defaultRoute(domain);
  }
  const actives = activeSources(route);
  const mode = route.modulation.mode;
  const primary = actives[0] ?? null;
  const participants =
    mode === "balanceo" || mode === "fusion"
      ? actives
      : primary
        ? [primary]
        : [];
  return { mode, primary, participants };
}
