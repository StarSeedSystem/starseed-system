"use client";

// src/components/messages/correos-panel.tsx
// -----------------------------------------------------------------------------
// MÓDULO MENSAJES — Sección "Correos" · correo interno REAL entre cuentas
// -----------------------------------------------------------------------------
// Reconstruido sobre `@/lib/mail/os-mail.ts` (hilos os_dm_threads marcados con
// meta.mail=true) — el backend anterior (`@/lib/mail/starseed-mail.ts`, tablas
// ss_mail/account_emails/starseed_mail_config) referenciaba tablas que NO
// EXISTEN en la base real: nunca llegó a enviar/recibir un correo de verdad.
// Este panel SÍ funciona de extremo a extremo sobre infraestructura verificada.
//
// Dos paneles (lista + lectura de hilo), folders (Recibidos/Enviados/Destacados/
// Archivados), redactar con destinatarios múltiples buscados en el directorio
// (@usuario), asunto + cuerpo markdown + adjuntos (picker universal),
// responder (inline, en el propio hilo) / reenviar (nuevo hilo "Fwd:"),
// marcar leído/destacado/archivar, tiempo real. Toggle "Correo externo": abre
// un borrador mailto: y guarda una copia en Enviados con etiqueta «Externo»
// (honesto: sin SMTP propio — ver nota discreta en el compositor y en Cuenta).
//
// El conmutador Mensajes ↔ Correos (en src/app/(main)/messages/page.tsx) NO se
// toca: sigue montando <CorreosPanel userId={...}/> exactamente igual.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
    Inbox, Send, Mail, PenSquare, ArrowLeft, RefreshCcw, Star, Archive, ArchiveRestore,
    X, Search, MailOpen, Paperclip, Forward, Loader2, ExternalLink, Eye, Pencil,
    Image as ImageIcon, Music, Video as VideoIcon, File as FileIcon, Link as LinkIcon, Lock,
    Globe2 as Globe2Icon,
} from "lucide-react";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";
// Invitaciones (grupo/página/evento) y referencias vivas de "Contenido de la
// red" (Adenda jul-2026): mismo render compartido con Mensajes/Comentarios.
import { UniversalAttachmentView, isInviteLike, isNetworkRefLike } from "@/components/files/universal-attachment-view";
import { InviteComposerButton, type InviteAttachmentPayload } from "@/components/invitations/invite-composer-button";
// Previsualización rica (audio/vídeo/pdf/código/genérico descargable —
// Requisito 4): antes Correos solo trataba especialmente las imágenes.
import { FilePreview } from "@/components/files/file-preview";
import { searchUsers, fetchProfilesByIds, type OsProfile } from "@/lib/social/os-profiles";
import {
    listMailThreads,
    getMailMessages,
    composeMail,
    replyToMail,
    forwardMail,
    setMailStarred,
    setMailArchived,
    markMailRead,
    subscribeMailThreadsList,
    subscribeMailThread,
    sendExternalMail,
    envioExternoDisponible,
    miDireccionPublica,
    getLinkedExternalEmail,
    messageFromRealtimeRow,
    type MailFolder,
    type MailThreadSummary,
    type DmMessage,
    type DmAttachment,
} from "@/lib/mail/os-mail";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatWhen(raw?: string | null): string {
    if (!raw) return "";
    try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function initialsOf(name?: string | null): string {
    const n = (name || "").trim();
    if (!n) return "?";
    return n.slice(0, 2).toUpperCase();
}

function iconFor(mime?: string | null, kind?: string | null): typeof FileIcon {
    const m = (mime || kind || "").toLowerCase();
    if (m === "invite") return Mail;
    if (m === "ref") return Globe2Icon;
    if (m.startsWith("image")) return ImageIcon;
    if (m.startsWith("audio")) return Music;
    if (m.startsWith("video")) return VideoIcon;
    if (m.includes("link") || m.includes("external") || m.includes("route")) return LinkIcon;
    return FileIcon;
}

/** Nombre a mostrar para un user_id (perfil resuelto, o "Tú" si soy yo). */
function nameFor(userId: string, profiles: Record<string, OsProfile>, myUserId: string | null): string {
    if (userId && userId === myUserId) return "Tú";
    return profiles[userId]?.displayName || profiles[userId]?.username || "Alguien";
}

/** Etiqueta de contraparte para una fila de lista: "de X" o "para X, Y". */
function counterpartLabel(t: MailThreadSummary, profiles: Record<string, OsProfile>, myUserId: string | null): string {
    if (t.external) return `externo · ${t.externalTo || "—"}`;
    const isMine = t.creatorId === myUserId;
    if (isMine) {
        const others = t.memberIds.filter((id) => id !== myUserId);
        const names = others.map((id) => nameFor(id, profiles, myUserId));
        return `para ${names.length ? names.join(", ") : "—"}`;
    }
    return `de ${nameFor(t.creatorId, profiles, myUserId)}`;
}

// ── Adjuntos ─────────────────────────────────────────────────────────────────

function AttachmentView({ attachment }: { attachment: DmAttachment }) {
    if (isInviteLike(attachment) || isNetworkRefLike(attachment)) {
        return <UniversalAttachmentView attachment={attachment} />;
    }

    const Icon = iconFor(attachment.mime, attachment.kind);
    if (attachment.kind === "image" && attachment.url) {
        return (
            <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block w-32 h-24 rounded-lg overflow-hidden border border-white/10 cursor-pointer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.name || "Imagen"} className="w-full h-full object-cover" />
            </a>
        );
    }

    // audio / vídeo / pdf / código / genérico descargable (con URL real): visor
    // rico compartido en vez de una simple tarjeta de enlace (Requisito 4).
    if (attachment.url) {
        return (
            <div className="max-w-sm">
                <FilePreview
                    file={{ url: attachment.url, name: attachment.name, mime: attachment.mime, type: attachment.kind }}
                    context="message"
                    compact
                    actions={false}
                />
            </div>
        );
    }

    const href = attachment.route;
    return (
        <a
            href={href || "#"}
            target={href ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs cursor-pointer hover:bg-white/[0.06] transition-colors duration-200 max-w-[220px]"
        >
            <Icon className="size-3.5 shrink-0 text-white/60" />
            <span className="truncate font-medium">{attachment.name || "Archivo adjunto"}</span>
        </a>
    );
}

function PendingAttachmentChip({ a, onRemove }: { a: UniversalAttachment; onRemove: () => void }) {
    const Icon = iconFor(a.mime, a.kind);
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] pl-2 pr-1 py-1 text-[11px]">
            <Icon className="size-3 text-white/60" />
            <span className="max-w-[120px] truncate">{a.name || "adjunto"}</span>
            <button type="button" onClick={onRemove} className="cursor-pointer rounded-full p-0.5 hover:bg-white/10" aria-label="Quitar adjunto">
                <X className="size-3" />
            </button>
        </span>
    );
}

// ── Buscador de destinatarios (@usuario) ─────────────────────────────────────

function RecipientPicker({
    selected, onChange,
}: { selected: OsProfile[]; onChange: (next: OsProfile[]) => void }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<OsProfile[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 1) { setResults([]); return; }
        setSearching(true);
        const t = setTimeout(async () => {
            const res = await searchUsers(term);
            setResults(res.filter((r) => !selected.some((s) => s.userId === r.userId)));
            setSearching(false);
        }, 250);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, selected.length]);

    return (
        <div className="space-y-1.5">
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {selected.map((p) => (
                        <Badge key={p.userId} variant="secondary" className="gap-1 pr-1">
                            {p.displayName}
                            <button type="button" className="cursor-pointer" onClick={() => onChange(selected.filter((s) => s.userId !== p.userId))}>
                                <X className="w-3 h-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o @usuario…"
                    className="pl-8 h-9 text-sm"
                />
                {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {query.trim().length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-lg border border-white/10 bg-black/10 p-1">
                    {results.map((p) => (
                        <button
                            key={p.userId}
                            type="button"
                            onClick={() => { onChange([...selected, p]); setQuery(""); }}
                            className="flex items-center gap-2.5 w-full p-1.5 rounded-lg text-left hover:bg-white/5 transition-colors cursor-pointer"
                        >
                            <Avatar className="h-7 w-7">
                                <AvatarImage src={p.avatarUrl} />
                                <AvatarFallback className="text-[10px]">{initialsOf(p.displayName)}</AvatarFallback>
                            </Avatar>
                            <span className="min-w-0">
                                <span className="block text-xs font-semibold truncate">{p.displayName}</span>
                                <span className="block text-[11px] text-muted-foreground truncate">@{p.username}</span>
                            </span>
                        </button>
                    ))}
                    {!searching && results.length === 0 && (
                        <p className="text-[11px] text-muted-foreground text-center py-2">Sin resultados.</p>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Compositor (nuevo / reenviar) ────────────────────────────────────────────

interface ForwardSeed {
    subject: string;
    body: string;
    senderLabel: string;
    createdAt: string;
    attachments: DmAttachment[];
}

function ComposeDialog({
    open, onOpenChange, forwardSeed, onSent,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Si se da, el diálogo redacta un REENVÍO de este contenido. */
    forwardSeed?: ForwardSeed | null;
    onSent: (threadId: string) => void;
}) {
    const isForward = !!forwardSeed;

    const [recipients, setRecipients] = useState<OsProfile[]>([]);
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [note, setNote] = useState("");
    const [attachments, setAttachments] = useState<UniversalAttachment[]>([]);
    const [preview, setPreview] = useState(false);
    const [external, setExternal] = useState(false);
    const [externalTo, setExternalTo] = useState("");
    const [linkedExternal, setLinkedExternal] = useState("");
    // (Adenda 200) Estado REAL del envío saliente de este despliegue.
    const [envioReal, setEnvioReal] = useState<{ disponible: boolean; dominio: string | null } | null>(null);
    const [miDireccion, setMiDireccion] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setRecipients([]);
        setSubject(isForward ? "" : "");
        setBody("");
        setNote("");
        setAttachments([]);
        setPreview(false);
        setExternal(false);
        setExternalTo("");
        setError(null);
        void getLinkedExternalEmail().then(setLinkedExternal);
        void envioExternoDisponible().then(setEnvioReal);
        void miDireccionPublica().then(setMiDireccion);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, isForward]);

    const handleSend = useCallback(async () => {
        setError(null);

        if (external) {
            const to = externalTo.trim();
            if (!to.includes("@")) { setError("Escribe un correo externo válido."); return; }
            setSending(true);
            try {
                const res = await sendExternalMail({
                    to,
                    subject: isForward ? `Fwd: ${forwardSeed!.subject.replace(/^\s*(Fwd:\s*)+/i, "")}` : subject,
                    body: isForward ? `${note.trim() ? note.trim() + "\n\n" : ""}--- Mensaje reenviado ---\n${forwardSeed!.body}` : body,
                });
                if (res.needsAuth) { setError("Inicia sesión para enviar."); return; }
                if (!res.ok) { setError(res.error || "No se pudo enviar el correo."); return; }

                // (Adenda 200) Si el OS tiene proveedor de envío, el correo SALIÓ
                // de verdad desde tu dirección pública: no abrimos nada. Si no,
                // se cae al cliente del sistema con `mailto:` como antes.
                if (res.enviadoDeVerdad) {
                    toast.success(`Correo enviado a ${to}${res.desde ? ` desde ${res.desde}` : ""}.`);
                } else {
                    if (!res.href) { setError(res.error || "No se pudo preparar el envío externo."); return; }
                    if (typeof window !== "undefined") window.location.href = res.href;
                    toast.success("Cliente de correo abierto. Copia guardada en Enviados con etiqueta «Externo».");
                }
                onOpenChange(false);
                if (res.threadId) onSent(res.threadId);
            } finally {
                setSending(false);
            }
            return;
        }

        if (!recipients.length) { setError("Añade al menos un destinatario."); return; }
        setSending(true);
        try {
            const res = isForward
                ? await forwardMail({
                    originalSubject: forwardSeed!.subject,
                    originalBody: forwardSeed!.body,
                    originalSenderLabel: forwardSeed!.senderLabel,
                    originalCreatedAt: forwardSeed!.createdAt,
                    attachments: forwardSeed!.attachments,
                    recipientIds: recipients.map((r) => r.userId),
                    note,
                })
                : await composeMail({
                    recipientIds: recipients.map((r) => r.userId),
                    subject,
                    body,
                    attachments: attachments as unknown as DmAttachment[],
                });
            if (res.needsAuth) { setError("Inicia sesión para enviar."); return; }
            if (!res.ok || !res.threadId) { setError(res.error || "No se pudo enviar el correo."); return; }
            toast.success("Correo enviado.");
            onOpenChange(false);
            onSent(res.threadId);
        } finally {
            setSending(false);
        }
    }, [external, externalTo, recipients, subject, body, note, attachments, isForward, forwardSeed, onOpenChange, onSent]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isForward ? <Forward className="size-4 text-primary" /> : <PenSquare className="size-4 text-primary" />}
                        {isForward ? "Reenviar correo" : "Nuevo correo"}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {isForward ? `Reenvías: «${forwardSeed?.subject}»` : "Busca destinatarios en el directorio de la red StarSeed."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                        <span className="text-xs font-medium">Correo externo (a todo internet)</span>
                        <Switch checked={external} onCheckedChange={setExternal} />
                    </div>

                    {external ? (
                        <>
                            <Input
                                value={externalTo}
                                onChange={(e) => setExternalTo(e.target.value)}
                                placeholder="destinatario@ejemplo.com"
                                className="h-9 text-sm"
                            />
                            {linkedExternal && (
                                <p className="text-[11px] text-muted-foreground">
                                    Tu correo externo vinculado: <span className="font-mono">{linkedExternal}</span>
                                </p>
                            )}
                        </>
                    ) : (
                        <RecipientPicker selected={recipients} onChange={setRecipients} />
                    )}

                    {!isForward && (
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" className="h-9 text-sm" />
                    )}

                    {isForward && (
                        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Añade una nota (opcional)" className="h-9 text-sm" />
                    )}

                    {!isForward && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-muted-foreground">Cuerpo (markdown)</span>
                                <button type="button" onClick={() => setPreview((p) => !p)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                                    {preview ? <Pencil className="size-3" /> : <Eye className="size-3" />}
                                    {preview ? "Editar" : "Vista previa"}
                                </button>
                            </div>
                            {preview ? (
                                <div className="min-h-[110px] rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                                    {body.trim() ? <MessageRenderer text={body} media={false} /> : <p className="text-xs text-muted-foreground">Nada que previsualizar.</p>}
                                </div>
                            ) : (
                                <textarea
                                    value={body}
                                    onChange={(e) => setBody(e.target.value)}
                                    placeholder="Escribe tu correo… admite **markdown**"
                                    rows={6}
                                    className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                                />
                            )}
                        </div>
                    )}

                    {isForward && (
                        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 max-h-32 overflow-y-auto">
                            <p className="text-[11px] text-muted-foreground mb-1">
                                {forwardSeed?.senderLabel} · {formatWhen(forwardSeed?.createdAt)}
                            </p>
                            <MessageRenderer text={forwardSeed?.body || ""} media={false} />
                        </div>
                    )}

                    {!external && !isForward && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <AttachFilePickerButton
                                onPick={(picked) => setAttachments((prev) => [...prev, ...picked])}
                                folder="correos"
                                title="Adjuntar a este correo"
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors duration-200"
                            >
                                <Paperclip className="size-3" /> Adjuntar
                            </AttachFilePickerButton>
                            <InviteComposerButton
                                onPick={(invite: InviteAttachmentPayload) => setAttachments((prev) => [...prev, invite])}
                                title="Invitar a grupo/página/evento"
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground hover:border-cyan-400/30 hover:text-foreground transition-colors duration-200"
                            >
                                <Mail className="size-3" /> Invitar
                            </InviteComposerButton>
                            {attachments.map((a, i) => (
                                <PendingAttachmentChip key={i} a={a} onRemove={() => setAttachments((prev) => prev.filter((_, j) => j !== i))} />
                            ))}
                        </div>
                    )}

                    {external && (
                        envioReal?.disponible ? (
                            <p className="rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-[11px] text-muted-foreground">
                                Sale de verdad a cualquier dirección de internet
                                {miDireccion && envioReal.dominio
                                    ? <> desde <span className="font-mono text-emerald-200">{miDireccion}@{envioReal.dominio}</span></>
                                    : null}
                                . Las respuestas vuelven a tu bandeja del OS. Los adjuntos aún no viajan en el envío externo.
                            </p>
                        ) : (
                            <p className="rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[11px] text-muted-foreground">
                                Este despliegue todavía no tiene proveedor de envío: se abrirá tu cliente de correo con el
                                borrador listo y quedará copia en Enviados etiquetada «Externo». Recibir ya funciona en
                                {envioReal?.dominio ? <span className="font-mono"> @{envioReal.dominio}</span> : " tu dirección pública"}.
                            </p>
                        )
                    )}

                    {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
                </div>

                <DialogFooter>
                    <Button variant="outline" className="cursor-pointer" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button className="cursor-pointer gap-1.5" onClick={() => void handleSend()} disabled={sending}>
                        {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                        {external ? "Abrir cliente de correo" : isForward ? "Reenviar" : "Enviar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ── Fila de la lista ─────────────────────────────────────────────────────────

function MailListItem({
    thread, profiles, myUserId, isActive, onSelect,
}: {
    thread: MailThreadSummary;
    profiles: Record<string, OsProfile>;
    myUserId: string | null;
    isActive: boolean;
    onSelect: () => void;
}) {
    const counterpart = counterpartLabel(thread, profiles, myUserId);
    const preview = (thread.lastMessage?.body || "").slice(0, 90);
    return (
        <button
            onClick={onSelect}
            className={cn(
                "flex items-start gap-3 w-full p-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer border",
                isActive ? "bg-primary/10 border-primary/20 shadow-sm" : "hover:bg-muted/60 border-transparent",
            )}
        >
            <div className="relative shrink-0">
                <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs font-semibold">{initialsOf(counterpart.replace(/^(de|para|externo)\s*/i, ""))}</AvatarFallback>
                </Avatar>
                {thread.unread && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p className={cn("truncate text-sm", thread.unread ? "font-bold" : "font-semibold")}>{thread.subject}</p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{formatWhen(thread.lastMsgAt)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                    {counterpart}
                    {thread.flags.starred && <Star className="inline-block ml-1 size-2.5 fill-amber-400 text-amber-400" />}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                    {(thread.lastMessage?.attachments.length ?? 0) > 0 && <Paperclip className="size-3 shrink-0" />}
                    {preview || "—"}
                </p>
            </div>
        </button>
    );
}

// ── Lectura + respuesta inline ───────────────────────────────────────────────

function MailReader({
    thread, myUserId, profiles, onBack, onChanged, onForward,
}: {
    thread: MailThreadSummary;
    myUserId: string | null;
    profiles: Record<string, OsProfile>;
    onBack: () => void;
    onChanged: () => void;
    onForward: (seed: ForwardSeed) => void;
}) {
    const [messages, setMessages] = useState<DmMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyBody, setReplyBody] = useState("");
    const [replyAttachments, setReplyAttachments] = useState<UniversalAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [starred, setStarred] = useState(thread.flags.starred);
    const [archived, setArchived] = useState(thread.flags.archived);

    const load = useCallback(async () => {
        setLoading(true);
        const rows = await getMailMessages(thread.id);
        setMessages(rows);
        setLoading(false);
    }, [thread.id]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        setStarred(thread.flags.starred);
        setArchived(thread.flags.archived);
    }, [thread.flags.starred, thread.flags.archived]);

    // Marca como leído al abrir (best-effort, no bloquea la lectura).
    useEffect(() => {
        if (thread.unread) void markMailRead(thread.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread.id]);

    useEffect(() => subscribeMailThread(thread.id, (payload) => {
        if (payload.eventType === "INSERT") {
            const m = messageFromRealtimeRow(payload.new as any);
            if (m) setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
        } else {
            void load();
        }
    }), [thread.id, load]);

    const counterpart = counterpartLabel(thread, profiles, myUserId);

    const handleReply = useCallback(async () => {
        if (!replyBody.trim() && replyAttachments.length === 0) return;
        setSending(true);
        try {
            const sent = await replyToMail(thread.id, replyBody, replyAttachments as unknown as DmAttachment[]);
            if (!sent) { toast.error("No se pudo enviar la respuesta."); return; }
            setMessages((prev) => [...prev, sent]);
            setReplyBody("");
            setReplyAttachments([]);
            onChanged();
        } finally {
            setSending(false);
        }
    }, [replyBody, replyAttachments, thread.id, onChanged]);

    const handleForward = () => {
        const last = messages[messages.length - 1];
        if (!last) return;
        onForward({
            subject: thread.subject,
            body: last.body,
            senderLabel: nameFor(last.sender || thread.creatorId, profiles, myUserId),
            createdAt: last.createdAt,
            attachments: last.attachments,
        });
    };

    const toggleStar = async () => {
        const next = !starred;
        setStarred(next);
        await setMailStarred(thread.id, next);
        onChanged();
    };
    const toggleArchive = async () => {
        const next = !archived;
        setArchived(next);
        await setMailArchived(thread.id, next);
        onChanged();
    };

    return (
        <div className="flex flex-col h-full">
            <header className="flex items-center gap-2 px-4 py-3 border-b bg-background/80 backdrop-blur-xl shrink-0">
                <Button variant="ghost" size="icon" className="cursor-pointer shrink-0 h-8 w-8" onClick={onBack} title="Volver a la bandeja">
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{thread.subject}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{counterpart}</p>
                </div>
                <Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8 shrink-0" title={starred ? "Quitar destacado" : "Destacar"} onClick={() => void toggleStar()}>
                    <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-400")} />
                </Button>
                <Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8 shrink-0" title={archived ? "Desarchivar" : "Archivar"} onClick={() => void toggleArchive()}>
                    {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
                {!thread.external && (
                    <Button variant="ghost" size="icon" className="cursor-pointer h-8 w-8 shrink-0" title="Reenviar" onClick={handleForward} disabled={messages.length === 0}>
                        <Forward className="h-4 w-4" />
                    </Button>
                )}
            </header>

            <ScrollArea className="flex-1">
                <div className="px-5 py-4 max-w-2xl space-y-4">
                    {thread.external && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-1.5 w-fit">
                            <ExternalLink className="size-3" /> Externo · enviado como mailto: a {thread.externalTo}
                        </div>
                    )}
                    {loading ? (
                        <p className="text-sm text-muted-foreground">Cargando…</p>
                    ) : messages.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Este correo no tiene contenido.</p>
                    ) : (
                        messages.map((m) => (
                            <div key={m.id} className="space-y-1.5">
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span className="font-semibold text-foreground/80">{nameFor(m.sender || "", profiles, myUserId)}</span>
                                    <span>·</span>
                                    <span>{formatWhen(m.createdAt)}</span>
                                    {m.editedAt && <span className="italic">(editado)</span>}
                                </div>
                                {m.deleted ? (
                                    <p className="text-sm italic text-muted-foreground">Mensaje eliminado.</p>
                                ) : (
                                    <MessageRenderer text={m.body} media={false} />
                                )}
                                {m.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {m.attachments.map((a, i) => <AttachmentView key={i} attachment={a} />)}
                                    </div>
                                )}
                                <Separator className="mt-3" />
                            </div>
                        ))
                    )}
                </div>
            </ScrollArea>

            {!thread.external && (
                <div className="border-t bg-background/80 backdrop-blur-xl px-4 py-3 shrink-0 space-y-2">
                    <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Responder… admite markdown"
                        rows={2}
                        className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <AttachFilePickerButton
                                onPick={(picked) => setReplyAttachments((prev) => [...prev, ...picked])}
                                folder="correos"
                                title="Adjuntar a la respuesta"
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors duration-200 shrink-0"
                            >
                                <Paperclip className="size-3" /> Adjuntar
                            </AttachFilePickerButton>
                            <InviteComposerButton
                                onPick={(invite: InviteAttachmentPayload) => setReplyAttachments((prev) => [...prev, invite])}
                                title="Invitar a grupo/página/evento"
                                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground hover:border-cyan-400/30 hover:text-foreground transition-colors duration-200 shrink-0"
                            >
                                <Mail className="size-3" /> Invitar
                            </InviteComposerButton>
                            {replyAttachments.map((a, i) => (
                                <PendingAttachmentChip key={i} a={a} onRemove={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))} />
                            ))}
                        </div>
                        <Button size="sm" className="h-8 cursor-pointer gap-1.5 shrink-0" onClick={() => void handleReply()} disabled={sending || (!replyBody.trim() && replyAttachments.length === 0)}>
                            {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                            Responder
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Panel principal de Correos ───────────────────────────────────────────────

export function CorreosPanel({ userId }: { userId: string | null }) {
    const [folder, setFolder] = useState<MailFolder>("inbox");
    const [threads, setThreads] = useState<MailThreadSummary[]>([]);
    const [profiles, setProfiles] = useState<Record<string, OsProfile>>({});
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [composeOpen, setComposeOpen] = useState(false);
    const [forwardSeed, setForwardSeed] = useState<ForwardSeed | null>(null);
    const [search, setSearch] = useState("");

    const load = useCallback(async (which: MailFolder) => {
        const rows = await listMailThreads(which);
        setThreads(rows);
        const ids = Array.from(new Set(rows.flatMap((t) => [t.creatorId, ...t.memberIds]).filter(Boolean)));
        if (ids.length) setProfiles(await fetchProfilesByIds(ids));
        setLoading(false);
    }, []);

    useEffect(() => {
        setLoading(true);
        setSelectedId(null);
        void load(folder);
    }, [folder, load]);

    useEffect(() => subscribeMailThreadsList(() => void load(folder)), [folder, load]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return threads;
        return threads.filter((t) => {
            const hay = [t.subject, t.lastMessage?.body, t.externalTo].filter(Boolean).join(" ").toLowerCase();
            return hay.includes(q);
        });
    }, [threads, search]);

    const unreadInbox = useMemo(() => (folder === "inbox" ? threads.filter((t) => t.unread).length : 0), [threads, folder]);
    const selected = useMemo(() => threads.find((t) => t.id === selectedId) || null, [threads, selectedId]);

    const handleSent = useCallback((threadId: string) => {
        setForwardSeed(null);
        setFolder("sent");
        void load("sent").then(() => setSelectedId(threadId));
    }, [load]);

    const FOLDERS: Array<[MailFolder, string, typeof Inbox]> = [
        ["inbox", "Recibidos", Inbox],
        ["sent", "Enviados", Send],
        ["starred", "Destacados", Star],
        ["archived", "Archivados", Archive],
    ];

    if (selected) {
        return (
            <>
                <ComposeDialog
                    open={composeOpen || !!forwardSeed}
                    onOpenChange={(o) => { setComposeOpen(o); if (!o) setForwardSeed(null); }}
                    forwardSeed={forwardSeed}
                    onSent={handleSent}
                />
                <MailReader
                    thread={selected}
                    myUserId={userId}
                    profiles={profiles}
                    onBack={() => setSelectedId(null)}
                    onChanged={() => void load(folder)}
                    onForward={(seed) => setForwardSeed(seed)}
                />
            </>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <ComposeDialog
                open={composeOpen || !!forwardSeed}
                onOpenChange={(o) => { setComposeOpen(o); if (!o) setForwardSeed(null); }}
                forwardSeed={forwardSeed}
                onSent={handleSent}
            />

            <div className="px-4 py-3 border-b bg-background/80 backdrop-blur-xl shrink-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Mail className="w-5 h-5 text-primary shrink-0" />
                        <h2 className="text-lg font-bold font-headline truncate">Correos</h2>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" title="Actualizar" onClick={() => void load(folder)}>
                            <RefreshCcw className="w-4 h-4" />
                        </Button>
                        <Button size="sm" className="h-8 cursor-pointer" onClick={() => setComposeOpen(true)} disabled={!userId} title={userId ? "Redactar correo" : "Inicia sesión para redactar"}>
                            <PenSquare className="mr-1.5 h-3.5 w-3.5" /> Redactar
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {FOLDERS.map(([key, label, Icon]) => (
                        <button
                            key={key}
                            onClick={() => setFolder(key)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer border",
                                folder === key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground",
                            )}
                        >
                            <Icon className="w-3.5 h-3.5" /> {label}
                            {key === "inbox" && unreadInbox > 0 && (
                                <Badge className="h-4 min-w-4 px-1 ml-0.5 text-[10px] bg-background text-foreground">{unreadInbox}</Badge>
                            )}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Buscar en tus correos…"
                        className="pl-8 h-8 text-sm bg-muted/50 border-transparent focus:border-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors" onClick={() => setSearch("")}>
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                    {!userId && !loading && (
                        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                            <Lock className="h-3.5 w-3.5 shrink-0" />
                            <span>
                                <Link href="/login" className="underline cursor-pointer font-medium text-foreground">Inicia sesión</Link> para ver y redactar tus correos.
                            </span>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                            <Mail className="w-8 h-8 mb-2 opacity-40 animate-pulse" />
                            <p className="text-sm">Cargando tu buzón…</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-14 text-center text-muted-foreground">
                            <MailOpen className="w-10 h-10 mb-3 opacity-30" />
                            {search ? (
                                <p className="text-sm">Sin resultados para "{search}".</p>
                            ) : folder === "inbox" ? (
                                <>
                                    <p className="text-sm font-medium">No tienes correos recibidos.</p>
                                    <p className="text-xs mt-1">Cuando alguien te escriba, aparecerá aquí.</p>
                                </>
                            ) : folder === "sent" ? (
                                <p className="text-sm font-medium">No has enviado correos todavía.</p>
                            ) : folder === "starred" ? (
                                <p className="text-sm font-medium">No tienes correos destacados.</p>
                            ) : (
                                <p className="text-sm font-medium">No tienes correos archivados.</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map((t) => (
                                <MailListItem key={t.id} thread={t} profiles={profiles} myUserId={userId} isActive={selectedId === t.id} onSelect={() => setSelectedId(t.id)} />
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

export default CorreosPanel;
