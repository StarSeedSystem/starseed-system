"use client";

/*
 * Conectores · Store soberano + espejo de cuenta
 * ---------------------------------------------------------------------------
 * Guarda QUÉ conectores ha activado/configurado el usuario y refleja ese estado
 * en la cuenta soberana compartida por el ecosistema (Supabase `user_settings`,
 * clave `prefs.connectors`), siguiendo el MISMO patrón que `library-sync.ts`.
 *
 * Principios (CLAUDE.md · Identidad Soberana + Singularidad del contenido):
 *  - LOCAL ES LA VERDAD: `localStorage` manda sin conexión. La nube solo enriquece.
 *  - MERGE NO DESTRUCTIVO: al leer/escribir `prefs` NO se pisan otras claves
 *    (library, installed, capabilities, dashboards…). Solo tocamos `prefs.connectors`.
 *  - TOLERANTE A FALLOS: sin sesión / sin tabla / error de red → NO rompe.
 *  - PROPIEDAD DEL USUARIO: solo su propia fila (RLS). Claves solo en el navegador.
 *  - GRATIS/PROPIO/OSS PRIMERO: `selectConnector` prefiere lo propio/OSS/gratis
 *    conectado; los de clave/oauth solo si el usuario los configuró.
 *
 * Persistencia:
 *   localStorage["starseed.connectors.v1"]  → ConnectorConfigMap
 *   user_settings.prefs.connectors          → ConnectorConfigMap (espejo)
 *
 * SSR-safe: sin `window` todo degrada a valores neutros y nada lanza.
 */

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  BUILTIN_CONNECTORS,
  CONNECTORS_BY_ID,
  RECOMMENDED_CONNECTOR_IDS,
} from "./registry";
import type {
  Connector,
  ConnectorCategory,
  ConnectorConfig,
  ConnectorConfigMap,
  ConnectorSelection,
  ConnectorStatus,
} from "./model";

/** Clave de almacenamiento local (versión 1). */
export const CONNECTORS_KEY = "starseed.connectors.v1";
/** Evento que emitimos tras cada mutación local (para que la UI y el sync reaccionen). */
export const CONNECTORS_EVENT = "starseed:connectors";
/** Debounce de subida (~1s) para agrupar ráfagas de cambios. */
const PUSH_DEBOUNCE_MS = 1000;

// ── Helpers de bajo nivel ────────────────────────────────────────
function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

async function getUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** ¿Es un objeto ConnectorConfig razonable? (defensivo ante datos remotos). */
function isConnectorConfig(x: unknown): x is ConnectorConfig {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { id?: unknown }).id === "string"
  );
}

/** Normaliza cualquier valor a un ConnectorConfigMap seguro. */
function coerceConfigMap(raw: unknown): ConnectorConfigMap {
  const out: ConnectorConfigMap = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (isConnectorConfig(val)) {
      out[id] = {
        id: val.id || id,
        enabled: !!val.enabled,
        apiKey: typeof val.apiKey === "string" ? val.apiKey : undefined,
        endpoint: typeof val.endpoint === "string" ? val.endpoint : undefined,
        oauthConnected:
          typeof val.oauthConnected === "boolean" ? val.oauthConnected : undefined,
        note: typeof val.note === "string" ? val.note : undefined,
        updatedAt: typeof val.updatedAt === "string" ? val.updatedAt : undefined,
      };
    }
  }
  return out;
}

// ── Lectura / escritura local ────────────────────────────────────
/** Lee el mapa de configuración local (o {} si SSR / vacío / corrupto). */
export function getConfigMap(): ConnectorConfigMap {
  if (!isClient()) return {};
  try {
    const raw = window.localStorage.getItem(CONNECTORS_KEY);
    return raw ? coerceConfigMap(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Escribe el mapa y notifica (defensivo: nunca lanza). */
function writeConfigMap(map: ConnectorConfigMap): void {
  if (!isClient()) return;
  try {
    window.localStorage.setItem(CONNECTORS_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(CONNECTORS_EVENT));
  } catch {
    /* almacenamiento lleno / bloqueado: la UI seguirá con el estado en memoria */
  }
}

// ── API de catálogo ──────────────────────────────────────────────
/** Descriptor estático de un conector por id (o undefined). */
export function getConnector(id: string): Connector | undefined {
  return CONNECTORS_BY_ID[id];
}

/**
 * Lista todos los conectores del catálogo con su ESTADO EFECTIVO y su config.
 * El estado efectivo combina el descriptor base con lo que el usuario configuró.
 */
export function listConnectors(): Array<{
  connector: Connector;
  config: ConnectorConfig | null;
  status: ConnectorStatus;
}> {
  const map = getConfigMap();
  return BUILTIN_CONNECTORS.map((connector) => {
    const config = map[connector.id] ?? null;
    return { connector, config, status: computeStatus(connector, config) };
  });
}

// ── Estado efectivo ──────────────────────────────────────────────
/**
 * Calcula el estado efectivo de un conector dado su config de usuario.
 * Reglas:
 *  - Propio/OSS/gratis SIN auth ('none'): siempre 'available'; 'connected' si
 *    el usuario lo activó explícitamente.
 *  - Con endpoint local: 'connected' si hay endpoint (propio o el default basta
 *    para estar 'available'); si no, 'available' (usa el default de StarSeed).
 *  - Con clave: 'connected' solo si hay clave; si no, 'needs-auth'.
 *  - Con OAuth: 'connected' solo si el usuario marcó oauthConnected; si no,
 *    'needs-auth' (honestos: no implementamos el flujo aquí).
 */
function computeStatus(connector: Connector, config: ConnectorConfig | null): ConnectorStatus {
  switch (connector.authType) {
    case "none":
      return config?.enabled ? "connected" : "available";
    case "localEndpoint":
      if (config?.endpoint && config.endpoint.trim()) return "connected";
      // Sin endpoint propio seguimos "disponibles": hay default de StarSeed/local.
      return config?.enabled ? "connected" : "available";
    case "apiKey":
      return config?.apiKey && config.apiKey.trim() ? "connected" : "needs-auth";
    case "oauth":
      return config?.oauthConnected ? "connected" : "needs-auth";
    default:
      return connector.status;
  }
}

/** Estado efectivo de un conector por id (o su base si no existe config). */
export function connectorStatus(id: string): ConnectorStatus {
  const connector = getConnector(id);
  if (!connector) return "needs-auth";
  return computeStatus(connector, getConfigMap()[id] ?? null);
}

// ── Mutadores ────────────────────────────────────────────────────
/**
 * Fija/parcha la configuración de un conector (merge sobre lo existente).
 * Activa `enabled` automáticamente si el parche aporta clave/endpoint/oauth.
 * Devuelve la config resultante. Persiste y notifica.
 */
export function setConnectorConfig(
  id: string,
  patch: Partial<Omit<ConnectorConfig, "id">>,
): ConnectorConfig {
  const map = getConfigMap();
  const prev = map[id] ?? { id, enabled: false };
  const next: ConnectorConfig = {
    ...prev,
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  // Si aporta credencial/endpoint/oauth y no se pidió lo contrario, se considera activo.
  const gotCredential =
    (typeof patch.apiKey === "string" && patch.apiKey.trim().length > 0) ||
    (typeof patch.endpoint === "string" && patch.endpoint.trim().length > 0) ||
    patch.oauthConnected === true;
  if (gotCredential && patch.enabled === undefined) next.enabled = true;
  map[id] = next;
  writeConfigMap(map);
  return next;
}

/** Marca un conector como activado (sin borrar su clave/endpoint). */
export function enableConnector(id: string): void {
  const map = getConfigMap();
  const prev = map[id] ?? { id, enabled: false };
  map[id] = { ...prev, id, enabled: true, updatedAt: new Date().toISOString() };
  writeConfigMap(map);
}

/**
 * Desactiva un conector. `forget` (opcional) borra además la clave/endpoint/oauth.
 * Por defecto solo lo desactiva (no destructivo con las credenciales).
 */
export function disableConnector(id: string, forget = false): void {
  const map = getConfigMap();
  const prev = map[id];
  if (!prev) {
    map[id] = { id, enabled: false, updatedAt: new Date().toISOString() };
  } else if (forget) {
    map[id] = { id, enabled: false, updatedAt: new Date().toISOString() };
  } else {
    map[id] = { ...prev, id, enabled: false, updatedAt: new Date().toISOString() };
  }
  writeConfigMap(map);
}

// ── Selección por Astraura (gratis-primero, propio-primero) ──────
/** Peso de preferencia por naturaleza (menor = mejor). own < oss < free < paid. */
const KIND_WEIGHT: Record<Connector["kind"], number> = {
  own: 0,
  oss: 1,
  free: 2,
  paid: 3,
};

/**
 * selectConnector — elige el mejor conector de una categoría para una tarea.
 *
 * Estrategia (transparente):
 *  1) Candidatos = conectores de esa categoría.
 *  2) Se descartan los que requieren clave/oauth y NO están configurados
 *     (honestos: no se usan sin credenciales).
 *  3) Se ordena por: (a) ya 'connected' antes que 'available';
 *     (b) naturaleza propio→oss→gratis→pago; (c) gratis antes que de pago;
 *     (d) marca `recommended`.
 *  4) `taskHint` (opcional) desempata dando un pequeño empujón a coincidencias
 *     por nombre/descripción/id (p.ej. "buscar en la web" → crawl/searxng).
 *
 * Devuelve siempre un `ConnectorSelection` (connector puede ser null si nada aplica).
 * Nunca lanza.
 */
export function selectConnector(
  category: ConnectorCategory,
  taskHint?: string,
): ConnectorSelection {
  try {
    const map = getConfigMap();
    const hint = (taskHint ?? "").trim().toLowerCase();

    const candidates = BUILTIN_CONNECTORS.filter((c) => c.category === category).map((c) => {
      const config = map[c.id] ?? null;
      const status = computeStatus(c, config);
      return { c, config, status };
    });

    // Descarta lo que requiere credenciales y no está conectado.
    const usable = candidates.filter((x) => {
      if (x.c.authType === "apiKey" || x.c.authType === "oauth") {
        return x.status === "connected";
      }
      return x.status === "connected" || x.status === "available";
    });

    if (usable.length === 0) {
      return {
        connector: null,
        status: "needs-auth",
        reason: `No hay conector propio/OSS/gratis listo para "${category}". Conecta uno (opcional) o auto-hospeda un servicio abierto.`,
      };
    }

    const hintScore = (c: Connector): number => {
      if (!hint) return 0;
      const hay = `${c.id} ${c.name} ${c.description ?? ""}`.toLowerCase();
      // Puntúa por tokens del hint presentes (pequeño desempate).
      let s = 0;
      for (const tok of hint.split(/\s+/).filter((t) => t.length > 2)) {
        if (hay.includes(tok)) s -= 1; // negativo = mejor (ordenamos ascendente)
      }
      return s;
    };

    usable.sort((a, b) => {
      // (a) connected antes que available.
      const aConn = a.status === "connected" ? 0 : 1;
      const bConn = b.status === "connected" ? 0 : 1;
      if (aConn !== bConn) return aConn - bConn;
      // (b) naturaleza propio→oss→gratis→pago.
      const w = KIND_WEIGHT[a.c.kind] - KIND_WEIGHT[b.c.kind];
      if (w !== 0) return w;
      // (c) gratis antes que de pago.
      const f = (a.c.free ? 0 : 1) - (b.c.free ? 0 : 1);
      if (f !== 0) return f;
      // (d) recomendado antes.
      const r = (a.c.recommended ? 0 : 1) - (b.c.recommended ? 0 : 1);
      if (r !== 0) return r;
      // (e) desempate por hint.
      return hintScore(a.c) - hintScore(b.c);
    });

    const best = usable[0];
    const kindWord =
      best.c.kind === "own"
        ? "propio"
        : best.c.kind === "oss"
          ? "código abierto"
          : best.c.kind === "free"
            ? "gratis"
            : "de pago";
    const reason =
      best.status === "connected"
        ? `Elegido "${best.c.name}" (${kindWord}, ya conectado) para ${category}.`
        : `Elegido "${best.c.name}" (${kindWord}, disponible sin cuenta) para ${category} — gratis-primero.`;

    return {
      connector: best.c,
      config: best.config ?? undefined,
      status: best.status,
      reason,
    };
  } catch {
    return {
      connector: null,
      status: "needs-auth",
      reason: "No se pudo seleccionar conector (estado no disponible).",
    };
  }
}

/** Conjunto recomendado por defecto (para que la UI lo destaque). */
export function recommendedConnectors(): Connector[] {
  return RECOMMENDED_CONNECTOR_IDS.map((id) => CONNECTORS_BY_ID[id]).filter(
    (c): c is Connector => !!c,
  );
}

// ════════════════════════════════════════════════════════════════
//  Espejo de cuenta (patrón library-sync) — merge NO destructivo
// ════════════════════════════════════════════════════════════════

/** Une el mapa remoto con el local: conserva lo local y añade lo remoto ausente. */
function mergeRemoteIntoLocal(remote: ConnectorConfigMap): void {
  if (!isClient()) return;
  const local = getConfigMap();
  let changed = false;
  for (const [id, remoteCfg] of Object.entries(remote)) {
    const localCfg = local[id];
    if (!localCfg) {
      // El remoto aporta un conector que no tenemos localmente → lo añadimos.
      local[id] = remoteCfg;
      changed = true;
      continue;
    }
    // Merge campo a campo: NO pisamos credenciales locales existentes; solo
    // rellenamos huecos con lo remoto (unión, nunca resta).
    const merged: ConnectorConfig = { ...localCfg };
    if (merged.apiKey == null && remoteCfg.apiKey != null) merged.apiKey = remoteCfg.apiKey;
    if (merged.endpoint == null && remoteCfg.endpoint != null) merged.endpoint = remoteCfg.endpoint;
    if (merged.oauthConnected == null && remoteCfg.oauthConnected != null)
      merged.oauthConnected = remoteCfg.oauthConnected;
    if (merged.note == null && remoteCfg.note != null) merged.note = remoteCfg.note;
    // `enabled`: OR lógico (si en cualquier dispositivo se activó, queda activo).
    const nextEnabled = !!merged.enabled || !!remoteCfg.enabled;
    if (nextEnabled !== merged.enabled) merged.enabled = nextEnabled;
    if (JSON.stringify(merged) !== JSON.stringify(localCfg)) {
      local[id] = merged;
      changed = true;
    }
  }
  if (changed) writeConfigMap(local);
}

/** Lee `prefs.connectors` de la cuenta y lo fusiona con lo local. */
async function pullAndMerge(userId: string): Promise<void> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("prefs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.prefs || typeof data.prefs !== "object") return;
    const prefs = data.prefs as Record<string, unknown>;
    const remote = coerceConfigMap(prefs.connectors);
    if (Object.keys(remote).length > 0) mergeRemoteIntoLocal(remote);
  } catch {
    /* sin sesión / sin tabla / red: localStorage manda */
  }
}

/** Sube el mapa local a `prefs.connectors` (merge no destructivo de prefs). */
async function pushSnapshot(userId: string): Promise<void> {
  try {
    const supabase = createClient();
    const connectors = getConfigMap();

    // 1) Lee prefs actual para NO pisar otras claves (library, installed…).
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
      /* si no se pudo leer, mezclamos sobre objeto vacío */
    }

    // 2) Mezcla solo NUESTRA clave.
    prefs.connectors = connectors;

    // 3) Upsert por user_id (misma forma que library-sync / settings-sync).
    await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    /* nunca rompemos: localStorage sigue siendo la verdad */
  }
}

/**
 * Fuerza una subida inmediata del estado de conectores a la cuenta (si hay sesión).
 * Resuelve siempre (defensivo). Útil tras una acción crítica.
 */
export async function syncConnectorsNow(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await pushSnapshot(userId);
}

/**
 * useConnectorsSync — móntalo UNA vez (junto a useLibrarySync) en el RootLayout.
 *
 * Comportamiento (idéntico patrón a useLibrarySync):
 *  - Al montar y en cada cambio de sesión: si hay usuario, LEE `prefs.connectors`
 *    y lo FUSIONA con el mapa local (unión no destructiva).
 *  - Al disparar `starseed:connectors` (con debounce ~1s): UPSERT de
 *    `{ connectors }` dentro de `prefs` (merge no destructivo del resto).
 *  - Todo defensivo y SSR-safe (no toca window/localStorage en servidor).
 */
export function useConnectorsSync(): void {
  useEffect(() => {
    if (!isClient()) return;

    const supabase = createClient();
    let active = true;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;

    const schedulePush = () => {
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        void (async () => {
          const userId = await getUserId();
          if (!active || !userId) return;
          await pushSnapshot(userId);
        })();
      }, PUSH_DEBOUNCE_MS);
    };

    // Fusión inicial: trae lo remoto y lo une a lo local.
    void (async () => {
      const userId = await getUserId();
      if (!active || !userId) return;
      await pullAndMerge(userId);
    })();

    // Cambios locales → subida con debounce.
    const onLocalChange = () => schedulePush();
    window.addEventListener(CONNECTORS_EVENT, onLocalChange);

    // Cambios de sesión: al iniciar sesión, refundir lo remoto sobre lo local.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!active) return;
        const userId = session?.user?.id ?? null;
        if (userId) await pullAndMerge(userId);
      })();
    });

    return () => {
      active = false;
      if (pushTimer) clearTimeout(pushTimer);
      window.removeEventListener(CONNECTORS_EVENT, onLocalChange);
      try {
        sub.subscription.unsubscribe();
      } catch {
        /* noop */
      }
    };
  }, []);
}
