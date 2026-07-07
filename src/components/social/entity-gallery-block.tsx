"use client";

// ═══════════════════════════════════════════════════════════════════════════
// EntityGalleryBlock — galería de imágenes destacadas
// -----------------------------------------------------------------------------
// Compartido entre la integración "Galería" de grupo/página y la sección
// "Galería destacada" del perfil propio. Estado en `entity-layout.ts`
// (entity_state key 'layout' → gallery[]), resuelto por el llamador.
// ═══════════════════════════════════════════════════════════════════════════

import { Trash2, ImagePlus, Images } from "lucide-react";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { GalleryImage } from "@/lib/entity-layout";

export interface EntityGalleryBlockProps {
    images: GalleryImage[];
    isOwner: boolean;
    onAdd: (url: string, caption?: string) => Promise<void> | void;
    onRemove: (index: number) => Promise<void> | void;
    emptyHint?: string;
}

export function EntityGalleryBlock({ images, isOwner, onAdd, onRemove, emptyHint }: EntityGalleryBlockProps) {
    return (
        <div className="space-y-3">
            {images.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/12 p-8 text-center text-sm text-muted-foreground">
                    <Images className="mx-auto mb-2 h-6 w-6 opacity-30" />
                    {emptyHint || "Todavía no hay imágenes en esta galería."}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {images.map((g, i) => (
                        <div key={`${g.url}-${i}`} className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={g.url} alt={g.caption || "Imagen de la galería"} className="h-full w-full object-cover" />
                            {isOwner && (
                                <button
                                    type="button"
                                    onClick={() => void onRemove(i)}
                                    className="absolute right-1.5 top-1.5 cursor-pointer rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                                    aria-label="Quitar imagen"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                            {g.caption && (
                                <p className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-1 text-[11px] text-white">{g.caption}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {isOwner && (
                <AttachFilePickerButton
                    onPick={(picked) => {
                        const url = picked[0]?.url;
                        if (url) void onAdd(url, picked[0]?.name);
                    }}
                    accept="image/*"
                    folder="galeria"
                    title="Añadir imagen a la galería"
                    hideTabs={["neuronas"]}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:border-primary/30 hover:text-foreground"
                >
                    <ImagePlus className="h-3.5 w-3.5" /> Añadir imagen
                </AttachFilePickerButton>
            )}
        </div>
    );
}

export default EntityGalleryBlock;
