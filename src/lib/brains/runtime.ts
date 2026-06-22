"use client";

/**
 * Cerebros — Runtime de ejecución/sincronización contra servidores REALES.
 *
 * Un "servidor de cerebro" es cualquier servidor HTTP que implementa el
 * contrato (documentado en public/brain/README.md):
 *   - GET  /health → { ok:true, name }
 *   - POST /run    { task, context? }  → { ok:true, result }
 *   - POST /sync   { bundle }          → { ok:true, stored }
 *
 * Enrutado automático LOCAL vs REMOTO:
 *   - kind === "local"  → se contacta DIRECTAMENTE desde el navegador
 *     (localhost está exento del bloqueo de contenido mixto). El servidor
 *     local debe enviar CORS permisivo.
 *   - cualquier otro kind (higgsfield/online/vps/runtime) → se enruta por el
 *     proxy del bot (POST {BOT_BASE}/api/brain) para evitar CORS y usar la
 *     clave guardada en la bóveda del usuario (key_ref).
 *
 * Adaptador de generación: un servidor remoto puede llevar `server.adapter`
 * (ver src/lib/brains/adapters.ts). Si está presente, `runOnServer` lo envía en
 * el cuerpo del proxy (`adapter`) y api/brain.py ejecuta el flujo plantillado
 * (Higgsfield/Replicate/etc.) en lugar del POST plano `{task,context}`. Los
 * servidores locales lo ignoran.
 *
 * Todo con try/catch, timeout (~8s vía AbortController) y errores amables.
 * SSR-safe: nada se ejecuta sin `globalThis.fetch`.
 *
 * Sigue los patrones de src/lib/brains/brains.ts.
 */

import type { BrainServer } from "@/lib/brains/brains";

/** Base del proxy del bot (mismo que usa brains-panel.tsx). */
export const BOT_BASE = "https://starseed-neurocortex.vercel.app";

/** Tiempo máximo por petición. */
const DEFAULT_TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ */
/* Resultados                                                          */
/* ------------------------------------------------------------------ */

export type RunVia = "local" | "proxy";

export interface RunResult {
  ok: boolean;
  /** Resultado devuelto por el servidor (cuando ok). */
  result?: unknown;
  /** Mensaje de error amable (cuando !ok). */
  error?: string;
  /** Cómo se contactó el servidor. */
  via: RunVia;
}

export interface SyncResult {
  ok: boolean;
  /** Info de almacenamiento devuelta por el servidor (cuando ok). */
  stored?: unknown;
  error?: string;
  via: RunVia;
}

export interface PingResult {
  ok: boolean;
  /** ¿El servidor está accesible y respondió bien? */
  reachable: boolean;
  /** Detalle legible (nombre del servidor, error, etc.). */
  detail?: string;
  via: RunVia;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** ¿Estamos en un entorno con fetch disponible (no SSR)? */
function canFetch(): boolean {
  return typeof globalThis !== "undefined" && typeof globalThis.fetch === "function";
}

/** ¿Es un servidor local (contacto directo desde el navegador)? */
export function isLocalServer(server: Pick<BrainServer, "kind">): boolean {
  return String(server?.kind) === "local";
}

/** Normaliza el endpoint y le añade un sufijo de ruta. */
function withPath(endpoint: string, path: string): string {
  const base = String(endpoint || "").replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/** Mensaje de error amable a partir de un error desconocido. */
function friendlyError(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "name" in e && (e as { name?: string }).name === "AbortError") {
    return "Tiempo de espera agotado: el servidor no respondió a tiempo.";
  }
  if (e instanceof Error && e.message) {
    // Errores de red típicos del navegador.
    if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
      return "No se pudo contactar el servidor (¿está encendido y con CORS permisivo?).";
    }
    return e.message;
  }
  return fallback;
}

/** fetch con timeout vía AbortController. SSR-safe. */
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (!canFetch()) throw new Error("fetch no disponible en este entorno.");
  const hasAbort = typeof AbortController !== "undefined";
  const controller = hasAbort ? new AbortController() : null;
  const timer =
    controller != null
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {
            /* */
          }
        }, timeoutMs)
      : null;
  try {
    return await fetch(input, controller ? { ...init, signal: controller.signal } : init);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** POST JSON al proxy del bot con la acción indicada. */
async function postProxy(
  action: "ping" | "run" | "sync",
  server: BrainServer,
  accountId: string | null | undefined,
  extra: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  return fetchWithTimeout(
    `${BOT_BASE}/api/brain`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account_id: accountId ?? "",
        action,
        endpoint: server.endpoint ?? "",
        key_ref: server.keyRef ?? "",
        ...extra,
      }),
    },
    timeoutMs,
  );
}

/** Lee el JSON de una respuesta de forma defensiva. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* run                                                                */
/* ------------------------------------------------------------------ */

/**
 * Ejecuta una tarea en un servidor de cerebro.
 * LOCAL → POST directo a `<endpoint>/run`.
 * REMOTO → proxy del bot con `action:'run'`. Si el servidor lleva un adaptador
 *   de generación (`server.adapter`), se incluye en el cuerpo para que el bot
 *   ejecute el flujo plantillado (Higgsfield/Replicate/etc.).
 */
export async function runOnServer(
  server: BrainServer,
  task: string,
  ctx?: unknown,
  accountId?: string | null,
): Promise<RunResult> {
  const local = isLocalServer(server);
  const via: RunVia = local ? "local" : "proxy";
  if (!canFetch()) return { ok: false, error: "No disponible en este entorno.", via };
  if (!server?.endpoint && local) return { ok: false, error: "El servidor local no tiene URL.", via };

  try {
    if (local) {
      const res = await fetchWithTimeout(withPath(String(server.endpoint), "/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, context: ctx }),
      });
      const j = await readJson(res);
      if (!res.ok || j.ok === false) {
        return { ok: false, error: (j.error as string) || `El servidor respondió ${res.status}.`, via };
      }
      return { ok: true, result: j.result ?? j, via };
    }

    // Remoto → proxy del bot. Incluye el adaptador de generación si el servidor
    // lo lleva (los servidores locales lo ignoran). El proxy usará el flujo
    // plantillado cuando `adapter` esté presente.
    const adapter = (server as { adapter?: unknown }).adapter;
    const extra: Record<string, unknown> = { task, context: ctx };
    if (adapter) extra.adapter = adapter;
    const res = await postProxy("run", server, accountId, extra);
    const j = await readJson(res);
    if (!res.ok || j.ok === false) {
      return {
        ok: false,
        error: (j.error as string) || (res.ok ? "El servidor respondió sin éxito." : `Proxy respondió ${res.status}.`),
        via,
      };
    }
    return { ok: true, result: j.result ?? j, via };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "No se pudo ejecutar la tarea."), via };
  }
}

/* ------------------------------------------------------------------ */
/* sync                                                               */
/* ------------------------------------------------------------------ */

/**
 * Sincroniza un bundle de cerebro hacia un servidor.
 * LOCAL → POST directo a `<endpoint>/sync`.
 * REMOTO → proxy del bot con `action:'sync'`.
 */
export async function syncToServer(
  server: BrainServer,
  bundle: unknown,
  accountId?: string | null,
): Promise<SyncResult> {
  const local = isLocalServer(server);
  const via: RunVia = local ? "local" : "proxy";
  if (!canFetch()) return { ok: false, error: "No disponible en este entorno.", via };
  if (!server?.endpoint && local) return { ok: false, error: "El servidor local no tiene URL.", via };

  try {
    if (local) {
      const res = await fetchWithTimeout(withPath(String(server.endpoint), "/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle }),
      });
      const j = await readJson(res);
      if (!res.ok || j.ok === false) {
        return { ok: false, error: (j.error as string) || `El servidor respondió ${res.status}.`, via };
      }
      return { ok: true, stored: j.stored ?? j, via };
    }

    const res = await postProxy("sync", server, accountId, { bundle });
    const j = await readJson(res);
    if (!res.ok || j.ok === false) {
      return {
        ok: false,
        error: (j.error as string) || (res.ok ? "El servidor respondió sin éxito." : `Proxy respondió ${res.status}.`),
        via,
      };
    }
    return { ok: true, stored: j.stored ?? j, via };
  } catch (e) {
    return { ok: false, error: friendlyError(e, "No se pudo sincronizar."), via };
  }
}

/* ------------------------------------------------------------------ */
/* ping                                                               */
/* ------------------------------------------------------------------ */

/**
 * Comprueba si un servidor de cerebro está accesible.
 * LOCAL → GET directo a `<endpoint>/health`.
 * REMOTO → proxy del bot con `action:'ping'`.
 */
export async function pingServer(server: BrainServer, accountId?: string | null): Promise<PingResult> {
  const local = isLocalServer(server);
  const via: RunVia = local ? "local" : "proxy";
  if (!canFetch()) return { ok: false, reachable: false, detail: "No disponible en este entorno.", via };
  if (!server?.endpoint && local) return { ok: false, reachable: false, detail: "El servidor local no tiene URL.", via };

  try {
    if (local) {
      const res = await fetchWithTimeout(withPath(String(server.endpoint), "/health"), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const j = await readJson(res);
      const ok = res.ok && j.ok !== false;
      return {
        ok,
        reachable: ok,
        detail: ok ? (j.name ? `Conectado a ${String(j.name)}.` : "Servidor local disponible.") : `El servidor respondió ${res.status}.`,
        via,
      };
    }

    const res = await postProxy("ping", server, accountId, {});
    const j = await readJson(res);
    const ok = res.ok && j.ok === true;
    return {
      ok,
      reachable: ok,
      detail: ok
        ? (j.name ? `Conectado a ${String(j.name)}.` : "Servidor disponible.")
        : res.ok
          ? (j.error as string) || "El servidor respondió sin éxito."
          : `Proxy respondió ${res.status}.`,
      via,
    };
  } catch (e) {
    return { ok: false, reachable: false, detail: friendlyError(e, "No se pudo contactar el servidor."), via };
  }
}
