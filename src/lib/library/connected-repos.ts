"use client";

/*
 * connected-repos — REPOS EXTERNOS CONECTADOS (GitHub, lectura pública)
 * (Adenda 65, §17). Cliente del proxy `api/github-repo/[owner]/[repo]`;
 * guarda/actualiza ítems `type:"repo"` en entity-library.ts (§17).
 *
 * SOP: architecture/libreria-biblioteca-sync.md §17.
 */

import {
    addConnectedRepoItem,
    resyncConnectedRepoItem,
    type ConnectedRepoMeta,
} from "@/lib/library/entity-library";
import { addRepoByUrl } from "@/lib/library/packages";
import type { EntityRef } from "@/lib/sync/entity-state";

export interface ParsedRepoRef {
    owner: string;
    repo: string;
}

/** Interpreta una URL de GitHub (o "owner/repo" directo) en {owner,repo}. Nunca lanza. */
export function parseGithubRef(input: string): ParsedRepoRef | null {
    const trimmed = (input ?? "").trim();
    if (!trimmed) return null;
    if (!trimmed.includes("://") && !/github\.com/i.test(trimmed)) {
        const short = trimmed.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
        if (short) return { owner: short[1], repo: short[2] };
    }
    try {
        const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        const url = new URL(withProtocol);
        if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
        const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
        if (parts.length < 2) return null;
        const repo = parts[1].replace(/\.git$/i, "");
        if (!parts[0] || !repo) return null;
        return { owner: parts[0], repo };
    } catch {
        return null;
    }
}

export interface FetchRepoMetaResult {
    ok: boolean;
    data?: ConnectedRepoMeta;
    error?: string;
}

/** Llama al proxy de servidor y normaliza la respuesta a `ConnectedRepoMeta`. Nunca lanza. */
export async function fetchGithubRepoMeta(owner: string, repo: string): Promise<FetchRepoMetaResult> {
    try {
        const res = await fetch(`/api/github-repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
            cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; data?: Record<string, unknown> } | null;
        if (!json || json.ok !== true || !json.data) {
            return { ok: false, error: json?.error || `No se pudo obtener el repositorio (${res.status}).` };
        }
        const d = json.data;
        const meta: ConnectedRepoMeta = {
            provider: "github",
            owner,
            repo,
            fullName: String(d.fullName ?? `${owner}/${repo}`),
            description: d.description ? String(d.description) : undefined,
            htmlUrl: String(d.htmlUrl ?? `https://github.com/${owner}/${repo}`),
            homepage: d.homepage ? String(d.homepage) : undefined,
            stars: Number(d.stars ?? 0),
            forks: Number(d.forks ?? 0),
            language: d.language ? String(d.language) : undefined,
            license: d.license ? String(d.license) : undefined,
            topics: Array.isArray(d.topics) ? (d.topics as unknown[]).map((t) => String(t)) : [],
            defaultBranch: String(d.defaultBranch ?? "main"),
            ownerLogin: String(d.ownerLogin ?? owner),
            ownerAvatar: d.ownerAvatar ? String(d.ownerAvatar) : undefined,
            readme: typeof d.readme === "string" ? d.readme : null,
            releases: Array.isArray(d.releases)
                ? (d.releases as Record<string, unknown>[]).map((r) => ({
                      tag: String(r.tag ?? ""),
                      name: r.name ? String(r.name) : undefined,
                      body: r.body ? String(r.body) : undefined,
                      publishedAt: r.publishedAt ? String(r.publishedAt) : undefined,
                      htmlUrl: r.htmlUrl ? String(r.htmlUrl) : undefined,
                  }))
                : [],
            syncedAt: new Date().toISOString(),
        };
        return { ok: true, data: meta };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Error de red al contactar GitHub." };
    }
}

/** Conecta (parsea URL + trae metadatos + guarda ítem) un repo externo en una biblioteca. */
export async function connectRepo(
    ref: EntityRef,
    input: string,
    folderId: string | null = null,
): Promise<{ ok: boolean; id?: string; error?: string }> {
    const parsed = parseGithubRef(input);
    if (!parsed) {
        return { ok: false, error: "No reconozco esa URL. Usa https://github.com/usuario/repositorio (o «usuario/repositorio»)." };
    }
    const meta = await fetchGithubRepoMeta(parsed.owner, parsed.repo);
    if (!meta.ok || !meta.data) return { ok: false, error: meta.error };
    const saved = await addConnectedRepoItem(ref, meta.data, folderId);
    if (!saved.ok) return { ok: false, error: "No se pudo guardar la referencia en tu biblioteca." };
    return { ok: true, id: saved.id };
}

/** "Sincronizar metadatos": vuelve a traer la ficha de GitHub y actualiza el ítem guardado. */
export async function resyncConnectedRepo(
    ref: EntityRef,
    itemId: string,
    owner: string,
    repo: string,
): Promise<{ ok: boolean; error?: string }> {
    const meta = await fetchGithubRepoMeta(owner, repo);
    if (!meta.ok || !meta.data) return { ok: false, error: meta.error };
    const res = await resyncConnectedRepoItem(ref, itemId, meta.data);
    return res.ok ? { ok: true } : { ok: false, error: "No se pudo actualizar la referencia." };
}

/** Enlace directo al .zip que sirve el propio GitHub (descarga/navegación directa; no pasa por nuestro proxy). */
export function githubZipUrl(meta: ConnectedRepoMeta): string {
    return `${meta.htmlUrl}/archive/refs/heads/${encodeURIComponent(meta.defaultBranch)}.zip`;
}

/**
 * "Instalar": intenta encontrar un catálogo de paquetes StarSeed
 * (`starseed.repo.json`) en la rama por defecto (o main/master) del repo
 * conectado, vía `addRepoByUrl()` YA EXISTENTE de packages.ts (misma
 * validación robusta que "Repos → añadir por URL"). Honesto: si no existe,
 * lo dice claramente — nunca finge instalar nada.
 */
export async function tryInstallManifest(meta: ConnectedRepoMeta): Promise<{ ok: boolean; message: string }> {
    const branches = Array.from(new Set([meta.defaultBranch, "main", "master"].filter(Boolean)));
    for (const branch of branches) {
        const url = `https://raw.githubusercontent.com/${meta.owner}/${meta.repo}/${encodeURIComponent(branch)}/starseed.repo.json`;
        const res = await addRepoByUrl(url);
        if (res.ok) return { ok: true, message: res.message };
    }
    return {
        ok: false,
        message:
            "Este repo no publica un catálogo de paquetes StarSeed (starseed.repo.json) en su rama por defecto — no se puede instalar directamente. Prueba «Guardar» o «Descargar».",
    };
}
