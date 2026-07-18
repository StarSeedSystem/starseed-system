"use client";

/**
 * SENSES — catálogo de sentidos (capacidades reales del navegador) que el
 * usuario puede conceder a Aurora y/o Astraura desde los ajustes de sentidos.
 *
 * Honestidad por diseño: cada sentido es una capability real del navegador.
 * Nada se captura de forma automática; la captura sólo ocurre tras una acción
 * explícita del usuario ("Probar" / uso) con su permiso. El config vive en
 * `senses_settings(owner, config jsonb, updated_at)` (RLS por owner) y se
 * espeja en `window.STARSEED_senses` para que el motor de Aurora pueda leer
 * los sentidos activos sin pegarle a la base de datos.
 *
 * SSR-safe: TODO acceso a window/navigator/media va dentro de manejadores o
 * efectos con guardas `typeof window`. Sigue el patrón de aurora/personalities.ts.
 */

import { createClient } from "@/utils/supabase/client";
import {
  Mic,
  Camera,
  MonitorUp,
  MapPin,
  ClipboardList,
  FileUp,
  Bell,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────

export type SensePermission =
  | "getUserMedia-audio"
  | "getUserMedia-video"
  | "getDisplayMedia"
  | "geolocation"
  | "clipboard"
  | "files"
  | "notifications";

export interface Sense {
  id: string;
  label: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: SensePermission;
}

/** Mapa { [senseId]: boolean }. */
export type SenseFlags = Record<string, boolean>;

/**
 * Config persistido en `senses_settings.config`.
 * - enabled:  el sentido está habilitado a nivel sistema (interruptor maestro).
 * - aurora:   Aurora puede usar el sentido.
 * - astraura: Astraura puede usar el sentido.
 */
export interface SensesConfig {
  enabled: SenseFlags;
  aurora: SenseFlags;
  astraura: SenseFlags;
}

export interface SenseTestResult {
  ok: boolean;
  /** Estado de permiso conocido tras el intento. */
  state: "granted" | "denied" | "prompt" | "unsupported" | "error";
  error?: string;
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

export const SENSES: Sense[] = [
  {
    id: "microfono",
    label: "Micrófono",
    blurb:
      "Escucha por voz (STT). Aurora ya lo usa para reconocer tus comandos hablados.",
    icon: Mic,
    permission: "getUserMedia-audio",
  },
  {
    id: "camara",
    label: "Cámara",
    blurb:
      "Vista de cámara en vivo para análisis visual (objetos, códigos, asistencia).",
    icon: Camera,
    permission: "getUserMedia-video",
  },
  {
    id: "pantalla",
    label: "Pantalla",
    blurb:
      "Compartir pantalla puntualmente para que la IA observe lo que ves y te ayude.",
    icon: MonitorUp,
    permission: "getDisplayMedia",
  },
  {
    id: "ubicacion",
    label: "Ubicación",
    blurb:
      "Tu posición geográfica para sugerencias contextuales y eventos cercanos.",
    icon: MapPin,
    permission: "geolocation",
  },
  {
    id: "portapapeles",
    label: "Portapapeles",
    blurb:
      "Leer el portapapeles bajo demanda (sólo tras un gesto explícito tuyo).",
    icon: ClipboardList,
    permission: "clipboard",
  },
  {
    id: "archivos",
    label: "Archivos",
    blurb:
      "Adjuntar o arrastrar archivos puntualmente para que la IA los procese.",
    icon: FileUp,
    permission: "files",
  },
  {
    id: "notificaciones",
    label: "Notificaciones",
    blurb:
      "Permitir avisos del sistema para reacciones en tiempo real (mensajes, alarmas).",
    icon: Bell,
    permission: "notifications",
  },
];

// ── Defaults sensatos (micrófono ON para Aurora) ─────────────────────────────

export function defaultConfig(): SensesConfig {
  const enabled: SenseFlags = {};
  const aurora: SenseFlags = {};
  const astraura: SenseFlags = {};
  for (const s of SENSES) {
    const on = s.id === "microfono";
    enabled[s.id] = on;
    aurora[s.id] = on; // Aurora usa el micro por defecto.
    astraura[s.id] = false;
  }
  return { enabled, aurora, astraura };
}

function normalizeConfig(raw: unknown): SensesConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<SensesConfig>;
  const merge = (def: SenseFlags, got?: SenseFlags): SenseFlags => {
    const out: SenseFlags = { ...def };
    if (got && typeof got === "object") {
      for (const s of SENSES) {
        if (typeof got[s.id] === "boolean") out[s.id] = got[s.id];
      }
    }
    return out;
  };
  return {
    enabled: merge(base.enabled, r.enabled),
    aurora: merge(base.aurora, r.aurora),
    astraura: merge(base.astraura, r.astraura),
  };
}

// ── window espejo (lo lee el motor de Aurora sin DB) ─────────────────────────

declare global {
  interface Window {
    STARSEED_senses?: SensesConfig;
  }
}

function mirrorToWindow(config: SensesConfig) {
  if (typeof window === "undefined") return;
  try {
    window.STARSEED_senses = config;
    window.dispatchEvent(
      new CustomEvent("starseed:senses", { detail: config }),
    );
  } catch {
    /* noop */
  }
}

// ── Persistencia Supabase ────────────────────────────────────────────────────

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Lee el config de sentidos (o defaults) y lo espeja en window. */
export async function getSenses(): Promise<SensesConfig> {
  try {
    const owner = await uid();
    if (!owner) {
      const def = defaultConfig();
      mirrorToWindow(def);
      return def;
    }
    const sb = createClient();
    const { data } = await sb
      .from("senses_settings")
      .select("config")
      .eq("owner", owner)
      .single();
    const config = normalizeConfig(
      (data as { config?: unknown } | null)?.config,
    );
    mirrorToWindow(config);
    return config;
  } catch {
    const def = defaultConfig();
    mirrorToWindow(def);
    return def;
  }
}

/** Guarda el config (upsert por owner) y actualiza el espejo en window. */
export async function saveSenses(
  config: SensesConfig,
): Promise<SensesConfig | null> {
  const normalized = normalizeConfig(config);
  // Espeja optimistamente para que Aurora reaccione de inmediato.
  mirrorToWindow(normalized);
  try {
    const owner = await uid();
    if (!owner) return normalized;
    const sb = createClient();
    const { data } = await sb
      .from("senses_settings")
      .upsert(
        {
          owner,
          config: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner" },
      )
      .select("config")
      .single();
    const saved = normalizeConfig(
      (data as { config?: unknown } | null)?.config ?? normalized,
    );
    mirrorToWindow(saved);
    return saved;
  } catch {
    return normalized;
  }
}

/**
 * Lista de ids de sentidos activos. Sin argumento: sentidos habilitados a nivel
 * sistema. Con `who`: sentidos habilitados Y permitidos para esa IA.
 * Lee el espejo de window (sin DB) y cae a defaults si no existe.
 */
export function getActiveSenses(who?: "aurora" | "astraura"): string[] {
  let config: SensesConfig;
  if (typeof window !== "undefined" && window.STARSEED_senses) {
    config = normalizeConfig(window.STARSEED_senses);
  } else {
    config = defaultConfig();
  }
  return SENSES.filter((s) => {
    if (!config.enabled[s.id]) return false;
    if (who) return !!config[who][s.id];
    return true;
  }).map((s) => s.id);
}

/**
 * Activa SOLO los sentidos indicados (el resto se desactivan) y persiste el
 * config. Espeja a window de inmediato para que Aurora reaccione en vivo.
 * (Adenda 71-bis: usado por el menú unificado de chat para hacer el toggle de
 * Sentidos REAL, no solo guardarlo en meta.config.)
 */
export async function setActiveSenses(ids: string[]): Promise<SensesConfig | null> {
  const current = await getSenses().catch(() => defaultConfig());
  const next: SensesConfig = { ...current };
  for (const s of SENSES) {
    next.enabled = { ...(next.enabled as Record<string, boolean>) };
    next.enabled[s.id] = ids.includes(s.id);
  }
  return saveSenses(next);
}

// ── Permisos / pruebas reales del navegador ──────────────────────────────────

function findSense(senseId: string): Sense | undefined {
  return SENSES.find((s) => s.id === senseId);
}

/**
 * Consulta el estado del permiso vía navigator.permissions.query donde exista.
 * Devuelve "unsupported" si no se puede consultar (no implica denegado).
 */
export async function permissionState(
  senseId: string,
): Promise<SenseTestResult["state"]> {
  if (typeof navigator === "undefined") return "unsupported";
  const sense = findSense(senseId);
  if (!sense) return "unsupported";
  const nav = navigator as Navigator & {
    permissions?: {
      query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
    };
  };
  if (!nav.permissions?.query) return "unsupported";

  // Mapear el sentido a un nombre de permiso consultable.
  let name: string | null = null;
  switch (sense.permission) {
    case "getUserMedia-audio":
      name = "microphone";
      break;
    case "getUserMedia-video":
      name = "camera";
      break;
    case "geolocation":
      name = "geolocation";
      break;
    case "clipboard":
      name = "clipboard-read";
      break;
    case "notifications":
      name = "notifications";
      break;
    // getDisplayMedia y files no son consultables.
    default:
      name = null;
  }
  if (!name) return "unsupported";

  try {
    const status = await nav.permissions.query({ name: name as PermissionName });
    return (status.state as SenseTestResult["state"]) ?? "prompt";
  } catch {
    return "unsupported";
  }
}

function stopStream(stream: MediaStream | null | undefined) {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* noop */
  }
}

/**
 * Invoca de verdad la API del navegador correspondiente para comprobar el
 * permiso. Detiene de inmediato cualquier MediaStream obtenido (sólo estamos
 * verificando el permiso; no capturamos nada). SSR-safe: úsalo sólo desde
 * manejadores de eventos.
 */
export async function requestSense(senseId: string): Promise<SenseTestResult> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, state: "unsupported", error: "Sin entorno de navegador" };
  }
  const sense = findSense(senseId);
  if (!sense) return { ok: false, state: "error", error: "Sentido desconocido" };

  try {
    switch (sense.permission) {
      case "getUserMedia-audio": {
        if (!navigator.mediaDevices?.getUserMedia)
          return { ok: false, state: "unsupported", error: "getUserMedia no disponible" };
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stopStream(stream);
        return { ok: true, state: "granted" };
      }
      case "getUserMedia-video": {
        if (!navigator.mediaDevices?.getUserMedia)
          return { ok: false, state: "unsupported", error: "getUserMedia no disponible" };
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stopStream(stream);
        return { ok: true, state: "granted" };
      }
      case "getDisplayMedia": {
        const md = navigator.mediaDevices as MediaDevices & {
          getDisplayMedia?: (c?: unknown) => Promise<MediaStream>;
        };
        if (!md?.getDisplayMedia)
          return { ok: false, state: "unsupported", error: "getDisplayMedia no disponible" };
        const stream = await md.getDisplayMedia({ video: true });
        stopStream(stream);
        return { ok: true, state: "granted" };
      }
      case "geolocation": {
        if (!navigator.geolocation)
          return { ok: false, state: "unsupported", error: "geolocation no disponible" };
        return await new Promise<SenseTestResult>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve({ ok: true, state: "granted" }),
            (err) =>
              resolve({
                ok: false,
                state: err.code === err.PERMISSION_DENIED ? "denied" : "error",
                error: err.message,
              }),
            { timeout: 10000 },
          );
        });
      }
      case "clipboard": {
        const clip = navigator.clipboard as Clipboard & {
          readText?: () => Promise<string>;
        };
        if (!clip?.readText)
          return { ok: false, state: "unsupported", error: "clipboard.readText no disponible" };
        await clip.readText();
        return { ok: true, state: "granted" };
      }
      case "notifications": {
        if (typeof Notification === "undefined")
          return { ok: false, state: "unsupported", error: "Notification no disponible" };
        const perm = await Notification.requestPermission();
        return {
          ok: perm === "granted",
          state:
            perm === "granted" ? "granted" : perm === "denied" ? "denied" : "prompt",
        };
      }
      case "files": {
        // Los archivos se adjuntan vía un <input>/drag-drop bajo demanda;
        // no hay un permiso persistente que consultar.
        return { ok: true, state: "prompt" };
      }
      default:
        return { ok: false, state: "unsupported" };
    }
  } catch (e) {
    const err = e as DOMException;
    const denied =
      err?.name === "NotAllowedError" || err?.name === "SecurityError";
    return {
      ok: false,
      state: denied ? "denied" : "error",
      error: err?.message || "Error al solicitar el sentido",
    };
  }
}
