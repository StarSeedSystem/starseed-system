"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * SharePostActions — "COMPARTIR COMO" del paso final del Lienzo de Creación
 * -----------------------------------------------------------------------------
 * Dos botones — mensaje / correo — que comparten la publicación YA PUBLICADA
 * (identificada por `postId`, el `recordId` de un `DestinationResult` de
 * `publish()`) SIN duplicarla: envían una tarjeta-REFERENCIA
 * `{kind:"ref", refKind:"post", refId, route}` (mismo protocolo que ya
 * entienden `UniversalAttachmentView`/`message-bubble`/`correos-panel` — no se
 * toca ninguna UI de mensajes, sólo se llama a sus APIs de datos).
 *
 *   · Mensaje → elige un hilo existente o busca una persona (crea/reutiliza un
 *     DM con `createDm`) y envía con `sendMessage`.
 *   · Correo  → busca destinatarios y redacta con `composeMail` (asunto +
 *     cuerpo + la referencia adjunta).
 *
 * Búsqueda de personas vía `searchUsers` (`@/lib/social/os-profiles`) — el
 * mismo camino ya usado por `new-chat-dialog.tsx` para iniciar DMs reales
 * (devuelve `userId` YA resuelto a `auth.users.id`; a diferencia de
 * `searchEntities` de mentions.ts, que devuelve `profiles.id`, una fila
 * distinta que no sirve directamente como destinatario de `os_dm_members`).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import { Send, Mail, Loader2, Check, X, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { searchUsers, type OsProfile } from "@/lib/social/os-profiles";
import { listThreads, createDm, sendMessage, type DmThreadSummary, type DmAttachment } from "@/lib/messages/dm";
import { composeMail } from "@/lib/mail/os-mail";
import { networkRefRoute } from "@/lib/files/network-content-ref";

export interface SharePostActionsProps {
    /** `recordId` de un destino ya entregado (fila real en `posts`). Sin él, los botones quedan deshabilitados con una pista. */
    postId?: string | null;
    title?: string;
    description?: string;
    className?: string;
}

function buildRefAttachment(postId: string, title?: string): DmAttachment {
    return {
        kind: "ref",
        refKind: "post",
        refId: postId,
        route: networkRefRoute("post", postId),
        name: title || "Publicación",
    };
}

/** Buscador de personas reutilizable (mensaje + correo). */
function UserSearch({ onPick, exclude }: { onPick: (p: OsProfile) => void; exclude?: string[] }) {
    const [query, setQuery] = useState("");
    const [hits, setHits] = useState<OsProfile[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!query.trim()) {
            setHits([]);
            return;
        }
        let alive = true;
        setLoading(true);
        const t = window.setTimeout(() => {
            searchUsers(query)
                .then((res) => {
                    if (alive) setHits(res.filter((p) => !exclude?.includes(p.userId)));
                })
                .finally(() => alive && setLoading(false));
        }, 300);
        return () => {
            alive = false;
            window.clearTimeout(t);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    return (
        <div className="space-y-1.5">
            <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar persona por nombre o usuario…"
                className="h-8 bg-white/[0.03] text-xs text-amber-50"
            />
            {loading && (
                <p className="flex items-center gap-1.5 text-[11px] text-white/40">
                    <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
                </p>
            )}
            {hits.length > 0 && (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-1">
                    {hits.map((p) => (
                        <button
                            key={p.userId}
                            type="button"
                            onClick={() => {
                                onPick(p);
                                setQuery("");
                                setHits([]);
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-amber-50 hover:bg-white/10"
                        >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-white/70">
                                {(p.displayName || p.username || "?").slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{p.displayName || p.username}</span>
                            <span className="shrink-0 text-[10px] text-white/35">@{p.username}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Compartir como mensaje ───────────────────────────────────────────────────

function ShareAsMessageDialog({
    open, onOpenChange, postId, title,
}: { open: boolean; onOpenChange: (v: boolean) => void; postId: string; title?: string }) {
    const [threads, setThreads] = useState<DmThreadSummary[]>([]);
    const [loadingThreads, setLoadingThreads] = useState(false);
    const [selectedThread, setSelectedThread] = useState<{ id: string; label: string } | null>(null);
    const [note, setNote] = useState("");
    const [sending, setSending] = useState(false);
    const [resolving, setResolving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setLoadingThreads(true);
        listThreads()
            .then((t) => setThreads(t))
            .finally(() => setLoadingThreads(false));
    }, [open]);

    async function pickUser(p: OsProfile) {
        setResolving(true);
        const res = await createDm(p.userId);
        setResolving(false);
        if (!res.ok || !res.thread) {
            toast.error(res.error || "No se pudo iniciar la conversación.");
            return;
        }
        setSelectedThread({ id: res.thread.id, label: p.displayName || p.username });
    }

    async function send() {
        if (!selectedThread) {
            toast.error("Elige un hilo o busca una persona.");
            return;
        }
        setSending(true);
        try {
            const ref = buildRefAttachment(postId, title);
            const msg = await sendMessage(selectedThread.id, { body: note.trim(), attachments: [ref] });
            if (!msg) {
                toast.error("No se pudo enviar el mensaje.");
                return;
            }
            toast.success("Publicación compartida como mensaje.");
            onOpenChange(false);
            setNote("");
            setSelectedThread(null);
        } finally {
            setSending(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-amber-50">Compartir como mensaje</DialogTitle>
                    <DialogDescription className="text-white/50">
                        Envía una tarjeta-referencia de tu publicación — no se duplica el contenido.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {selectedThread ? (
                        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                            <span className="flex items-center gap-1.5 truncate">
                                <Check className="h-3.5 w-3.5 shrink-0" /> {selectedThread.label}
                            </span>
                            <button type="button" onClick={() => setSelectedThread(null)} className="shrink-0 text-white/40 hover:text-white/80">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <UserSearch onPick={pickUser} />
                            {resolving && (
                                <p className="flex items-center gap-1.5 text-[11px] text-white/40">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Abriendo conversación…
                                </p>
                            )}
                            <div className="space-y-1">
                                <label className="flex items-center gap-1.5 text-[11px] font-medium text-white/45">
                                    <Users className="h-3 w-3" /> O elige un hilo reciente
                                </label>
                                {loadingThreads ? (
                                    <p className="flex items-center gap-1.5 text-[11px] text-white/40">
                                        <Loader2 className="h-3 w-3 animate-spin" /> Cargando hilos…
                                    </p>
                                ) : threads.length === 0 ? (
                                    <p className="text-[11px] text-white/35">Sin hilos recientes todavía.</p>
                                ) : (
                                    <div className="max-h-32 space-y-1 overflow-y-auto">
                                        {threads.slice(0, 15).map((t) => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setSelectedThread({ id: t.id, label: t.title || (t.kind === "group" ? "Grupo" : "Conversación directa") })}
                                                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-amber-50 hover:bg-white/10"
                                            >
                                                <span className="truncate">{t.title || (t.kind === "group" ? "Grupo" : "Conversación directa")}</span>
                                                {t.unreadCount > 0 && (
                                                    <span className="shrink-0 rounded-full bg-amber-400/20 px-1.5 text-[10px] text-amber-200">{t.unreadCount}</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Nota opcional…"
                        className="min-h-[60px] bg-white/[0.03] text-xs text-amber-50"
                    />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-white/60">
                        Cancelar
                    </Button>
                    <Button type="button" onClick={send} disabled={!selectedThread || sending} className="gap-1.5">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Enviar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Compartir como correo ────────────────────────────────────────────────────

function ShareAsMailDialog({
    open, onOpenChange, postId, title, description,
}: { open: boolean; onOpenChange: (v: boolean) => void; postId: string; title?: string; description?: string }) {
    const [recipients, setRecipients] = useState<OsProfile[]>([]);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!open) return;
        setSubject(title ? `Publicación: ${title}` : "Una publicación de StarSeed");
        setBody(description || "Te comparto esta publicación.");
    }, [open, title, description]);

    function addRecipient(p: OsProfile) {
        setRecipients((r) => (r.some((x) => x.userId === p.userId) ? r : [...r, p]));
    }
    function removeRecipient(userId: string) {
        setRecipients((r) => r.filter((p) => p.userId !== userId));
    }

    async function send() {
        if (!recipients.length) {
            toast.error("Añade al menos un destinatario.");
            return;
        }
        setSending(true);
        try {
            const ref = buildRefAttachment(postId, title);
            const res = await composeMail({
                recipientIds: recipients.map((p) => p.userId),
                subject,
                body,
                attachments: [ref],
            });
            if (!res.ok) {
                toast.error(res.error || "No se pudo enviar el correo.");
                return;
            }
            toast.success("Publicación compartida por correo.");
            onOpenChange(false);
            setRecipients([]);
        } finally {
            setSending(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-amber-50">Compartir como correo</DialogTitle>
                    <DialogDescription className="text-white/50">
                        Redacta un correo interno con la referencia de tu publicación adjunta.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    {recipients.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {recipients.map((p) => (
                                <span key={p.userId} className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">
                                    {p.displayName || p.username}
                                    <button type="button" onClick={() => removeRecipient(p.userId)} className="text-amber-200/60 hover:text-amber-100">
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <UserSearch onPick={addRecipient} exclude={recipients.map((r) => r.userId)} />
                    <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" className="h-8 bg-white/[0.03] text-xs text-amber-50" />
                    <Textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Mensaje…"
                        className="min-h-[90px] bg-white/[0.03] text-xs text-amber-50"
                    />
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-white/60">
                        Cancelar
                    </Button>
                    <Button type="button" onClick={send} disabled={!recipients.length || sending} className="gap-1.5">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        Enviar correo
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Componente raíz ──────────────────────────────────────────────────────────

export default function SharePostActions({ postId, title, description, className }: SharePostActionsProps) {
    const [msgOpen, setMsgOpen] = useState(false);
    const [mailOpen, setMailOpen] = useState(false);
    const disabled = !postId;

    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            <span className="text-xs font-medium text-white/50">Compartir como:</span>
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => setMsgOpen(true)}
                title={disabled ? "Publica primero para poder compartir una referencia" : "Compartir como mensaje"}
                className="gap-1.5 text-xs"
            >
                <Send className="h-3.5 w-3.5" /> Mensaje
            </Button>
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => setMailOpen(true)}
                title={disabled ? "Publica primero para poder compartir una referencia" : "Compartir como correo"}
                className="gap-1.5 text-xs"
            >
                <Mail className="h-3.5 w-3.5" /> Correo
            </Button>

            {postId && (
                <>
                    <ShareAsMessageDialog open={msgOpen} onOpenChange={setMsgOpen} postId={postId} title={title} />
                    <ShareAsMailDialog open={mailOpen} onOpenChange={setMailOpen} postId={postId} title={title} description={description} />
                </>
            )}
        </div>
    );
}
