"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * AttachmentCarousel — CARRUSEL MULTI-FORMATO estilo Instagram
 * -----------------------------------------------------------------------------
 * Cuando una publicación trae VARIOS adjuntos heterogéneos (imagen + vídeo +
 * código + PDF + app…), este componente los muestra como un carrusel deslizable
 * (swipe táctil + flechas + puntos) donde CADA slide se adapta inteligentemente
 * a su propio formato. El slide ACTUAL siempre puede abrirse con las tres vías
 * de `EmbeddedContentWindow` (ventana incrustada / pantalla completa / pestaña):
 * se monta UNA instancia compartida bajo el carrusel para el slide activo (se
 * reinicia a colapsada al cambiar de slide vía `key`), evitando montar N
 * iframes a la vez sólo por tenerlos en el carrusel.
 *
 * Con un único adjunto no hay carrusel: se delega directo en
 * `EmbeddedContentWindow` (mismo componente, cero código duplicado).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import {
    Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious,
    type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";
import { FilePreview, detectFormat } from "@/components/files/file-preview";
import {
    EmbeddedContentWindow, toFileLike, titleOf, iconFor, isEmbeddableSurface,
    type EmbeddedItem, type EmbedContext,
} from "@/components/posts/embedded-content-window";
import type { MainRatio } from "@/lib/publish/publish";

export interface AttachmentCarouselProps {
    items: EmbeddedItem[];
    /** Contexto de tamaño máximo: "feed" (compacto) o "page" (página de post). */
    context?: EmbedContext;
    /** Proporción de la vista principal (auto/1:1/4:5/16:9/libre). */
    ratio?: MainRatio;
    className?: string;
}

const ASPECT_CLASS: Partial<Record<MainRatio, string>> = {
    "1:1": "aspect-square",
    "4:5": "aspect-[4/5]",
    "16:9": "aspect-video",
};

/** Slide "superficie" (página/app/pizarra/servidor…): tarjeta estática — el
 *  iframe real sólo se monta al abrir (evita N iframes simultáneos ociosos). */
function SurfaceSlide({ item, boxed, ratio }: { item: EmbeddedItem; boxed: boolean; ratio: MainRatio }) {
    const Icon = iconFor(item);
    return (
        <div
            className={cn(
                "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-transparent p-6 text-center",
                boxed ? ASPECT_CLASS[ratio] : "min-h-[220px]",
            )}
        >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10">
                <Icon className="size-6 text-cyan-300" />
            </span>
            <p className="max-w-full truncate px-2 text-sm font-semibold text-white/85">{titleOf(item)}</p>
            <p className="text-[11px] text-white/45">Ábrelo con los botones de abajo.</p>
        </div>
    );
}

/** Cuerpo compacto de un slide: imagen/vídeo recortados a la proporción elegida
 *  (look "Instagram"); el resto delega en `FilePreview` (misma lógica de
 *  formatos que ya usan las tarjetas del feed). */
function SlideBody({ item, ratio, context }: { item: EmbeddedItem; ratio: MainRatio; context: EmbedContext }) {
    const boxed = ratio === "1:1" || ratio === "4:5" || ratio === "16:9";

    if (isEmbeddableSurface(item)) {
        return <SurfaceSlide item={item} boxed={boxed} ratio={ratio} />;
    }

    const fmt = detectFormat(toFileLike(item));
    if (boxed && (fmt === "image" || fmt === "video")) {
        return (
            <div className={cn("relative w-full overflow-hidden rounded-xl bg-black/30", ASPECT_CLASS[ratio])}>
                {fmt === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={item.url || undefined}
                        alt={titleOf(item)}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <video
                        src={item.url || undefined}
                        poster={item.thumbnail || undefined}
                        controls
                        playsInline
                        preload="metadata"
                        className="absolute inset-0 h-full w-full bg-black object-cover"
                    />
                )}
            </div>
        );
    }

    const cap = context === "feed" ? "max-h-[65vh]" : "max-h-[80vh]";
    return (
        <div className={cn("w-full overflow-hidden rounded-xl", cap)}>
            <FilePreview file={toFileLike(item)} context="post" compact actions={false} />
        </div>
    );
}

export function AttachmentCarousel({ items, context = "feed", ratio = "auto", className }: AttachmentCarouselProps) {
    const [api, setApi] = useState<CarouselApi>();
    const [current, setCurrent] = useState(0);

    useEffect(() => {
        if (!api) return;
        setCurrent(api.selectedScrollSnap());
        const onSelect = () => setCurrent(api.selectedScrollSnap());
        api.on("select", onSelect);
        return () => {
            api.off("select", onSelect);
        };
    }, [api]);

    if (!items || items.length === 0) return null;

    // Un único adjunto: nada de carrusel — la propia ventana incrustada basta.
    if (items.length === 1) {
        return <EmbeddedContentWindow item={items[0]} context={context} ratio={ratio} className={className} />;
    }

    const idx = Math.min(current, items.length - 1);
    const activeItem = items[idx];

    return (
        <div className={cn("space-y-2", className)}>
            <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
                <Carousel setApi={setApi} className="w-full" opts={{ align: "start", loop: false }}>
                    <CarouselContent>
                        {items.map((item, i) => (
                            <CarouselItem key={item.id || i}>
                                <div className="p-1.5">
                                    <SlideBody item={item} ratio={ratio} context={context} />
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious className="left-2 border-white/10 bg-black/50 text-white hover:bg-black/70" />
                    <CarouselNext className="right-2 border-white/10 bg-black/50 text-white hover:bg-black/70" />
                </Carousel>

                {/* Puntos de posición (clicables) */}
                <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
                    {items.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            aria-label={`Ir al adjunto ${i + 1}`}
                            onClick={() => api?.scrollTo(i)}
                            className={cn(
                                "h-1.5 cursor-pointer rounded-full bg-white/40 transition-all duration-200 hover:bg-white/70",
                                i === idx ? "w-4 bg-cyan-300 hover:bg-cyan-300" : "w-1.5",
                            )}
                        />
                    ))}
                </div>

                {/* Contador de posición */}
                <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/70 backdrop-blur-sm">
                    {idx + 1} / {items.length}
                </div>
            </div>

            {/* Ventana compartida del slide ACTUAL: se reinicia (colapsada) al
                cambiar de slide gracias a la `key`, así nunca hay N iframes
                montados a la vez por culpa del carrusel. */}
            <EmbeddedContentWindow key={activeItem.id ?? `slide-${idx}`} item={activeItem} context={context} ratio={ratio} />
        </div>
    );
}

export default AttachmentCarousel;
