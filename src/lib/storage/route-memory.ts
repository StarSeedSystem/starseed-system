/**
 * Wire StarSeed memory storage to the multi-source router.
 *
 * `routeAndStore` takes a memory, computes its size, asks the router
 * (`chooseBackend`) which backend should host it, and then *executes* that
 * decision against the real world:
 *   - starseed → content stays in Supabase (`memories` row), tag `'starseed'`.
 *   - gdrive   → upload the markdown to the user's Google Drive via the bot,
 *                store the resulting file link in `config.drive`, tag `'gdrive'`.
 *   - github   → push the .md via the memory_github bot if simply configured,
 *                otherwise mark `config.pending='github'`.
 *   - local    → mark `config.local={syncthing:true}` for Syncthing, tag `'local'`.
 *
 * It always updates the `memories` row (RLS scoped to owner) and never throws:
 * every path returns a human, Spanish `detail` describing where the memory landed.
 */

"use client";

import { createClient } from "@/utils/supabase/client";
import { chooseBackend } from "./router";
import { ensureDefaults, getPolicy, listBackends } from "./backends";
import type { StorageBackend, StoragePolicy } from "./backends";

export const BOT_BASE = "https://starseed-neurocortex.vercel.app";

/** Minimal shape of a memory we can route + store. */
export interface RoutableMemory {
  id?: string;
  name?: string;
  content?: string | null;
  kinds?: string[];
  vault_id?: string | null;
  config?: Record<string, unknown> | null;
  storage?: string[] | null;
}

export interface RouteAndStoreOpts {
  /** Pre-loaded backends (avoids a round-trip). If omitted, we load them. */
  backends?: StorageBackend[];
  /** Pre-loaded policy. If omitted, we load it. */
  policy?: StoragePolicy;
  /** Pre-resolved owner id. If omitted, we resolve via supabase auth. */
  uid?: string | null;
  /** Treat this memory as "fundamental" (keeps it on StarSeed when policy says so). */
  fundamental?: boolean;
  /** Retention hint forwarded to the router. */
  term?: "short" | "mid" | "long";
}

export interface RouteAndStoreResult {
  /** Chosen backend kind id (e.g. "starseed", "gdrive", "github", "local"), or null. */
  backend: string | null;
  /** Why the router picked this backend (Spanish, from the router). */
  reason: string;
  /** Human, Spanish summary of what actually happened (where it landed / errors). */
  detail: string;
  /** Whether the store action succeeded. */
  ok: boolean;
  /** Convenience: the public Drive link, when the memory landed in Google Drive. */
  link?: string;
}

/** Byte length of a string in MB (UTF-8). SSR-safe. */
function sizeMbOf(content: string): number {
  try {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(content).length / (1024 * 1024);
    }
  } catch {
    /* fall through */
  }
  // Fallback: rough UTF-8 byte estimate without TextEncoder.
  let bytes = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes / (1024 * 1024);
}

function ensureMd(name: string): string {
  const n = (name || "memoria").trim() || "memoria";
  return n.toLowerCase().endsWith(".md") ? n : `${n}.md`;
}

/** Merge `'kind'` into a storage string[] without duplicates. */
function withStorage(existing: string[] | null | undefined, kind: string): string[] {
  const set = new Set<string>((existing ?? []).filter(Boolean));
  set.add(kind);
  return Array.from(set);
}

/**
 * Update the memories row (owner-scoped). We only patch the fields we touch so we
 * never clobber content/name/etc. Returns true on success.
 */
async function patchMemoryRow(
  uid: string,
  memoryId: string | undefined,
  patch: Record<string, unknown>,
): Promise<boolean> {
  if (!memoryId) return false;
  try {
    const sb = createClient();
    const { error } = await sb
      .from("memories")
      .update(patch)
      .eq("id", memoryId)
      .eq("owner", uid);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Route a memory to the best backend and store it there.
 * Never throws; always returns a structured, Spanish-friendly result.
 */
export async function routeAndStore(
  memory: RoutableMemory,
  opts: RouteAndStoreOpts = {},
): Promise<RouteAndStoreResult> {
  try {
    // ── resolve owner ──
    let uid = opts.uid ?? null;
    if (!uid) {
      try {
        const sb = createClient();
        const { data: au } = await sb.auth.getUser();
        uid = au?.user?.id ?? null;
      } catch {
        uid = null;
      }
    }
    if (!uid) {
      return {
        backend: null,
        reason: "Sin sesión.",
        detail: "Inicia sesión para enrutar y guardar la memoria.",
        ok: false,
      };
    }

    // ── load backends + policy (or use provided) ──
    let backends = opts.backends;
    if (!backends || backends.length === 0) {
      backends = await ensureDefaults(uid);
      if (!backends || backends.length === 0) backends = await listBackends();
    }
    const policy = opts.policy ?? (await getPolicy());

    // ── choose backend ──
    const content = memory.content ?? "";
    const sizeMb = Number(sizeMbOf(content).toFixed(3));
    const kind = (memory.kinds && memory.kinds[0]) || undefined;
    const { backend, reason } = chooseBackend(
      { sizeMb, kind, fundamental: opts.fundamental, term: opts.term },
      backends ?? [],
      policy,
    );

    if (!backend) {
      return {
        backend: null,
        reason,
        detail: "No hay ningún almacén activo. Activa al menos uno (por defecto, el servidor StarSeed).",
        ok: false,
      };
    }

    const backendKind = String(backend.kind);
    const cfg = (memory.config ?? {}) as Record<string, unknown>;

    // ── execute per chosen backend ──
    switch (backendKind) {
      /* ───────────────────────── StarSeed (Supabase) ───────────────────────── */
      case "starseed": {
        // Content stays in Supabase; just make sure the row reflects starseed storage.
        const ok = await patchMemoryRow(uid, memory.id, {
          storage: withStorage(memory.storage, "starseed"),
        });
        return {
          backend: backendKind,
          reason,
          detail: `Guardado en el servidor StarSeed (${sizeMb} MB). Contenido disponible al instante como contexto.`,
          ok: ok || !memory.id, // if there's no id yet, the caller will persist it
        };
      }

      /* ───────────────────────── Google Drive (bot) ───────────────────────── */
      case "gdrive": {
        // 1) Is Drive connected for this user?
        let connected = false;
        try {
          const sres = await fetch(
            `${BOT_BASE}/api/drive?action=status&account_id=${encodeURIComponent(uid)}`,
            { method: "GET" },
          );
          const sdata = (await sres.json().catch(() => ({}))) as { ok?: boolean; connected?: boolean };
          connected = Boolean(sdata?.ok && sdata?.connected);
        } catch {
          connected = false;
        }
        if (!connected) {
          return {
            backend: backendKind,
            reason,
            detail: "Drive no conectado — conéctalo en Conexiones.",
            ok: false,
          };
        }

        // 2) Upload the markdown.
        const folderId = (backend.config as Record<string, unknown> | undefined)?.folderId;
        let upRes: Response;
        try {
          upRes = await fetch(`${BOT_BASE}/api/drive`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account_id: uid,
              action: "upload",
              name: ensureMd(memory.name ?? "memoria"),
              content,
              mimeType: "text/markdown",
              ...(folderId ? { folderId } : {}),
            }),
          });
        } catch (e) {
          return {
            backend: backendKind,
            reason,
            detail: `No se pudo contactar con Google Drive: ${e instanceof Error ? e.message : "error de red"}.`,
            ok: false,
          };
        }

        const upData = (await upRes.json().catch(() => ({}))) as {
          ok?: boolean;
          file?: { id?: string; name?: string };
          error?: unknown;
        };

        if (upRes.ok && upData?.ok && upData?.file?.id) {
          const fileId = String(upData.file.id);
          const fileName = String(upData.file.name ?? ensureMd(memory.name ?? "memoria"));
          const link = `https://drive.google.com/file/d/${fileId}/view`;
          const nextConfig = {
            ...cfg,
            drive: { fileId, name: fileName, link },
          };
          await patchMemoryRow(uid, memory.id, {
            config: nextConfig,
            storage: withStorage(memory.storage, "gdrive"),
          });
          return {
            backend: backendKind,
            reason,
            detail: `Subido a Google Drive (${sizeMb} MB) · ${link}`,
            ok: true,
            link,
          };
        }

        return {
          backend: backendKind,
          reason,
          detail: `Google Drive rechazó la subida: ${String(upData?.error ?? `HTTP ${upRes.status}`)}.`,
          ok: false,
        };
      }

      /* ───────────────────────── GitHub (memory_github bot) ───────────────────────── */
      case "github": {
        // The memory_github contract requires a PAT (stored in the user's vault) plus
        // repo/branch/path config. Driving that securely from here is non-trivial, so
        // unless the backend already carries a usable repo+token we mark the intent and
        // let the Memory Hub's existing GitHub panel complete the sync.
        const bcfg = (backend.config ?? {}) as Record<string, unknown>;
        const repo = typeof bcfg.repo === "string" ? bcfg.repo : "";
        const token = typeof bcfg.token === "string" ? bcfg.token : "";
        const branch = typeof bcfg.branch === "string" && bcfg.branch ? bcfg.branch : "main";
        const path =
          typeof bcfg.path === "string" && bcfg.path
            ? bcfg.path
            : `memorias/${ensureMd(memory.name ?? "memoria")}`;

        if (repo && token) {
          try {
            const res = await fetch(`${BOT_BASE}/api/memory_github`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                account_id: uid,
                repo,
                token,
                branch,
                path,
                content,
                action: "push",
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              html_url?: string;
              error?: unknown;
            };
            if (res.ok && data?.ok) {
              const url = typeof data.html_url === "string" ? data.html_url : "";
              const nextConfig = {
                ...cfg,
                github: { repo, branch, path, ...(url ? { html_url: url } : {}) },
              };
              await patchMemoryRow(uid, memory.id, {
                config: nextConfig,
                storage: withStorage(memory.storage, "github"),
              });
              return {
                backend: backendKind,
                reason,
                detail: `Versionado en GitHub${url ? ` · ${url}` : ""}.`,
                ok: true,
                link: url || undefined,
              };
            }
            // fell through → mark pending below
          } catch {
            /* fall through to pending */
          }
        }

        // Not enough to push automatically → mark intent.
        await patchMemoryRow(uid, memory.id, {
          config: { ...cfg, pending: "github" },
          storage: withStorage(memory.storage, "github"),
        });
        return {
          backend: backendKind,
          reason,
          detail: "Pendiente: configura GitHub (repo y PAT) en la memoria para versionarla.",
          ok: false,
        };
      }

      /* ───────────────────────── Local (Syncthing) ───────────────────────── */
      case "local": {
        const nextConfig = { ...cfg, local: { syncthing: true } };
        const ok = await patchMemoryRow(uid, memory.id, {
          config: nextConfig,
          storage: withStorage(memory.storage, "local"),
        });
        return {
          backend: backendKind,
          reason,
          detail: "Marcado para Syncthing (carpeta local). Se sincronizará entre tus dispositivos.",
          ok: ok || !memory.id,
        };
      }

      /* ───────────────────────── Any other extensible source ───────────────────────── */
      default: {
        // obsidian / webdav / s3 / custom — mark intent + tag storage so the UI reflects it.
        const nextConfig = { ...cfg, pending: backendKind };
        await patchMemoryRow(uid, memory.id, {
          config: nextConfig,
          storage: withStorage(memory.storage, backendKind),
        });
        return {
          backend: backendKind,
          reason,
          detail: `Destino "${backendKind}" seleccionado. Configura esta fuente para completar el guardado.`,
          ok: false,
        };
      }
    }
  } catch (e) {
    return {
      backend: null,
      reason: "Error inesperado.",
      detail: `No se pudo enrutar la memoria: ${e instanceof Error ? e.message : "error desconocido"}.`,
      ok: false,
    };
  }
}

export default routeAndStore;
