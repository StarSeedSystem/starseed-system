"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Biblioteca · MARCADORES (guardar-todo con etiquetado IA)
 * ---------------------------------------------------------------------------
 * Superficie NUEVA, acotada, inspirada en Karakeep (guarda enlaces/notas/
 * imágenes con etiquetado automático + búsqueda de texto completo) pero de
 * IMPLEMENTACIÓN PROPIA: no copia código AGPL, solo el concepto. Ver paquete
 * `iatool-karakeep` (packages.ts) y la capacidad `bookmarks-ai` (skills.ts).
 *
 * Modelo de datos: cada marcador es un `SavedItem` normal de
 * `entity-library.ts` con `type:"bookmark"`, guardado dentro de un folder
 * raíz "Marcadores" (auto-creada, una por biblioteca de entidad). Así los
 * marcadores viven DENTRO de la Biblioteca ya existente (Finder, permisos,
 * ramas, publicación…) sin duplicar infraestructura: esta capa solo añade el
 * concepto de "marcador" + la sugerencia de etiquetas + una búsqueda local.
 *
 * Etiquetado: si hay alguna fuente de Aurora disponible (Astraura es
 * gratis-primero: Pollinations siempre activo por defecto), se pide una
 * sugerencia breve de etiquetas vía `astrauraChat` (import dinámico,
 * defensivo, con timeout corto). Si Aurora no responde a tiempo o falla, cae
 * a una heurística local determinista (dominio del enlace + palabra clave del
 * título) — el guardado JAMÁS depende de que la IA responda.
 *
 * OJO dedupe: `saveItem` deduplica por (type+refId+route+url). Una nota sin
 * URL no tiene forma natural de distinguirse de otra, así que aquí generamos
 * un `refId` único para cualquier marcador SIN url (notas e imágenes pegadas
 * sin enlace propio) — los marcadores CON url sí reutilizan/actualizan la
 * entrada existente si se guarda la misma URL dos veces (mismo comportamiento
 * que el resto de la Biblioteca: Entidad Única, no duplica referencias).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
    saveItem,
    createFolder,
    listLibrary,
    readLibrarySnapshot,
    type EntityRef,
    type SavedItem,
} from "./entity-library";
import { currentUserRef } from "@/lib/sync/entity-state";

/** Nombre del folder raíz donde viven todos los marcadores de una biblioteca. */
export const BOOKMARKS_FOLDER_NAME = "Marcadores";

export type BookmarkKind = "enlace" | "nota" | "imagen";

export interface SaveBookmarkInput {
    kind: BookmarkKind;
    /** Título legible; si falta, se deriva de la URL o queda "Marcador sin título". */
    title?: string;
    url?: string;
    note?: string;
    /** Cuerpo largo (para notas) o descripción. */
    content?: string;
    /** Miniatura/imagen (para marcadores de tipo "imagen" o previews de enlaces). */
    thumbnail?: string;
    mime?: string;
    /** Etiquetas explícitas del usuario. Si se omiten, se intenta sugerir vía IA. */
    tags?: string[];
    /** `false` para NO llamar a Aurora aunque falten etiquetas (por defecto intenta sugerir). */
    suggestTags?: boolean;
}

export interface SaveBookmarkResult {
    ok: boolean;
    id?: string;
    folderId?: string;
    tags: string[];
    error?: string;
}

/** `ref` explícito, o "Mi biblioteca" (usuario con sesión) por defecto. */
async function resolveRef(ref?: EntityRef | null): Promise<EntityRef | null> {
    if (ref) return ref;
    try {
        return await currentUserRef();
    } catch {
        return null;
    }
}

function uniqueRefId(prefix: string): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}_${crypto.randomUUID()}`;
    } catch {
        /* noop */
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Busca (o crea) el folder raíz "Marcadores" de una biblioteca. Idempotente. */
export async function ensureBookmarksFolder(ref: EntityRef): Promise<string> {
    const doc = await listLibrary(ref);
    const existing = doc.folders.find((f) => f.parentId === null && f.name === BOOKMARKS_FOLDER_NAME);
    if (existing) return existing.id;
    return createFolder(ref, BOOKMARKS_FOLDER_NAME, null);
}

/** Heurística SIN IA: tipo + dominio del enlace + una palabra clave del título. Nunca falla. */
function heuristicTags(input: { title: string; url?: string; kind: BookmarkKind }): string[] {
    const out = new Set<string>();
    out.add(input.kind);
    if (input.url) {
        try {
            const host = new URL(input.url).hostname.replace(/^www\./, "");
            const root = host.split(".")[0];
            if (root) out.add(root.toLowerCase());
        } catch {
            /* URL no parseable: se ignora sin romper nada */
        }
    }
    const word = input.title
        .trim()
        .split(/\s+/)
        .find((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length > 3);
    if (word) {
        const clean = word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
        if (clean) out.add(clean);
    }
    return Array.from(out).filter(Boolean).slice(0, 5);
}

/** Resuelve `p`, o `null` si tarda más de `ms` (nunca lanza, nunca cuelga el guardado). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        p.then(
            (v) => {
                clearTimeout(timer);
                resolve(v);
            },
            () => {
                clearTimeout(timer);
                resolve(null);
            },
        );
    });
}

/**
 * Sugiere de 2 a 5 etiquetas breves en español para un marcador, vía Aurora
 * (`astrauraChat`, gratis-primero — import dinámico defensivo para no acoplar
 * el bundle). Timeout de 6s: si Aurora no responde a tiempo o la llamada
 * falla por cualquier motivo, cae a `heuristicTags` (determinista, sin red).
 * NUNCA lanza.
 */
export async function suggestBookmarkTags(input: {
    title: string;
    url?: string;
    note?: string;
    kind: BookmarkKind;
}): Promise<string[]> {
    const fallback = () => heuristicTags(input);
    try {
        const { astrauraChat } = await import("@/ai/astraura/router");
        const context = [`Título: ${input.title}`, input.url ? `URL: ${input.url}` : "", input.note ? `Nota: ${input.note}` : ""]
            .filter(Boolean)
            .join("\n");
        const res = await withTimeout(
            astrauraChat({
                taskHint: "summary",
                messages: [
                    {
                        role: "user",
                        content:
                            `Sugiere de 2 a 5 etiquetas breves (una o dos palabras cada una, en español, sin almohadilla) ` +
                            `para clasificar este marcador guardado. Responde SOLO las etiquetas separadas por comas, sin ` +
                            `explicación ni numeración:\n\n${context}`,
                    },
                ],
            }),
            6000,
        );
        const text = res?.text?.trim();
        if (!text) return fallback();
        const tags = text
            .replace(/^[#\s]+/, "")
            .split(/[,\n]/)
            .map((t) => t.trim().replace(/^#/, "").toLowerCase())
            .filter((t) => t.length > 0 && t.length <= 24 && !/\s{2,}/.test(t))
            .slice(0, 5);
        return tags.length ? tags : fallback();
    } catch {
        return fallback();
    }
}

/**
 * Guarda un marcador (enlace/nota/imagen) dentro del folder "Marcadores" de
 * una biblioteca. Si no se pasa `ref`, usa "Mi biblioteca" (requiere sesión).
 * Si faltan etiquetas y `suggestTags !== false`, intenta sugerirlas vía Aurora
 * (best-effort, nunca bloquea más de ~6s). NUNCA lanza.
 */
export async function saveBookmark(input: SaveBookmarkInput, ref?: EntityRef | null): Promise<SaveBookmarkResult> {
    try {
        const target = await resolveRef(ref);
        if (!target) return { ok: false, tags: [], error: "Inicia sesión para guardar marcadores." };

        const url = input.url?.trim() || undefined;
        const title = input.title?.trim() || url || "Marcador sin título";

        let tags = (input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
        if (!tags.length && input.suggestTags !== false) {
            tags = await suggestBookmarkTags({ title, url, note: input.note, kind: input.kind });
        }

        const folderId = await ensureBookmarksFolder(target);
        // Sin URL (nota/imagen pegada) no hay forma natural de deduplicar: se
        // genera un refId único para que cada guardado sea una entrada nueva.
        const refId = url ? undefined : uniqueRefId(`bookmark-${input.kind}`);

        const res = await saveItem(
            target,
            {
                type: "bookmark",
                refId,
                title,
                url,
                note: input.note,
                content: input.content,
                thumbnail: input.thumbnail,
                mime: input.mime,
                tags,
            },
            folderId,
        );
        return { ok: res.ok, id: res.id, folderId, tags };
    } catch (err: unknown) {
        return { ok: false, tags: [], error: (err as Error)?.message || "No se pudo guardar el marcador." };
    }
}

/** Todos los marcadores de una biblioteca (más recientes primero; ya vienen así de `listLibrary`). */
export async function listBookmarks(ref: EntityRef): Promise<SavedItem[]> {
    const doc = await listLibrary(ref);
    return doc.items.filter((it) => it.type === "bookmark");
}

/** Snapshot síncrono (solo cache local) de los marcadores — para pintar UI sin esperar red. */
export function bookmarksSnapshot(ref: EntityRef): SavedItem[] {
    return readLibrarySnapshot(ref).items.filter((it) => it.type === "bookmark");
}

/**
 * Búsqueda de texto completo LOCAL y simple (sin índice ni servicio externo):
 * coincidencia de subcadena, sin distinguir mayúsculas/acentos exactos, sobre
 * título + nota + contenido + URL + etiquetas. `query` vacío devuelve `items`
 * tal cual (sin filtrar).
 */
export function searchBookmarks(items: SavedItem[], query: string): SavedItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
        const haystack = [it.title, it.note, it.content, it.url, ...(it.tags ?? [])]
            .filter((v): v is string => typeof v === "string" && v.length > 0)
            .join("   ")
            .toLowerCase();
        return haystack.includes(q);
    });
}
