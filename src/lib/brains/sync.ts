"use client";

/**
 * Cerebros — Sincronización REAL de un enlace cerebro↔servidor.
 *
 * Cuando un cerebro está enlazado a un servidor del registro (brain_server_links),
 * "sincronizar" puede significar varias cosas a la vez según `link.sync` y el
 * tipo de servidor (`server.kind`). Esta utilidad ejecuta los pasos que apliquen
 * y devuelve un parte legible (en español) sin lanzar nunca:
 *
 *   1) Syncthing (sync de ficheros open-source, P2P): si el enlace (o el
 *      servidor) declara una carpeta de Syncthing, se pide un RE-ESCANEO de esa
 *      carpeta al Neurocortex (POST {BOT_BASE}/api/syncthing action:'scan').
 *      Reutiliza EXACTAMENTE el contrato que usa src/components/exocortex/
 *      syncthing-panel.tsx: { account_id, action:'scan', id:<carpeta> }.
 *
 *   2) Empuje del bundle del cerebro: si la dirección/rol implica subir datos
 *      (direction push/both o rol compute/primary), se ensambla el bundle del
 *      cerebro (assembleBrainBundle) y se envía al servidor con syncToServer
 *      (runtime.ts: directo /sync en local, o proxy /api/brain action:'sync').
 *
 *   3) Datastore (CouchDB/Postgres): si el enlace/servidor indica un datastore
 *      de replicación, se registra un paso informativo (la replicación la
 *      gestiona el propio datastore; no hacemos nada destructivo aquí).
 *
 * SSR-safe: nada se ejecuta sin `globalThis.fetch`. Todo con try/catch.
 * Sigue los patrones de src/lib/brains/runtime.ts y servers.ts.
 */

import { assembleBrainBundle } from "@/lib/brains/brains";
import { syncToServer } from "@/lib/brains/runtime";
import type { ServerLink, RegistryServer } from "@/lib/brains/servers";

/** Base del Neurocortex (mismo host que runtime.ts y syncthing-panel.tsx). */
export const BOT_BASE = "https://starseed-neurocortex.vercel.app";

/* ------------------------------------------------------------------ */
/* Tipos de resultado                                                  */
/* ------------------------------------------------------------------ */

/** Naturaleza de cada paso ejecutado durante la sincronización. */
export type SyncStepKind = "syncthing" | "bundle" | "datastore" | "info";

export interface SyncStep {
  /** Tipo de paso (qué se intentó). */
  kind: SyncStepKind;
  /** ¿El paso terminó bien? */
  ok: boolean;
  /** Detalle legible en español. */
  detail: string;
}

export interface RunLinkSyncResult {
  /** Verdadero si TODOS los pasos ejecutados terminaron bien (y hubo alguno). */
  ok: boolean;
  /** Pasos ejecutados, en orden. */
  steps: SyncStep[];
  /** Resumen legible en español. */
  detail: string;
}

export interface RunLinkSyncOpts {
  /** Id de cuenta (supabase user.id) para los endpoints del bot. */
  accountId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** ¿Estamos en un entorno con fetch disponible (no SSR)? */
function canFetch(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.fetch === "function";
}

/** Lee el JSON de una respuesta de forma defensiva. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Mensaje de error amable a partir de un error desconocido (en español). */
function friendlyError(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) {
    if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
      return "No se pudo contactar con el Neurocortex de StarSeed.";
    }
    return e.message;
  }
  return fallback;
}

/** Carpeta de Syncthing declarada en el enlace o en la config del servidor. */
function syncthingFolderId(link: ServerLink, server: RegistryServer): string | null {
  const fromLink = (link?.sync as Record<string, unknown> | undefined)?.syncthingFolderId;
  if (typeof fromLink === "string" && fromLink.trim()) return fromLink.trim();
  const fromServer = (server?.config as Record<string, unknown> | undefined)?.syncthingFolderId;
  if (typeof fromServer === "string" && fromServer.trim()) return fromServer.trim();
  return null;
}

/** Datastore de replicación declarado en el enlace o en la config del servidor. */
function datastoreOf(link: ServerLink, server: RegistryServer): string | null {
  const fromLink = (link?.sync as Record<string, unknown> | undefined)?.datastore;
  if (typeof fromLink === "string" && fromLink.trim()) return fromLink.trim();
  const fromServer = (server?.config as Record<string, unknown> | undefined)?.datastore;
  if (typeof fromServer === "string" && fromServer.trim()) return fromServer.trim();
  return null;
}

/** ¿La dirección/rol del enlace implica EMPUJAR el bundle al servidor? */
function shouldPushBundle(link: ServerLink): boolean {
  const dir = String((link?.sync as Record<string, unknown> | undefined)?.direction ?? "both");
  const role = String(link?.role ?? "");
  if (dir === "push" || dir === "both") return true;
  if (role === "compute" || role === "primary") return true;
  return false;
}

/** Convierte la fila del registro en el BrainServer que espera el runtime. */
function toRuntimeServer(server: RegistryServer) {
  return {
    id: server.id,
    kind: server.kind,
    name: server.name,
    endpoint: server.endpoint,
    keyRef: server.keyRef,
    status: server.status,
    // Conserva campos extra de config (p.ej. adapter) por si el runtime los usa.
    ...(server.config && typeof server.config === "object" ? (server.config as Record<string, unknown>) : {}),
  };
}

/* ------------------------------------------------------------------ */
/* Paso 1 — Syncthing (re-escaneo de carpeta)                          */
/* ------------------------------------------------------------------ */

/**
 * Pide a Syncthing (vía Neurocortex) un re-escaneo de la carpeta. Usa el MISMO
 * contrato que syncthing-panel.tsx: POST /api/syncthing { account_id, action:'scan', id }.
 */
async function runSyncthingScan(
  accountId: string | null | undefined,
  folder: string,
): Promise<SyncStep> {
  if (!canFetch()) {
    return { kind: "syncthing", ok: false, detail: "Syncthing: no disponible en este entorno." };
  }
  try {
    const res = await fetch(`${BOT_BASE}/api/syncthing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId ?? "", action: "scan", id: folder }),
    });
    const j = await readJson(res);
    const ok = res.ok && j.ok !== false;
    return {
      kind: "syncthing",
      ok,
      detail: ok
        ? `Syncthing: re-escaneo solicitado para la carpeta «${folder}».`
        : `Syncthing: no se pudo re-escanear «${folder}» (${(j.error as string) || `respondió ${res.status}`}).`,
    };
  } catch (e) {
    return { kind: "syncthing", ok: false, detail: `Syncthing: ${friendlyError(e, "no se pudo re-escanear la carpeta.")}` };
  }
}

/* ------------------------------------------------------------------ */
/* Paso 2 — Empuje del bundle del cerebro                              */
/* ------------------------------------------------------------------ */

/**
 * Ensambla el bundle del cerebro y lo empuja al servidor (directo /sync en
 * local, o proxy /api/brain action:'sync'). Reutiliza runtime.ts y brains.ts.
 */
async function runBundlePush(
  link: ServerLink,
  server: RegistryServer,
  accountId: string | null | undefined,
): Promise<SyncStep> {
  try {
    const bundle = await assembleBrainBundle(link.brain_id);
    if (!bundle) {
      return { kind: "bundle", ok: false, detail: "Bundle: no se pudo ensamblar el cerebro (¿existe y tienes sesión?)." };
    }
    const r = await syncToServer(toRuntimeServer(server), bundle, accountId);
    return {
      kind: "bundle",
      ok: !!r.ok,
      detail: r.ok
        ? `Bundle: cerebro empujado a «${server.name}» (${r.via === "local" ? "directo" : "proxy"}).`
        : `Bundle: no se pudo empujar a «${server.name}» (${r.error || "error desconocido"}).`,
    };
  } catch (e) {
    return { kind: "bundle", ok: false, detail: `Bundle: ${friendlyError(e, "no se pudo empujar el cerebro.")}` };
  }
}

/* ------------------------------------------------------------------ */
/* Orquestador                                                         */
/* ------------------------------------------------------------------ */

/**
 * Ejecuta la sincronización REAL de un enlace cerebro↔servidor:
 *  - dispara un re-escaneo de Syncthing si hay carpeta declarada,
 *  - empuja el bundle del cerebro si la dirección/rol lo implica,
 *  - registra un paso informativo para datastores de replicación.
 *
 * Nunca lanza: devuelve siempre { ok, steps, detail } en español.
 */
export async function runLinkSync(
  link: ServerLink,
  server: RegistryServer,
  opts?: RunLinkSyncOpts,
): Promise<RunLinkSyncResult> {
  const steps: SyncStep[] = [];
  const accountId = opts?.accountId ?? null;

  try {
    if (!link || !server) {
      return { ok: false, steps, detail: "No hay enlace o servidor que sincronizar." };
    }

    // 1) Syncthing (carpeta de ficheros open-source).
    const folder = syncthingFolderId(link, server);
    if (folder) {
      steps.push(await runSyncthingScan(accountId, folder));
    }

    // 2) Empuje del bundle del cerebro (push/both o rol compute/primary).
    if (shouldPushBundle(link)) {
      steps.push(await runBundlePush(link, server, accountId));
    }

    // 3) Datastore de replicación (CouchDB/Postgres): solo informativo.
    const datastore = datastoreOf(link, server);
    if (datastore) {
      steps.push({
        kind: "datastore",
        ok: true,
        detail: `Datastore (${datastore}): replicación gestionada por el datastore; no se requiere acción aquí.`,
      });
    }

    // Si no aplicó ningún paso, lo decimos claramente.
    if (steps.length === 0) {
      const dir = String((link.sync as Record<string, unknown> | undefined)?.direction ?? "none");
      steps.push({
        kind: "info",
        ok: true,
        detail:
          dir === "pull"
            ? "Sin acciones de subida: este enlace está configurado solo para bajar (pull)."
            : "Nada que sincronizar: configura una carpeta Syncthing o una dirección de subida (push/both).",
      });
    }

    const acted = steps.filter((s) => s.kind !== "info");
    const ok = acted.length > 0 ? acted.every((s) => s.ok) : true;
    const okCount = steps.filter((s) => s.ok).length;
    const detail = ok
      ? `Sincronización completada (${okCount}/${steps.length} pasos correctos).`
      : `Sincronización con incidencias (${okCount}/${steps.length} pasos correctos).`;

    return { ok, steps, detail };
  } catch (e) {
    steps.push({ kind: "info", ok: false, detail: friendlyError(e, "Error inesperado al sincronizar.") });
    return { ok: false, steps, detail: "No se pudo completar la sincronización." };
  }
}
