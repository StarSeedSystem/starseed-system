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
  HeartPulse,
} from "lucide-react";
import {
  estadoPermiso,
  entornoPermisos,
  requestDevicePermission,
  type PermisoDispositivo,
} from "@/lib/aurora/senses/request-permission";

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

/** Visor embebido que suprime diálogos: una sola fuente (`entornoPermisos`). */
export function visorBloqueaPermisos(): { bloqueado: boolean; visor: string } {
  const visor = entornoPermisos().visor;
  return visor ? { bloqueado: true, visor } : { bloqueado: false, visor: "" };
}

/** Sentidos cuyo permiso web vive en `request-permission` (motor único). */
export const SENTIDO_A_PERMISO: Partial<Record<SensePermission, PermisoDispositivo>> = {
  "getUserMedia-audio": "microfono",
  "getUserMedia-video": "camara",
  geolocation: "ubicacion",
  notifications: "notificaciones",
  files: "archivos",
};

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
    // Adenda 77-voz — reutiliza el MISMO micrófono (analizador compartido del
    // orbe). Estima el TONO/EMOCIÓN de tu voz en local, sin reconocer palabras y
    // sin enviar nada. OFF por defecto (y en móvil el guard del orbe lo mantiene
    // inactivo: el micrófono del móvil tiene un solo dueño).
    id: "oido-emocional",
    label: "Oído emocional",
    blurb:
      "Percibe el tono y la emoción de tu voz (energía, brillo, ritmo) mientras Aurora escucha. 100% local; nada sale del dispositivo.",
    icon: HeartPulse,
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

function resultadoASentido(r: {
  soportado: boolean;
  concedido: boolean;
  motivo?: string;
}): SenseTestResult {
  if (r.concedido) return { ok: true, state: "granted" };
  if (!r.soportado) return { ok: false, state: "unsupported", error: r.motivo };
  const denied = /denied|denegado|bloque/i.test(r.motivo ?? "");
  return { ok: false, state: denied ? "denied" : "prompt", error: r.motivo };
}

/**
 * Consulta el estado del permiso. Los sentidos con API web común delegan en
 * `estadoPermiso`; pantalla y portapapeles no son consultables.
 */
export async function permissionState(
  senseId: string,
): Promise<SenseTestResult["state"]> {
  const sense = findSense(senseId);
  if (!sense) return "unsupported";
  const permiso = SENTIDO_A_PERMISO[sense.permission];
  if (!permiso) return "unsupported";
  return estadoPermiso(permiso);
}

function stopStream(stream: MediaStream | null | undefined) {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* noop */
  }
}

/**
 * Invoca de verdad la API del navegador. Mic/cámara/geo/avisos/archivos van
 * por `requestDevicePermission` (motor único). Pantalla y portapapeles no
 * tienen permiso web reutilizable: se piden al usar.
 */
export async function requestSense(senseId: string): Promise<SenseTestResult> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, state: "unsupported", error: "Sin entorno de navegador" };
  }
  const sense = findSense(senseId);
  if (!sense) return { ok: false, state: "error", error: "Sentido desconocido" };

  const permiso = SENTIDO_A_PERMISO[sense.permission];
  if (permiso) {
    if (permiso === "archivos") {
      const m = await import("@/lib/aurora/senses/folder-detect");
      const res = await m.conectarCarpetaYDetectar();
      if (!res) return { ok: false, state: "prompt", error: "cancelado (no se eligió carpeta)" };
      try {
        window.dispatchEvent(new CustomEvent("starseed:carpeta-detectada", { detail: res }));
      } catch { /* el resumen es cortesía; el permiso ya quedó concedido */ }
      return { ok: true, state: "granted" };
    }
    return resultadoASentido(await requestDevicePermission(permiso));
  }

  try {
    if (sense.permission === "getDisplayMedia") {
      const md = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (c?: unknown) => Promise<MediaStream>;
      };
      if (!md?.getDisplayMedia)
        return { ok: false, state: "unsupported", error: "getDisplayMedia no disponible" };
      const stream = await md.getDisplayMedia({ video: true });
      stopStream(stream);
      return { ok: true, state: "granted" };
    }
    if (sense.permission === "clipboard") {
      const clip = navigator.clipboard as Clipboard & {
        readText?: () => Promise<string>;
      };
      if (!clip?.readText)
        return { ok: false, state: "unsupported", error: "clipboard.readText no disponible" };
      await clip.readText();
      return { ok: true, state: "granted" };
    }
    return { ok: false, state: "unsupported" };
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
