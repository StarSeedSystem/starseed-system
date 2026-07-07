"use client";

// ════════════════════════════════════════════════════════════════════════════
// ItemPreviewPane — vista previa embebida por formato al seleccionar un ítem.
// Envuelve FilePreview (src/components/files/file-preview.tsx) ya existente:
// cubre imagen/audio/video/texto(markdown)/código/PDF/enlace out-of-the-box.
// Para tipos sin contenido propio (route/page/package/alias/branch) muestra
// una ficha de metadatos simple con acceso directo a "Abrir".
// ════════════════════════════════════════════════════════════════════════════

import { Button } from "@/components/ui/button";
import { ExternalLink, Tags, X, Link2 } from "lucide-react";
import { FilePreview } from "@/components/files/file-preview";
import { itemTypeMeta, toFileLike } from "./item-meta";
import { relatedItemsOf } from "./finder-types";
import type { EntityLibraryDoc, SavedItem } from "@/lib/library/entity-library";

export interface ItemPreviewPaneProps {
    item: SavedItem;
    accent?: string;
    onOpen: () => void;
    onClose: () => void;
    resolvedTarget?: SavedItem | null;
    /** Documento completo de la biblioteca (opcional): habilita "Archivos relacionados" (§18). */
    doc?: EntityLibraryDoc;
    onSelectRelated?: (item: SavedItem) => void;
}

export function ItemPreviewPane({ item, accent, onOpen, onClose, resolvedTarget, doc, onSelectRelated }: ItemPreviewPaneProps) {
    const shown = resolvedTarget ?? item;
    const meta = itemTypeMeta(item.type);
    const hasEmbeddable = !!(shown.url || shown.content || shown.route);
    const related = doc ? relatedItemsOf(doc, item, 5) : [];

    return (
        <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground">{meta.label}</p>
                </div>
                <button type="button" onClick={onClose} className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-white/10 hover:text-white" aria-label="Cerrar vista previa">
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            {hasEmbeddable ? (
                <FilePreview file={toFileLike(shown)} context="library" accent={accent} actions={false} />
            ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-xs text-muted-foreground">
                    Sin vista previa embebida para este tipo de referencia.
                </div>
            )}

            {item.note && <p className="text-xs text-white/70">{item.note}</p>}

            {item.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <Tags className="h-3 w-3 text-muted-foreground" />
                    {item.tags.map((t) => (
                        <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                            #{t}
                        </span>
                    ))}
                </div>
            )}

            {related.length > 0 && (
                <div className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Link2 className="h-3 w-3" /> Archivos relacionados
                    </p>
                    <div className="flex flex-col gap-1">
                        {related.map((r) => (
                            <button
                                key={r.id}
                                type="button"
                                onClick={() => onSelectRelated?.(r)}
                                className="flex cursor-pointer items-center gap-1.5 truncate rounded-lg px-2 py-1 text-left text-[11px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                            >
                                <span className="truncate">{r.title}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <Button type="button" size="sm" onClick={onOpen} className="mt-auto w-full cursor-pointer gap-2 text-xs">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </Button>
        </div>
    );
}

export default ItemPreviewPane;
