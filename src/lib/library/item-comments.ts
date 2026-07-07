"use client";

/*
 * item-comments — COMENTARIOS ligeros por ítem/carpeta de Biblioteca (Adenda 65, §15).
 * ═══════════════════════════════════════════════════════════════════════════
 * Hilo simple (lista plana, sin respuestas anidadas) persistido en
 * `entity_state(ref, key='lib-comments:<targetId>')` — NO en el doc principal
 * de biblioteca (`key='library'`) para no acoplar su LWW/tamaño a hilos de
 * conversación que crecen sin límite claro. `targetId` es `item.id` o
 * `folder.id`; ambos espacios de id ya llevan prefijo único de `makeId()`
 * (`item-`/`folder-`/`alias-`/`branch-`/`repo-`), así que nunca colisionan.
 *
 * SOP / fuente de verdad: architecture/libreria-biblioteca-sync.md §15.
 * Local-first tolerante: sin sesión o sin red, degrada a lista vacía / no-op,
 * nunca lanza. Realtime vía el mismo motor genérico de entity_state (§4).
 */

import { useCallback, useEffect, useState } from "react";
import {
    currentUserRef,
    getEntityState,
    setEntityState,
    subscribeEntityState,
    type EntityRef,
} from "@/lib/sync/entity-state";

export interface LibComment {
    id: string;
    authorId: string;
    authorLabel?: string;
    body: string;
    createdAt: string;
    editedAt?: string;
}

export interface LibCommentsDoc {
    comments: LibComment[];
}

function commentsKey(targetId: string): string {
    return `lib-comments:${targetId}`;
}

function emptyDoc(): LibCommentsDoc {
    return { comments: [] };
}

function normalizeDoc(raw: unknown): LibCommentsDoc {
    if (!raw || typeof raw !== "object") return emptyDoc();
    const r = raw as Record<string, unknown>;
    const comments = Array.isArray(r.comments)
        ? r.comments.filter((c): c is LibComment => !!c && typeof c === "object" && typeof (c as LibComment).id === "string")
        : [];
    return { comments };
}

let _seq = 0;
function makeCommentId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `cmt-${crypto.randomUUID()}`;
    } catch {
        /* noop */
    }
    return `cmt-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

/** Lee el hilo de comentarios de un ítem/carpeta. Nunca lanza; sin datos devuelve lista vacía. */
export async function listComments(ref: EntityRef, targetId: string): Promise<LibComment[]> {
    const row = await getEntityState<LibCommentsDoc>(ref, commentsKey(targetId));
    if (!row || !row.value) return [];
    return normalizeDoc(row.value).comments;
}

/** Añade un comentario. Requiere sesión (el autor se resuelve del usuario actual). */
export async function addComment(
    ref: EntityRef,
    targetId: string,
    body: string,
    authorLabel?: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "El comentario está vacío." };
    const who = await currentUserRef();
    if (!who) return { ok: false, error: "Inicia sesión para comentar." };
    try {
        const current = await listComments(ref, targetId);
        const entry: LibComment = {
            id: makeCommentId(),
            authorId: who.id,
            authorLabel,
            body: trimmed,
            createdAt: new Date().toISOString(),
        };
        const next: LibCommentsDoc = { comments: [...current, entry] };
        await setEntityState(ref, commentsKey(targetId), next);
        return { ok: true, id: entry.id };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "No se pudo comentar." };
    }
}

/** Edita un comentario propio (best-effort: no re-valida autoría contra el servidor). */
export async function editComment(ref: EntityRef, targetId: string, commentId: string, body: string): Promise<{ ok: boolean }> {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false };
    try {
        const current = await listComments(ref, targetId);
        if (!current.some((c) => c.id === commentId)) return { ok: false };
        const next: LibCommentsDoc = {
            comments: current.map((c) => (c.id === commentId ? { ...c, body: trimmed, editedAt: new Date().toISOString() } : c)),
        };
        await setEntityState(ref, commentsKey(targetId), next);
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

/** Borra un comentario. */
export async function removeComment(ref: EntityRef, targetId: string, commentId: string): Promise<{ ok: boolean }> {
    try {
        const current = await listComments(ref, targetId);
        const next: LibCommentsDoc = { comments: current.filter((c) => c.id !== commentId) };
        await setEntityState(ref, commentsKey(targetId), next);
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

export interface UseLibComments {
    comments: LibComment[];
    loading: boolean;
    add: (body: string, authorLabel?: string) => Promise<{ ok: boolean; id?: string; error?: string }>;
    edit: (commentId: string, body: string) => Promise<{ ok: boolean }>;
    remove: (commentId: string) => Promise<{ ok: boolean }>;
}

/** Hook realtime del hilo de comentarios de un ítem/carpeta. `targetId` null = inactivo. */
export function useLibComments(ref: EntityRef | null, targetId: string | null): UseLibComments {
    const [comments, setComments] = useState<LibComment[]>([]);
    const [loading, setLoading] = useState<boolean>(!!ref && !!targetId);

    useEffect(() => {
        if (!ref || !targetId) {
            setComments([]);
            setLoading(false);
            return;
        }
        let alive = true;
        setLoading(true);
        listComments(ref, targetId).then((list) => {
            if (alive) {
                setComments(list);
                setLoading(false);
            }
        });
        const unsub = subscribeEntityState<LibCommentsDoc>(ref, commentsKey(targetId), (change) => {
            if (!alive) return;
            setComments(normalizeDoc(change.value).comments);
        });
        return () => {
            alive = false;
            unsub();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- ref.kind/ref.id/targetId identifican la suscripción de forma estable
    }, [ref?.kind, ref?.id, targetId]);

    const add = useCallback(
        (body: string, authorLabel?: string) => {
            if (!ref || !targetId) return Promise.resolve({ ok: false, error: "Sin destino." });
            return addComment(ref, targetId, body, authorLabel);
        },
        [ref, targetId],
    );
    const edit = useCallback(
        (commentId: string, body: string) => (ref && targetId ? editComment(ref, targetId, commentId, body) : Promise.resolve({ ok: false })),
        [ref, targetId],
    );
    const remove = useCallback(
        (commentId: string) => (ref && targetId ? removeComment(ref, targetId, commentId) : Promise.resolve({ ok: false })),
        [ref, targetId],
    );

    return { comments, loading, add, edit, remove };
}
