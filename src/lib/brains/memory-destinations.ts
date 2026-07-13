"use client";

/**
 * Cerebros · DESTINOS DE SINCRONIZACIÓN de memorias, POR CEREBRO
 * ============================================================================
 * Ver architecture/cerebros-memorias-graphify.md §7. Cada cerebro declara en
 * `Brain.config.memoryDestinations` (jsonb ya existente — SIN migración):
 *
 *   { local: { enabled: true },            // SIEMPRE true — mirror local (memory-offline.ts)
 *     starseed: { enabled: boolean },      // default ON — manifiesto en entity_state
 *     external: ExternalMemoryDestination[] } // 0+ destinos propios ("brain-store")
 *
 * DECISIÓN DE DISEÑO (honesta, ver SOP §7): no se crea ninguna tabla nueva.
 *   - "starseed" se representa con un MANIFIESTO en entity_state (metadatos,
 *     nunca contenido) — la StarSeed store REAL ya es `brain_memory_files`.
 *   - "external" (tipo 'brain-store') reutiliza `Brain.servers[]`
 *     (BrainServer con kind:'own', endpoint, keyRef) + addServer/removeServer
 *     de brains.ts, en vez de duplicar un registro paralelo.
 *
 * Defensivo/SSR-safe: try/catch en todo, nunca lanza a sus llamadores.
 */

import {
  saveBrain,
  addServer,
  removeServer,
  newServerId,
  type Brain,
} from "@/lib/brains/brains";
import { getEntityState, setEntityState, currentUserRef } from "@/lib/sync/entity-state";
import { listMemoryFiles } from "@/lib/cerebro/memory-files";
// Reutiliza la config YA guardada del proveedor 'p2p-syncthing' (endpoint +
// clave API, local por dispositivo) — este módulo NO duplica ese registro,
// solo lo consulta para el paso de sincronización best-effort de abajo.
import { getProviderConfig } from "@/ai/astraura/sync-providers";

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

/** Destino externo ("brain-store"): una URL propia que respalda el cerebro. */
export interface ExternalMemoryDestination {
  id: string;
  /** Id del BrainServer creado para este destino (kind:'own'), si aplica. */
  serverId?: string;
  url: string;
  label: string;
  /** Nombre de la clave en la bóveda (secrets_vault). Nunca el valor en claro. */
  keyRef?: string;
}

/**
 * Destino "p2p" — espejo del cerebro vía la instancia SYNCTHING del propio
 * usuario (ver `sync-providers.ts::p2pSyncthingProvider`). NO duplica esa
 * config (endpoint/clave API): solo declara SI este cerebro debe pedirle a
 * Syncthing que sincronice, y opcionalmente QUÉ folder le corresponde.
 * Default OFF (a diferencia de `starseed`, que es automático): requiere que
 * el usuario tenga su propio Syncthing configurado.
 */
export interface P2pMemoryDestination {
  enabled: boolean;
  /** Id del folder Syncthing que espeja este cerebro (opcional). */
  folderId?: string;
  label?: string;
}

export interface MemoryDestinationsConfig {
  local: { enabled: true };
  starseed: { enabled: boolean };
  external: ExternalMemoryDestination[];
  /** Espejo por Syncthing (folder local sincronizada) — default OFF. */
  p2p: P2pMemoryDestination;
}

/** Manifiesto honesto del destino StarSeed de un cerebro (solo metadatos). */
export interface StarseedStoreManifest {
  brainId: string;
  fileCount: number;
  provisionedAt: string;
  updatedAt: string;
  /** Límites reales, sin promesas falsas (cuota de cuenta, sin SLA). */
  limits: string;
}

const MANIFEST_KEY_PREFIX = "brain-store:";

/* ------------------------------------------------------------------ */
/* Config por defecto / normalización                                  */
/* ------------------------------------------------------------------ */

export function defaultMemoryDestinations(): MemoryDestinationsConfig {
  return { local: { enabled: true }, starseed: { enabled: true }, external: [], p2p: { enabled: false } };
}

function normalizeP2p(raw: unknown): P2pMemoryDestination {
  if (!raw || typeof raw !== "object") return { enabled: false };
  const r = raw as Partial<P2pMemoryDestination>;
  return {
    enabled: r.enabled === true,
    folderId: typeof r.folderId === "string" && r.folderId ? r.folderId : undefined,
    label: typeof r.label === "string" && r.label ? r.label : undefined,
  };
}

function normalizeExternal(raw: unknown): ExternalMemoryDestination[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalMemoryDestination[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const d = r as Partial<ExternalMemoryDestination>;
    if (!d.id || !d.url) continue;
    out.push({
      id: String(d.id),
      serverId: d.serverId ? String(d.serverId) : undefined,
      url: String(d.url),
      label: d.label ? String(d.label) : "Destino externo",
      keyRef: d.keyRef ? String(d.keyRef) : undefined,
    });
  }
  return out;
}

/** Normaliza cualquier valor de `Brain.config.memoryDestinations`. Nunca lanza. */
export function normalizeMemoryDestinations(raw: unknown): MemoryDestinationsConfig {
  try {
    if (!raw || typeof raw !== "object") return defaultMemoryDestinations();
    const r = raw as Partial<MemoryDestinationsConfig> & { starseed?: { enabled?: boolean } };
    return {
      local: { enabled: true }, // local SIEMPRE activo, no desactivable.
      starseed: { enabled: r.starseed?.enabled !== false }, // default ON.
      external: normalizeExternal(r.external),
      p2p: normalizeP2p(r.p2p), // default OFF (requiere Syncthing propio).
    };
  } catch {
    return defaultMemoryDestinations();
  }
}

/** Lee la config de destinos de un cerebro (defaults si no se configuró nunca). */
export function getMemoryDestinations(brain: Brain | null | undefined): MemoryDestinationsConfig {
  if (!brain) return defaultMemoryDestinations();
  return normalizeMemoryDestinations((brain.config as Record<string, unknown> | undefined)?.memoryDestinations);
}

/** Escribe (merge) la config de destinos de un cerebro. Devuelve el cerebro actualizado. */
export async function setMemoryDestinations(
  brain: Brain,
  patch: Partial<MemoryDestinationsConfig>,
): Promise<Brain | null> {
  try {
    const current = getMemoryDestinations(brain);
    const next: MemoryDestinationsConfig = {
      local: { enabled: true },
      starseed: { enabled: patch.starseed?.enabled ?? current.starseed.enabled },
      external: patch.external ?? current.external,
      p2p: {
        enabled: patch.p2p?.enabled ?? current.p2p.enabled,
        folderId: patch.p2p && "folderId" in patch.p2p ? patch.p2p.folderId : current.p2p.folderId,
        label: patch.p2p && "label" in patch.p2p ? patch.p2p.label : current.p2p.label,
      },
    };
    return await saveBrain({
      ...brain,
      config: { ...(brain.config || {}), memoryDestinations: next },
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* StarSeed (entity_state) — "host gratuito automático"                */
/* ------------------------------------------------------------------ */

/**
 * Aprovisiona/actualiza el manifiesto StarSeed de un cerebro: un registro
 * HONESTO (solo metadatos, nunca contenido) en `entity_state` que documenta
 * que este cerebro tiene almacenamiento StarSeed activo (la store real ya es
 * `brain_memory_files`, gratis por cuenta, sin SLA). Idempotente y defensivo.
 */
export async function provisionStarseedStore(brain: Brain): Promise<StarseedStoreManifest | null> {
  try {
    const ref = await currentUserRef();
    if (!ref) return null;
    const key = `${MANIFEST_KEY_PREFIX}${brain.id}`;
    const existing = await getEntityState<StarseedStoreManifest>(ref, key);
    const files = await listMemoryFiles(brain.id);
    const now = new Date().toISOString();
    const manifest: StarseedStoreManifest = {
      brainId: brain.id,
      fileCount: files.length,
      provisionedAt: existing?.value?.provisionedAt || now,
      updatedAt: now,
      limits:
        "Almacenamiento gestionado por la cuenta StarSeed (tabla brain_memory_files, RLS por " +
        "propietario). Gratis dentro de la cuota razonable de la cuenta; sin SLA garantizado.",
    };
    const row = await setEntityState(ref, key, manifest);
    return row?.value ?? manifest;
  } catch {
    return null;
  }
}

/** Lee el manifiesto StarSeed de un cerebro (o null si no se aprovisionó). */
export async function getStarseedManifest(brainId: string): Promise<StarseedStoreManifest | null> {
  try {
    const ref = await currentUserRef();
    if (!ref) return null;
    const row = await getEntityState<StarseedStoreManifest>(ref, `${MANIFEST_KEY_PREFIX}${brainId}`);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Externo ("brain-store") — reutiliza Brain.servers[]                 */
/* ------------------------------------------------------------------ */

/**
 * Añade un destino externo propio ("brain-store"): crea un BrainServer
 * (kind:'own') con el endpoint dado y lo referencia en memoryDestinations.
 * Devuelve el cerebro actualizado (con el nuevo server + destino), o null.
 */
export async function addExternalDestination(
  brain: Brain,
  input: { url: string; label?: string; keyRef?: string },
): Promise<Brain | null> {
  try {
    if (!input?.url?.trim()) return null;
    const serverId = newServerId();
    const label = input.label?.trim() || "Cerebro-almacén externo";
    const withServer = await addServer(brain, {
      id: serverId,
      kind: "own",
      name: label,
      endpoint: input.url.trim(),
      keyRef: input.keyRef,
      status: "pendiente",
    });
    if (!withServer) return null;
    const dest: ExternalMemoryDestination = {
      id: serverId,
      serverId,
      url: input.url.trim(),
      label,
      keyRef: input.keyRef,
    };
    const current = getMemoryDestinations(withServer);
    return await setMemoryDestinations(withServer, { external: [...current.external, dest] });
  } catch {
    return null;
  }
}

/** Quita un destino externo (y su BrainServer asociado, si lo tiene). */
export async function removeExternalDestination(brain: Brain, destinationId: string): Promise<Brain | null> {
  try {
    const current = getMemoryDestinations(brain);
    const dest = current.external.find((d) => d.id === destinationId);
    let working: Brain | null = brain;
    if (dest?.serverId) {
      working = await removeServer(brain, dest.serverId);
      if (!working) return null;
    }
    const nextExternal = current.external.filter((d) => d.id !== destinationId);
    return await setMemoryDestinations(working, { external: nextExternal });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Orquestador de sincronización (best-effort, nunca lanza)             */
/* ------------------------------------------------------------------ */

export interface MemoryDestinationSyncStep {
  kind: "starseed" | "external" | "local" | "p2p";
  ok: boolean;
  detail: string;
}

export interface MemoryDestinationSyncResult {
  ok: boolean;
  steps: MemoryDestinationSyncStep[];
}

/** ¿Hay fetch disponible en este entorno? (SSR-safe). */
function canFetch(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.fetch === "function";
}

/**
 * Sincroniza los destinos de un cerebro: (1) refresca el manifiesto StarSeed
 * si está activo, (2) empuja un bundle ligero a cada destino externo (POST
 * best-effort, contrato laxo `{ ok }`, igual de tolerante que runtime.ts). El
 * mirror LOCAL (§8 del SOP) se gestiona aparte en memory-offline.ts — este
 * orquestador no lo toca para mantener responsabilidades separadas.
 */
export async function syncBrainMemoryNow(brain: Brain): Promise<MemoryDestinationSyncResult> {
  const steps: MemoryDestinationSyncStep[] = [];
  try {
    const dest = getMemoryDestinations(brain);

    if (dest.starseed.enabled) {
      const manifest = await provisionStarseedStore(brain);
      steps.push({
        kind: "starseed",
        ok: !!manifest,
        detail: manifest
          ? `Manifiesto StarSeed actualizado (${manifest.fileCount} ficheros).`
          : "No se pudo actualizar el manifiesto StarSeed (¿sesión activa?).",
      });
    }

    if (dest.external.length && canFetch()) {
      const files = await listMemoryFiles(brain.id);
      const bundle = {
        starseedBrainMemory: 1,
        brainId: brain.id,
        brainName: brain.name,
        exportedAt: new Date().toISOString(),
        files: files.map((f) => ({ id: f.id, name: f.name, content: f.content, meta: f.meta })),
      };
      for (const ext of dest.external) {
        try {
          const res = await fetch(ext.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bundle),
          });
          steps.push({
            kind: "external",
            ok: res.ok,
            detail: res.ok
              ? `Bundle enviado a «${ext.label}».`
              : `«${ext.label}» respondió ${res.status}.`,
          });
        } catch (e) {
          steps.push({
            kind: "external",
            ok: false,
            detail: `No se pudo contactar «${ext.label}»: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
    } else if (dest.external.length) {
      steps.push({ kind: "external", ok: false, detail: "Sin red disponible para sincronizar destinos externos." });
    }

    // Espejo P2P (Syncthing propio) — best-effort, honesto: solo NUDGEA a
    // Syncthing a reescanear/sincronizar el folder; no mueve el contenido de
    // las memorias por aquí (eso lo hace Syncthing por su cuenta, por archivo).
    if (dest.p2p.enabled) {
      const cfg = getProviderConfig("p2p-syncthing") as { endpoint?: string; apiKey?: string };
      if (!cfg.endpoint || !cfg.apiKey) {
        steps.push({ kind: "p2p", ok: false, detail: "Syncthing no está configurado (ver Cuenta → Servidor de sincronización)." });
      } else if (!canFetch()) {
        steps.push({ kind: "p2p", ok: false, detail: "Sin red disponible para avisar a Syncthing." });
      } else {
        try {
          const base = cfg.endpoint.trim().replace(/\/+$/, "");
          const qs = dest.p2p.folderId ? `?folder=${encodeURIComponent(dest.p2p.folderId)}` : "";
          const res = await fetch(`${base}/rest/db/scan${qs}`, {
            method: "POST",
            headers: { "X-API-Key": cfg.apiKey },
          });
          steps.push({
            kind: "p2p",
            ok: res.ok,
            detail: res.ok
              ? `Syncthing avisado de sincronizar${dest.p2p.folderId ? ` «${dest.p2p.folderId}»` : ""} (espejo de archivos, no de este manifiesto).`
              : `Syncthing respondió ${res.status} (revisa endpoint/clave API).`,
          });
        } catch (e) {
          steps.push({ kind: "p2p", ok: false, detail: `No se pudo contactar con Syncthing: ${e instanceof Error ? e.message : String(e)}` });
        }
      }
    }

    const ok = steps.length === 0 || steps.every((s) => s.ok);
    return { ok, steps };
  } catch (e) {
    steps.push({ kind: "local", ok: false, detail: `Error inesperado: ${e instanceof Error ? e.message : String(e)}` });
    return { ok: false, steps };
  }
}
