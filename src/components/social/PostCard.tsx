// src/components/social/PostCard.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    Send,
    Lock,
    Trash2,
    Loader2,
    Clapperboard,
    Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useLikes, useComments } from "@/hooks/use-os-entities";
import {
    type NormalizedPost,
    formatCount,
    formatRelativeTime,
} from "@/lib/social-posts";
import { PostBlocksRenderer, PostTagChips } from "@/components/social/post-blocks-renderer";
// Enviar a… (DESTINOS · Adenda 66 §5): publicar en el Lienzo, mensaje, cerebro, etc.
import { ShareToDialog } from "@/components/sharing/share-to-dialog";
import type { ShareResourceRef } from "@/lib/sharing/share-targets";

const GOLD = "#E9C46A";

/** ¿El id parece un uuid de os_posts real (no un fallback/sample)? */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isRealPostId(id: string): boolean {
    return UUID_RE.test(id);
}

/**
 * Tarjeta de publicación reutilizable con PREVIEW ADAPTABLE según el tipo de
 * contenido (texto, imagen, galería, video, audio, enlace, PDF/archivo).
 * Responsive y fluida: usa contenedores min-w-0, aspect-ratio, object-cover,
 * lazy-load de imágenes y truncado elegante. Acciones reales básicas: like local
 * con contador, comentar (toggle UI), compartir (copiar enlace).
 */
export function PostCard({ post }: { post: NormalizedPost }) {
    const real = isRealPostId(post.id);
    return real ? <RealPostCard post={post} /> : <SamplePostCard post={post} />;
}

/**
 * Tarjeta para publicaciones REALES (os_posts): likes y comentarios persistidos
 * en Supabase vía useLikes / useComments. Degradación elegante a /login sin sesión.
 */
function RealPostCard({ post }: { post: NormalizedPost }) {
    const { count, liked, needsAuth: likeNeedsAuth, toggle } = useLikes(post.id, post.likes);
    const comments = useComments(post.id, true);
    const [showComments, setShowComments] = useState(false);
    const [copied, setCopied] = useState(false);
    const accent = post.accent;

    const commentCount = comments.loading ? post.commentsCount : comments.comments.length;

    const handleShare = makeShareHandler(post, setCopied);

    return (
        <PostCardShell
            post={post}
            accent={accent}
            likeCount={count}
            liked={liked}
            onToggleLike={toggle}
            likeNeedsAuth={likeNeedsAuth}
            commentCount={commentCount}
            showComments={showComments}
            onToggleComments={() => setShowComments((v) => !v)}
            copied={copied}
            onShare={handleShare}
            commentsPanel={
                showComments ? (
                    <CommentThread accent={accent} comments={comments} />
                ) : null
            }
        />
    );
}

/**
 * Tarjeta para publicaciones de EJEMPLO (fallback-*): like local (no persiste) y
 * comentarios deshabilitados con invitación a iniciar sesión. Nunca rompe.
 */
function SamplePostCard({ post }: { post: NormalizedPost }) {
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(post.likes);
    const [showComments, setShowComments] = useState(false);
    const [copied, setCopied] = useState(false);
    const accent = post.accent;

    const toggleLike = async () => {
        setLiked((prev) => {
            setLikeCount((c) => c + (prev ? -1 : 1));
            return !prev;
        });
    };

    const handleShare = makeShareHandler(post, setCopied);

    return (
        <PostCardShell
            post={post}
            accent={accent}
            likeCount={likeCount}
            liked={liked}
            onToggleLike={toggleLike}
            likeNeedsAuth={false}
            commentCount={post.commentsCount}
            showComments={showComments}
            onToggleComments={() => setShowComments((v) => !v)}
            copied={copied}
            onShare={handleShare}
            commentsPanel={
                showComments ? (
                    <div className="mt-3 w-full rounded-xl border border-border/50 bg-muted/30 p-3 text-sm text-muted-foreground">
                        Esta es una publicación de ejemplo.{" "}
                        <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                            Inicia sesión
                        </Link>{" "}
                        para comentar en la red real.
                    </div>
                ) : null
            }
        />
    );
}

/** Construye un handler de compartir (navigator.share con fallback a copiar). */
function makeShareHandler(
    post: NormalizedPost,
    setCopied: React.Dispatch<React.SetStateAction<boolean>>,
) {
    return async () => {
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
}

/** Props presentacionales compartidas por las dos variantes de tarjeta. */
interface PostCardShellProps {
    post: NormalizedPost;
    accent?: string;
    likeCount: number;
    liked: boolean;
    onToggleLike: () => void | Promise<void>;
    likeNeedsAuth: boolean;
    commentCount: number;
    showComments: boolean;
    onToggleComments: () => void;
    copied: boolean;
    onShare: () => void | Promise<void>;
    commentsPanel: React.ReactNode;
}

/** Estructura visual común de la tarjeta (cabecera, cuerpo, acciones, panel). */
function PostCardShell({
    post,
    accent,
    likeCount,
    liked,
    onToggleLike,
    likeNeedsAuth,
    commentCount,
    showComments,
    onToggleComments,
    copied,
    onShare,
    commentsPanel,
}: PostCardShellProps) {
    const [likeHint, setLikeHint] = useState(false);
    const [sendTo, setSendTo] = useState<ShareResourceRef | null>(null);

    const openSendTo = () => {
        const url =
            typeof window !== "undefined"
                ? `${window.location.origin}${window.location.pathname}#post-${post.id}`
                : undefined;
        setSendTo({
            kind: "publicacion",
            id: post.id,
            name: post.title || post.authorName || "Publicación",
            url,
            note: post.body ? post.body.slice(0, 140) : undefined,
        });
    };

    const handleLike = async () => {
        await onToggleLike();
        if (likeNeedsAuth) {
            setLikeHint(true);
            setTimeout(() => setLikeHint(false), 4000);
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
                <PostAttachmentList post={post} />

                {/* Adenda 66 §6 · bloques ricos del Lienzo (código, gráfica, mapa, agente…) */}
                <PostBlocksRenderer blocks={post.blocks} accent={accent} />

                {/* Adenda 66 §6 · etiquetas múltiples de la publicación */}
                <PostTagChips tags={post.tags} />
            </CardContent>

            {/* ── Acciones ── */}
            <CardFooter className="flex-col items-stretch px-[clamp(0.85rem,2.5vw,1.25rem)] pt-2">
                <div className="flex flex-wrap justify-between items-center gap-1 text-muted-foreground border-t pt-2">
                    <div className="flex gap-1 min-w-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLike}
                            aria-pressed={liked}
                            className={cn(
                                "flex items-center gap-2 hover:bg-primary/10 hover:text-primary cursor-pointer",
                                liked && "text-primary",
                            )}
                        >
                            <ThumbsUp className={cn("w-4 h-4", liked && "fill-current")} />
                            <span className="tabular-nums">{formatCount(likeCount)}</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onToggleComments}
                            aria-expanded={showComments}
                            className={cn(
                                "flex items-center gap-2 hover:bg-primary/10 hover:text-primary cursor-pointer",
                                showComments && "text-primary",
                            )}
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className="tabular-nums">{formatCount(commentCount)}</span>
                        </Button>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={openSendTo}
                            className="flex items-center gap-2 cursor-pointer"
                            aria-label="Enviar a…"
                        >
                            <Send className="w-4 h-4" />
                            <span className="hidden sm:inline">Enviar</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onShare}
                            className="flex items-center gap-2 cursor-pointer"
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
                </div>

                {likeHint && likeNeedsAuth && (
                    <span className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                            Inicia sesión para reaccionar
                        </Link>
                    </span>
                )}

                {commentsPanel}
            </CardFooter>

            {sendTo && (
                <ShareToDialog open onOpenChange={(o) => !o && setSendTo(null)} resource={sendTo} />
            )}
        </Card>
    );
}

/** Hilo de comentarios reales: lista + composer, conectado a useComments. */
function CommentThread({
    accent,
    comments,
}: {
    accent?: string;
    comments: ReturnType<typeof useComments>;
}) {
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const [authHint, setAuthHint] = useState(false);
    const [myUid, setMyUid] = useState<string | null>(null);
    const [myName, setMyName] = useState<string>("Ciudadano StarSeed");
    const mounted = useRef(true);

    useEffect(() => {
        mounted.current = true;
        (async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.auth.getSession();
                const user = data.session?.user;
                if (!mounted.current) return;
                setMyUid(user?.id ?? null);
                const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
                const name =
                    (typeof meta.full_name === "string" && meta.full_name) ||
                    (typeof meta.name === "string" && meta.name) ||
                    (typeof meta.display_name === "string" && meta.display_name) ||
                    (user?.email ? user.email.split("@")[0] : "") ||
                    "Ciudadano StarSeed";
                setMyName(name);
            } catch {
                /* sin sesión */
            }
        })();
        return () => {
            mounted.current = false;
        };
    }, []);

    const handleSend = async () => {
        const text = body.trim();
        if (!text || sending) return;
        setSending(true);
        const res = await comments.add(text, myName);
        setSending(false);
        if (res.needsAuth) {
            setAuthHint(true);
        } else if (res.ok) {
            setBody("");
            setAuthHint(false);
        }
    };

    return (
        <div className="mt-3 w-full space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3">
            {/* Lista */}
            {comments.loading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando comentarios…
                </p>
            ) : comments.comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    Aún no hay comentarios. Sé el primero en responder.
                </p>
            ) : (
                <ul className="space-y-3">
                    {comments.comments.map((c) => (
                        <li key={c.id} className="flex items-start gap-2.5 min-w-0">
                            <Avatar className="h-7 w-7 shrink-0">
                                <AvatarFallback
                                    className="text-[10px] font-bold"
                                    style={accent ? { background: `${accent}22`, color: accent } : undefined}
                                >
                                    {c.authorName.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 rounded-lg bg-background/60 px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="truncate text-xs font-semibold">{c.authorName}</p>
                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                        {formatRelativeTime(c.createdAt)}
                                    </span>
                                </div>
                                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                                    {c.body}
                                </p>
                            </div>
                            {myUid && c.authorId === myUid && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => comments.remove(c.id)}
                                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500 cursor-pointer"
                                    aria-label="Eliminar comentario"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}

            {/* Composer */}
            <div className="flex items-end gap-2">
                <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={
                        comments.needsAuth
                            ? "Inicia sesión para comentar…"
                            : "Escribe un comentario…"
                    }
                    className="min-h-[40px] resize-none border-border/50 bg-transparent text-sm"
                />
                <Button
                    type="button"
                    size="icon"
                    onClick={handleSend}
                    disabled={sending || !body.trim()}
                    className="shrink-0 cursor-pointer"
                    style={accent ? { background: accent, color: "#0b0b12" } : undefined}
                    aria-label="Enviar comentario"
                >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
            </div>
            {(authHint || comments.needsAuth) && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <Link href="/login" className="underline cursor-pointer" style={{ color: GOLD }}>
                        Inicia sesión para comentar
                    </Link>
                </span>
            )}
        </div>
    );
}

/** Icono de chip según el tipo de adjunto. */
function attachmentChipIcon(kind: string): React.ReactNode {
    switch (kind) {
        case "video":
            return <Clapperboard className="h-3.5 w-3.5" />;
        case "audio":
            return <Music className="h-3.5 w-3.5" />;
        case "pdf":
            return <FileText className="h-3.5 w-3.5" />;
        case "link":
            return <Link2 className="h-3.5 w-3.5" />;
        case "image":
            return <ImageIcon className="h-3.5 w-3.5" />;
        default:
            return <FileIcon className="h-3.5 w-3.5" />;
    }
}

/**
 * Adjuntos VISIBLES de la publicación (Adenda 63 §8): las imágenes se muestran
 * como miniaturas en rejilla y el resto (PDF, archivo, audio, vídeo, enlace)
 * como chips con icono + enlace. Se omite el adjunto que ya ocupa el preview
 * principal (post.media) para no duplicarlo.
 */
function PostAttachmentList({ post }: { post: NormalizedPost }) {
    const mediaUrl = post.media?.url;
    const list = (post.attachments || []).filter((a) => !a.url || a.url !== mediaUrl);
    if (list.length === 0) return null;

    const images = list.filter((a) => a.kind === "image" && a.url);
    const rest = list.filter((a) => !(a.kind === "image" && a.url));

    return (
        <div className="mt-3 space-y-2 min-w-0">
            {images.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                    {images.map((a, i) => (
                        <a
                            key={`${a.url}-${i}`}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={a.name || `Imagen adjunta ${i + 1}`}
                            className="relative block aspect-square overflow-hidden rounded-lg border border-border/50 bg-muted/40 cursor-pointer"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={a.url}
                                alt={a.name || `Imagen adjunta ${i + 1}`}
                                loading="lazy"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 hover:scale-105"
                            />
                        </a>
                    ))}
                </div>
            )}
            {rest.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {rest.map((a, i) => {
                        const inner = (
                            <>
                                <span className="shrink-0 text-primary">{attachmentChipIcon(a.kind)}</span>
                                <span className="max-w-[180px] truncate">{a.name || a.domain || "Adjunto"}</span>
                                {a.url && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
                            </>
                        );
                        const chipClass =
                            "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-xs min-w-0";
                        return a.url ? (
                            <a
                                key={`${a.url}-${i}`}
                                href={a.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(chipClass, "cursor-pointer transition-colors hover:bg-muted/60 hover:border-primary/30")}
                            >
                                {inner}
                            </a>
                        ) : (
                            <span key={`chip-${i}`} className={cn(chipClass, "text-muted-foreground")}>
                                {inner}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
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
