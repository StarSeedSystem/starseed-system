// src/lib/social-posts.ts
// Capa de datos de publicaciones sociales sobre Supabase (tabla pública `cafe_posts`).
// Provee tipos normalizados + helpers para detectar el tipo de preview y formatear
// números/fechas con Intl. Diseñado para degradar con elegancia: la tabla real no
// tiene columnas de media dedicadas, así que inferimos adjuntos desde `body`,
// `recipe` y `col`. Si un campo no existe simplemente se ignora.

/** Forma cruda de una fila de `cafe_posts` (campos relevantes, todos opcionales/seguros). */
export interface CafePostRow {
    id: string;
    group_id?: string | null;
    account_id?: string | null;
    profile_id?: string | null;
    author_name?: string | null;
    branch?: string | null;
    kind?: string | null;
    title?: string | null;
    body?: string | null;
    recipe?: Record<string, any> | null;
    col?: string | null;
    status?: string | null;
    created_at?: string | null;
}

/** Tipos de preview adaptable que el PostCard sabe renderizar. */
export type PostMediaKind = "image" | "gallery" | "video" | "audio" | "pdf" | "file" | "link" | "text";

export interface PostMedia {
    kind: PostMediaKind;
    url?: string;
    urls?: string[];      // para galería
    name?: string;        // nombre de archivo / título de enlace
    size?: string;        // tamaño formateado (archivos)
    domain?: string;      // dominio (enlaces)
    poster?: string;      // poster (video)
}

/** Publicación normalizada lista para la UI. */
export interface NormalizedPost {
    id: string;
    authorName: string;
    authorHandle?: string;
    avatarUrl?: string;
    accent?: string;          // color de acento (col)
    title?: string;
    body: string;
    kind: string;
    createdAt: string;        // ISO
    likes: number;
    commentsCount: number;
    media: PostMedia | null;
    isFallback?: boolean;     // viene de datos de ejemplo
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?[^\s]*)?$/i;
const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?[^\s]*)?$/i;
const AUDIO_RE = /\.(mp3|wav|ogg|m4a|flac)(\?[^\s]*)?$/i;
const PDF_RE = /\.pdf(\?[^\s]*)?$/i;
const FILE_RE = /\.(zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|json)(\?[^\s]*)?$/i;
const URL_RE = /(https?:\/\/[^\s)]+)/gi;

function safeDomain(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

/**
 * Detecta el tipo de preview a partir del texto y los metadatos de la fila.
 * Soporta `recipe.media` (array de urls) o `recipe.image`/`recipe.video` si existieran.
 */
export function detectMedia(row: Pick<CafePostRow, "body" | "recipe">): PostMedia | null {
    const recipe = row.recipe || {};

    // 1) Media explícita en recipe (galería múltiple).
    const explicit: string[] = Array.isArray(recipe.media)
        ? recipe.media.filter((u: any) => typeof u === "string")
        : [];
    if (explicit.length > 1) {
        return { kind: "gallery", urls: explicit };
    }
    if (explicit.length === 1 && explicit[0]) {
        const u = explicit[0];
        if (VIDEO_RE.test(u)) return { kind: "video", url: u, poster: recipe.poster };
        if (AUDIO_RE.test(u)) return { kind: "audio", url: u };
        return { kind: "image", url: u };
    }
    if (typeof recipe.image === "string") return { kind: "image", url: recipe.image };
    if (typeof recipe.video === "string") return { kind: "video", url: recipe.video, poster: recipe.poster };

    // 2) Inferencia desde URLs en el cuerpo.
    const body = row.body || "";
    const urls = body.match(URL_RE) || [];
    if (urls.length === 0) return null;

    const images = urls.filter((u) => IMAGE_RE.test(u));
    if (images.length > 1) return { kind: "gallery", urls: images };
    if (images.length === 1) return { kind: "image", url: images[0] };

    const first = urls[0];
    if (!first) return null;
    if (VIDEO_RE.test(first)) return { kind: "video", url: first };
    if (AUDIO_RE.test(first)) return { kind: "audio", url: first };
    if (PDF_RE.test(first)) return { kind: "pdf", url: first, name: decodeURIComponent(first.split("/").pop() || "documento.pdf") };
    if (FILE_RE.test(first)) return { kind: "file", url: first, name: decodeURIComponent(first.split("/").pop() || "archivo") };

    // 3) Enlace genérico.
    return { kind: "link", url: first, domain: safeDomain(first), name: first };
}

/** Normaliza una fila cruda de Supabase a la forma de UI. */
export function normalizeCafePost(row: CafePostRow): NormalizedPost {
    const recipe = row.recipe || {};
    const body = row.body || row.title || "";
    return {
        id: row.id,
        authorName: row.author_name || "Ciudadano StarSeed",
        avatarUrl: typeof recipe.avatar === "string" ? recipe.avatar : undefined,
        accent: row.col || undefined,
        title: row.title || undefined,
        body,
        kind: row.kind || "post",
        createdAt: row.created_at || new Date().toISOString(),
        likes: typeof recipe.likes === "number" ? recipe.likes : 0,
        commentsCount: Array.isArray(recipe.comments) ? recipe.comments.length : 0,
        media: detectMedia({ body, recipe }),
    };
}

// ── Formateo con Intl ──

const NUM_FMT = new Intl.NumberFormat("es-ES", { notation: "compact", maximumFractionDigits: 1 });
export function formatCount(n: number): string {
    if (!Number.isFinite(n)) return "0";
    return NUM_FMT.format(n);
}

const RTF = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });
const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60, unit: "seconds" },
    { amount: 60, unit: "minutes" },
    { amount: 24, unit: "hours" },
    { amount: 7, unit: "days" },
    { amount: 4.34524, unit: "weeks" },
    { amount: 12, unit: "months" },
    { amount: Number.POSITIVE_INFINITY, unit: "years" },
];

/** Tiempo relativo legible: "hace 2 h", "hace 3 días"… */
export function formatRelativeTime(iso: string): string {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    let duration = (date.getTime() - Date.now()) / 1000;
    for (const division of DIVISIONS) {
        if (Math.abs(duration) < division.amount) {
            return RTF.format(Math.round(duration), division.unit);
        }
        duration /= division.amount;
    }
    return "";
}

/** Datos de ejemplo elegantes cuando no hay sesión o publicaciones reales. */
export function getFallbackPosts(): NormalizedPost[] {
    const now = Date.now();
    return [
        {
            id: "fallback-1",
            authorName: "Proyecto Stardust",
            authorHandle: "@stardust",
            accent: "#22d3ee",
            body: "Anunciando el Proyecto Constelación: nuestra suite de visualización de datos en tiempo real sobre el núcleo de la Red StarSeed. Más detalles próximamente.",
            kind: "anuncio",
            createdAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
            likes: 1200,
            commentsCount: 24,
            media: { kind: "image", url: "https://placehold.co/600x400.png" },
            isFallback: true,
        },
        {
            id: "fallback-2",
            authorName: "Alex Duran",
            authorHandle: "@alex",
            accent: "#a855f7",
            body: "Acabo de usar el Generador de Apps con IA para crear un rastreador de inventario en 5 minutos. Un cambio de juego para el prototipado rápido. #StarSeedNetwork",
            kind: "post",
            createdAt: new Date(now - 1000 * 60 * 60 * 26).toISOString(),
            likes: 125,
            commentsCount: 8,
            media: null,
            isFallback: true,
        },
        {
            id: "fallback-3",
            authorName: "Samantha Lee",
            authorHandle: "@samlee",
            accent: "#10b981",
            body: "El resumidor de notificaciones es genial. Mi bandeja era un desastre y ahora recibo un resumen limpio cada mañana. ¡Inbox zero a mi alcance!",
            kind: "post",
            createdAt: new Date(now - 1000 * 60 * 60 * 50).toISOString(),
            likes: 340,
            commentsCount: 3,
            media: null,
            isFallback: true,
        },
    ];
}
