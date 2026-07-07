"use client";

/*
 * MessageBubble — burbuja de un mensaje de hilo real (os_dm_messages).
 * Renderiza el cuerpo con MessageRenderer (markdown/código/media universal),
 * pinta adjuntos (imagen/audio/video/archivo/referencia-servidor), permite
 * responder-citando, editar/borrar propios, y guardar en Biblioteca.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
    MoreVertical, Reply, Pencil, Trash2, Check, X, FileIcon, Music, Video as VideoIcon,
    Server, Bot, ExternalLink,
} from "lucide-react";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { SaveToLibrary } from "@/components/library/save-to-library";
import type { DmAttachment, DmMessage } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";
// Invitaciones (grupo/página/evento) y referencias vivas de "Contenido de la
// red" (Adenda jul-2026): mismo render compartido con Correos/Comentarios.
import { UniversalAttachmentView, isInviteLike, isNetworkRefLike } from "@/components/files/universal-attachment-view";
// Previsualización rica (pdf/código/genérico descargable — Requisito 4):
// reutiliza el mismo visor universal que ya usan comentarios/biblioteca.
import { FilePreview } from "@/components/files/file-preview";

function AttachmentView({ attachment }: { attachment: DmAttachment }) {
    if (isInviteLike(attachment) || isNetworkRefLike(attachment)) {
        return <UniversalAttachmentView attachment={attachment} />;
    }

    if (attachment.kind === "server") {
        return (
            <Link
                href={`/servidores-apps?panel=${encodeURIComponent(attachment.refId ?? "")}`}
                className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 hover:bg-primary/10 transition-colors cursor-pointer"
            >
                <Server className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-semibold truncate">{attachment.name || "Servidor de apps"}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 ml-auto" />
            </Link>
        );
    }

    if (attachment.kind === "image" && attachment.url) {
        return (
            <div className="relative w-[min(280px,68vw)] aspect-video overflow-hidden rounded-xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.name || "Imagen"} className="w-full h-full object-cover" />
            </div>
        );
    }

    if (attachment.kind === "audio" && attachment.url) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 w-[min(280px,68vw)]">
                <Music className="w-4 h-4 text-muted-foreground shrink-0" />
                <audio controls src={attachment.url} className="w-full h-8" />
            </div>
        );
    }

    if (attachment.kind === "video" && attachment.url) {
        return (
            <div className="w-[min(280px,68vw)] rounded-xl overflow-hidden border border-white/10">
                <video controls src={attachment.url} className="w-full" />
            </div>
        );
    }

    // pdf / código / archivo genérico descargable (con URL real): visor rico
    // compartido en vez de una simple tarjeta de descarga (Requisito 4).
    if (attachment.url) {
        return (
            <div className="w-[min(280px,68vw)]">
                <FilePreview
                    file={{ url: attachment.url, name: attachment.name, mime: attachment.mime, type: attachment.kind }}
                    context="message"
                    compact
                    actions={false}
                />
            </div>
        );
    }

    // Referencia interna sin archivo real (solo `route`, p.ej. un enlace de app).
    const href = attachment.route;
    const content = (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 w-[min(280px,68vw)] hover:bg-white/[0.06] transition-colors">
            <FileIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium truncate">{attachment.name || "Archivo adjunto"}</span>
        </div>
    );
    if (href) {
        return href.startsWith("/") ? (
            <Link href={href} className="cursor-pointer block">{content}</Link>
        ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" className="cursor-pointer block">{content}</a>
        );
    }
    return content;
}

export interface MessageBubbleProps {
    message: DmMessage;
    isMine: boolean;
    sender: OsProfile | null;
    replyToMessage: DmMessage | null;
    isAgentThread: boolean;
    onReply: (message: DmMessage) => void;
    onEdit: (messageId: string, newBody: string) => Promise<void>;
    onDelete: (messageId: string) => Promise<void>;
}

export function MessageBubble({
    message, isMine, sender, replyToMessage, isAgentThread, onReply, onEdit, onDelete,
}: MessageBubbleProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(message.body);
    const isAgent = message.kind === "agent";

    if (message.deleted) {
        return (
            <div className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                <div className="rounded-2xl px-3.5 py-2 text-xs italic text-muted-foreground border border-dashed border-white/10">
                    Mensaje eliminado
                </div>
            </div>
        );
    }

    const displayName = isAgent ? "Aurora" : sender?.displayName ?? "Miembro";

    const handleSaveEdit = async () => {
        const text = draft.trim();
        if (!text || text === message.body) {
            setEditing(false);
            return;
        }
        await onEdit(message.id, text);
        setEditing(false);
    };

    return (
        <div className={cn("flex items-end gap-2.5 group", isMine ? "justify-end" : "justify-start")}>
            {!isMine && (
                <Avatar className="h-7 w-7 self-end shrink-0 mb-0.5">
                    {isAgent ? (
                        <AvatarFallback className="bg-[#007FFF]/20 text-[#7fb8ff]"><Bot className="w-3.5 h-3.5" /></AvatarFallback>
                    ) : (
                        <>
                            <AvatarImage src={sender?.avatarUrl} />
                            <AvatarFallback className="text-xs">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </>
                    )}
                </Avatar>
            )}

            <div className={cn("max-w-[min(480px,80vw)] flex flex-col gap-0.5", isMine ? "items-end" : "items-start")}>
                {(!isMine || isAgent) && (
                    <p className={cn("text-[11px] font-semibold px-1", isAgent ? "text-[#7fb8ff]" : "text-muted-foreground")}>
                        {displayName}
                    </p>
                )}

                {replyToMessage && (
                    <div className="mb-0.5 rounded-lg border-l-2 border-primary/40 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground max-w-full truncate">
                        {replyToMessage.deleted ? "Mensaje eliminado" : replyToMessage.body.slice(0, 80) || "Adjunto"}
                    </div>
                )}

                <div
                    className={cn(
                        "relative rounded-2xl px-3.5 py-2.5 shadow-sm min-w-0",
                        isMine
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : isAgent
                                ? "bg-[#007FFF]/10 border border-[#007FFF]/25 rounded-bl-sm"
                                : "bg-card border border-border/60 rounded-bl-sm",
                    )}
                >
                    {editing ? (
                        <div className="flex items-center gap-1.5 min-w-[200px]">
                            <Input
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") void handleSaveEdit();
                                    if (e.key === "Escape") setEditing(false);
                                }}
                                autoFocus
                                className="h-7 text-sm bg-transparent border-white/20"
                            />
                            <Button size="icon" className="h-6 w-6 cursor-pointer shrink-0" onClick={() => void handleSaveEdit()}>
                                <Check className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 cursor-pointer shrink-0" onClick={() => setEditing(false)}>
                                <X className="w-3 h-3" />
                            </Button>
                        </div>
                    ) : (
                        <>
                            {message.body.trim() && (
                                <MessageRenderer
                                    text={message.body}
                                    media={false}
                                    compact
                                    className={cn(isMine && "[&_*]:!text-primary-foreground")}
                                />
                            )}
                            {message.attachments.length > 0 && (
                                <div className={cn("space-y-1.5", message.body.trim() && "mt-1.5")}>
                                    {message.attachments.map((a, i) => <AttachmentView key={i} attachment={a} />)}
                                </div>
                            )}
                        </>
                    )}

                    <p className={cn(
                        "text-[10px] mt-1.5 flex items-center gap-1",
                        isMine ? "text-primary-foreground/60 justify-end" : "text-muted-foreground",
                    )}>
                        {message.editedAt && <span className="italic">editado ·</span>}
                        {new Date(message.createdAt).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                </div>
            </div>

            {/* Menú de acciones (aparece al hover, siempre accesible por click) */}
            {!editing && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity self-center"
                        >
                            <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={isMine ? "end" : "start"}>
                        <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => onReply(message)}>
                            <Reply className="w-3.5 h-3.5" /> Responder
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                            <div className="px-0">
                                <SaveToLibrary
                                    variant="menu-item"
                                    item={{
                                        type: "post",
                                        refId: message.id,
                                        title: message.body.slice(0, 60) || "Mensaje guardado",
                                        note: `De ${displayName}`,
                                    }}
                                />
                            </div>
                        </DropdownMenuItem>
                        {isMine && !isAgentThread && (
                            <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setEditing(true)}>
                                <Pencil className="w-3.5 h-3.5" /> Editar
                            </DropdownMenuItem>
                        )}
                        {isMine && (
                            <DropdownMenuItem
                                className="cursor-pointer gap-2 text-red-400 focus:text-red-400"
                                onClick={() => void onDelete(message.id)}
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Eliminar
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}

export default MessageBubble;
