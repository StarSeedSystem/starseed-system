"use client";

/*
 * feed-filters — FILTROS · ORDEN · BÚSQUEDA INTELIGENTE de publicaciones
 * (Adenda 66 §7). Lógica reutilizable que se monta encima de CUALQUIER feed:
 *
 *   · Filtrar por etiquetas/tipos (catálogo de creation-config).
 *   · Ordenar: reciente · relevante · popular · cronológico inverso · propios.
 *   · Vista: lista · tarjetas · compacta.
 *   · Búsqueda de texto (título/cuerpo/autor).
 *   · Relevancia con Astraura ("Para mí"): reordena por afinidad con el perfil,
 *     SIN bloquear la UI (se aplica cuando llega; fallback = recencia).
 *
 * Preferencias POR PERFIL y POR ENTORNO, persistidas en `starseed.feed.prefs.v1`
 * (mapa `${perfil}::${entorno}` → prefs). Reportar esa clave para SYNCED_KEYS.
 *
 * SSR-safe: todo acceso a localStorage/ventana va guardado; astrauraChat solo se
 * invoca en el cliente vía import dinámico (no engorda el bundle del feed).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedPost } from "@/lib/social-posts";
// Catálogo de tipos por destino del Centro de Creación. ENGANCHE: si más
// adelante creation-config exporta un array plano de etiquetas múltiples (p.ej.
// `POST_TAGS`), sustituir la derivación de abajo por ese import directo.
import { TIPOS_POR_DEST } from "@/components/creation/creation-config";

/* ─────────────────────────── Tipos ─────────────────────────── */

export type FeedSort = "reciente" | "relevante" | "popular" | "cronologico" | "propios";
export type FeedView = "lista" | "tarjetas" | "compacta";

export interface FeedPrefs {
    sort: FeedSort;
    view: FeedView;
    /** Etiquetas/tipos activos (post.kind ∈ tags). Vacío = todas. */
    tags: string[];
    /** Texto de búsqueda (título/cuerpo/autor). */
    query: string;
    /** "Para mí": reordena por afinidad con el contexto del perfil (Astraura). */
    forMe: boolean;
}

export const DEFAULT_FEED_PREFS: FeedPrefs = {
    sort: "reciente",
    view: "tarjetas",
    tags: [],
    query: "",
    forMe: false,
};

/** Clave de persistencia (mapa por perfil+entorno). Reportar para SYNCED_KEYS. */
export const FEED_PREFS_KEY = "starseed.feed.prefs.v1";
/** Evento window emitido al cambiar preferencias (sync entre montajes/pestañas). */
export const FEED_PREFS_EVENT = "starseed:feed-prefs";

export interface FeedTag {
    id: string;
    label: string;
}

/** Catálogo de etiquetas/tipos, derivado de creation-config (dedup por id). */
export const FEED_TAG_CATALOG: FeedTag[] = (() => {
    const seen = new Map<string, string>();
    seen.set("post", "General");
    for (const defs of Object.values(TIPOS_POR_DEST)) {
        for (const d of defs) {
            if (!seen.has(d.id)) seen.set(d.id, d.label);
        }
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
})();

export const FEED_SORT_LABELS: Record<FeedSort, string> = {
    reciente: "Reciente",
    relevante: "Relevante",
    popular: "Popular",
    cronologico: "Cronológico inverso",
    propios: "Propios",
};

export const FEED_VIEW_LABELS: Record<FeedView, string> = {
    lista: "Lista",
    tarjetas: "Tarjetas",
    compacta: "Compacta",
};

/* ─────────────────────────── Helpers de texto ─────────────────────────── */

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Minúsculas sin acentos (búsqueda tolerante). */
function fold(s: string): string {
    return (s || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
}

/** Marca de tiempo (ms) segura de un post. */
function timeOf(p: NormalizedPost): number {
    const t = Date.parse(p.createdAt || "");
    return Number.isFinite(t) ? t : 0;
}

/** Señal de interacción (likes + comentarios, comentarios pesan más). */
function engagementOf(p: NormalizedPost): number {
    return (p.likes || 0) + 2 * (p.commentsCount || 0);
}

/* ─────────────────────────── Persistencia por perfil+entorno ─────────────────────────── */

/** Perfil activo en este dispositivo (best-effort; distintas formas posibles). */
function activeProfileScope(): string {
    if (!isClient()) return "me";
    try {
        const raw = localStorage.getItem("starseed.profile.active.v1");
        if (!raw) return "me";
        const t = raw.trim();
        if (t.startsWith("{")) {
            const o = JSON.parse(t) as Record<string, unknown>;
            const id = o.id ?? o.activeId ?? o.profileId ?? o.userId;
            return typeof id === "string" && id ? id : "me";
        }
        return t.replace(/^"|"$/g, "") || "me";
    } catch {
        return "me";
    }
}

/** Clave compuesta perfil::entorno. `profileId` explícito gana al activo. */
export function feedScopeKey(envKey: string, profileId?: string): string {
    const profile = profileId || activeProfileScope();
    return `${profile}::${envKey || "global"}`;
}

type PrefsStore = Record<string, Partial<FeedPrefs>>;

function readStore(): PrefsStore {
    if (!isClient()) return {};
    try {
        const raw = localStorage.getItem(FEED_PREFS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? (parsed as PrefsStore) : {};
    } catch {
        return {};
    }
}

function normalizePrefs(raw: Partial<FeedPrefs> | undefined | null): FeedPrefs {
    if (!raw) return { ...DEFAULT_FEED_PREFS };
    const sort: FeedSort = (["reciente", "relevante", "popular", "cronologico", "propios"] as FeedSort[]).includes(
        raw.sort as FeedSort,
    )
        ? (raw.sort as FeedSort)
        : DEFAULT_FEED_PREFS.sort;
    const view: FeedView = (["lista", "tarjetas", "compacta"] as FeedView[]).includes(raw.view as FeedView)
        ? (raw.view as FeedView)
        : DEFAULT_FEED_PREFS.view;
    return {
        sort,
        view,
        tags: Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string") : [],
        query: typeof raw.query === "string" ? raw.query : "",
        forMe: raw.forMe === true,
    };
}

export function getFeedPrefs(envKey: string, profileId?: string): FeedPrefs {
    return normalizePrefs(readStore()[feedScopeKey(envKey, profileId)]);
}

export function setFeedPrefsFor(envKey: string, next: FeedPrefs, profileId?: string): void {
    if (!isClient()) return;
    const key = feedScopeKey(envKey, profileId);
    const store = readStore();
    // No persistimos la query (efímera): se guarda solo orden/vista/tags/forMe.
    store[key] = { sort: next.sort, view: next.view, tags: next.tags, forMe: next.forMe };
    try {
        localStorage.setItem(FEED_PREFS_KEY, JSON.stringify(store));
    } catch {
        /* cuota: degradamos en silencio */
    }
    try {
        window.dispatchEvent(new CustomEvent(FEED_PREFS_EVENT, { detail: { key } }));
    } catch {
        /* noop */
    }
}

/* ─────────────────────────── Hook de preferencias ─────────────────────────── */

export interface UseFeedPrefs {
    prefs: FeedPrefs;
    setPrefs: (patch: Partial<FeedPrefs>) => void;
    resetPrefs: () => void;
}

/**
 * Preferencias reactivas del feed (por perfil+entorno), con sync entre montajes
 * y pestañas. `query` vive solo en memoria de este montaje (no se persiste).
 */
export function useFeedPrefs(envKey: string, profileId?: string): UseFeedPrefs {
    const key = feedScopeKey(envKey, profileId);
    const [prefs, setLocal] = useState<FeedPrefs>(() => (isClient() ? getFeedPrefs(envKey, profileId) : { ...DEFAULT_FEED_PREFS }));

    // Recarga al montar (evita desajuste de hidratación) y ante cambios externos.
    useEffect(() => {
        setLocal(getFeedPrefs(envKey, profileId));
        if (!isClient()) return;
        const onChange = (e: Event) => {
            const detail = (e as CustomEvent<{ key?: string } | undefined>).detail;
            if (!detail || detail.key === key) setLocal((p) => ({ ...getFeedPrefs(envKey, profileId), query: p.query }));
        };
        const onStorage = (ev: StorageEvent) => {
            if (ev.key === FEED_PREFS_KEY || ev.key === null) setLocal((p) => ({ ...getFeedPrefs(envKey, profileId), query: p.query }));
        };
        window.addEventListener(FEED_PREFS_EVENT, onChange);
        window.addEventListener("storage", onStorage);
        return () => {
            window.removeEventListener(FEED_PREFS_EVENT, onChange);
            window.removeEventListener("storage", onStorage);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifica envKey+profileId de forma estable
    }, [key]);

    const setPrefs = useCallback(
        (patch: Partial<FeedPrefs>) => {
            setLocal((prev) => {
                const next = { ...prev, ...patch };
                // La query es efímera: si el cambio es SOLO la query, no persistimos.
                const onlyQuery = Object.keys(patch).length === 1 && "query" in patch;
                if (!onlyQuery) setFeedPrefsFor(envKey, next, profileId);
                return next;
            });
        },
        [envKey, profileId],
    );

    const resetPrefs = useCallback(() => {
        setLocal({ ...DEFAULT_FEED_PREFS });
        setFeedPrefsFor(envKey, { ...DEFAULT_FEED_PREFS }, profileId);
    }, [envKey, profileId]);

    return { prefs, setPrefs, resetPrefs };
}

/* ─────────────────────────── Filtro + orden (síncrono) ─────────────────────────── */

export interface FeedContext {
    /** Nombre del autor propio (para el orden/filtro "propios"). */
    myName?: string;
    /** @handle propio (respaldo de identidad). */
    myHandle?: string;
}

/**
 * Aplica filtros + orden a la lista (puro y síncrono). El orden "relevante" usa
 * una heurística instantánea (interacción decaída por antigüedad); la relevancia
 * con Astraura ("Para mí") se aplica aparte en `useFeedFiltered`.
 */
export function filterAndSortPosts(posts: NormalizedPost[], prefs: FeedPrefs, ctx: FeedContext = {}): NormalizedPost[] {
    let list = posts.slice();

    // 1) Filtro por etiquetas/tipos.
    if (prefs.tags.length > 0) {
        const set = new Set(prefs.tags);
        list = list.filter((p) => set.has(p.kind));
    }

    // 2) Búsqueda de texto (título/cuerpo/autor).
    const q = fold(prefs.query.trim());
    if (q) {
        list = list.filter(
            (p) =>
                fold(p.title || "").includes(q) ||
                fold(p.body || "").includes(q) ||
                fold(p.authorName || "").includes(q) ||
                fold(p.authorHandle || "").includes(q),
        );
    }

    // 3) "Propios": solo mis publicaciones (si sé identificarme).
    if (prefs.sort === "propios" && (ctx.myName || ctx.myHandle)) {
        const name = fold(ctx.myName || "");
        const handle = fold((ctx.myHandle || "").replace(/^@+/, ""));
        list = list.filter(
            (p) => (name && fold(p.authorName || "") === name) || (handle && fold((p.authorHandle || "").replace(/^@+/, "")) === handle),
        );
    }

    // 4) Orden.
    const now = Date.now();
    const byRecent = (a: NormalizedPost, b: NormalizedPost) => timeOf(b) - timeOf(a);
    switch (prefs.sort) {
        case "cronologico":
            list.sort((a, b) => timeOf(a) - timeOf(b));
            break;
        case "popular":
            list.sort((a, b) => engagementOf(b) - engagementOf(a) || byRecent(a, b));
            break;
        case "relevante": {
            const score = (p: NormalizedPost) => {
                const ageDays = Math.max(0, (now - timeOf(p)) / 86_400_000);
                return (engagementOf(p) + 1) / (1 + ageDays);
            };
            list.sort((a, b) => score(b) - score(a) || byRecent(a, b));
            break;
        }
        case "reciente":
        case "propios":
        default:
            list.sort(byRecent);
            break;
    }

    return list;
}

/* ─────────────────────────── Relevancia con Astraura ─────────────────────────── */

/** Parsea el primer bloque JSON de un texto (tolerante a ```json … ```). */
function extractJson(text: string): unknown {
    if (!text) return null;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const body = fenced?.[1] ?? text;
    const start = body.search(/[[{]/);
    if (start < 0) return null;
    // Busca el cierre equilibrado desde el primer corchete/llave.
    const open = body[start];
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    for (let i = start; i < body.length; i++) {
        if (body[i] === open) depth++;
        else if (body[i] === close) {
            depth--;
            if (depth === 0) {
                try {
                    return JSON.parse(body.slice(start, i + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

/** Normaliza la respuesta del modelo a una lista de ids ordenada por afinidad. */
function idsFromRanking(parsed: unknown): string[] {
    const rows: Array<{ id?: unknown; score?: unknown }> = Array.isArray(parsed)
        ? (parsed as Array<{ id?: unknown; score?: unknown }>)
        : parsed && typeof parsed === "object"
          ? (((parsed as Record<string, unknown>).order ??
                (parsed as Record<string, unknown>).ids ??
                (parsed as Record<string, unknown>).ranking ??
                []) as Array<{ id?: unknown; score?: unknown }>)
          : [];
    if (!Array.isArray(rows)) return [];
    const scored = rows
        .map((r) => (typeof r === "string" ? { id: r, score: 0 } : { id: String(r?.id ?? ""), score: Number(r?.score ?? 0) }))
        .filter((r) => r.id);
    // Si trae score, ordénalos por score desc; si no, respeta el orden dado.
    if (scored.some((r) => Number.isFinite(r.score) && r.score !== 0)) {
        scored.sort((a, b) => b.score - a.score);
    }
    return scored.map((r) => r.id);
}

const RELEVANCE_TIMEOUT_MS = 12_000;
const RELEVANCE_MAX_POSTS = 40;

/**
 * Puntúa/ordena publicaciones por afinidad con el contexto del perfil usando
 * `astrauraChat`. Prompt en español, respuesta SOLO JSON, con timeout. Devuelve
 * los ids en orden de relevancia, o `null` si falla/agota (el llamador cae a
 * recencia). NUNCA lanza; NUNCA bloquea la UI (se llama en un efecto).
 */
export async function rankByRelevance(
    posts: NormalizedPost[],
    profileContext: string,
    opts: { signal?: AbortSignal } = {},
): Promise<string[] | null> {
    if (!isClient() || posts.length < 2) return null;
    const subset = posts.slice(0, RELEVANCE_MAX_POSTS);

    const compact = subset.map((p) => ({
        id: p.id,
        t: (p.title || "").slice(0, 80),
        s: (p.body || "").replace(/\s+/g, " ").slice(0, 180),
        k: p.kind,
        a: p.authorName,
        l: p.likes,
        c: p.commentsCount,
    }));

    const system =
        "Eres el motor de relevancia de StarSeed. Ordenas publicaciones por afinidad con el contexto del perfil de la persona. " +
        "Responde EXCLUSIVAMENTE con JSON válido, sin texto adicional, con la forma: " +
        '{"order":[{"id":"<id>","score":<0-100>}]}. Incluye TODOS los ids recibidos, del más afín al menos afín.';
    const user =
        `Contexto del perfil:\n${(profileContext || "Sin contexto explícito; prioriza calidad, diversidad y actualidad.").slice(0, 1200)}\n\n` +
        `Publicaciones (JSON):\n${JSON.stringify(compact)}\n\n` +
        "Devuelve solo el JSON de orden.";

    try {
        const { astrauraChat } = await import("@/ai/astraura/router");
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        opts.signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => controller.abort(), RELEVANCE_TIMEOUT_MS);

        let res: { text?: string } | null = null;
        try {
            res = await astrauraChat({
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
                temperature: 0.2,
                maxTokens: 900,
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
            opts.signal?.removeEventListener("abort", onAbort);
        }

        if (opts.signal?.aborted) return null;
        const parsed = extractJson(res?.text ?? "");
        const ids = idsFromRanking(parsed);
        return ids.length ? ids : null;
    } catch {
        return null;
    }
}

/* ─────────────────────────── Hook combinado (filtro + relevancia asíncrona) ─────────────────────────── */

/**
 * Lista final para renderizar: filtro/orden SÍNCRONO inmediato + reordenación
 * por relevancia de Astraura cuando `prefs.forMe` está activo (no bloquea; se
 * aplica al llegar). No toca `posts` (el realtime del feed sigue intacto).
 */
export function useFeedFiltered(
    posts: NormalizedPost[],
    prefs: FeedPrefs,
    ctx: FeedContext & { profileContext?: string } = {},
): { visible: NormalizedPost[]; ranking: boolean } {
    const base = useMemo(
        () => filterAndSortPosts(posts, prefs, ctx),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deps explícitas relevantes
        [posts, prefs.sort, prefs.tags, prefs.query, prefs.forMe, ctx.myName, ctx.myHandle],
    );

    const [orderMap, setOrderMap] = useState<Map<string, number> | null>(null);
    const [ranking, setRanking] = useState(false);
    const sigRef = useRef<string>("");

    const profileContext = ctx.profileContext ?? "";
    const idSig = base.map((p) => p.id).join(",");

    useEffect(() => {
        if (!prefs.forMe) {
            setOrderMap(null);
            setRanking(false);
            sigRef.current = "";
            return;
        }
        const sig = `${idSig}|${profileContext}`;
        if (sig === sigRef.current) return; // ya calculado para este conjunto+contexto
        sigRef.current = sig;

        const controller = new AbortController();
        setRanking(true);
        void rankByRelevance(base, profileContext, { signal: controller.signal }).then((ids) => {
            if (controller.signal.aborted) return;
            if (ids && ids.length) {
                const m = new Map<string, number>();
                ids.forEach((id, i) => m.set(id, i));
                setOrderMap(m);
            } else {
                setOrderMap(null); // fallback: mantiene el orden base (recencia/heurística)
            }
            setRanking(false);
        });
        return () => controller.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- idSig+profileContext+forMe cubren el recálculo
    }, [prefs.forMe, idSig, profileContext]);

    const visible = useMemo(() => {
        if (!prefs.forMe || !orderMap) return base;
        const rankOf = (id: string) => (orderMap.has(id) ? orderMap.get(id)! : Number.MAX_SAFE_INTEGER);
        return base
            .map((p, i) => ({ p, i }))
            .sort((a, b) => rankOf(a.p.id) - rankOf(b.p.id) || a.i - b.i)
            .map((x) => x.p);
    }, [base, orderMap, prefs.forMe]);

    return { visible, ranking };
}
