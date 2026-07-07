// src/lib/feed/feed-algorithms.ts
// ─────────────────────────────────────────────────────────────────────────────
// ALGORITMOS DE FEED SELECCIONABLES de la Red StarSeed (/network).
//
// Ordena la MISMA lista de publicaciones (`FeedPost[]` de `@/lib/feed/network-feed`)
// según el algoritmo elegido por el usuario. No hace red aparte: opera en cliente
// sobre los datos ya cargados del feed.
//
//   · Cronológico   → más reciente primero (orden natural de `created_at`).
//   · Relevancia    → puntuación por interacción (likes/comentarios/shares) con
//                     decaimiento temporal suave (evita que lo viejo domine para
//                     siempre, pero no penaliza tanto como el cronológico puro).
//   · Cercanía      → afinidad con "mis conexiones" (autores que sigo / con los
//                     que interactué) primero; el resto por relevancia.
//   · Por área      → agrupa por área (política/educación/cultura/general) y
//                     dentro de cada área ordena por relevancia.
//   · Personalizado → editor de pesos (recencia, afinidad, diversidad, área)
//                     combinados en una puntuación ponderada 0..1 por publicación.
//
// Persistencia: la elección de algoritmo + los pesos personalizados se guardan
// en localStorage con el patrón `DEFAULTS_VERSION` ya usado en el dashboard
// (`src/components/dashboard/dashboard-layout.tsx`): si sube la versión, se
// re-siembran los valores por defecto sin perder otras claves del usuario.
// SSR-safe: toda lectura/escritura de localStorage ocurre tras comprobar
// `typeof window !== "undefined"`.
// ─────────────────────────────────────────────────────────────────────────────

import type { FeedPost } from "@/lib/feed/network-feed";

// ── Identificadores de algoritmo ─────────────────────────────────────────────

export type FeedAlgorithmId =
    | "cronologico"
    | "relevancia"
    | "cercania"
    | "por-area"
    | "personalizado";

export interface FeedAlgorithmDef {
    id: FeedAlgorithmId;
    label: string;
    icon: string; // nombre de icono lucide-react (resuelto en la UI)
    blurb: string;
}

export const FEED_ALGORITHMS: FeedAlgorithmDef[] = [
    {
        id: "cronologico",
        label: "Cronológico",
        icon: "Clock",
        blurb: "Lo más reciente primero, sin reordenar por popularidad.",
    },
    {
        id: "relevancia",
        label: "Relevancia",
        icon: "Flame",
        blurb: "Prioriza publicaciones con más interacción reciente.",
    },
    {
        id: "cercania",
        label: "Cercanía",
        icon: "Users2",
        blurb: "Primero tus conexiones; luego el resto por relevancia.",
    },
    {
        id: "por-area",
        label: "Por área",
        icon: "LayoutGrid",
        blurb: "Agrupa política, educación, cultura y general por separado.",
    },
    {
        id: "personalizado",
        label: "Personalizado",
        icon: "SlidersHorizontal",
        blurb: "Define tus propios pesos: recencia, afinidad, diversidad, área.",
    },
];

export function feedAlgorithmById(id: string): FeedAlgorithmDef | undefined {
    return FEED_ALGORITHMS.find((a) => a.id === id);
}

// ── Pesos del algoritmo "Personalizado" ──────────────────────────────────────

export interface FeedWeights {
    /** 0..1 — cuánto pesa la recencia (más nuevo = mejor puntuación). */
    recencia: number;
    /** 0..1 — cuánto pesa la afinidad con autores de "mis conexiones". */
    afinidad: number;
    /** 0..1 — cuánto pesa evitar que un mismo autor/área domine el feed. */
    diversidad: number;
    /** 0..1 — cuánto pesa que el área coincida con las áreas preferidas. */
    area: number;
}

export const DEFAULT_WEIGHTS: FeedWeights = {
    recencia: 0.4,
    afinidad: 0.3,
    diversidad: 0.15,
    area: 0.15,
};

// ── Preferencia persistida ───────────────────────────────────────────────────

export interface FeedPreference {
    algorithm: FeedAlgorithmId;
    weights: FeedWeights;
    /** Áreas preferidas para el algoritmo "Personalizado" (vacío = todas iguales). */
    preferredAreas: string[];
}

const LS_KEY = "starseed_feed_preference_v1";
const LS_VERSION_KEY = "starseed_feed_preference_version";
// Sube esta versión cuando cambien los valores POR DEFECTO (no cuando el
// usuario simplemente edite sus propios pesos): re-siembra sólo si la versión
// guardada no coincide, preservando cualquier elección explícita del usuario
// mediante un merge superficial sobre el nuevo default.
const DEFAULTS_VERSION = "feed-gen1-2026-07-06-selector-pesos";

function defaultPreference(): FeedPreference {
    return {
        algorithm: "relevancia",
        weights: { ...DEFAULT_WEIGHTS },
        preferredAreas: [],
    };
}

/** Carga la preferencia persistida, migrando si la versión de defaults subió. */
export function loadFeedPreference(): FeedPreference {
    if (typeof window === "undefined") return defaultPreference();
    try {
        const storedVersion = window.localStorage.getItem(LS_VERSION_KEY);
        const raw = window.localStorage.getItem(LS_KEY);
        const base = defaultPreference();
        if (!raw) {
            window.localStorage.setItem(LS_KEY, JSON.stringify(base));
            window.localStorage.setItem(LS_VERSION_KEY, DEFAULTS_VERSION);
            return base;
        }
        const parsed = JSON.parse(raw) as Partial<FeedPreference>;
        const merged: FeedPreference = {
            algorithm: parsed.algorithm ?? base.algorithm,
            weights: { ...base.weights, ...(parsed.weights ?? {}) },
            preferredAreas: Array.isArray(parsed.preferredAreas) ? parsed.preferredAreas : base.preferredAreas,
        };
        if (storedVersion !== DEFAULTS_VERSION) {
            // Migración: conserva la elección del usuario, sólo actualiza la marca
            // de versión (evita perder su algoritmo/pesos ante un futuro cambio
            // de defaults que sí deba re-sembrar valores nuevos).
            window.localStorage.setItem(LS_VERSION_KEY, DEFAULTS_VERSION);
            window.localStorage.setItem(LS_KEY, JSON.stringify(merged));
        }
        return merged;
    } catch {
        return defaultPreference();
    }
}

export function saveFeedPreference(pref: FeedPreference): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(pref));
        window.localStorage.setItem(LS_VERSION_KEY, DEFAULTS_VERSION);
    } catch {
        /* almacenamiento no disponible: la sesión sigue funcionando en memoria */
    }
}

// ── Puntuación y ordenación ──────────────────────────────────────────────────

function ageHours(createdAt: string): number {
    const ms = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, ms / (1000 * 60 * 60));
}

/** Puntuación de "relevancia" pura: interacción con decaimiento temporal suave. */
function relevanceScore(post: FeedPost): number {
    const interaction = post.likes * 1 + post.commentsCount * 2 + post.shares * 1.5;
    const decay = 1 / (1 + ageHours(post.createdAt) / 18); // vida media ~18h
    return interaction * decay + decay * 2; // pequeño piso para que lo nuevo sin interacción no quede a 0
}

/** Puntuación de recencia normalizada 0..1 (más nuevo = más alto). */
function recencyScore(post: FeedPost): number {
    return 1 / (1 + ageHours(post.createdAt) / 24);
}

/** ¿El autor de la publicación es una de "mis conexiones"? */
function isConnection(post: FeedPost, connectionIds: Set<string>): boolean {
    return connectionIds.has(post.author.id);
}

export function sortChronological(posts: FeedPost[]): FeedPost[] {
    return [...posts].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function sortByRelevance(posts: FeedPost[]): FeedPost[] {
    return [...posts].sort((a, b) => relevanceScore(b) - relevanceScore(a));
}

export function sortByCloseness(posts: FeedPost[], connectionIds: Set<string> = new Set()): FeedPost[] {
    return [...posts].sort((a, b) => {
        const aConn = isConnection(a, connectionIds) ? 1 : 0;
        const bConn = isConnection(b, connectionIds) ? 1 : 0;
        if (aConn !== bConn) return bConn - aConn;
        return relevanceScore(b) - relevanceScore(a);
    });
}

/** Agrupa por área preservando el orden de relevancia dentro de cada grupo. */
export function sortByArea(posts: FeedPost[]): FeedPost[] {
    const order = ["politica", "educacion", "cultura", "general"];
    const byArea = new Map<string, FeedPost[]>();
    for (const p of sortByRelevance(posts)) {
        const key = p.area || "general";
        if (!byArea.has(key)) byArea.set(key, []);
        byArea.get(key)!.push(p);
    }
    const out: FeedPost[] = [];
    for (const key of order) {
        if (byArea.has(key)) out.push(...byArea.get(key)!);
        byArea.delete(key);
    }
    // Áreas no previstas al final (sin perder ninguna publicación).
    for (const rest of byArea.values()) out.push(...rest);
    return out;
}

/**
 * Algoritmo "Personalizado": puntuación ponderada combinando recencia, afinidad
 * (cercanía), diversidad (penaliza repetir autor/área consecutivos) y área
 * preferida. Los pesos vienen del editor persistido (`FeedWeights`).
 */
export function sortByCustomWeights(
    posts: FeedPost[],
    weights: FeedWeights,
    opts: { connectionIds?: Set<string>; preferredAreas?: string[] } = {},
): FeedPost[] {
    const connectionIds = opts.connectionIds ?? new Set<string>();
    const preferredAreas = new Set(opts.preferredAreas ?? []);

    // Puntuación base (sin diversidad, que depende del orden final → se aplica
    // después con un barrido que penaliza repeticiones consecutivas).
    const scored = posts.map((p) => {
        const recency = recencyScore(p);
        const affinity = isConnection(p, connectionIds) ? 1 : 0.15;
        const areaMatch = preferredAreas.size === 0 || preferredAreas.has(p.area || "general") ? 1 : 0.4;
        const base =
            recency * weights.recencia +
            affinity * weights.afinidad +
            areaMatch * weights.area;
        return { post: p, base };
    });

    scored.sort((a, b) => b.base - a.base);

    // Diversidad: recorre el orden puntuado y baja en la cola cualquier
    // publicación cuyo autor o área se repita justo tras la anterior, evitando
    // que una sola voz/área domine varios puestos seguidos.
    const diversityWeight = weights.diversidad;
    if (diversityWeight > 0) {
        const result: typeof scored = [];
        const pool = [...scored];
        let lastAuthor: string | null = null;
        let lastArea: string | null = null;
        while (pool.length > 0) {
            let pickIdx = 0;
            for (let i = 0; i < pool.length; i++) {
                const candidate = pool[i];
                const repeatsAuthor = candidate.post.author.id === lastAuthor;
                const repeatsArea = (candidate.post.area || "general") === lastArea;
                const penalty = (repeatsAuthor ? diversityWeight : 0) + (repeatsArea ? diversityWeight * 0.5 : 0);
                const bestPenalty =
                    (pool[pickIdx].post.author.id === lastAuthor ? diversityWeight : 0) +
                    ((pool[pickIdx].post.area || "general") === lastArea ? diversityWeight * 0.5 : 0);
                // Preferimos el candidato con menor penalización; en empate, el de
                // mayor puntuación base (la lista ya viene ordenada por base desc).
                if (penalty < bestPenalty) pickIdx = i;
            }
            const [picked] = pool.splice(pickIdx, 1);
            result.push(picked);
            lastAuthor = picked.post.author.id;
            lastArea = picked.post.area || "general";
        }
        return result.map((r) => r.post);
    }

    return scored.map((s) => s.post);
}

/**
 * Punto de entrada único: aplica el algoritmo elegido sobre la lista de
 * publicaciones YA CARGADA del feed (no vuelve a pedir datos a la red).
 */
export function applyFeedAlgorithm(
    posts: FeedPost[],
    pref: FeedPreference,
    opts: { connectionIds?: Set<string> } = {},
): FeedPost[] {
    switch (pref.algorithm) {
        case "cronologico":
            return sortChronological(posts);
        case "relevancia":
            return sortByRelevance(posts);
        case "cercania":
            return sortByCloseness(posts, opts.connectionIds);
        case "por-area":
            return sortByArea(posts);
        case "personalizado":
            return sortByCustomWeights(posts, pref.weights, {
                connectionIds: opts.connectionIds,
                preferredAreas: pref.preferredAreas,
            });
        default:
            return sortChronological(posts);
    }
}
