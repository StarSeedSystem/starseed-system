"use client";

// ════════════════════════════════════════════════════════════════════════════
// CommentsDialog — hilo de comentarios de un ítem/carpeta (Adenda 65, §15).
// Persistido en entity_state(ref,'lib-comments:<targetId>'), realtime.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send, Trash2, Loader2 } from "lucide-react";
import { useLibComments } from "@/lib/library/item-comments";
import type { EntityRef } from "@/lib/sync/entity-state";

export interface CommentsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entityRef: EntityRef;
    title: string;
    targetId: string;
    /** Etiqueta legible del usuario actual, si se conoce. */
    myLabel?: string;
    myUserId?: string | null;
}

export function CommentsDialog({ open, onOpenChange, entityRef, title, targetId, myLabel, myUserId }: CommentsDialogProps) {
    const { comments, loading, add, remove } = useLibComments(open ? entityRef : null, open ? targetId : null);
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);

    const handleSend = async () => {
        const trimmed = body.trim();
        if (!trimmed) return;
        setSending(true);
        const res = await add(trimmed, myLabel);
        setSending(false);
        if (res.ok) setBody("");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <MessageSquare className="h-4 w-4 text-primary" /> Comentarios · {title}
                    </DialogTitle>
                    <DialogDescription>Visible para quien ya tiene acceso a esta biblioteca.</DialogDescription>
                </DialogHeader>

                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {loading ? (
                        <p className="flex items-center gap-1.5 py-4 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
                        </p>
                    ) : comments.length === 0 ? (
                        <p className="py-4 text-center text-xs text-muted-foreground">Aún no hay comentarios. Sé el primero.</p>
                    ) : (
                        comments.map((c) => (
                            <div key={c.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold text-white/80">
                                        {c.authorLabel || (c.authorId === myUserId ? "Tú" : "Alguien")}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString("es-ES")}</span>
                                        {c.authorId === myUserId && (
                                            <button
                                                type="button"
                                                onClick={() => void remove(c.id)}
                                                className="cursor-pointer text-muted-foreground hover:text-rose-300"
                                                aria-label="Borrar comentario"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap text-xs text-white/80">{c.body}</p>
                                {c.editedAt && <p className="mt-0.5 text-[9px] italic text-muted-foreground">(editado)</p>}
                            </div>
                        ))
                    )}
                </div>

                <div className="flex items-end gap-2 pt-1">
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Escribe un comentario… (Cmd/Ctrl+Enter para enviar)"
                        rows={2}
                        className="border-white/15 bg-black/30 text-xs"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                void handleSend();
                            }
                        }}
                    />
                    <Button
                        type="button"
                        size="icon"
                        className="h-9 w-9 shrink-0 cursor-pointer"
                        disabled={sending || !body.trim()}
                        onClick={() => void handleSend()}
                        aria-label="Enviar comentario"
                    >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default CommentsDialog;
