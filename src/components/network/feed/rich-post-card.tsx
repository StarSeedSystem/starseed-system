"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TiltCard } from "@/components/ui/tilt-card";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious
} from "@/components/ui/carousel";
import { Heart, MessageCircle, Share2, MoreHorizontal, Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilePreview, type FileLike } from "@/components/files/file-preview";
import { AttachmentCarousel } from "@/components/posts/attachment-carousel";
import { LiveAttachment } from "@/components/posts/live-attachment";
import type { FeedPost } from "@/lib/feed/network-feed";
import { useLikes } from "@/hooks/use-os-entities";
import { commentTree, type CommentNode } from "@/lib/posts/post-entity";
import { getCurrentUserId } from "@/lib/os-social";
import { CommentThread } from "./comment-thread";
import { SaveToLibrary } from "@/components/library/save-to-library";

interface RichPostCardProps {
    post: FeedPost;
    /** Vista previa EN VIVO (compositor): desactiva navegación/guardado, la
     *  tarjeta se renderiza igual pixel a pixel. Por defecto false. */
    preview?: boolean;
}

/** Etiqueta legible + acento por área (política/educación/cultura/general). */
const AREA_META: Record<string, { label: string; accent: string }> = {
    politica: { label: "Política", accent: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
    educacion: { label: "Educación", accent: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
    cultura: { label: "Cultura", accent: "text-purple-300 bg-purple-500/10 border-purple-500/20" },
    general: { label: "General", accent: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20" },
};

/**
 * Tarjeta de vista previa expandible para el adjunto rico de una publicación
 * (página, app, widget, programa, agente, skill, archivo, encuesta, evento…).
 * Colapsada muestra una fila compacta con icono + título; expandida delega el
 * render completo por tipo a `FilePreview` (reutiliza toda su lógica de formatos).
 */
function AttachmentPreviewCard({ attachment }: { attachment: NonNullable<FeedPost["attachment"]> }) {
    const [expanded, setExpanded] = useState(false);
    const file: FileLike = {
        url: attachment.url ?? undefined,
        launchHref: attachment.href ?? undefined,
        name: attachment.name ?? attachment.title ?? undefined,
        type: attachment.kind,
        mime: attachment.mime ?? undefined,
        thumbnail: attachment.thumbnail ?? undefined,
        description: attachment.description ?? undefined,
    };

    return (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
            >
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/75">
                    {attachment.title || attachment.name || "Contenido adjunto"}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300/70">
                    {expanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                    {expanded ? "Contraer" : "Expandir"}
                </span>
            </button>
            {expanded && (
                <div className="border-t border-white/10 p-3 animate-in fade-in-50 duration-200">
                    <FilePreview file={file} context="post" compact />
                </div>
            )}
        </div>
    );
}

export function RichPostCard({ post, preview = false }: RichPostCardProps) {
    const { count: likesCount, liked: isLiked, toggle: toggleLike } = useLikes(post.postId, post.likes);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<CommentNode[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const areaMeta = post.area ? AREA_META[post.area] : null;

    useEffect(() => {
        let active = true;
        getCurrentUserId().then((uid) => {
            if (active) setCurrentUserId(uid);
        });
        return () => {
            active = false;
        };
    }, []);

    const loadComments = useCallback(async () => {
        setCommentsLoading(true);
        try {
            setComments(await commentTree(post.postId));
        } finally {
            setCommentsLoading(false);
        }
    }, [post.postId]);

    useEffect(() => {
        if (showComments) void loadComments();
    }, [showComments, loadComments]);

    return (
        <TiltCard
            intensity={5} // Subtle tilt for feed items
            className="w-full mb-6"
        >
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#0a0a0a]/60 backdrop-blur-xl shadow-md transition-all">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="relative group cursor-pointer">
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full opacity-75 blur group-hover:opacity-100 transition duration-200"></div>
                            {post.author.avatar ? (
                                <img src={post.author.avatar} alt="Avatar" className="relative w-10 h-10 rounded-full object-cover border border-black" />
                            ) : (
                                <div className="relative flex w-10 h-10 items-center justify-center rounded-full border border-black bg-gradient-to-br from-cyan-500 to-purple-500 text-xs font-bold text-white">
                                    {post.author.name?.[0]?.toUpperCase() ?? "?"}
                                </div>
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-1">
                                <h3 className="font-bold text-sm text-white">{post.author.name}</h3>
                                {post.author.verified && <span className="text-blue-400 text-[10px]">✓</span>}
                            </div>
                            <p className="text-xs text-white/40">
                                {post.author.handle && <>{post.author.handle} • </>}
                                {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {areaMeta && (
                            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", areaMeta.accent)}>
                                {areaMeta.label}
                            </span>
                        )}
                        <button className="text-white/30 hover:text-white transition-colors cursor-pointer">
                            <MoreHorizontal className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4">
                    {preview ? (
                        <p className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap font-light">
                            {post.content}
                        </p>
                    ) : (
                        <Link href={`/post/${post.postId}`} className="block">
                            <p className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap font-light hover:text-white transition-colors">
                                {post.content}
                            </p>
                        </Link>
                    )}

                    {/* Vista principal: cualquier proporción/contenido, tamaño máximo por
                        contexto (feed compacto). La vista previa es OPCIONAL. */}
                    {(post.showPreview ?? true) && (
                        post.attachments && post.attachments.length > 0 ? (
                            // Contenido vivo (Adenda "Cultura social"): con UN único adjunto, se
                            // delega en `LiveAttachment` (mismo render que `EmbeddedContentWindow`
                            // cuando el adjunto es estático — cero regresión; añade edición en vivo
                            // o canal en vivo cuando el autor los activó desde el compositor). Con
                            // varios adjuntos se conserva el carrusel existente sin cambios.
                            post.attachments.length === 1 ? (
                                <LiveAttachment item={post.attachments[0]} context="feed" ratio={post.mainRatio ?? "auto"} />
                            ) : (
                                <AttachmentCarousel items={post.attachments} context="feed" ratio={post.mainRatio ?? "auto"} />
                            )
                        ) : (
                            <>
                                {/* Legado: carrusel de medios simple (retrocompatibilidad total) */}
                                {post.media.length > 0 && (
                                    <div className="relative rounded-xl overflow-hidden border border-white/10 shadow-inner bg-black/50">
                                        <Carousel className="w-full">
                                            <CarouselContent>
                                                {post.media.map((media, idx) => {
                                                    const file: FileLike =
                                                        typeof media === "string"
                                                            ? { url: media }
                                                            : {
                                                                url: (media as any)?.url ?? undefined,
                                                                name: (media as any)?.name ?? undefined,
                                                                type: (media as any)?.type ?? undefined,
                                                                mime: (media as any)?.mime ?? undefined,
                                                                thumbnail: (media as any)?.thumbnail ?? undefined,
                                                            };
                                                    return (
                                                        <CarouselItem key={idx}>
                                                            <div className="w-full overflow-hidden p-2">
                                                                <FilePreview file={file} context="post" compact />
                                                            </div>
                                                        </CarouselItem>
                                                    );
                                                })}
                                            </CarouselContent>
                                            {post.media.length > 1 && (
                                                <>
                                                    <CarouselPrevious className="left-2 bg-black/50 border-white/10 text-white hover:bg-black/70" />
                                                    <CarouselNext className="right-2 bg-black/50 border-white/10 text-white hover:bg-black/70" />
                                                </>
                                            )}
                                        </Carousel>
                                    </div>
                                )}

                                {/* Legado: tarjeta de vista previa expandible del adjunto rico único */}
                                {post.attachment && <AttachmentPreviewCard attachment={post.attachment} />}
                            </>
                        )
                    )}

                    {/* Tags / Metadata */}
                    {post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                            {post.tags.map(tag => (
                                <span key={tag} className="text-xs font-semibold text-primary/80 bg-primary/10 px-2 py-1 rounded-full border border-primary/20 shadow-[0_0_10px_rgba(var(--primary-hsl),0.2)]">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-t border-white/5">
                    <div className="flex gap-6">
                        <button
                            onClick={() => void toggleLike()}
                            className={cn("flex items-center gap-2 text-sm transition-colors group cursor-pointer", isLiked ? "text-pink-500" : "text-white/60 hover:text-pink-400")}
                        >
                            <Heart className={cn("w-5 h-5 transition-transform group-active:scale-75", isLiked && "fill-current")} />
                            <span>{likesCount}</span>
                        </button>

                        <button
                            onClick={() => setShowComments(!showComments)}
                            className="flex items-center gap-2 text-sm text-white/60 hover:text-blue-400 transition-colors cursor-pointer"
                        >
                            <MessageCircle className="w-5 h-5" />
                            <span>{post.commentsCount}</span>
                        </button>

                        <button className="flex items-center gap-2 text-sm text-white/60 hover:text-green-400 transition-colors cursor-pointer">
                            <Share2 className="w-5 h-5" />
                            <span>{post.shares}</span>
                        </button>
                    </div>

                    {!preview && (
                        <div className="flex items-center gap-1">
                            <SaveToLibrary
                                variant="icon"
                                item={{
                                    type: "post",
                                    refId: post.postId,
                                    route: `/post/${post.postId}`,
                                    title: post.content?.slice(0, 80) || `Publicación de ${post.author.name}`,
                                }}
                                className="text-white/40 hover:text-white"
                            />
                            <Link href={`/post/${post.postId}`} className="text-white/40 hover:text-white transition-colors cursor-pointer" title="Abrir publicación completa">
                                <ExternalLink className="w-4 h-4" />
                            </Link>
                        </div>
                    )}
                </div>

                {/* Comments Section (Collapsible) — hilo ramificado real */}
                {showComments && (
                    <div className="border-t border-white/5 bg-black/20 p-4 animate-in slide-in-from-top-2 fade-in duration-200">
                        {commentsLoading ? (
                            <p className="text-xs text-white/40">Cargando comentarios…</p>
                        ) : (
                            <CommentThread
                                postId={post.postId}
                                comments={comments}
                                currentUserId={currentUserId}
                                onChanged={loadComments}
                            />
                        )}
                    </div>
                )}
            </div>
        </TiltCard>
    );
}
