// src/lib/social-posts.ts
// Capa de datos de publicaciones sociales sobre Supabase (tabla pública `cafe_posts`).
// Provee tipos normalizados + helpers para detectar el tipo de preview y formatear
// números/fechas con Intl. Diseñado para degradar con elegancia: la tabla real no
// tiene columnas de media dedicadas, así que inferimos adjuntos desde `body`,
// `recipe` y `col`. Si un campo no existe simplemente se ignora.

import { parseBlocks, type PostBlock } from "@/lib/creation/post-blocks";
import { type Marco, normalizarMarco } from "@/lib/profile/marco-foto";

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
    /** Adjuntos adicionales extraídos del cuerpo (bloque "**Adjuntos:**" de /publish). */
    attachments?: PostMedia[];
    /** Adenda 66 §6 · ETIQUETAS MÚLTIPLES de la publicación (ss:meta.tags). */
    tags?: string[];
    /** Adenda 66 §6 · Bloques RICOS del Lienzo (ss:meta.blocks) para el post-blocks-renderer. */
    blocks?: PostBlock[];
    /** (Adenda 219) Marcos de forma por URL de medio (ss:meta.marcos). */
    marcos?: Record<string, Marco>;
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

// ─────────────────────────────────────────────────────────────────────────────
// ADJUNTOS EMBEBIDOS EN EL CUERPO (Adenda 63 §8 · "Adjuntos visibles")
//
// /publish y la Zona de Publicación persisten los adjuntos DENTRO del body del
// post (os_posts solo tiene body/media_url): un bloque markdown "**Adjuntos:**"
// con líneas `- ![nombre](url)` (imagen), `- [nombre](url)` (archivo con URL) o
// `- [Etiqueta] nombre — url` (enlaces), más un comentario de metadata
// `<!--ss:meta {...}-->` (convención de creation-config). Este parser separa
// ese bloque del texto para que la UI muestre miniaturas/chips en lugar de
// markdown crudo. La regex de ss:meta se duplica aquí a propósito para no
// invertir capas (lib ← components).
// ─────────────────────────────────────────────────────────────────────────────

const SS_META_COMMENT_RE = /<!--ss:meta\s+([\s\S]*?)-->/;
const ATTACH_BLOCK_RE = /\n*\*\*Adjuntos:\*\*\n((?:-[^\n]*(?:\n|$))+)/;
const MD_IMAGE_LINE_RE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/;
const MD_LINK_LINE_RE = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)$/;
const LABELED_LINE_RE = /^\[([^\]]+)\]\s*(.*)$/;
const BARE_URL_RE = /(https?:\/\/[^\s)]+)/;

/** Resultado de separar cuerpo, adjuntos y metadata embebida. */
export interface SplitBodyResult {
    /** Cuerpo limpio (sin bloque de adjuntos ni comentario ss:meta). */
    body: string;
    attachments: PostMedia[];
    /** Metadata `ss:meta` (área/tipo especializado) si venía embebida. */
    meta: { area?: string; tipo?: string } | null;
    /** Adenda 66 §6 · Etiquetas múltiples (ss:meta.tags). */
    tags: string[];
    /** Adenda 66 §6 · Bloques ricos (ss:meta.blocks) ya parseados. */
    blocks: PostBlock[];
    /** (Adenda 219) Marcos de forma por URL de medio (ss:meta.marcos), ya normalizados. */
    marcos: Record<string, Marco>;
}

/** Infiere el PostMedia adecuado para una URL de adjunto (por extensión). */
function mediaFromUrl(url: string, name?: string): PostMedia {
    const fallbackName = decodeURIComponent(url.split("/").pop() || "").split("?")[0] || undefined;
    const label = name || fallbackName;
    if (IMAGE_RE.test(url)) return { kind: "image", url, name: label };
    if (VIDEO_RE.test(url)) return { kind: "video", url, name: label };
    if (AUDIO_RE.test(url)) return { kind: "audio", url, name: label };
    if (PDF_RE.test(url)) return { kind: "pdf", url, name: label };
    if (FILE_RE.test(url)) return { kind: "file", url, name: label };
    return { kind: "link", url, name: label, domain: safeDomain(url) };
}

/**
 * Extrae del cuerpo el bloque "**Adjuntos:**" (→ lista de PostMedia) y el
 * comentario `ss:meta` (→ área/tipo). Devuelve el cuerpo limpio. Nunca lanza;
 * con un body sin convenciones devuelve `{ body, attachments: [], meta: null }`.
 */
export function splitBodyAttachments(raw: string | null | undefined): SplitBodyResult {
    let body = raw || "";
    let meta: SplitBodyResult["meta"] = null;
    let tags: string[] = [];
    let blocks: PostBlock[] = [];
    const marcos: Record<string, Marco> = {};

    // 1) Metadata embebida (invisible para la lectura humana).
    const mm = body.match(SS_META_COMMENT_RE);
    if (mm?.[1]) {
        try {
            const parsed = JSON.parse(mm[1]) as Record<string, unknown>;
            if (parsed && typeof parsed === "object") {
                meta = {
                    area: typeof parsed.area === "string" ? parsed.area : undefined,
                    tipo: typeof parsed.tipo === "string" ? parsed.tipo : undefined,
                };
                // Adenda 66 §6 · etiquetas múltiples + bloques ricos.
                if (Array.isArray(parsed.tags)) {
                    tags = parsed.tags.filter((t): t is string => typeof t === "string");
                }
                blocks = parseBlocks(parsed.blocks);
                // (Adenda 219) marcos de forma por URL de medio.
                if (parsed.marcos && typeof parsed.marcos === "object") {
                    for (const [u, m] of Object.entries(parsed.marcos as Record<string, unknown>)) {
                        if (u && m && typeof m === "object") marcos[u] = normalizarMarco(m);
                    }
                }
            }
        } catch {
            /* metadata corrupta: se ignora */
        }
        body = body.replace(SS_META_COMMENT_RE, "");
    }

    // 2) Bloque de adjuntos de /publish.
    const attachments: PostMedia[] = [];
    const ab = body.match(ATTACH_BLOCK_RE);
    if (ab?.[1]) {
        for (const rawLine of ab[1].split("\n")) {
            const item = rawLine.replace(/^-\s*/, "").trim();
            if (!item) continue;

            const img = item.match(MD_IMAGE_LINE_RE);
            if (img?.[2]) {
                attachments.push({ kind: "image", url: img[2], name: img[1] || undefined });
                continue;
            }
            const link = item.match(MD_LINK_LINE_RE);
            if (link?.[2]) {
                attachments.push(mediaFromUrl(link[2], link[1] || undefined));
                continue;
            }
            // `- [Etiqueta] nombre — url` (enlaces) o `- [Etiqueta] nombre` (sin URL).
            const labeled = item.match(LABELED_LINE_RE);
            if (labeled) {
                const rest = (labeled[2] || "").trim();
                const url = rest.match(BARE_URL_RE)?.[1];
                const name = rest.replace(BARE_URL_RE, "").replace(/[—–-]\s*$/, "").trim() || labeled[1];
                attachments.push(url ? mediaFromUrl(url, name) : { kind: "file", name });
            }
        }
        body = body.replace(ATTACH_BLOCK_RE, "\n");
    }

    return { body: body.trim(), attachments, meta, tags, blocks, marcos };
}

/** Normaliza una fila cruda de Supabase a la forma de UI. */
export function normalizeCafePost(row: CafePostRow): NormalizedPost {
    const recipe = row.recipe || {};
    const split = splitBodyAttachments(row.body || row.title || "");
    const body = split.body;
    return {
        id: row.id,
        authorName: row.author_name || "Ciudadano StarSeed",
        avatarUrl: typeof recipe.avatar === "string" ? recipe.avatar : undefined,
        accent: row.col || undefined,
        title: row.title || undefined,
        body,
        kind: split.meta?.tipo || row.kind || "post",
        createdAt: row.created_at || new Date().toISOString(),
        likes: typeof recipe.likes === "number" ? recipe.likes : 0,
        commentsCount: Array.isArray(recipe.comments) ? recipe.comments.length : 0,
        media: detectMedia({ body, recipe }),
        attachments: split.attachments.length > 0 ? split.attachments : undefined,
        tags: split.tags.length > 0 ? split.tags : undefined,
        blocks: split.blocks.length > 0 ? split.blocks : undefined,
        marcos: Object.keys(split.marcos).length > 0 ? split.marcos : undefined,
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
    // Sin publicaciones de ejemplo. Las superficies muestran un estado vacío
    // real ("Aún no hay publicaciones") cuando no hay datos en Supabase.
    return [];
}
