"use client";

/*
 * user-repos — REPOSITORIOS CREABLES estilo GitHub dentro de la Biblioteca
 * (Adenda 65, §16). Un repo = una `LibraryFolder` con `folder.repo` (RepoMeta):
 * reutiliza ÍNTEGRAMENTE entity-library.ts como backend de su contenido
 * (archivos/folders normales dentro de ese folder) y public-catalog.ts para
 * la visibilidad pública (`publishFolder`, ya existente — no se duplica
 * lógica de publicación).
 *
 * SOP / fuente de verdad: architecture/libreria-biblioteca-sync.md §16.
 */

import {
    createFolder,
    setFolderRepoMeta,
    saveItem,
    type EntityLibraryDoc,
    type LibraryFolder,
    type RepoMeta,
    type RepoRelease,
} from "@/lib/library/entity-library";
import { publishFolder, PUBLIC_CATEGORIES, type PublicCategory } from "@/lib/library/public-catalog";
import { findPackage, install } from "@/lib/library/packages";
import { buildZipBlob } from "@/lib/files/simple-zip";
import type { EntityRef } from "@/lib/sync/entity-state";

let _seq = 0;
function newLocalId(prefix: string): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
    } catch {
        /* noop */
    }
    return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

function safeSeg(name: string): string {
    return (name || "sin-nombre").replace(/[\\/:*?"<>|]+/g, "-").trim() || "sin-nombre";
}

function defaultReadme(name: string, description?: string): string {
    return `# ${name}\n\n${description ? description + "\n\n" : ""}Repositorio creado en la Biblioteca de StarSeed OS.\n`;
}

export interface CreateRepoInput {
    name: string;
    description?: string;
    visibility: "privado" | "publico";
    category?: string;
    license?: string;
    topics?: string[];
    readme?: string;
}

/** Crea un repositorio nuevo (folder raíz + metadatos). Devuelve el id del folder. */
export async function createRepo(
    ref: EntityRef,
    input: CreateRepoInput,
    parentId: string | null = null,
): Promise<{ ok: boolean; folderId?: string; error?: string }> {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "El repositorio necesita un nombre." };
    const folderId = await createFolder(ref, name, parentId);
    if (!folderId) return { ok: false, error: "No se pudo crear el folder del repositorio." };
    const repo: RepoMeta = {
        description: input.description?.trim() || undefined,
        visibility: input.visibility,
        category: input.category,
        license: input.license?.trim() || undefined,
        topics: (input.topics ?? []).map((t) => t.trim()).filter(Boolean),
        readme: input.readme?.trim() || defaultReadme(name, input.description),
        releases: [],
        forkedFrom: null,
        createdAt: new Date().toISOString(),
    };
    await setFolderRepoMeta(ref, folderId, repo);
    return { ok: true, folderId };
}

/** Actualiza (parcialmente) los metadatos de un repositorio ya creado. */
export async function updateRepoMeta(ref: EntityRef, folder: LibraryFolder, patch: Partial<RepoMeta>): Promise<{ ok: boolean }> {
    if (!folder.repo) return { ok: false };
    const next: RepoMeta = { ...folder.repo, ...patch };
    await setFolderRepoMeta(ref, folder.id, next);
    return { ok: true };
}

/** Marca/desmarca un folder EXISTENTE como repositorio ("Convertir en repositorio…"). */
export async function convertFolderToRepo(
    ref: EntityRef,
    folder: LibraryFolder,
    input: Omit<CreateRepoInput, "name">,
): Promise<{ ok: boolean }> {
    const repo: RepoMeta = {
        description: input.description?.trim() || undefined,
        visibility: input.visibility,
        category: input.category,
        license: input.license?.trim() || undefined,
        topics: (input.topics ?? []).map((t) => t.trim()).filter(Boolean),
        readme: input.readme?.trim() || defaultReadme(folder.name, input.description),
        releases: [],
        forkedFrom: null,
        createdAt: new Date().toISOString(),
    };
    await setFolderRepoMeta(ref, folder.id, repo);
    return { ok: true };
}

/**
 * "Publicar versión" (release con nota): añade la entrada al changelog local y,
 * si el repo es público, vuelca de nuevo el folder al catálogo comunitario
 * (`publishFolder`, ya existente) — cada release pública es una fila NUEVA en
 * `library_public_items` (instantánea, no un diff real de git; así se explica
 * en la UI, honesto).
 */
export async function publishRepoRelease(
    ref: EntityRef,
    doc: EntityLibraryDoc,
    folder: LibraryFolder,
    input: { tag: string; note: string },
): Promise<{ ok: boolean; message: string }> {
    if (!folder.repo) return { ok: false, message: "Este folder no es un repositorio." };
    const release: RepoRelease = {
        id: newLocalId("rel"),
        tag: input.tag.trim() || `v${folder.repo.releases.length + 1}`,
        note: input.note.trim(),
        createdAt: new Date().toISOString(),
        by: "tú",
        published: folder.repo.visibility === "publico",
    };
    const nextMeta: RepoMeta = {
        ...folder.repo,
        releases: [release, ...folder.repo.releases],
        lastPublishedAt: folder.repo.visibility === "publico" ? new Date().toISOString() : folder.repo.lastPublishedAt,
    };
    await setFolderRepoMeta(ref, folder.id, nextMeta);

    if (folder.repo.visibility === "publico") {
        const category: PublicCategory = (PUBLIC_CATEGORIES as string[]).includes(folder.repo.category ?? "")
            ? (folder.repo.category as PublicCategory)
            : "repo";
        const res = await publishFolder({
            entityRef: ref,
            items: doc.items,
            folders: doc.folders,
            sourceFolderId: folder.id,
            category,
            destFolder: folder.name,
            recursive: true,
        });
        if (!res.ok) {
            return { ok: true, message: `Versión «${release.tag}» registrada, pero no se pudo publicar al catálogo: ${res.error ?? "error"}.` };
        }
        return { ok: true, message: `Versión «${release.tag}» publicada (${res.count} ítem(s) volcados en la Librería pública).` };
    }
    return { ok: true, message: `Versión «${release.tag}» registrada en el historial del repositorio (privado).` };
}

/**
 * "Replicar" (fork): copia recursiva de un folder-repo (+ subfolders +
 * ítems) a la biblioteca de `destRef`, como un repo NUEVO con
 * `repo.forkedFrom` apuntando al origen. Copia independiente (como
 * `duplicateItem`, no vinculada como `branch`) — un fork es tu propia copia
 * editable, igual que en GitHub.
 */
export async function forkRepo(
    sourceRef: EntityRef,
    sourceDoc: EntityLibraryDoc,
    sourceFolder: LibraryFolder,
    destRef: EntityRef,
    destParentId: string | null = null,
): Promise<{ ok: boolean; folderId?: string; error?: string; itemsCopied?: number }> {
    if (!sourceFolder.repo) return { ok: false, error: "Ese folder no es un repositorio." };

    const created = await createRepo(
        destRef,
        {
            name: sourceFolder.name,
            description: sourceFolder.repo.description,
            visibility: "privado", // el fork nace privado: no auto-publica nada en nombre del autor original
            category: sourceFolder.repo.category,
            license: sourceFolder.repo.license,
            topics: sourceFolder.repo.topics,
            readme: sourceFolder.repo.readme,
        },
        destParentId,
    );
    if (!created.ok || !created.folderId) return created;

    await setFolderRepoMeta(destRef, created.folderId, {
        description: sourceFolder.repo.description,
        visibility: "privado",
        category: sourceFolder.repo.category,
        license: sourceFolder.repo.license,
        topics: sourceFolder.repo.topics,
        readme: sourceFolder.repo.readme,
        releases: [],
        forkedFrom: { kind: sourceRef.kind, id: sourceRef.id, folderId: sourceFolder.id },
        createdAt: new Date().toISOString(),
    });

    let itemsCopied = 0;
    async function copySubtree(srcFolderId: string, destFolderId: string): Promise<void> {
        const childFolders = sourceDoc.folders.filter((f) => (f.parentId ?? null) === srcFolderId);
        for (const child of childFolders) {
            const newChildId = await createFolder(destRef, child.name, destFolderId);
            await copySubtree(child.id, newChildId);
        }
        const items = sourceDoc.items.filter((it) => (it.folderId ?? null) === srcFolderId && it.type !== "alias");
        for (const it of items) {
            const res = await saveItem(
                destRef,
                {
                    type: it.type,
                    refId: it.refId,
                    route: it.route,
                    url: it.url,
                    title: it.title,
                    note: it.note,
                    tags: it.tags,
                    mime: it.mime,
                    thumbnail: it.thumbnail,
                    content: it.content,
                    language: it.language,
                    description: it.description,
                    connectedRepo: it.connectedRepo,
                },
                destFolderId,
            );
            if (res.ok) itemsCopied++;
        }
    }
    await copySubtree(sourceFolder.id, created.folderId);

    return { ok: true, folderId: created.folderId, itemsCopied };
}

/** ¿Este repo tiene al menos un paquete instalable directo (para mostrar/ocultar "Instalar")? */
export function hasInstallablePackages(doc: EntityLibraryDoc, folderId: string): boolean {
    return doc.items.some(
        (it) => (it.folderId ?? null) === folderId && it.type === "package" && !!it.refId && !!findPackage(it.refId),
    );
}

/**
 * "Instalar": SOLO si el repo contiene ítems `type:"package"` válidos → los
 * instala vía `packages.ts:install()` ya existente (cero lógica nueva de
 * instalación). Honesto: si no hay ninguno, la UI oculta el botón por
 * completo (ver `hasInstallablePackages`).
 */
export async function installRepoPackages(
    doc: EntityLibraryDoc,
    folderId: string,
): Promise<{ ok: boolean; installed: number; skipped: number }> {
    const candidates = doc.items.filter((it) => (it.folderId ?? null) === folderId && it.type === "package" && it.refId);
    let installed = 0;
    let skipped = 0;
    for (const it of candidates) {
        const pkg = it.refId ? findPackage(it.refId) : undefined;
        if (!pkg) {
            skipped++;
            continue;
        }
        const res = await install(pkg);
        if (res.ok) installed++;
        else skipped++;
    }
    return { ok: installed > 0, installed, skipped };
}

/**
 * "Descargar": genera un .zip (sin dependencias — `simple-zip.ts`) con el
 * README.md + contenido de los ítems (texto inline si existe, o mejor
 * esfuerzo de `fetch(url)` si no). Lo que no se puede traer (CORS, sin url)
 * queda como una referencia `.url.txt` — nunca se pierde silenciosamente.
 */
export async function downloadRepoZip(doc: EntityLibraryDoc, folder: LibraryFolder): Promise<{ ok: boolean; error?: string }> {
    if (typeof window === "undefined") return { ok: false, error: "Solo disponible en el navegador." };
    if (!folder.repo) return { ok: false, error: "Ese folder no es un repositorio." };

    const entries: { path: string; data: Uint8Array | string }[] = [
        { path: "README.md", data: folder.repo.readme || `# ${folder.name}\n` },
    ];

    async function walk(folderId: string, prefix: string): Promise<void> {
        const childFolders = doc.folders.filter((f) => (f.parentId ?? null) === folderId);
        for (const child of childFolders) {
            await walk(child.id, `${prefix}${safeSeg(child.name)}/`);
        }
        const items = doc.items.filter((it) => (it.folderId ?? null) === folderId && it.type !== "alias");
        for (const it of items) {
            const name = `${prefix}${safeSeg(it.title)}`;
            if (it.content) {
                entries.push({ path: `${name}.txt`, data: it.content });
                continue;
            }
            if (it.url) {
                try {
                    const res = await fetch(it.url);
                    if (res.ok) {
                        const buf = new Uint8Array(await res.arrayBuffer());
                        entries.push({ path: name, data: buf });
                        continue;
                    }
                } catch {
                    /* CORS/red: cae a la referencia de enlace de abajo */
                }
            }
            entries.push({
                path: `${name}.url.txt`,
                data: `${it.title}\n${it.url ?? it.route ?? "(sin URL ni ruta)"}\n\n(No se pudo incluir el contenido real: enlace externo o bloqueado por CORS.)\n`,
            });
        }
    }
    await walk(folder.id, "");

    const blob = buildZipBlob(entries);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeSeg(folder.name) || "repositorio"}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true };
}
