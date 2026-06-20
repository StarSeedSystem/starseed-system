// ════════════════════════════════════════════════════════════════
// Abridor Universal — modelo de contenido, detección y adaptadores
// ----------------------------------------------------------------
// Un ContentResource es una Entidad Única (Lienzo Universal) que el
// abridor sabe renderizar con el visor adecuado. Los adaptadores
// fromPostMedia / fromLibraryItem / fromFile conectan el mismo motor
// con publicaciones, biblioteca y archivos locales del usuario.
// SOP: architecture/dashboard-launcher-apps-y-archivos.md §4
// ════════════════════════════════════════════════════════════════

import type { PostMedia } from "@/lib/social-posts";
import type { LibraryItem } from "@/lib/widget-data";

export type ContentKind =
    | "image" | "gif" | "gallery" | "video" | "audio" | "pdf" | "html"
    | "model3d" | "markdown" | "code" | "text" | "dataset"
    | "link" | "entity" | "app" | "unknown";

export type ContentOrigin = "url" | "file" | "post" | "library" | "sample" | "exocortex";

export interface ContentResource {
    id: string;
    kind: ContentKind;
    title: string;
    /** Bytes / destino (imagen, vídeo, audio, pdf, html, glb, enlace…). */
    url?: string;
    /** Galería de imágenes. */
    urls?: string[];
    /** Contenido en línea (markdown/código/texto/HTML como srcdoc). */
    text?: string;
    /** Lenguaje para 'code'. */
    language?: string;
    mime?: string;
    poster?: string;
    accent?: string;
    origin?: ContentOrigin;
    meta?: {
        author?: string;
        size?: string;
        domain?: string;
        discipline?: string;
        rating?: number;
        source?: string;          // fuente oficial (Fase 2.x: en tiempo real)
        originalKind?: string;    // tipo subyacente cuando kind === 'entity'
        href?: string;            // enlace interno (entidad)
    };
}

// ── Detección de tipo ────────────────────────────────────────────
const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "avif", "bmp", "svg", "ico"];
const VIDEO_EXT = ["mp4", "webm", "mov", "mkv", "m4v", "ogv"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"];
const MODEL_EXT = ["glb", "gltf"];
const CODE_EXT = ["js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "cs", "php", "sh", "json", "yaml", "yml", "toml", "css", "scss", "sql", "xml"];
const DATA_EXT = ["csv", "tsv", "xlsx", "xls", "parquet"];

export function extOf(s: string): string {
    const clean = s.split("?")[0].split("#")[0];
    const base = clean.substring(clean.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Detecta el ContentKind a partir de mime, url y/o nombre. */
export function detectKind(input: { url?: string; mime?: string; name?: string }): ContentKind {
    const mime = (input.mime || "").toLowerCase();
    if (mime) {
        if (mime === "image/gif") return "gif";
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        if (mime.startsWith("audio/")) return "audio";
        if (mime === "application/pdf") return "pdf";
        if (mime === "text/html") return "html";
        if (mime.includes("gltf") || mime.includes("model")) return "model3d";
        if (mime === "text/markdown") return "markdown";
        if (mime === "application/json" || mime === "text/csv") return "dataset";
        if (mime.startsWith("text/")) return "text";
    }
    const ext = extOf(input.name || input.url || "");
    if (ext === "gif") return "gif";
    if (IMAGE_EXT.includes(ext)) return "image";
    if (VIDEO_EXT.includes(ext)) return "video";
    if (AUDIO_EXT.includes(ext)) return "audio";
    if (ext === "pdf") return "pdf";
    if (ext === "html" || ext === "htm") return "html";
    if (MODEL_EXT.includes(ext)) return "model3d";
    if (ext === "md" || ext === "markdown") return "markdown";
    if (DATA_EXT.includes(ext)) return "dataset";
    if (CODE_EXT.includes(ext)) return "code";
    if (ext === "txt") return "text";
    if (input.url && /^https?:\/\//i.test(input.url)) return "link";
    return "unknown";
}

let _seq = 0;
function rid(prefix: string): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `${prefix}-${crypto.randomUUID()}`;
    } catch { /* noop */ }
    return `${prefix}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

function nameFromUrl(url: string, fallback = "recurso"): string {
    try {
        const base = decodeURIComponent(url.split("?")[0].split("#")[0].split("/").pop() || "");
        return base || fallback;
    } catch { return fallback; }
}

// ── Constructores / adaptadores ──────────────────────────────────
/** Crea un recurso a partir de una URL suelta (detecta el tipo). */
export function fromUrl(url: string, title?: string): ContentResource {
    const kind = detectKind({ url });
    return { id: rid("url"), kind, title: title || nameFromUrl(url), url, origin: "url" };
}

/** Crea un recurso a partir de un File del dispositivo del usuario. */
export function fromFile(file: File): ContentResource {
    const url = URL.createObjectURL(file);
    const kind = detectKind({ url, mime: file.type, name: file.name });
    return {
        id: rid("file"),
        kind,
        title: file.name,
        url,
        mime: file.type || undefined,
        origin: "file",
        meta: { size: humanSize(file.size) },
    };
}

/** Adapta un PostMedia (publicaciones) al motor universal. */
export function fromPostMedia(media: PostMedia, title?: string): ContentResource {
    const base = { id: rid("post"), title: title || media.name || "Adjunto", origin: "post" as const };
    switch (media.kind) {
        case "gallery":
            return { ...base, kind: "gallery", urls: media.urls || [] };
        case "video":
            return { ...base, kind: "video", url: media.url, poster: media.poster };
        case "audio":
            return { ...base, kind: "audio", url: media.url };
        case "pdf":
            return { ...base, kind: "pdf", url: media.url };
        case "image":
            return { ...base, kind: detectKind({ url: media.url }) === "gif" ? "gif" : "image", url: media.url };
        case "link":
            return { ...base, kind: "link", url: media.url, meta: { domain: media.domain } };
        case "text":
            return { ...base, kind: "text", text: media.name };
        case "file":
        default:
            return { ...base, kind: media.url ? detectKind({ url: media.url, name: media.name }) : "unknown", url: media.url, meta: { size: media.size } };
    }
}

const LIB_KIND_MAP: Record<LibraryItem["kind"], string> = {
    doc: "documento", video: "vídeo", curso: "curso", modelo3d: "modelo 3D", audio: "audio", dataset: "dataset",
};

/** Adapta un LibraryItem (biblioteca) — entidad del Lienzo Universal. */
export function fromLibraryItem(item: LibraryItem): ContentResource {
    return {
        id: rid("lib"),
        kind: "entity",
        title: item.title,
        origin: "library",
        meta: {
            author: item.author,
            discipline: item.discipline,
            rating: item.rating,
            originalKind: LIB_KIND_MAP[item.kind] ?? item.kind,
            href: "/library",
        },
    };
}

export function humanSize(bytes: number): string {
    if (!bytes || bytes < 0) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0, n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}
