"use client";

// ════════════════════════════════════════════════════════════════
// RecentGalleryWidget — últimas capturas de tu Galería personal, en vivo.
// Lee directamente tu biblioteca (entity-library) filtrando imágenes/vídeos,
// sin datos simulados. Vacío → CTA para abrir la Cámara o la Galería.
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { Images, Camera as CameraIcon, Video } from "lucide-react";
import { WidgetShell } from "../kit";
import { currentUserRef, type EntityRef } from "@/lib/sync/entity-state";
import { listLibrary, type SavedItem } from "@/lib/library/entity-library";
import { isMediaItem, mediaKindOf } from "@/lib/library/media-library";

export function RecentGalleryWidget() {
    const [items, setItems] = useState<SavedItem[] | null>(null);

    useEffect(() => {
        let alive = true;
        void currentUserRef().then(async (ref: EntityRef | null) => {
            if (!ref) {
                if (alive) setItems([]);
                return;
            }
            const doc = await listLibrary(ref);
            if (!alive) return;
            const media = doc.items
                .filter(isMediaItem)
                .sort((a, b) => Date.parse(b.addedAt || "") - Date.parse(a.addedAt || ""));
            setItems(media);
        });
        return () => {
            alive = false;
        };
    }, []);

    return (
        <WidgetShell
            title="Galería reciente"
            subtitle="Tus últimas capturas"
            icon={Images}
            accent="#f472b6"
            expandHref="/galeria"
            connections={[
                { label: "Galería", href: "/galeria", color: "#f472b6", icon: Images },
                { label: "Cámara", href: "/camara", color: "#fb7185", icon: CameraIcon },
            ]}
        >
            {(size) => {
                if (items === null) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (items.length === 0) {
                    return (
                        <div className="flex h-full flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-pink-400/30 bg-pink-500/10">
                                <Images className="size-6 text-pink-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay fotos ni vídeos</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Captura algo con la Cámara para empezar.</p>
                            </div>
                            <Link href="/camara" className="inline-flex items-center gap-1.5 rounded-full border border-pink-400/40 bg-pink-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-pink-300 hover:bg-pink-500/25 transition-colors cursor-pointer">
                                <CameraIcon className="size-3.5" /> Abrir Cámara
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 4 : size.vTier === "expanded" ? 12 : 6;
                const shown = items.slice(0, max);

                return (
                    <div className="grid h-full grid-cols-3 gap-1.5 @sm:grid-cols-4">
                        {shown.map((it) => {
                            const kind = mediaKindOf(it);
                            return (
                                <Link key={it.id} href="/galeria" className="relative block cursor-pointer overflow-hidden rounded-lg border border-border/30 bg-black/20">
                                    {kind === "video" ? (
                                        // eslint-disable-next-line jsx-a11y/media-has-caption
                                        <video src={it.url} muted className="h-full w-full object-cover aspect-square" />
                                    ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={it.url} alt={it.title} loading="lazy" className="h-full w-full object-cover aspect-square" />
                                    )}
                                    {kind === "video" && (
                                        <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-black/50">
                                            <Video className="size-2.5 text-white" />
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default RecentGalleryWidget;
