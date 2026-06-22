/**
 * Intelligent routing for the multi-source memory storage system.
 *
 * Philosophy:
 *  - StarSeed server (Supabase) is LIMITED → preferred for context, short/medium-term
 *    memory and important "fundamental" memories.
 *  - Larger files → the user's Google Drive (or local store with capacity).
 *  - Unlimited extensible sources (GitHub, WebDAV, S3, custom) as overflow.
 */

import type { StorageBackend, StoragePolicy } from "./backends";

export interface RouteInput {
  sizeMb: number;
  kind?: string;
  fundamental?: boolean;
  term?: "short" | "mid" | "long";
}

export interface RouteResult {
  backend: StorageBackend | null;
  reason: string;
}

export interface CapacityInfo {
  usedMb: number;
  quotaMb: number | null;
  pct: number | null;
  unlimited: boolean;
  warning: boolean;
}

function isEnabled(b: StorageBackend): boolean {
  return b.enabled !== false;
}

function hasCapacity(b: StorageBackend, sizeMb: number): boolean {
  if (b.quota_mb == null) return true; // unlimited
  const used = typeof b.used_mb === "number" ? b.used_mb : 0;
  return used + sizeMb <= b.quota_mb;
}

function prio(b: StorageBackend): number {
  return typeof b.priority === "number" ? b.priority : 99;
}

/**
 * Choose the best backend for a memory given the available backends and policy.
 */
export function chooseBackend(
  input: RouteInput,
  backends: StorageBackend[],
  policy: StoragePolicy = {},
): RouteResult {
  const enabled = (backends || []).filter(isEnabled);
  if (enabled.length === 0) {
    return { backend: null, reason: "No hay ningún almacén activo. Activa al menos uno (por defecto, el servidor StarSeed)." };
  }

  const sizeMb = Number.isFinite(input.sizeMb) ? input.sizeMb : 0;
  const starseedMax = typeof policy.starseedMaxMb === "number" ? policy.starseedMaxMb : 5;
  const keepFundamental = policy.keepFundamentalOnStarseed !== false; // default true
  const star = enabled.find((b) => b.kind === "starseed");

  // 1) Fundamental memories → StarSeed (if policy keeps them there and it exists).
  if (input.fundamental && keepFundamental && star && hasCapacity(star, sizeMb)) {
    return {
      backend: star,
      reason: "Memoria fundamental: se guarda en el servidor StarSeed para tenerla siempre disponible como contexto.",
    };
  }

  // 2) Small + not long-term → StarSeed (fast, always available).
  if (star && sizeMb <= starseedMax && input.term !== "long" && hasCapacity(star, sizeMb)) {
    return {
      backend: star,
      reason: `Memoria ligera (${sizeMb} MB ≤ ${starseedMax} MB) y de corto/medio plazo: ideal para el servidor StarSeed.`,
    };
  }

  // 3) Large / long-term → preferred large target (gdrive/local) or any non-starseed
  //    backend that "prefersLarge", choosing lowest priority with capacity.
  const nonStar = enabled.filter((b) => b.kind !== "starseed");
  const preferTarget = policy.preferLargeTarget;

  const candidates = nonStar
    .filter((b) => hasCapacity(b, sizeMb))
    .sort((a, b) => {
      // preferred target first
      const ap = preferTarget && a.kind === preferTarget ? 0 : 1;
      const bp = preferTarget && b.kind === preferTarget ? 0 : 1;
      if (ap !== bp) return ap - bp;
      // then those that prefer large files
      const al = (a.rules as Record<string, unknown> | null)?.prefersLarge ? 0 : 1;
      const bl = (b.rules as Record<string, unknown> | null)?.prefersLarge ? 0 : 1;
      if (al !== bl) return al - bl;
      // then lowest priority number
      return prio(a) - prio(b);
    });

  if (candidates.length > 0) {
    const chosen = candidates[0];
    const why =
      preferTarget && chosen.kind === preferTarget
        ? `Destino preferido para ficheros grandes (${labelOf(chosen.kind)}).`
        : (chosen.rules as Record<string, unknown> | null)?.prefersLarge
          ? `Almacén orientado a ficheros grandes (${labelOf(chosen.kind)}), con capacidad disponible.`
          : `Almacén con capacidad disponible (${labelOf(chosen.kind)}).`;
    const sizeNote = sizeMb > starseedMax ? `${sizeMb} MB supera el umbral del servidor StarSeed (${starseedMax} MB). ` : "";
    const termNote = input.term === "long" ? "Memoria de largo plazo. " : "";
    return { backend: chosen, reason: `${sizeNote}${termNote}${why}`.trim() };
  }

  // 4) Fallback: StarSeed if it has room, else the lowest-priority enabled backend.
  if (star && hasCapacity(star, sizeMb)) {
    return { backend: star, reason: "Sin otros almacenes con capacidad: se usa el servidor StarSeed como reserva." };
  }
  const fallback = [...enabled].sort((a, b) => prio(a) - prio(b))[0];
  return {
    backend: fallback,
    reason: `Reserva: ningún almacén tiene capacidad holgada; se elige el de mayor prioridad (${labelOf(fallback.kind)}). Revisa tus cuotas.`,
  };
}

/** Capacity summary for a single backend. Warn at >85%. */
export function capacityInfo(backend: StorageBackend): CapacityInfo {
  const usedMb = typeof backend.used_mb === "number" ? backend.used_mb : 0;
  const quotaMb = backend.quota_mb ?? null;
  if (quotaMb == null) {
    return { usedMb, quotaMb: null, pct: null, unlimited: true, warning: false };
  }
  const pct = quotaMb > 0 ? Math.min(100, Math.round((usedMb / quotaMb) * 100)) : 0;
  return { usedMb, quotaMb, pct, unlimited: false, warning: pct > 85 };
}

const LABELS: Record<string, string> = {
  starseed: "Servidor StarSeed",
  gdrive: "Google Drive",
  local: "Memoria local",
  github: "GitHub",
  obsidian: "Obsidian",
  webdav: "WebDAV / Nextcloud",
  s3: "S3 / compatible",
  custom: "Fuente personalizada",
};

function labelOf(kind: string): string {
  return LABELS[kind] ?? kind;
}

/** Spanish summary of how routing will behave given policy + backends. */
export function explainPolicy(policy: StoragePolicy, backends: StorageBackend[]): string {
  const enabled = (backends || []).filter(isEnabled);
  const star = enabled.find((b) => b.kind === "starseed");
  const starseedMax = typeof policy.starseedMaxMb === "number" ? policy.starseedMaxMb : 5;
  const keepFundamental = policy.keepFundamentalOnStarseed !== false;
  const target = policy.preferLargeTarget;
  const lines: string[] = [];

  if (star) {
    lines.push(
      `Las memorias fundamentales${keepFundamental ? " " : " NO necesariamente "}se quedan en el servidor StarSeed.`,
    );
    lines.push(
      `Las memorias ligeras (≤ ${starseedMax} MB) y de corto/medio plazo van al servidor StarSeed (rápido y siempre disponible, pero limitado).`,
    );
  } else {
    lines.push("No hay servidor StarSeed activo: todo el contexto se enrutará a tus almacenes externos.");
  }

  if (target) {
    lines.push(`Los ficheros grandes y de largo plazo prefieren ${labelOf(target)}.`);
  } else {
    const large = enabled.find((b) => (b.rules as Record<string, unknown> | null)?.prefersLarge && b.kind !== "starseed");
    lines.push(
      large
        ? `Los ficheros grandes irán a tu almacén orientado a tamaño (${labelOf(large.kind)}).`
        : "Aún no defines destino para ficheros grandes: añade Google Drive, un almacén local u otra fuente.",
    );
  }

  const others = enabled.filter((b) => b.kind !== "starseed" && b.kind !== target);
  if (others.length) {
    lines.push(`Como reserva/overflow se usarán: ${others.map((b) => labelOf(b.kind)).join(", ")}.`);
  }

  return lines.join(" ");
}
