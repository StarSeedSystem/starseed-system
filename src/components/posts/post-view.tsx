"use client";

// -----------------------------------------------------------------------------
// Módulo 5 · El Lienzo Universal — PostView
// Renderiza la PUBLICACIÓN como entidad atómica: su contenido (texto/markdown/
// imagen/enlace/resumen de lienzo), su ALCANCE ("Publicado en: …" vía reachOf),
// su autor; una barra de interacciones (Republicar · Etiquetar · Sugerir Cambio
// · Reportar) + reacciones + votación avanzada; y los comentarios anidados.
//
// Todas las interacciones son read-modify-write sobre la MISMA entidad. Refresco
// por polling (subscribe). SSR-safe: las consultas ocurren tras el montaje.
// -----------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Repeat2, Tag, GitPullRequestArrow, Flag, Heart, Sparkles, ThumbsUp,
    MapPin, MessageCircle, Loader2, Vote, User as UserIcon, Layers,
} from "lucide-react";
import {
    loadPost, reachOf, react, vote, tag, republish, suggestChange, report,
    commentTree, subscribe,
    type PostEntity, type CommentNode, type VotingConfig,
} from "@/lib/posts/post-entity";
import { FilePreview, type FileLike } from "@/components/files/file-preview";
import { AttachmentCarousel } from "@/components/posts/attachment-carousel";
import type { EmbeddedItem } from "@/components/posts/embedded-content-window";
import type { MainRatio } from "@/lib/publish/publish";
import { CommentThread } from "@/components/network/feed/comment-thread";
import { getCurrentUserId } from "@/lib/os-social";

// ----------------------------- Helpers UI -----------------------------------

const REACTIONS: { kind: string; label: string; Icon: React.ComponentType<any> }[] = [
    { kind: "like", label: "Me gusta", Icon: ThumbsUp },
    { kind: "love", label: "Me encanta", Icon: Heart },
    { kind: "celebrate", label: "Celebrar", Icon: Sparkles },
];

function authorName(p?: { display_name?: string | null; handle?: string | null } | null): string {
    if (!p) return "Ciudadano StarSeed";
    return p.display_name || (p.handle ? `@${p.handle}` : "Ciudadano StarSeed");
}

function fmtDate(iso?: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("es-ES", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

// ----------------------------- Contenido ------------------------------------

/** Render del cuerpo de la entidad según el contenido jsonb. */
function PostContent({ post }: { post: PostEntity }) {
    const c = post.content || {};
    const title: string | undefined = c.title;
    const text: string | undefined = c.text ?? c.markdown ?? c.body;
    const image: string | undefined = c.image ?? c.cover;
    const link: string | undefined = c.link ?? c.url;
    const canvas = c.canvas; // resumen de lienzo: { blocks?: n, summary?: string }
    const media: string | undefined = c.media ?? c.media_url ?? c.mediaUrl ?? c.video ?? c.audio ?? c.pdf;
    const file = c.file as Record<string, unknown> | undefined; // { url, name, format, mime, size }

    // NUEVO · Adenda "Publicaciones ricas": adjuntos multi-formato (carrusel +
    // ventana incrustada). Si el contenido los trae, sustituyen el render por
    // campo suelto (image/media/file/link) de abajo — la vista previa sigue
    // siendo OPCIONAL vía `showPreview`. Retrocompatible: sin `attachments`,
    // el render de siempre por campo continúa exactamente igual.
    const attachments: EmbeddedItem[] | undefined = Array.isArray(c.attachments) ? c.attachments : undefined;
    const showPreview = c.showPreview !== false;
    const hasRichAttachments = showPreview && Boolean(attachments && attachments.length > 0);

    return (
        <div className="space-y-3">
            {title && <h2 className="text-xl font-bold text-white/95 leading-snug">{title}</h2>}

            {text && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{text}</p>
            )}

            {hasRichAttachments ? (
                <AttachmentCarousel items={attachments!} context="page" ratio={(c.mainRatio as MainRatio) || "auto"} />
            ) : (
                showPreview && (
                    <>
                        {image && (
                            <FilePreview file={{ url: image, name: title, type: "imagen" } as FileLike} context="post" />
                        )}

                        {media && (
                            <FilePreview file={{ url: media } as FileLike} context="post" />
                        )}

                        {file?.url && (
                            <FilePreview
                                file={{
                                    url: file.url as string,
                                    name: (file.name as string) ?? title,
                                    type: (file.format as string) ?? undefined,
                                    mime: (file.mime as string) ?? undefined,
                                    size: (file.size as number | string) ?? undefined,
                                } as FileLike}
                                context="post"
                            />
                        )}

                        {link && (
                            <FilePreview file={{ url: link, type: "enlace" } as FileLike} context="post" />
                        )}
                    </>
                )
            )}

            {canvas && (
                <div className="flex items-start gap-3 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 px-4 py-3">
                    <Layers className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-300" />
                    <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-white/90">Lienzo Universal</p>
                        <p className="text-xs text-white/60">
                            {typeof canvas?.summary === "string"
                                ? canvas.summary
                                : `Composición con ${canvas?.blocks ?? canvas?.count ?? "varios"} elementos.`}
                        </p>
                    </div>
                </div>
            )}

            {!text && !image && !media && !file?.url && !link && !canvas && !title && !hasRichAttachments && (
                <p className="text-sm italic text-white/40">Esta publicación no tiene contenido visible.</p>
            )}
        </div>
    );
}

// ----------------------------- Votación -------------------------------------

function VotingWidget({
    voting,
    tally,
    onVote,
    busy,
}: {
    voting: VotingConfig;
    tally: Record<string, number>;
    onVote: (choice: string) => void;
    busy: boolean;
}) {
    const options = voting.options ?? [];
    const total = options.reduce((sum, o) => sum + (tally[o.id] ?? 0), 0);

    return (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4">
            <div className="mb-3 flex items-center gap-2">
                <Vote className="h-4 w-4 text-emerald-300" />
                <span className="text-sm font-semibold text-white/90">
                    {voting.question || "Votación"}
                </span>
                {voting.mode === "multiple" && (
                    <Badge variant="outline" className="border-emerald-400/30 text-[10px] text-emerald-200">
                        elección múltiple
                    </Badge>
                )}
            </div>

            <div className="space-y-2">
                {options.length === 0 && (
                    <p className="text-xs text-white/50">No hay opciones configuradas.</p>
                )}
                {options.map((opt) => {
                    const count = tally[opt.id] ?? 0;
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                        <button
                            key={opt.id}
                            type="button"
                            disabled={busy}
                            onClick={() => onVote(opt.id)}
                            className="group relative w-full overflow-hidden rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-left transition-colors hover:border-emerald-400/40 disabled:opacity-60"
                        >
                            <div
                                className="absolute inset-y-0 left-0 bg-emerald-400/15 transition-all"
                                style={{ width: `${pct}%` }}
                                aria-hidden
                            />
                            <div className="relative flex items-center justify-between gap-2">
                                <span className="text-sm text-white/85">{opt.label}</span>
                                <span className="text-xs font-mono text-white/60">
                                    {count} · {pct}%
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>

            <p className="mt-2 text-right text-[11px] text-white/40">
                {total} voto{total === 1 ? "" : "s"} en total
            </p>
        </div>
    );
}


// ----------------------------- Componente raíz ------------------------------

export default function PostView({ postId }: { postId: string }) {
    const [post, setPost] = useState<PostEntity | null>(null);
    const [comments, setComments] = useState<CommentNode[]>([]);
    const [reach, setReach] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [busy, setBusy] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const reachLoadedFor = useRef<string | null>(null);

    // Usuario actual (para Editar/Borrar en los comentarios propios del hilo).
    useEffect(() => {
        let active = true;
        getCurrentUserId().then((uid) => {
            if (active) setCurrentUserId(uid);
        });
        return () => {
            active = false;
        };
    }, []);

    // Carga inicial + suscripción por polling (SSR-safe: solo tras montar).
    useEffect(() => {
        if (!postId) {
            setLoading(false);
            setNotFound(true);
            return;
        }
        let active = true;

        (async () => {
            const p = await loadPost(postId);
            if (!active) return;
            if (!p) {
                setNotFound(true);
                setLoading(false);
                return;
            }
            setPost(p);
            setComments(await commentTree(postId));
            setLoading(false);
        })();

        const unsub = subscribe(postId, ({ post: p, comments: c }) => {
            if (!active) return;
            if (p) setPost(p);
            setComments(c);
        });

        return () => {
            active = false;
            unsub();
        };
    }, [postId]);

    // Resolver alcance cuando cambian los destinos.
    useEffect(() => {
        if (!post) return;
        const key = JSON.stringify(post.post_references?.destinations ?? []);
        if (reachLoadedFor.current === key) return;
        reachLoadedFor.current = key;
        (async () => {
            setReach(await reachOf(post));
        })();
    }, [post]);

    const refresh = useCallback(async () => {
        const [p, c] = await Promise.all([loadPost(postId), commentTree(postId)]);
        if (p) setPost(p);
        setComments(c);
    }, [postId]);

    // -------- Acciones de la barra de interacciones (atómicas) --------

    const doReact = async (kind: string) => {
        if (busy) return;
        setBusy(true);
        try {
            const next = await react(postId, kind);
            setPost((prev) => (prev ? { ...prev, interactions: next } : prev));
        } catch {
            toast.error("No se pudo registrar la reacción");
        } finally {
            setBusy(false);
        }
    };

    const doVote = async (choice: string) => {
        if (busy) return;
        setBusy(true);
        try {
            const next = await vote(postId, choice);
            setPost((prev) => (prev ? { ...prev, interactions: next } : prev));
            toast.success("Voto registrado");
        } catch (e: any) {
            toast.error(e?.message || "No se pudo registrar el voto");
        } finally {
            setBusy(false);
        }
    };

    const doTag = async () => {
        const raw = window.prompt("Etiquetas (separadas por comas):");
        if (raw == null) return;
        const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
        if (tags.length === 0) return;
        setBusy(true);
        try {
            const next = await tag(postId, tags);
            setPost((prev) => (prev ? { ...prev, interactions: next } : prev));
            toast.success("Etiquetas aplicadas");
        } catch {
            toast.error("No se pudieron aplicar las etiquetas");
        } finally {
            setBusy(false);
        }
    };

    const doRepublish = async () => {
        const where = window.prompt(
            "¿Dónde republicar? Indica un id de Perfil o Página:",
        );
        if (!where) return;
        const kind = window.confirm("¿Es una Página? (Aceptar = Página, Cancelar = Perfil)")
            ? "page"
            : "profile";
        setBusy(true);
        try {
            await republish(postId, [{ kind, id: where.trim() }]);
            await refresh();
            toast.success("Republicado: se creó una referencia/instancia");
        } catch {
            toast.error("No se pudo republicar");
        } finally {
            setBusy(false);
        }
    };

    const doSuggest = async () => {
        const text = window.prompt("Describe tu sugerencia de cambio:");
        if (!text || !text.trim()) return;
        setBusy(true);
        try {
            await suggestChange(postId, text.trim());
            await refresh();
            toast.success("Sugerencia enviada");
        } catch {
            toast.error("No se pudo enviar la sugerencia");
        } finally {
            setBusy(false);
        }
    };

    const doReport = async () => {
        const reason = window.prompt("Motivo del reporte:");
        if (!reason || !reason.trim()) return;
        setBusy(true);
        try {
            await report(postId, reason.trim());
            await refresh();
            toast.success("Reporte enviado a moderación");
        } catch {
            toast.error("No se pudo enviar el reporte");
        } finally {
            setBusy(false);
        }
    };

    // -------- Derivados --------

    const interactions = post?.interactions ?? {};
    const voting = post?.post_references?.voting ?? null;
    const tags = interactions.tags ?? [];
    const reactionCounts = interactions.reactions ?? {};
    const commentCount = useMemo(() => {
        let n = 0;
        const walk = (list: CommentNode[]) => {
            for (const c of list) {
                n += 1;
                walk(c.children);
            }
        };
        walk(comments);
        return n;
    }, [comments]);

    // -------- Estados de carga / no encontrado --------

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-10 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando publicación…
            </div>
        );
    }

    if (notFound || !post) {
        return (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
                <p className="text-sm text-white/70">No se encontró la publicación.</p>
                <Link href="/network" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
                    Volver al inicio
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Tarjeta de la entidad */}
            <article className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg backdrop-blur">
                {/* Autor + fecha */}
                <header className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400/30 to-fuchsia-400/30 text-white/80">
                            <UserIcon className="h-4 w-4" />
                        </span>
                        <div className="leading-tight">
                            <p className="text-sm font-semibold text-white/90">{authorName(post.author)}</p>
                            <p className="text-[11px] text-white/40">{fmtDate(post.created_at)}</p>
                        </div>
                    </div>
                    {post.type !== "post" && (
                        <Badge variant="outline" className="text-[10px] capitalize text-white/60">
                            {post.type}
                        </Badge>
                    )}
                </header>

                {/* Contenido */}
                <PostContent post={post} />

                {/* Alcance: dónde vive la entidad */}
                {reach.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-500/5 px-3 py-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                        <span className="text-[11px] font-semibold text-white/60">Publicado en:</span>
                        {reach.map((r, i) => (
                            <span key={i} className="text-[11px] text-cyan-200">
                                {r}
                                {i < reach.length - 1 ? " ·" : ""}
                            </span>
                        ))}
                    </div>
                )}

                {/* Etiquetas */}
                {tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {tags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px]">
                                #{t}
                            </Badge>
                        ))}
                    </div>
                )}

                {/* Votación avanzada */}
                {voting && (
                    <div className="mt-4">
                        <VotingWidget
                            voting={voting}
                            tally={interactions.votes ?? {}}
                            onVote={doVote}
                            busy={busy}
                        />
                    </div>
                )}

                {/* Reacciones */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {REACTIONS.map(({ kind, label, Icon }) => (
                        <button
                            key={kind}
                            type="button"
                            disabled={busy}
                            onClick={() => doReact(kind)}
                            title={label}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70 transition-colors hover:border-fuchsia-400/40 hover:text-white disabled:opacity-60"
                        >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{reactionCounts[kind] ?? 0}</span>
                        </button>
                    ))}
                    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-white/40">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {commentCount} comentario{commentCount === 1 ? "" : "s"}
                    </span>
                </div>

                {/* Barra de interacciones estándar (Módulo 5) */}
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 sm:grid-cols-4">
                    <Button variant="ghost" size="sm" onClick={doRepublish} disabled={busy} className="justify-start text-white/70">
                        <Repeat2 className="h-4 w-4" /> Republicar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={doTag} disabled={busy} className="justify-start text-white/70">
                        <Tag className="h-4 w-4" /> Etiquetar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={doSuggest} disabled={busy} className="justify-start text-white/70">
                        <GitPullRequestArrow className="h-4 w-4" /> Sugerir Cambio
                    </Button>
                    <Button variant="ghost" size="sm" onClick={doReport} disabled={busy} className="justify-start text-rose-300/80 hover:text-rose-300">
                        <Flag className="h-4 w-4" /> Reportar
                    </Button>
                </div>
            </article>

            {/* Comentarios ramificados: composer + árbol anidado, adjuntos, menciones, reacciones */}
            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <CommentThread
                    postId={postId}
                    comments={comments}
                    currentUserId={currentUserId}
                    onChanged={refresh}
                />
            </section>
        </div>
    );
}
