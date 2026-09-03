"use client";

// ═══════════════════════════════════════════════════════════════════════════
// EntityGalleryBlock — galería de imágenes destacadas
// -----------------------------------------------------------------------------
// Compartido entre la integración "Galería" de grupo/página y la sección
// "Galería destacada" del perfil propio. Estado en `entity-layout.ts`
// (entity_state key 'layout' → gallery[]), resuelto por el llamador.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Trash2, ImagePlus, Images } from "lucide-react";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { GalleryImage } from "@/lib/entity-layout";
import type { Marco } from "@/lib/profile/marco-foto";
import { FotoConMarco } from "@/components/profile/foto-con-marco";
import { MarcoDeMedio } from "@/components/creation/marco-de-medio"; // (Ola 224) elegir marco al añadir

export interface EntityGalleryBlockProps {
    images: GalleryImage[];
    isOwner: boolean;
    onAdd: (url: string, caption?: string, marco?: Marco) => Promise<void> | void; // (Ola 224)
    onRemove: (index: number) => Promise<void> | void;
    emptyHint?: string;
}

export function EntityGalleryBlock({ images, isOwner, onAdd, onRemove, emptyHint }: EntityGalleryBlockProps) {
    // (Ola 224) Imagen pendiente de confirmar: el dueño elige marco antes de añadirla.
    const [pendiente, setPendiente] = useState<{ url: string; caption?: string; marco?: Marco } | null>(null);
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
                            {g.marco ? (
                                // (Ola 224) marco de forma guardado (Adenda 219)
                                <FotoConMarco src={g.url} marco={g.marco} alt={g.caption || "Imagen de la galería"} size="100%" />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={g.url} alt={g.caption || "Imagen de la galería"} className="h-full w-full object-cover" />
                            )}
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
            {isOwner && pendiente && (
                // (Ola 224) confirmación con marco opcional antes de guardar
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-xs font-medium text-white/70">Nueva imagen: elige un marco de forma (opcional)</p>
                    <MarcoDeMedio
                        src={pendiente.url}
                        value={pendiente.marco ?? null}
                        onChange={(m) => setPendiente({ ...pendiente, marco: m })}
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => { void onAdd(pendiente.url, pendiente.caption, pendiente.marco); setPendiente(null); }}
                            className="cursor-pointer rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/30"
                        >
                            Añadir a la galería
                        </button>
                        <button
                            type="button"
                            onClick={() => setPendiente(null)}
                            className="cursor-pointer rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:border-white/25"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
            {isOwner && (
                <AttachFilePickerButton
                    onPick={(picked) => {
                        const url = picked[0]?.url;
                        if (url) setPendiente({ url, caption: picked[0]?.name }); // (Ola 224)
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
