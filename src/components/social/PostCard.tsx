// src/components/social/PostCard.tsx
"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    ThumbsUp,
    MessageCircle,
    Share2,
    FileText,
    File as FileIcon,
    ExternalLink,
    Link2,
    Music,
    Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    type NormalizedPost,
    formatCount,
    formatRelativeTime,
} from "@/lib/social-posts";

/**
 * Tarjeta de publicación reutilizable con PREVIEW ADAPTABLE según el tipo de
 * contenido (texto, imagen, galería, video, audio, enlace, PDF/archivo).
 * Responsive y fluida: usa contenedores min-w-0, aspect-ratio, object-cover,
 * lazy-load de imágenes y truncado elegante. Acciones reales básicas: like local
 * con contador, comentar (toggle UI), compartir (copiar enlace).
 */
export function PostCard({ post }: { post: NormalizedPost }) {
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(post.likes);
    const [showComments, setShowComments] = useState(false);
    const [copied, setCopied] = useState(false);

    const accent = post.accent;

    const toggleLike = () => {
        setLiked((prev) => {
            setLikeCount((c) => c + (prev ? -1 : 1));
            return !prev;
        });
    };

    const handleShare = async () => {
        const url =
            typeof window !== "undefined"
                ? `${window.location.origin}${window.location.pathname}#post-${post.id}`
                : "";
        try {
            if (navigator?.share) {
                await navigator.share({ title: post.title || post.authorName, url });
            } else if (navigator?.clipboard) {
                await navigator.clipboard.writeText(url);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            /* el usuario canceló el diálogo de compartir */
        }
    };

    return (
        <Card
            id={`post-${post.id}`}
            className="min-w-0 w-full overflow-hidden hover:border-primary/30 transition-colors"
            style={accent ? { borderColor: `${accent}22` } : undefined}
        >
            {/* ── Cabecera autor ── */}
            <CardHeader className="p-[clamp(0.85rem,2.5vw,1.25rem)] pb-2">
                <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                        className="h-[clamp(2.25rem,7vw,2.75rem)] w-[clamp(2.25rem,7vw,2.75rem)] shrink-0 ring-2"
                        style={{ ["--tw-ring-color" as any]: accent ? `${accent}55` : "transparent" }}
                    >
                        <AvatarImage src={post.avatarUrl} alt={post.authorName} />
                        <AvatarFallback
                            className="font-bold"
                            style={accent ? { background: `${accent}22`, color: accent } : undefined}
                        >
                            {post.authorName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <p className="font-semibold truncate text-[clamp(0.9rem,2.5vw,1rem)]">
                                {post.authorName}
                            </p>
                            {post.kind && post.kind !== "post" && (
                                <Badge
                                    variant="outline"
                                    className="hidden sm:inline-flex text-[10px] px-2 py-0 capitalize shrink-0"
                                    style={accent ? { borderColor: `${accent}44`, color: accent } : undefined}
                                >
                                    {post.kind}
                                </Badge>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                            {post.authorHandle ? `${post.authorHandle} · ` : ""}
                            {formatRelativeTime(post.createdAt)}
                        </p>
                    </div>
                </div>
            </CardHeader>

            {/* ── Cuerpo ── */}
            <CardContent className="px-[clamp(0.85rem,2.5vw,1.25rem)] py-1 min-w-0">
                {post.title && (
                    <h3 className="font-headline font-semibold text-[clamp(1rem,2.8vw,1.15rem)] mb-1 break-words">
                        {post.title}
                    </h3>
                )}
                {post.body && (
                    <p className="text-foreground/90 whitespace-pre-wrap break-words text-[clamp(0.875rem,2.4vw,0.95rem)] leading-relaxed line-clamp-[12]">
                        {post.body}
                    </p>
                )}

                {post.media && <PostMediaPreview post={post} />}
            </CardContent>

            {/* ── Acciones ── */}
            <CardFooter className="flex-col items-stretch px-[clamp(0.85rem,2.5vw,1.25rem)] pt-2">
                <div className="flex flex-wrap justify-between items-center gap-1 text-muted-foreground border-t pt-2">
                    <div className="flex gap-1 min-w-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={toggleLike}
                            className={cn(
                                "flex items-center gap-2 hover:bg-primary/10 hover:text-primary",
                                liked && "text-primary",
                            )}
                        >
                            <ThumbsUp className={cn("w-4 h-4", liked && "fill-current")} />
                            <span className="tabular-nums">{formatCount(likeCount)}</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowComments((v) => !v)}
                            className="flex items-center gap-2 hover:bg-primary/10 hover:text-primary"
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className="tabular-nums">{formatCount(post.commentsCount)}</span>
                        </Button>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleShare}
                        className="flex items-center gap-2 shrink-0"
                    >
                        {copied ? (
                            <>
                                <Check className="w-4 h-4 text-emerald-500" />
                                <span className="hidden sm:inline">Copiado</span>
                            </>
                        ) : (
                            <>
                                <Share2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Compartir</span>
                            </>
                        )}
                    </Button>
                </div>

                {showComments && (
                    <div className="mt-3 w-full rounded-xl border border-border/50 bg-muted/30 p-3 text-sm text-muted-foreground">
                        Los comentarios en tiempo real estarán disponibles próximamente.
                    </div>
                )}
            </CardFooter>
        </Card>
    );
}

/** Render del preview de media adaptable por tipo. */
function PostMediaPreview({ post }: { post: NormalizedPost }) {
    const media = post.media!;

    switch (media.kind) {
        case "image":
            return (
                <div className="relative mt-3 w-full aspect-video rounded-xl overflow-hidden border border-border/50 bg-muted/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={media.url}
                        alt={post.title || "Imagen de la publicación"}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                </div>
            );

        case "gallery": {
            const urls = (media.urls || []).slice(0, 4);
            return (
                <div
                    className={cn(
                        "mt-3 grid gap-1.5 rounded-xl overflow-hidden",
                        urls.length === 1 ? "grid-cols-1" : "grid-cols-2",
                    )}
                >
                    {urls.map((u, i) => (
                        <div
                            key={i}
                            className={cn(
                                "relative overflow-hidden border border-border/50 bg-muted/40",
                                urls.length === 3 && i === 0 ? "col-span-2 aspect-video" : "aspect-square",
                            )}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={u}
                                alt={`Imagen ${i + 1}`}
                                loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover"
                            />
                            {i === 3 && (media.urls?.length || 0) > 4 && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-lg font-bold">
                                    +{(media.urls!.length || 0) - 4}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            );
        }

        case "video":
            return (
                <div className="relative mt-3 w-full aspect-video rounded-xl overflow-hidden border border-border/50 bg-black">
                    <video
                        src={media.url}
                        poster={media.poster}
                        controls
                        preload="metadata"
                        className="absolute inset-0 h-full w-full object-contain"
                    />
                </div>
            );

        case "audio":
            return (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 min-w-0">
                    <div className="shrink-0 rounded-lg bg-primary/15 p-2 text-primary">
                        <Music className="h-5 w-5" />
                    </div>
                    <audio src={media.url} controls className="w-full min-w-0" preload="metadata" />
                </div>
            );

        case "pdf":
        case "file": {
            const isPdf = media.kind === "pdf";
            return (
                <a
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 hover:bg-muted/50 transition-colors min-w-0"
                >
                    <div
                        className={cn(
                            "shrink-0 rounded-lg p-2.5",
                            isPdf ? "bg-red-500/15 text-red-500" : "bg-primary/15 text-primary",
                        )}
                    >
                        {isPdf ? <FileText className="h-6 w-6" /> : <FileIcon className="h-6 w-6" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-sm">{media.name || "Archivo"}</p>
                        <p className="text-xs text-muted-foreground">
                            {media.size ? `${media.size} · ` : ""}
                            {isPdf ? "PDF" : "Archivo"} · Abrir
                        </p>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
            );
        }

        case "link":
            return (
                <a
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3 hover:bg-muted/50 transition-colors min-w-0"
                >
                    <div className="shrink-0 rounded-lg bg-primary/15 p-2.5 text-primary">
                        <Link2 className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-sm">{media.domain || "Enlace"}</p>
                        <p className="text-xs text-muted-foreground truncate">{media.url}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
            );

        default:
            return null;
    }
}
