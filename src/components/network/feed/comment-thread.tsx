"use client";

// src/components/network/feed/comment-thread.tsx
// ─────────────────────────────────────────────────────────────────────────────
// COMENTARIOS RAMIFICADOS — hilo real y anidado sobre `@/lib/posts/post-entity`.
//
// Cada comentario es una publicación anidada (fila `posts` con `type:'comment'`).
// Responder a un comentario ESPECÍFICO crea una rama colgando de él
// (`post_references.parentComment`), no del post raíz: por eso el hilo es un
// árbol real, no una lista plana. Funcionalidad:
//
//   · Ramas anidadas con línea de profundidad + "ver N respuestas" colapsable.
//   · Adjuntos de cualquier formato (imagen/audio/vídeo/archivo/enlace) vía
//     `FilePreview` (misma previsualización rica que usa el resto del OS).
//   · Menciones @perfil / #página·archivo·publicación con autocompletado real
//     (reutiliza `MentionInput`, ya conectado a `searchEntities`).
//   · Reacciones (me gusta / me encanta / celebrar) por comentario, reutilizando
//     `react()` de post-entity (funciona igual sobre cualquier fila `posts`).
//   · Ordenar por relevancia (reacciones + respuestas) o más reciente.
//   · Edición con HISTORIAL SIMPLE (se puede desplegar "ver versión anterior").
//
// SSR-safe ("use client"); toda escritura pasa por post-entity.ts (RLS-aware).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
    Send, CornerDownRight, Loader2, User as UserIcon, ChevronDown, ChevronUp,
    ThumbsUp, Heart, Sparkles, Paperclip, Image as ImageIcon, Music, Video as VideoIcon,
    File as FileIcon, Link as LinkIcon, X, Pencil, History, Clock, Flame, Trash2, Globe2,
} from "lucide-react";
import {
    addComment,
    editComment,
    deleteComment,
    react,
    countReplies,
    type CommentNode,
    type CommentAttachment,
} from "@/lib/posts/post-entity";
import { parseMentions, toPlainText, type Mention } from "@/lib/mentions/mentions";
import MentionInput from "@/components/mentions/mention-input";
import { MentionChip } from "@/components/mentions/entity-chip";
import { FilePreview, type FileLike } from "@/components/files/file-preview";
// Subida universal de archivos (Adenda 64 §9): el botón "Adjuntar" del
// composer de comentarios abre el selector universal (dispositivo/bibliotecas/
// neuronas); los archivos quedan en storage real (URL pública), no en blobs
// locales efímeros como hacía `AttachmentPicker` con URL.createObjectURL.
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";
// Referencias vivas de "Contenido de la red" (Adenda jul-2026): mismo render
// compartido con Mensajes/Correos. Los comentarios NO envían invitaciones
// (solo mensajes/correos, ver @/lib/invitations/invitations.ts) — aquí solo
// aplica el caso "ref" (página/grupo/evento/publicación embebidos en vivo).
import { UniversalAttachmentView, isNetworkRefLike } from "@/components/files/universal-attachment-view";

/** Traduce el `kind` amplio de UniversalAttachment al vocabulario de CommentAttachment. */
function universalToCommentKind(kind: string): CommentAttachment["kind"] {
    if (kind === "image") return "imagen";
    if (kind === "audio") return "audio";
    if (kind === "video") return "video";
    return "archivo";
}

// ───────────────────────────── Utilidades ───────────────────────────────────

function authorName(p?: { display_name?: string | null; handle?: string | null } | null): string {
    if (!p) return "Ciudadano StarSeed";
    return p.display_name || (p.handle ? `@${p.handle}` : "Ciudadano StarSeed");
}

function fmtDate(iso?: string | null): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("es-ES", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

const REACTIONS: { kind: string; label: string; Icon: React.ComponentType<any> }[] = [
    { kind: "like", label: "Me gusta", Icon: ThumbsUp },
    { kind: "love", label: "Me encanta", Icon: Heart },
    { kind: "celebrate", label: "Celebrar", Icon: Sparkles },
];

const ATTACHMENT_KIND_META: Record<string, { icon: React.ComponentType<any>; label: string; accept: string }> = {
    imagen: { icon: ImageIcon, label: "Imagen", accept: "image/*" },
    audio: { icon: Music, label: "Audio", accept: "audio/*" },
    video: { icon: VideoIcon, label: "Vídeo", accept: "video/*" },
    archivo: { icon: FileIcon, label: "Archivo", accept: "*/*" },
    enlace: { icon: LinkIcon, label: "Enlace", accept: "" },
    ref: { icon: Globe2, label: "Referencia", accept: "" },
};

function relevanceOf(node: CommentNode): number {
    const reactions = node.interactions?.reactions ?? {};
    const total = Object.values(reactions).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    return total * 2 + countReplies(node);
}

/** Ordena un nivel del árbol (no recursivo: cada nivel se ordena por separado). */
function sortLevel(nodes: CommentNode[], order: "reciente" | "relevancia"): CommentNode[] {
    const copy = [...nodes];
    if (order === "relevancia") {
        copy.sort((a, b) => relevanceOf(b) - relevanceOf(a));
    } else {
        copy.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }
    return copy;
}

// ───────────────────────────── Adjuntos (composer) ──────────────────────────

interface AttachmentPickerProps {
    attachments: CommentAttachment[];
    onChange: (next: CommentAttachment[]) => void;
}

/** Selector compacto de adjuntos para el composer de un comentario/respuesta. */
function AttachmentPicker({ attachments, onChange }: AttachmentPickerProps) {
    const [urlKind, setUrlKind] = useState<string | null>(null);
    const [urlValue, setUrlValue] = useState("");

    function addUrl() {
        const url = urlValue.trim();
        if (!url) return;
        const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        let title: string | null = null;
        try {
            title = new URL(url).hostname.replace(/^www\./, "");
        } catch {
            title = url;
        }
        onChange([...attachments, { id, kind: "enlace", url, title }]);
        setUrlValue("");
        setUrlKind(null);
    }

    function removeAt(id: string) {
        onChange(attachments.filter((a) => a.id !== id));
    }

    /** Adjuntos entregados por el selector universal (ya subidos a storage, con URL real). */
    function handleUniversalAttachments(picked: UniversalAttachment[]) {
        const next: CommentAttachment[] = picked.map((a) => ({
            id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            // Una referencia de "Contenido de la red" conserva su kind "ref" tal
            // cual (se embebe en vivo); el resto se traduce al vocabulario de
            // CommentAttachment como hasta ahora.
            kind: a.kind === "ref" ? "ref" : universalToCommentKind(a.kind),
            url: a.url || a.route || "",
            name: a.name ?? null,
            mime: a.mime ?? null,
            refKind: a.refKind,
            refId: a.refId,
            route: a.route,
        }));
        onChange([...attachments, ...next]);
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1">
                <AttachFilePickerButton
                    onPick={handleUniversalAttachments}
                    folder="comentarios"
                    title="Adjuntar archivo al comentario"
                    className="grid size-7 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/50 hover:border-white/25 hover:text-white"
                >
                    <Paperclip className="size-3.5" />
                </AttachFilePickerButton>
                <button
                    type="button"
                    onClick={() => setUrlKind((prev) => (prev === "enlace" ? null : "enlace"))}
                    title="Adjuntar enlace"
                    className={cn(
                        "grid size-7 cursor-pointer place-items-center rounded-full border transition-colors",
                        urlKind === "enlace"
                            ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                            : "border-white/10 bg-white/[0.03] text-white/50 hover:border-white/25 hover:text-white",
                    )}
                >
                    <LinkIcon className="size-3.5" />
                </button>
            </div>

            {urlKind === "enlace" && (
                <div className="flex items-center gap-2">
                    <input
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        placeholder="https://…"
                        className="h-8 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-xs text-white/85 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addUrl();
                            }
                        }}
                    />
                    <Button size="sm" className="h-8" onClick={addUrl} disabled={!urlValue.trim()}>
                        Añadir
                    </Button>
                </div>
            )}

            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {attachments.map((a) => {
                        const cfg = ATTACHMENT_KIND_META[a.kind] ?? ATTACHMENT_KIND_META.archivo;
                        return (
                            <span
                                key={a.id}
                                className="inline-flex max-w-[10rem] items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/70"
                            >
                                <cfg.icon className="size-3 shrink-0" />
                                <span className="truncate">{a.name || a.title || cfg.label}</span>
                                <button
                                    type="button"
                                    onClick={() => removeAt(a.id)}
                                    className="shrink-0 rounded-full p-0.5 hover:bg-white/10"
                                    aria-label="Quitar adjunto"
                                >
                                    <X className="size-2.5" />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ───────────────────────────── Composer de comentario ───────────────────────

interface ComposerProps {
    placeholder: string;
    onSubmit: (text: string, attachments: CommentAttachment[], mentions: Mention[]) => Promise<void>;
    onCancel?: () => void;
    compact?: boolean;
    autoFocus?: boolean;
    initialText?: string;
    submitLabel?: string;
}

function CommentComposer({
    placeholder, onSubmit, onCancel, compact, initialText = "", submitLabel = "Comentar",
}: ComposerProps) {
    const [text, setText] = useState(initialText);
    const [attachments, setAttachments] = useState<CommentAttachment[]>([]);
    const [mentions, setMentions] = useState<Mention[]>([]);
    const [sending, setSending] = useState(false);
    const [showAttach, setShowAttach] = useState(false);

    const submit = async () => {
        const t = text.trim();
        if ((!t && attachments.length === 0) || sending) return;
        setSending(true);
        try {
            await onSubmit(t, attachments, mentions);
            setText("");
            setAttachments([]);
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={cn("space-y-2", compact ? "" : "rounded-xl border border-white/10 bg-white/[0.03] p-3")}>
            <MentionInput
                value={text}
                onChange={setText}
                onMentionsChange={setMentions}
                placeholder={placeholder}
                rows={compact ? 2 : 3}
            />
            {showAttach && <AttachmentPicker attachments={attachments} onChange={setAttachments} />}
            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setShowAttach((v) => !v)}
                    className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                        showAttach ? "bg-cyan-500/15 text-cyan-200" : "text-white/40 hover:text-white/70",
                    )}
                >
                    <Paperclip className="size-3.5" />
                    Adjuntar
                    {attachments.length > 0 && (
                        <span className="rounded-full bg-cyan-500/20 px-1.5 text-[10px] font-bold text-cyan-200">
                            {attachments.length}
                        </span>
                    )}
                </button>
                <div className="flex items-center gap-2">
                    {onCancel && (
                        <Button size="sm" variant="ghost" onClick={onCancel} disabled={sending}>
                            Cancelar
                        </Button>
                    )}
                    <Button size="sm" onClick={submit} disabled={sending || (!text.trim() && attachments.length === 0)}>
                        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">{submitLabel}</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ───────────────────────────── Nodo del árbol ───────────────────────────────

interface CommentItemProps {
    node: CommentNode;
    depth: number;
    order: "reciente" | "relevancia";
    onReply: (parentId: string, text: string, attachments: CommentAttachment[], mentions: Mention[]) => Promise<void>;
    onChanged: () => void;
    currentUserId: string | null;
}

const MAX_VISIBLE_DEPTH_LINES = 6; // más allá, seguimos anidando pero sin más sangrado visual excesivo

function CommentItem({ node, depth, order, onReply, onChanged, currentUserId }: CommentItemProps) {
    const confirm = useConfirm();
    const [replying, setReplying] = useState(false);
    const [editing, setEditing] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [collapsed, setCollapsed] = useState(depth >= 2); // ramas profundas empiezan colapsadas
    const [busyReaction, setBusyReaction] = useState(false);
    const [reactions, setReactions] = useState<Record<string, number>>(node.interactions?.reactions ?? {});
    const [deleted, setDeleted] = useState(false);

    const text: string = node.content?.text ?? "";
    const attachments: CommentAttachment[] = Array.isArray(node.content?.attachments) ? node.content.attachments : [];
    const history: { text: string; editedAt: string }[] = Array.isArray(node.content?.history) ? node.content.history : [];
    const editedAt: string | null = node.content?.editedAt ?? null;
    const mentions = useMemo(() => parseMentions(text), [text]);
    const plainText = useMemo(() => toPlainText(text), [text]);
    const isOwn = Boolean(currentUserId) && node.author_id === currentUserId;
    const replyCount = countReplies(node);
    const children = useMemo(() => sortLevel(node.children, order), [node.children, order]);
    const indentClamp = Math.min(depth, MAX_VISIBLE_DEPTH_LINES);

    const doReact = async (kind: string) => {
        if (busyReaction) return;
        setBusyReaction(true);
        const prev = { ...reactions };
        setReactions((r) => ({ ...r, [kind]: (r[kind] ?? 0) + 1 })); // optimista
        try {
            const next = await react(node.id, kind);
            setReactions(next.reactions ?? {});
        } catch {
            setReactions(prev);
            toast.error("No se pudo reaccionar");
        } finally {
            setBusyReaction(false);
        }
    };

    const submitReply = async (t: string, atts: CommentAttachment[], m: Mention[]) => {
        await onReply(node.id, t, atts, m);
        setReplying(false);
        setCollapsed(false);
    };

    const submitEdit = async (t: string, atts: CommentAttachment[]) => {
        try {
            const updated = await editComment(node.id, t, atts);
            if (!updated) throw new Error();
            toast.success("Comentario editado");
            setEditing(false);
            onChanged();
        } catch {
            toast.error("No se pudo editar el comentario");
        }
    };

    const doDelete = async () => {
        if (!(await confirm({ title: "Borrar comentario", description: "¿Borrar este comentario?", destructive: true }))) return;
        const ok = await deleteComment(node.id);
        if (ok) {
            setDeleted(true);
            toast.success("Comentario borrado");
            onChanged();
        } else {
            toast.error("No se pudo borrar el comentario");
        }
    };

    if (deleted) return null;

    return (
        <div
            className={cn(depth > 0 && "relative border-l border-white/10 pl-4")}
            style={depth > 0 ? { marginLeft: `${indentClamp * 0.75}rem` } : undefined}
        >
            <div className="rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:bg-white/10">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] text-white/70">
                            <UserIcon className="h-3 w-3" />
                        </span>
                        <span className="text-sm font-semibold text-white/90">{authorName(node.author)}</span>
                        {editedAt && (
                            <span className="text-[10px] italic text-white/35">editado</span>
                        )}
                    </div>
                    <span className="text-[11px] text-white/40">{fmtDate(node.created_at)}</span>
                </div>

                {editing ? (
                    <div className="mt-2">
                        <CommentComposer
                            placeholder="Edita tu comentario…"
                            initialText={text}
                            submitLabel="Guardar"
                            onCancel={() => setEditing(false)}
                            onSubmit={async (t, atts) => submitEdit(t, atts.length > 0 ? atts : attachments)}
                            compact
                        />
                    </div>
                ) : (
                    <>
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                            {plainText}
                        </p>

                        {mentions.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {mentions.map((m, i) => (
                                    <MentionChip key={`${m.kind}:${m.type}:${m.id}:${i}`} mention={m} linked />
                                ))}
                            </div>
                        )}

                        {attachments.length > 0 && (
                            <div className="mt-2 space-y-2">
                                {attachments.map((a) =>
                                    isNetworkRefLike(a) ? (
                                        <UniversalAttachmentView key={a.id} attachment={a} />
                                    ) : (
                                        <FilePreview
                                            key={a.id}
                                            file={{ url: a.url, name: a.name, mime: a.mime, type: a.kind, thumbnail: a.thumbnail } as FileLike}
                                            context="message"
                                            compact
                                            actions={false}
                                        />
                                    ),
                                )}
                            </div>
                        )}

                        {history.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setShowHistory((v) => !v)}
                                className="mt-2 inline-flex items-center gap-1 text-[10px] text-white/35 transition-colors hover:text-cyan-300"
                            >
                                <History className="h-3 w-3" />
                                {showHistory ? "Ocultar" : "Ver"} historial ({history.length})
                            </button>
                        )}
                        {showHistory && (
                            <div className="mt-1.5 space-y-1.5 border-l border-white/10 pl-3">
                                {history.map((h, i) => (
                                    <div key={i} className="text-[11px] text-white/40">
                                        <span className="italic">{fmtDate(h.editedAt)}: </span>
                                        <span className="whitespace-pre-wrap">{h.text}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {!editing && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                        {/* Reacciones */}
                        <div className="flex items-center gap-1">
                            {REACTIONS.map(({ kind, label, Icon }) => (
                                <button
                                    key={kind}
                                    type="button"
                                    disabled={busyReaction}
                                    onClick={() => doReact(kind)}
                                    title={label}
                                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/60 transition-colors hover:border-fuchsia-400/40 hover:text-white disabled:opacity-60"
                                >
                                    <Icon className="h-3 w-3" />
                                    {(reactions[kind] ?? 0) > 0 && <span>{reactions[kind]}</span>}
                                </button>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={() => setReplying((v) => !v)}
                            className="inline-flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-cyan-300"
                        >
                            <CornerDownRight className="h-3 w-3" />
                            Responder
                        </button>

                        {isOwn && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setEditing(true)}
                                    className="inline-flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-amber-300"
                                >
                                    <Pencil className="h-3 w-3" />
                                    Editar
                                </button>
                                <button
                                    type="button"
                                    onClick={doDelete}
                                    className="inline-flex items-center gap-1 text-[11px] text-white/40 transition-colors hover:text-rose-300"
                                >
                                    <Trash2 className="h-3 w-3" />
                                    Borrar
                                </button>
                            </>
                        )}
                    </div>
                )}

                {replying && (
                    <div className="mt-2">
                        <CommentComposer
                            placeholder="Escribe una respuesta…"
                            onSubmit={submitReply}
                            onCancel={() => setReplying(false)}
                            compact
                            submitLabel="Responder"
                        />
                    </div>
                )}
            </div>

            {/* Rama anidada: colapsable con "ver N respuestas" */}
            {node.children.length > 0 && (
                <div className="mt-2">
                    {collapsed ? (
                        <button
                            type="button"
                            onClick={() => setCollapsed(false)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-cyan-300/80 transition-colors hover:border-cyan-400/30 hover:text-cyan-200"
                        >
                            <ChevronDown className="h-3 w-3" />
                            Ver {replyCount} {replyCount === 1 ? "respuesta" : "respuestas"}
                        </button>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setCollapsed(true)}
                                className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-white/40 transition-colors hover:border-white/25 hover:text-white/70"
                            >
                                <ChevronUp className="h-3 w-3" />
                                Ocultar {replyCount} {replyCount === 1 ? "respuesta" : "respuestas"}
                            </button>
                            <div className="space-y-2">
                                {children.map((child) => (
                                    <CommentItem
                                        key={child.id}
                                        node={child}
                                        depth={depth + 1}
                                        order={order}
                                        onReply={onReply}
                                        onChanged={onChanged}
                                        currentUserId={currentUserId}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ───────────────────────────── Componente raíz ──────────────────────────────

export interface CommentThreadProps {
    postId: string;
    comments: CommentNode[];
    /** id del usuario actual (para mostrar Editar/Borrar en lo propio). null si no hay sesión. */
    currentUserId: string | null;
    /** Se llama tras cualquier cambio (nuevo comentario, edición, borrado) para refrescar el árbol. */
    onChanged: () => void;
    className?: string;
}

/**
 * Hilo de comentarios ramificado completo: composer raíz + árbol anidado con
 * ordenación seleccionable. `comments` ya viene como árbol (`commentTree`); este
 * componente sólo re-ordena cada NIVEL según `order`, preservando la jerarquía.
 */
export function CommentThread({ postId, comments, currentUserId, onChanged, className }: CommentThreadProps) {
    const [order, setOrder] = useState<"reciente" | "relevancia">("relevancia");

    const totalCount = useMemo(() => {
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

    const roots = useMemo(() => sortLevel(comments, order), [comments, order]);

    const handleReply = async (
        parentId: string,
        text: string,
        attachments: CommentAttachment[],
        mentions: Mention[],
    ) => {
        try {
            const created = await addComment(postId, text, parentId, { attachments, mentions });
            if (!created) throw new Error();
            toast.success("Respuesta publicada");
            onChanged();
        } catch {
            toast.error("No se pudo publicar la respuesta");
        }
    };

    const handleRootSubmit = async (text: string, attachments: CommentAttachment[], mentions: Mention[]) => {
        try {
            const created = await addComment(postId, text, null, { attachments, mentions });
            if (!created) throw new Error();
            toast.success("Comentario publicado");
            onChanged();
        } catch {
            toast.error("No se pudo publicar el comentario");
        }
    };

    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white/80">
                    Comentarios ({totalCount})
                </h3>
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/20 p-0.5 text-[11px]">
                    <button
                        type="button"
                        onClick={() => setOrder("relevancia")}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors",
                            order === "relevancia" ? "bg-cyan-500/20 text-cyan-200" : "text-white/40 hover:text-white/70",
                        )}
                    >
                        <Flame className="h-3 w-3" /> Relevancia
                    </button>
                    <button
                        type="button"
                        onClick={() => setOrder("reciente")}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors",
                            order === "reciente" ? "bg-cyan-500/20 text-cyan-200" : "text-white/40 hover:text-white/70",
                        )}
                    >
                        <Clock className="h-3 w-3" /> Recientes
                    </button>
                </div>
            </div>

            <CommentComposer placeholder="Comparte tu comentario…" onSubmit={handleRootSubmit} />

            {roots.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/40">
                    Sé el primero en comentar.
                </p>
            ) : (
                <div className="space-y-3">
                    {roots.map((node) => (
                        <CommentItem
                            key={node.id}
                            node={node}
                            depth={0}
                            order={order}
                            onReply={handleReply}
                            onChanged={onChanged}
                            currentUserId={currentUserId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default CommentThread;
