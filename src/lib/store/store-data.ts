"use client";

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Módulo 12 · La Tienda (capa de datos)
// ----------------------------------------------------------------
// Tienda de la Economía del Regalo: los usuarios PUBLICAN sus creaciones,
// las INSTALAN en su Biblioteca y las VALORAN/curan. Todo libre.
//
// Backend: Supabase (RLS por owner / shared). Tablas:
//   • store_items(id, owner, category, title, description, payload jsonb,
//                 source_kind, source_ref, license, downloads, rating,
//                 ratings_count, verified, shared, created_at, updated_at)
//   • store_ratings(item_id, voter, stars, comment, pk(item_id,voter))
//
// Principios:
//   • Soberanía: instalar = copiar a la Biblioteca local (library-store).
//   • Singularidad: dedup en Biblioteca por (url + título).
//   • Degradación elegante: TODO es never-throw; si Supabase falla, se
//     devuelve vacío/false y la página conserva el demo como ejemplos.
//
// Sigue el patrón de src/lib/aurora/personalities.ts y
// src/lib/brains/brains.ts (uid() + try/catch → []).
// ════════════════════════════════════════════════════════════════

import { createClient } from "@/utils/supabase/client";
import { saveResource, installApp } from "@/lib/library-store";

/* ------------------------------------------------------------------ */
/* Categorías                                                          */
/* ------------------------------------------------------------------ */

export interface StoreCategory {
    id: string;
    label: string;
    /** Nombre del icono lucide-react (string para evitar acoplar JSX aquí). */
    icon: string;
}

export const STORE_CATEGORIES: StoreCategory[] = [
    { id: "app", label: "Apps", icon: "AppWindow" },
    { id: "widget", label: "Widgets", icon: "LayoutGrid" },
    { id: "tema", label: "Temas", icon: "Palette" },
    { id: "plantilla", label: "Plantillas", icon: "LayoutTemplate" },
    { id: "personalidad", label: "Personalidades", icon: "Sparkles" },
    { id: "cerebro", label: "Cerebros", icon: "BrainCircuit" },
    { id: "recurso", label: "Recursos", icon: "Package" },
    { id: "calendario", label: "Calendarios", icon: "CalendarDays" },
];

/* ------------------------------------------------------------------ */
/* Tipos                                                               */
/* ------------------------------------------------------------------ */

export type StoreSourceKind =
    | "app"
    | "personality"
    | "canvas"
    | "brain"
    | "manual"
    | string;

export interface StoreItem {
    id: string;
    owner: string | null;
    category: string;
    title: string;
    description: string;
    payload: Record<string, unknown> | null;
    source_kind: StoreSourceKind | null;
    source_ref: string | null;
    license: string;
    downloads: number;
    rating: number;
    ratings_count: number;
    verified: boolean;
    shared: boolean;
    created_at?: string;
    updated_at?: string;
}

/** Una creación del usuario lista para publicar (picker "Publicar mis creaciones"). */
export interface MyCreation {
    id: string;
    kind: StoreSourceKind; // app | personality | canvas | brain
    title: string;
    /** Categoría sugerida en la Tienda. */
    suggestedCategory: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function uid(): Promise<string | null> {
    try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

function num(v: unknown, fallback = 0): number {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/** Normaliza una fila cruda de store_items a un StoreItem estable. */
function normalize(row: Record<string, unknown>): StoreItem {
    return {
        id: String(row.id ?? ""),
        owner: (row.owner as string) ?? null,
        category: String(row.category ?? "recurso"),
        title: String(row.title ?? "Sin título"),
        description: String(row.description ?? ""),
        payload: (row.payload as Record<string, unknown>) ?? null,
        source_kind: (row.source_kind as string) ?? null,
        source_ref: (row.source_ref as string) ?? null,
        license: String(row.license ?? "StarSeed Public"),
        downloads: num(row.downloads, 0),
        rating: num(row.rating, 0),
        ratings_count: num(row.ratings_count, 0),
        verified: Boolean(row.verified),
        shared: row.shared === undefined ? true : Boolean(row.shared),
        created_at: row.created_at as string | undefined,
        updated_at: row.updated_at as string | undefined,
    };
}

/* ------------------------------------------------------------------ */
/* Lectura: catálogo de la Tienda                                      */
/* ------------------------------------------------------------------ */

/**
 * Lista los items compartidos de la Tienda, ordenados por descargas y
 * valoración descendente. Opcionalmente filtra por categoría.
 * Never-throw: devuelve [] ante cualquier fallo.
 */
export async function listStoreItems(category?: string): Promise<StoreItem[]> {
    try {
        const sb = createClient();
        let q = sb
            .from("store_items")
            .select("*")
            .eq("shared", true)
            .order("downloads", { ascending: false })
            .order("rating", { ascending: false });
        if (category) q = q.eq("category", category);
        const { data } = await q;
        return ((data as Record<string, unknown>[]) || []).map(normalize);
    } catch {
        return [];
    }
}

/** Obtiene un único item por id (never-throw). */
export async function getStoreItem(id: string): Promise<StoreItem | null> {
    try {
        if (!id) return null;
        const sb = createClient();
        const { data } = await sb
            .from("store_items")
            .select("*")
            .eq("id", id)
            .single();
        return data ? normalize(data as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Publicación                                                         */
/* ------------------------------------------------------------------ */

export interface PublishInput {
    category: string;
    title: string;
    description?: string;
    payload?: Record<string, unknown> | null;
    sourceKind?: StoreSourceKind;
    sourceRef?: string | null;
    license?: string;
}

/**
 * Publica una creación en la Tienda (owner=uid, shared=true). Devuelve el
 * item insertado o null si no hay sesión / falla. Never-throw.
 */
export async function publishToStore(input: PublishInput): Promise<StoreItem | null> {
    try {
        const owner = await uid();
        if (!owner) return null;
        const sb = createClient();
        const payloadRow = {
            owner,
            category: input.category || "recurso",
            title: input.title?.trim() || "Sin título",
            description: input.description?.trim() || "",
            payload: input.payload ?? {},
            source_kind: input.sourceKind ?? "manual",
            source_ref: input.sourceRef ?? null,
            license: input.license?.trim() || "StarSeed Public",
            verified: false,
            shared: true,
        };
        const { data } = await sb
            .from("store_items")
            .insert(payloadRow)
            .select("*")
            .single();
        return data ? normalize(data as Record<string, unknown>) : null;
    } catch {
        return null;
    }
}

/** Mapea una app generada → item de Tienda y la publica. */
export async function publishApp(app: {
    id: string;
    name: string;
    files?: unknown;
    description?: string;
}): Promise<StoreItem | null> {
    return publishToStore({
        category: "app",
        title: app.name || "App sin título",
        description: app.description || "App publicada desde StarSeed OS.",
        payload: { files: app.files ?? null },
        sourceKind: "app",
        sourceRef: app.id,
        license: "StarSeed Public",
    });
}

/** Mapea una personalidad de Aurora → item de Tienda y la publica. */
export async function publishPersonality(p: {
    id: string;
    name: string;
    description?: string;
}): Promise<StoreItem | null> {
    return publishToStore({
        category: "personalidad",
        title: p.name || "Personalidad",
        description: p.description || "Personalidad de Aurora compartida.",
        payload: {},
        sourceKind: "personality",
        sourceRef: p.id,
        license: "StarSeed Public",
    });
}

/** Mapea un lienzo (canvas) → item de Tienda y lo publica. */
export async function publishCanvas(c: {
    id: string;
    title: string;
    description?: string;
}): Promise<StoreItem | null> {
    return publishToStore({
        category: "plantilla",
        title: c.title || "Lienzo",
        description: c.description || "Lienzo compartido como plantilla.",
        payload: {},
        sourceKind: "canvas",
        sourceRef: c.id,
        license: "StarSeed Public",
    });
}

/** Mapea un cerebro (brain) → item de Tienda y lo publica. */
export async function publishBrain(b: {
    id: string;
    name: string;
    description?: string;
}): Promise<StoreItem | null> {
    return publishToStore({
        category: "cerebro",
        title: b.name || "Cerebro",
        description: b.description || "Cerebro compartido.",
        payload: {},
        sourceKind: "brain",
        sourceRef: b.id,
        license: "StarSeed Public",
    });
}

/* ------------------------------------------------------------------ */
/* Instalación → Biblioteca soberana                                   */
/* ------------------------------------------------------------------ */

/**
 * Instala un item en la Biblioteca local del usuario (saveResource) y, si
 * es una app, la registra en el Launcher (installApp). Incrementa el
 * contador de descargas en la Tienda (best-effort). Never-throw → devuelve
 * { ok }.
 */
export async function installItem(item: StoreItem): Promise<{ ok: boolean }> {
    try {
        if (!item || !item.id) return { ok: false };

        // 1) Guardar en la Biblioteca soberana (dedup por url+título).
        saveResource({
            id: `store-${item.id}`,
            kind: item.category || "recurso",
            title: item.title,
            url: `starseed://store/${item.id}`,
            origin: "store",
        });

        // 2) Si es una app, registrarla también en el Launcher.
        if (item.category === "app" || item.source_kind === "app") {
            installApp({
                id: item.source_ref || `store-${item.id}`,
                name: item.title,
            });
        }

        // 3) Incrementar descargas en la Tienda (best-effort).
        await bumpDownloads(item);

        return { ok: true };
    } catch {
        return { ok: false };
    }
}

/** Incrementa downloads vía RPC `increment_store_downloads`; si no existe, read-modify-write. */
async function bumpDownloads(item: StoreItem): Promise<void> {
    try {
        const sb = createClient();
        // Intento 1: RPC atómica (si está desplegada en el proyecto).
        const rpc = await sb.rpc("increment_store_downloads", { item_id: item.id });
        if (!rpc.error) return;
        // Intento 2: update read-modify-write con el valor que ya tenemos.
        await sb
            .from("store_items")
            .update({ downloads: num(item.downloads, 0) + 1 })
            .eq("id", item.id);
    } catch {
        /* descargas es decorativo: degradamos en silencio */
    }
}

/* ------------------------------------------------------------------ */
/* Valoración (rating) + recálculo                                     */
/* ------------------------------------------------------------------ */

/**
 * Registra/actualiza la valoración del usuario para un item (upsert en
 * store_ratings) y recalcula store_items.rating / ratings_count leyendo
 * todas las valoraciones (read-modify-write). Never-throw → { ok }.
 */
export async function rateItem(
    itemId: string,
    stars: number,
    comment?: string,
): Promise<{ ok: boolean; rating?: number; ratingsCount?: number }> {
    try {
        const voter = await uid();
        if (!voter || !itemId) return { ok: false };
        const clamped = Math.max(1, Math.min(5, Math.round(num(stars, 0))));
        const sb = createClient();

        // 1) Upsert de la valoración del votante (pk: item_id + voter).
        const up = await sb
            .from("store_ratings")
            .upsert(
                {
                    item_id: itemId,
                    voter,
                    stars: clamped,
                    comment: comment?.trim() || null,
                },
                { onConflict: "item_id,voter" },
            );
        if (up.error) return { ok: false };

        // 2) Releer todas las valoraciones del item y recomputar media.
        const { data: rows } = await sb
            .from("store_ratings")
            .select("stars")
            .eq("item_id", itemId);
        const list = (rows as { stars: number }[]) || [];
        const count = list.length;
        const avg =
            count > 0
                ? list.reduce((s, r) => s + num(r.stars, 0), 0) / count
                : 0;
        const rating = Math.round(avg * 100) / 100;

        // 3) Persistir el agregado en store_items (best-effort).
        await sb
            .from("store_items")
            .update({ rating, ratings_count: count })
            .eq("id", itemId);

        return { ok: true, rating, ratingsCount: count };
    } catch {
        return { ok: false };
    }
}

/* ------------------------------------------------------------------ */
/* Mis creaciones (picker para publicar)                               */
/* ------------------------------------------------------------------ */

/**
 * Reúne las creaciones del usuario (apps + personalidades + lienzos +
 * cerebros) para el selector "Publicar mis creaciones". Cada consulta es
 * independiente y tolerante a fallos: si una tabla falla, se omite.
 * Never-throw → siempre devuelve un array (posiblemente vacío).
 */
export async function listMyCreations(): Promise<MyCreation[]> {
    const out: MyCreation[] = [];
    try {
        const owner = await uid();
        if (!owner) return out;
        const sb = createClient();

        // Lanzamos las cuatro consultas en paralelo; cada una protegida.
        const [apps, personalities, canvases, brains] = await Promise.all([
            sb
                .from("generated_apps")
                .select("id,name")
                .eq("owner", owner)
                .then((r) => (r.data as { id: string; name: string }[]) || [])
                .then((d) => d, () => []),
            sb
                .from("aurora_personalities")
                .select("id,name")
                .eq("owner", owner)
                .then((r) => (r.data as { id: string; name: string }[]) || [])
                .then((d) => d, () => []),
            sb
                .from("canvases")
                .select("id,title")
                .eq("owner", owner)
                .then((r) => (r.data as { id: string; title: string }[]) || [])
                .then((d) => d, () => []),
            sb
                .from("brains")
                .select("id,name")
                .eq("owner", owner)
                .then((r) => (r.data as { id: string; name: string }[]) || [])
                .then((d) => d, () => []),
        ]);

        for (const a of apps) {
            out.push({
                id: a.id,
                kind: "app",
                title: a.name || "App",
                suggestedCategory: "app",
            });
        }
        for (const p of personalities) {
            out.push({
                id: p.id,
                kind: "personality",
                title: p.name || "Personalidad",
                suggestedCategory: "personalidad",
            });
        }
        for (const c of canvases) {
            out.push({
                id: c.id,
                kind: "canvas",
                title: c.title || "Lienzo",
                suggestedCategory: "plantilla",
            });
        }
        for (const b of brains) {
            out.push({
                id: b.id,
                kind: "brain",
                title: b.name || "Cerebro",
                suggestedCategory: "cerebro",
            });
        }

        return out;
    } catch {
        return out;
    }
}

/**
 * Publica una `MyCreation` usando el helper específico de su tipo. Atajo
 * usado por el picker de la página. `description` opcional sobrescribe el
 * texto por defecto. Never-throw.
 */
export async function publishCreation(
    c: MyCreation,
    description?: string,
): Promise<StoreItem | null> {
    const desc = description?.trim() || undefined;
    switch (c.kind) {
        case "app":
            return publishApp({ id: c.id, name: c.title, description: desc });
        case "personality":
            return publishPersonality({ id: c.id, name: c.title, description: desc });
        case "canvas":
            return publishCanvas({ id: c.id, title: c.title, description: desc });
        case "brain":
            return publishBrain({ id: c.id, name: c.title, description: desc });
        default:
            return publishToStore({
                category: c.suggestedCategory || "recurso",
                title: c.title,
                description: desc,
                sourceKind: c.kind,
                sourceRef: c.id,
            });
    }
}
