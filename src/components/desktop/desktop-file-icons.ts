// ════════════════════════════════════════════════════════════════
// StarSeed OS — Taxonomía visual de archivos del escritorio
// ----------------------------------------------------------------
// Un único punto de verdad para dibujar CUALQUIER formato de archivo
// con icono + color + etiqueta claros (imagen · vídeo · audio · pdf ·
// código · 3D · markdown · datos · folder…). Datos + helpers puros
// (dependen solo de lucide-react para el tipo de icono). Se usa en la
// vista de folders ramificada y en cualquier lista de archivos.
// ════════════════════════════════════════════════════════════════

import {
    Folder, Image as ImageIcon, Film, Music, FileText, Box, FileCode2,
    File as FileIcon, Link2, Globe, LayoutGrid, Database, Table2, Archive,
    StickyNote, FileType, type LucideIcon,
} from "lucide-react";
import type { DesktopIcon } from "./desktop-store";

export interface FileTypeVisual {
    /** Icono Lucide representativo. */
    Icon: LucideIcon;
    /** Acento hex de la familia. */
    accent: string;
    /** Etiqueta legible corta (para chips / subtítulos). */
    label: string;
    /** Grupo funcional (para agrupar/filtrar). */
    group: "image" | "video" | "audio" | "document" | "code" | "3d" | "data" | "folder" | "link" | "app" | "widget" | "other";
}

// ── Mapa por ContentKind / fileKind ──────────────────────────────
const KIND_MAP: Record<string, FileTypeVisual> = {
    image: { Icon: ImageIcon, accent: "#38BDF8", label: "Imagen", group: "image" },
    gif: { Icon: ImageIcon, accent: "#22D3EE", label: "GIF", group: "image" },
    gallery: { Icon: ImageIcon, accent: "#0EA5E9", label: "Galería", group: "image" },
    video: { Icon: Film, accent: "#F472B6", label: "Vídeo", group: "video" },
    audio: { Icon: Music, accent: "#A855F7", label: "Audio", group: "audio" },
    pdf: { Icon: FileType, accent: "#F87171", label: "PDF", group: "document" },
    markdown: { Icon: FileText, accent: "#818CF8", label: "Markdown", group: "document" },
    text: { Icon: FileText, accent: "#94A3B8", label: "Texto", group: "document" },
    note: { Icon: StickyNote, accent: "#FBBF24", label: "Nota", group: "document" },
    doc: { Icon: FileText, accent: "#60A5FA", label: "Documento", group: "document" },
    html: { Icon: FileCode2, accent: "#FB923C", label: "HTML", group: "code" },
    code: { Icon: FileCode2, accent: "#34D399", label: "Código", group: "code" },
    model3d: { Icon: Box, accent: "#C084FC", label: "3D", group: "3d" },
    dataset: { Icon: Database, accent: "#FBBF24", label: "Datos", group: "data" },
    csv: { Icon: Table2, accent: "#4ADE80", label: "CSV", group: "data" },
    archive: { Icon: Archive, accent: "#EAB308", label: "Archivo", group: "other" },
    link: { Icon: Link2, accent: "#22D3EE", label: "Enlace", group: "link" },
    entity: { Icon: LayoutGrid, accent: "#2DD4BF", label: "Entidad", group: "other" },
    app: { Icon: LayoutGrid, accent: "#007FFF", label: "App", group: "app" },
    unknown: { Icon: FileIcon, accent: "#64748B", label: "Archivo", group: "other" },
};

// ── Mapa por extensión (cuando fileKind no basta) ────────────────
const EXT_GROUPS: Array<{ re: RegExp; kind: string }> = [
    { re: /\.(png|jpe?g|webp|avif|bmp|heic|svg)$/i, kind: "image" },
    { re: /\.gif$/i, kind: "gif" },
    { re: /\.(mp4|webm|mov|mkv|avi|m4v)$/i, kind: "video" },
    { re: /\.(mp3|wav|flac|ogg|m4a|aac)$/i, kind: "audio" },
    { re: /\.pdf$/i, kind: "pdf" },
    { re: /\.(md|mdx)$/i, kind: "markdown" },
    { re: /\.(txt|rtf)$/i, kind: "text" },
    { re: /\.(docx?|odt|pages)$/i, kind: "doc" },
    { re: /\.html?$/i, kind: "html" },
    { re: /\.(js|ts|tsx|jsx|py|rs|go|java|c|cpp|rb|php|json|css|sh)$/i, kind: "code" },
    { re: /\.(glb|gltf|obj|fbx|stl|usdz)$/i, kind: "model3d" },
    { re: /\.(csv|tsv)$/i, kind: "csv" },
    { re: /\.(xlsx?|numbers|parquet)$/i, kind: "dataset" },
    { re: /\.(zip|rar|7z|tar|gz)$/i, kind: "archive" },
];

/** Resuelve la apariencia de un archivo por su fileKind y/o nombre-URL. */
export function fileVisual(fileKind?: string, nameOrUrl?: string): FileTypeVisual {
    if (fileKind && KIND_MAP[fileKind]) return KIND_MAP[fileKind];
    if (nameOrUrl) {
        const hit = EXT_GROUPS.find((g) => g.re.test(nameOrUrl));
        if (hit && KIND_MAP[hit.kind]) return KIND_MAP[hit.kind];
    }
    return KIND_MAP.unknown;
}

/** Apariencia para CUALQUIER icono del escritorio (folder, app, widget, enlace, archivo). */
export function desktopIconVisual(icon: DesktopIcon): FileTypeVisual {
    switch (icon.kind) {
        case "folder":
            return { Icon: Folder, accent: icon.accent ?? "#FFBF00", label: "Folder", group: "folder" };
        case "app":
            return { Icon: LayoutGrid, accent: icon.accent ?? "#007FFF", label: "App", group: "app" };
        case "widget":
            return { Icon: LayoutGrid, accent: icon.accent ?? "#7C3AED", label: "Widget", group: "widget" };
        case "link":
            return { Icon: Globe, accent: icon.accent ?? "#22D3EE", label: "Enlace", group: "link" };
        default: {
            const v = fileVisual(icon.fileKind, icon.url ?? icon.name);
            return icon.accent ? { ...v, accent: icon.accent } : v;
        }
    }
}

/** ¿Este icono puede mostrar una miniatura de imagen real? */
export function hasThumbnail(icon: DesktopIcon): boolean {
    if (icon.thumbUrl) return true;
    if (icon.kind !== "file") return false;
    const v = fileVisual(icon.fileKind, icon.url ?? icon.name);
    return v.group === "image" && Boolean(icon.url);
}

/** URL de miniatura preferida (thumbUrl explícita o la propia imagen). */
export function thumbnailUrl(icon: DesktopIcon): string | undefined {
    if (icon.thumbUrl) return icon.thumbUrl;
    if (hasThumbnail(icon)) return icon.url;
    return undefined;
}

/** Cuenta recursiva de elementos dentro de un folder (para subtítulos). */
export function countFolderItems(icon: DesktopIcon): number {
    if (icon.kind !== "folder" || !icon.children) return 0;
    return icon.children.length;
}
