// item-meta — metadatos visuales por SavedItemType (icono/label), incluyendo
// los tipos v2 (`alias`, `branch`). Puro, sin JSX.

import {
    Package, PenSquare, FileText, Globe, Link2, ExternalLink, CornerUpRight, GitBranch, Bookmark, Drama, Palette,
    type LucideIcon,
} from "lucide-react";
import type { SavedItem, SavedItemType } from "@/lib/library/entity-library";
import { detectFormat, type FileLike } from "@/components/files/file-preview";

export const ITEM_TYPE_META: Record<SavedItemType, { label: string; icon: LucideIcon }> = {
    package: { label: "Paquete", icon: Package },
    post: { label: "Publicación", icon: PenSquare },
    file: { label: "Archivo", icon: FileText },
    page: { label: "Página", icon: Globe },
    route: { label: "Ruta del OS", icon: Link2 },
    external: { label: "Enlace externo", icon: ExternalLink },
    alias: { label: "Acceso directo", icon: CornerUpRight },
    branch: { label: "Rama (vinculado)", icon: GitBranch },
    /** v2.1 (§17): repo GIT externo conectado. */
    repo: { label: "Repo conectado", icon: GitBranch },
    /** v2.1 (§19): guardado desde "Marcadores" (enlace/nota/imagen). */
    bookmark: { label: "Marcador", icon: Bookmark },
    /** v2.2 (Adenda 63 §11): personalidad de Aurora (archivo de configuración). */
    personality: { label: "Personalidad", icon: Drama },
    /** v2.3 (Adenda 72 C1): archivo de diseño (.ssdesign.json). */
    design: { label: "Diseño", icon: Palette },
};

export function itemTypeMeta(type: SavedItemType) {
    return ITEM_TYPE_META[type] ?? ITEM_TYPE_META.external;
}

/** Adapta un SavedItem a FileLike (para detección de formato y FilePreview). */
export function toFileLike(item: SavedItem): FileLike {
    return {
        url: item.url,
        name: item.title,
        mime: item.mime,
        type: item.mime ? undefined : item.type === "file" ? undefined : item.type,
        thumbnail: item.thumbnail,
        content: item.content,
        language: item.language,
        description: item.description ?? item.note,
    };
}

export function itemFormat(item: SavedItem) {
    return detectFormat(toFileLike(item));
}
