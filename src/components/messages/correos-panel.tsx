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
// (2026-09-28) Mismo marco que los chats: dos paneles de cristal (apilados en
// móvil), modo enfoque para el lector, menú ⋮ por correo con «Ajustes de este
// correo», y los ajustes personales de Mensajería respetados en la bandeja:
// fijados arriba, silenciados sin aviso, archivados fuera de Recibidos,
// etiquetas propias como filtro, firma al redactar, confirmar antes de enviar,
// vista conversación/lista e imágenes remotas bajo tu permiso.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { avisarCorreoEnviado, avisarCorreoRecibido, sembrarAvisados } from "@/lib/mail/avisos-correo";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import Link from "next/link";
import {
    Inbox, Send, Mail, PenSquare, ArrowLeft, RefreshCcw, Star, Archive, ArchiveRestore,
    X, Search, MailOpen, Paperclip, Forward, Loader2, ExternalLink, Eye, Pencil,
    Image as ImageIcon, Music, Video as VideoIcon, File as FileIcon, Link as LinkIcon, Lock,
    Globe2 as Globe2Icon, Maximize2, Minimize2, Settings2, BellOff, Pin, Tag, ChevronDown, ImageOff,
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
import { useAjustesMensajeria } from "@/lib/mensajeria/ajustes-store";
import type { AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";
import { useContactos } from "@/lib/contactos/store";
import { AvatarContacto } from "@/components/contactos/avatar-contacto";
import { MarcoDosPaneles } from "@/components/messages/marco/marco-dos-paneles";
import { MenuHilo } from "@/components/messages/marco/menu-hilo";
import { DialogoAjustesHilo } from "@/components/messages/marco/dialogo-ajustes-hilo";
import { useNombresHilos } from "@/components/messages/marco/nombres-hilos";
import { useEsMovil } from "@/components/messages/marco/use-es-movil";
import { describirSilencio } from "@/components/messages/marco/formato-tiempo";
import { ACENTO, CLASE_ROTULO, pildoraFantasma } from "@/components/messages/marco/estilos";

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

/** Nombre a mostrar para un user_id: «Tú», tu contacto (apodo › nombre) o su perfil. */
type NombrePara = (userId: string) => string;

/** Etiqueta de contraparte para una fila de lista: "de X" o "para X, Y". */
function counterpartLabel(t: MailThreadSummary, nombrePara: NombrePara, myUserId: string | null): string {
    if (t.external) return `externo · ${t.externalTo || "—"}`;
    const isMine = t.creatorId === myUserId;
    if (isMine) {
        const others = t.memberIds.filter((id) => id !== myUserId);
        const names = others.map((id) => nombrePara(id));
        return `para ${names.length ? names.join(", ") : "—"}`;
    }
    return `de ${nombrePara(t.creatorId)}`;
}

/** Quién aparece en el avatar de la fila: el remitente, o el primer destinatario si lo envié yo. */
function contraparteId(t: MailThreadSummary, myUserId: string | null): string | null {
    if (t.external) return null;
    if (t.creatorId === myUserId) return t.memberIds.find((id) => id !== myUserId) ?? null;
    return t.creatorId || null;
}

/**
 * ¿Imagen alojada fuera de StarSeed? (las de fuera pueden avisar al remitente de que abriste el
 * correo). Lo nuestro —datos en línea, rutas internas, este origen y el almacenamiento de
 * Supabase— no cuenta como remoto.
 */
export function esImagenRemota(url: string | undefined | null, origen?: string): boolean {
    if (!url) return false;
    if (url.startsWith("data:") || url.startsWith("blob:") || (url.startsWith("/") && !url.startsWith("//"))) return false;
    try {
        const u = new URL(url, origen || "https://starseed.local");
        const aqui = origen ? new URL(origen).host : typeof window !== "undefined" ? window.location.host : "";
        if (u.host === aqui) return false;
        if (u.host.endsWith(".supabase.co") || u.pathname.startsWith("/storage/v1/")) return false;
        return u.protocol === "http:" || u.protocol === "https:";
    } catch {
        return false;
    }
}

/** Firma al pie de un correo nuevo (con el separador clásico «-- »). */
export function cuerpoConFirma(firma: string): string {
    const f = firma.trim();
    return f ? `\n\n-- \n${f}` : "";
}

// ── Adjuntos ─────────────────────────────────────────────────────────────────

function AttachmentView({ attachment, permitirRemotas }: { attachment: DmAttachment; permitirRemotas: boolean }) {
    if (isInviteLike(attachment) || isNetworkRefLike(attachment)) {
        return <UniversalAttachmentView attachment={attachment} />;
    }

    const Icon = iconFor(attachment.mime, attachment.kind);
    if (attachment.kind === "image" && attachment.url) {
        if (!permitirRemotas && esImagenRemota(attachment.url)) {
            return (
                <span className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 text-center text-[11px] text-white/55">
                    <ImageOff className="h-4 w-4" />
                    Imagen de fuera, sin cargar
                </span>
            );
        }
        return (
            <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block h-24 w-32 cursor-pointer overflow-hidden rounded-xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt={attachment.name || "Imagen"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
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
            className="flex max-w-[220px] cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition-colors duration-200 hover:bg-white/[0.06]"
        >
            <Icon className="size-3.5 shrink-0 text-white/60" />
            <span className="truncate font-medium">{attachment.name || "Archivo adjunto"}</span>
        </a>
    );
}

function PendingAttachmentChip({ a, onRemove }: { a: UniversalAttachment; onRemove: () => void }) {
    const Icon = iconFor(a.mime, a.kind);
    return (
        <span className="ss-redondo inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-2 pr-1 text-[11px]">
            <Icon className="size-3 text-white/60" />
            <span className="max-w-[140px] truncate">{a.name || "adjunto"}</span>
            <button type="button" onClick={onRemove} className="ss-redondo cursor-pointer rounded-full p-0.5 hover:bg-white/10" aria-label="Quitar adjunto">
                <X className="size-3" />
            </button>
        </span>
    );
}

const CLASE_CAMPO =
    "w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-[14px] text-white placeholder:text-white/40 transition-colors focus:border-[#007FFF]/60 focus:bg-white/[0.06] focus:outline-none";
const CLASE_PASTILLA =
    "ss-redondo inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12px] text-white/65 transition-colors duration-200 hover:border-[#007FFF]/40 hover:text-white";

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
                        <span key={p.userId} className="ss-redondo inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-white" style={pildoraFantasma(ACENTO.aurora)}>
                            {p.displayName}
                            <button type="button" aria-label={`Quitar a ${p.displayName}`} className="ss-redondo grid h-5 w-5 cursor-pointer place-items-center rounded-full hover:bg-white/15" onClick={() => onChange(selected.filter((s) => s.userId !== p.userId))}>
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Para: busca por nombre o @usuario…"
                    aria-label="Destinatarios"
                    className={cn(CLASE_CAMPO, "h-10 pl-8")}
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-white/50" />}
            </div>
            {query.trim().length > 0 && (
                <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-1">
                    {results.map((p) => (
                        <button
                            key={p.userId}
                            type="button"
                            onClick={() => { onChange([...selected, p]); setQuery(""); }}
                            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-white/5"
                        >
                            <AvatarContacto nombre={p.displayName} avatarUrl={p.avatarUrl ?? null} tam={28} />
                            <span className="min-w-0">
                                <span className="block truncate text-xs font-semibold">{p.displayName}</span>
                                <span className="block truncate text-[11px] text-white/50">@{p.username}</span>
                            </span>
                        </button>
                    ))}
                    {!searching && results.length === 0 && (
                        <p className="py-2 text-center text-[11px] text-white/50">Sin resultados.</p>
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
    open, onOpenChange, forwardSeed, onSent, firma, confirmarEnvio, onAbrirAjustes,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Si se da, el diálogo redacta un REENVÍO de este contenido. */
    forwardSeed?: ForwardSeed | null;
    onSent: (threadId: string) => void;
    firma: string;
    confirmarEnvio: boolean;
    onAbrirAjustes?: () => void;
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
    const [confirmando, setConfirmando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const firmaRef = useRef(firma);
    firmaRef.current = firma;

    useEffect(() => {
        if (!open) return;
        setRecipients([]);
        setSubject("");
        // (2026-09-28) La firma de Ajustes › Correos va al pie de cada correo NUEVO, editable.
        setBody(isForward ? "" : cuerpoConFirma(firmaRef.current));
        setNote("");
        setAttachments([]);
        setPreview(false);
        setExternal(false);
        setExternalTo("");
        setError(null);
        setConfirmando(false);
        void getLinkedExternalEmail().then(setLinkedExternal);
        void envioExternoDisponible().then(setEnvioReal);
        void miDireccionPublica().then(setMiDireccion);
    }, [open, isForward]);

    const destinoLegible = external
        ? externalTo.trim() || "—"
        : recipients.map((r) => r.displayName).join(", ") || "—";

    const handleSend = useCallback(async () => {
        setError(null);

        if (external) {
            const to = externalTo.trim();
            if (!to.includes("@")) { setError("Escribe un correo externo válido."); setConfirmando(false); return; }
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
                    // (Adenda 206) Deja rastro en el centro de notificaciones:
                    // el correo ya no vive solo dentro de su sección.
                    avisarCorreoEnviado({
                        para: to,
                        asunto: isForward ? `Fwd: ${forwardSeed!.subject}` : (subject || "(sin asunto)"),
                        desde: res.desde,
                        threadId: res.threadId,
                    });
                } else {
                    if (!res.href) { setError(res.error || "No se pudo preparar el envío externo."); return; }
                    if (typeof window !== "undefined") window.location.href = res.href;
                    toast.success("Cliente de correo abierto. Copia guardada en Enviados con etiqueta «Externo».");
                }
                onOpenChange(false);
                if (res.threadId) onSent(res.threadId);
            } finally {
                setSending(false);
                setConfirmando(false);
            }
            return;
        }

        if (!recipients.length) { setError("Añade al menos un destinatario."); setConfirmando(false); return; }
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
            setConfirmando(false);
        }
    }, [external, externalTo, recipients, subject, body, note, attachments, isForward, forwardSeed, onOpenChange, onSent]);

    const pulsarEnviar = () => {
        if (confirmarEnvio && !confirmando) {
            setConfirmando(true);
            return;
        }
        void handleSend();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="gap-0 border-white/10 bg-[rgba(10,12,28,0.97)] p-0 backdrop-blur-2xl max-md:left-0 max-md:top-0 max-md:h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none md:max-h-[88vh] md:max-w-xl md:rounded-[24px]">
                <div className="flex h-full min-h-0 flex-col">
                    <DialogHeader className="shrink-0 border-b border-white/[0.08] px-5 pb-4 pt-5 pr-14 text-left">
                        <DialogTitle className="flex items-center gap-2 text-[17px] font-semibold">
                            {isForward ? <Forward className="size-4 text-[#007FFF]" /> : <PenSquare className="size-4 text-[#007FFF]" />}
                            {isForward ? "Reenviar correo" : "Nuevo correo"}
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-white/55">
                            {isForward ? `Reenvías: «${forwardSeed?.subject}»` : "Busca destinatarios en el directorio de la red StarSeed."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                            <label htmlFor="correo-externo" className="cursor-pointer text-[13px] font-medium text-white/85">Correo externo (a todo internet)</label>
                            <Switch id="correo-externo" checked={external} onCheckedChange={setExternal} className="ss-redondo data-[state=checked]:bg-[#007FFF] data-[state=unchecked]:bg-white/15" />
                        </div>

                        {external ? (
                            <>
                                <input
                                    value={externalTo}
                                    onChange={(e) => setExternalTo(e.target.value)}
                                    placeholder="destinatario@ejemplo.com"
                                    aria-label="Destinatario externo"
                                    className={cn(CLASE_CAMPO, "h-10")}
                                />
                                <p className="text-[12px] text-white/55">
                                    {linkedExternal ? (
                                        <>Tu correo externo vinculado: <span className="font-mono text-white/75">{linkedExternal}</span>. </>
                                    ) : (
                                        <>Aún no has vinculado tu correo de fuera. </>
                                    )}
                                    {onAbrirAjustes && (
                                        <button type="button" onClick={onAbrirAjustes} className="cursor-pointer font-medium text-[#4da3ff] underline-offset-2 hover:underline">
                                            {linkedExternal ? "Cambiarlo en Ajustes" : "Vincularlo en Ajustes"}
                                        </button>
                                    )}
                                </p>
                            </>
                        ) : (
                            <RecipientPicker selected={recipients} onChange={setRecipients} />
                        )}

                        {!isForward && (
                            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" aria-label="Asunto" className={cn(CLASE_CAMPO, "h-10")} />
                        )}

                        {isForward && (
                            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Añade una nota (opcional)" aria-label="Nota del reenvío" className={cn(CLASE_CAMPO, "h-10")} />
                        )}

                        {!isForward && (
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[12px] text-white/50">Cuerpo (markdown)</span>
                                    <button type="button" onClick={() => setPreview((p) => !p)} className="inline-flex cursor-pointer items-center gap-1 text-[12px] text-white/55 transition-colors hover:text-white">
                                        {preview ? <Pencil className="size-3" /> : <Eye className="size-3" />}
                                        {preview ? "Editar" : "Vista previa"}
                                    </button>
                                </div>
                                {preview ? (
                                    <div className="min-h-[140px] rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                                        {body.trim() ? <MessageRenderer text={body} media={false} /> : <p className="text-xs text-white/50">Nada que previsualizar.</p>}
                                    </div>
                                ) : (
                                    <textarea
                                        value={body}
                                        onChange={(e) => setBody(e.target.value)}
                                        placeholder="Escribe tu correo… admite **markdown**"
                                        aria-label="Cuerpo del correo"
                                        rows={8}
                                        className={cn(CLASE_CAMPO, "resize-y py-2.5 leading-relaxed")}
                                    />
                                )}
                            </div>
                        )}

                        {isForward && (
                            <div className="max-h-40 overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                                <p className="mb-1 text-[11px] text-white/50">
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
                                    className={CLASE_PASTILLA}
                                >
                                    <Paperclip className="size-3" /> Adjuntar
                                </AttachFilePickerButton>
                                <InviteComposerButton
                                    onPick={(invite: InviteAttachmentPayload) => setAttachments((prev) => [...prev, invite])}
                                    title="Invitar a grupo/página/evento"
                                    className={CLASE_PASTILLA}
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
                                <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-[12px] text-white/65">
                                    Sale de verdad a cualquier dirección de internet
                                    {miDireccion && envioReal.dominio
                                        ? <> desde <span className="font-mono text-emerald-200">{miDireccion}@{envioReal.dominio}</span></>
                                        : null}
                                    . Las respuestas vuelven a tu bandeja del OS. Los adjuntos aún no viajan en el envío externo.
                                </p>
                            ) : (
                                <p className="rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-2 text-[12px] text-white/65">
                                    Este despliegue todavía no tiene proveedor de envío: se abrirá tu cliente de correo con el
                                    borrador listo y quedará copia en Enviados etiquetada «Externo». Recibir ya funciona en
                                    {envioReal?.dominio ? <span className="font-mono"> @{envioReal.dominio}</span> : " tu dirección pública"}.
                                </p>
                            )
                        )}

                        {error && <p className="text-[13px] text-rose-300" role="alert">{error}</p>}
                    </div>

                    <div className="shrink-0 border-t border-white/[0.08] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        {confirmando ? (
                            <div role="alertdialog" aria-label="Confirmar envío" className="space-y-2.5">
                                <p className="text-[13px] text-white/85">
                                    ¿Enviar {isForward ? "este reenvío" : "este correo"} a <span className="font-semibold text-white">{destinoLegible}</span>?
                                </p>
                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <button type="button" onClick={() => setConfirmando(false)} className="h-10 cursor-pointer rounded-xl bg-white/[0.06] px-4 text-[13px] font-medium text-white/85 hover:bg-white/[0.12]">
                                        Revisar
                                    </button>
                                    <button type="button" onClick={() => void handleSend()} disabled={sending} className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#007FFF] px-5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                                        Sí, enviar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => onOpenChange(false)} className="h-10 cursor-pointer rounded-xl bg-white/[0.06] px-4 text-[13px] font-medium text-white/85 hover:bg-white/[0.12]">
                                    Cancelar
                                </button>
                                <button type="button" onClick={pulsarEnviar} disabled={sending} className="inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#007FFF] px-5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                    {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {external ? "Abrir cliente de correo" : isForward ? "Reenviar" : "Enviar"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Fila de la lista ─────────────────────────────────────────────────────────

interface EstadoCorreo {
    fijado: boolean;
    silenciado: boolean;
    silencioHasta: string | null;
    archivado: boolean;
    etiquetas: string[];
}

function estadoCorreo(aj: AjustesMensajeriaApi, t: MailThreadSummary): EstadoCorreo {
    const ef = aj.efectivos(t.id, "correo");
    const propio = aj.ajustes.hilos[t.id];
    const silencioHasta = propio?.notificaciones?.silencioHasta ?? null;
    return {
        fijado: ef.fijado,
        silenciado: !!describirSilencio(silencioHasta) || propio?.notificaciones?.activas === false,
        silencioHasta,
        archivado: t.flags.archived || ef.archivado,
        etiquetas: propio?.etiquetas ?? [],
    };
}

function MailListItem({
    thread, nombrePara, myUserId, isActive, onSelect, estado, avatarUrl, menu, onContextMenu,
}: {
    thread: MailThreadSummary;
    nombrePara: NombrePara;
    myUserId: string | null;
    isActive: boolean;
    onSelect: () => void;
    estado: EstadoCorreo;
    avatarUrl?: string | null;
    menu: ReactNode;
    onContextMenu: (e: MouseEvent) => void;
}) {
    const counterpart = counterpartLabel(thread, nombrePara, myUserId);
    const otro = contraparteId(thread, myUserId);
    const nombreAvatar = thread.external ? thread.externalTo || "Externo" : otro ? nombrePara(otro) : "?";
    const preview = (thread.lastMessage?.body || "").replace(/\s+/g, " ").slice(0, 110);
    const fuerte = thread.unread && !estado.silenciado;
    return (
        <li onContextMenu={onContextMenu}>
            <div
                className={cn("group flex items-start gap-1 rounded-2xl pr-1 transition-colors duration-150", isActive ? "" : "hover:bg-white/[0.05]")}
                style={isActive ? pildoraFantasma(ACENTO.aurora) : undefined}
            >
                <button
                    type="button"
                    onClick={onSelect}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={`${thread.subject}, ${counterpart}${thread.unread ? ", sin leer" : ""}`}
                    className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-2xl py-2.5 pl-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007FFF]"
                >
                    <span className="relative mt-0.5 shrink-0">
                        <AvatarContacto nombre={nombreAvatar} avatarUrl={avatarUrl ?? null} tam={40} />
                        {thread.unread && (
                            <span
                                aria-hidden
                                className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[#0b0c1c]"
                                style={{ background: estado.silenciado ? "rgba(255,255,255,0.45)" : ACENTO.aurora }}
                            />
                        )}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                            <span className={cn("truncate text-[14px] text-white", fuerte ? "font-bold" : "font-semibold")}>{thread.subject}</span>
                            <span className="ml-auto shrink-0 pl-1 text-[11px] text-white/50">{formatWhen(thread.lastMsgAt)}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-white/55">
                            <span className="min-w-0 truncate">{counterpart}</span>
                            {thread.flags.starred && <Star className="h-3 w-3 shrink-0 fill-[#FFBF00] text-[#FFBF00]" aria-label="Destacado" />}
                            {estado.fijado && <Pin className="h-3 w-3 shrink-0 rotate-45 text-white/55" aria-label="Fijado" />}
                            {estado.silenciado && <BellOff className="h-3 w-3 shrink-0 text-white/45" aria-label="Silenciado" />}
                        </span>
                        <span className={cn("mt-0.5 flex items-center gap-1 truncate text-[13px]", fuerte ? "text-white/80" : "text-white/50")}>
                            {(thread.lastMessage?.attachments.length ?? 0) > 0 && <Paperclip className="size-3 shrink-0" />}
                            <span className="truncate">{preview || "—"}</span>
                        </span>
                        {estado.etiquetas.length > 0 && (
                            <span className="mt-1.5 flex flex-wrap gap-1">
                                {estado.etiquetas.map((e) => (
                                    <span key={e} className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white/80" style={pildoraFantasma(ACENTO.contactos)}>
                                        {e}
                                    </span>
                                ))}
                            </span>
                        )}
                    </span>
                </button>
                <div className="pt-2">{menu}</div>
            </div>
        </li>
    );
}

// ── Lectura + respuesta inline ───────────────────────────────────────────────

function MailReader({
    thread, myUserId, nombrePara, onBack, onChanged, onForward, enfocado, onAlternarEnfoque, onAjustes, onArchivar,
    vista, cargarImagenesRemotas, confirmarEnvio, estado, esMovil,
}: {
    thread: MailThreadSummary;
    myUserId: string | null;
    nombrePara: NombrePara;
    onBack: () => void;
    onChanged: () => void;
    onForward: (seed: ForwardSeed) => void;
    enfocado?: boolean;
    onAlternarEnfoque?: () => void;
    onAjustes: () => void;
    /** Archivar/desarchivar (servidor y ajustes personales a la vez). */
    onArchivar: () => void;
    vista: "conversacion" | "lista";
    cargarImagenesRemotas: boolean;
    confirmarEnvio: boolean;
    estado: EstadoCorreo;
    esMovil: boolean;
}) {
    const [messages, setMessages] = useState<DmMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyBody, setReplyBody] = useState("");
    const [replyAttachments, setReplyAttachments] = useState<UniversalAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [confirmando, setConfirmando] = useState(false);
    const [starred, setStarred] = useState(thread.flags.starred);
    const archived = estado.archivado;
    const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
    const [verRemotas, setVerRemotas] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const rows = await getMailMessages(thread.id);
        setMessages(rows);
        setLoading(false);
    }, [thread.id]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        setVerRemotas(false);
        setAbiertos(new Set());
        setConfirmando(false);
    }, [thread.id]);

    useEffect(() => {
        setStarred(thread.flags.starred);
    }, [thread.flags.starred]);

    // Marca como leído al abrir (best-effort, no bloquea la lectura).
    useEffect(() => {
        if (thread.unread) void markMailRead(thread.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread.id]);

    useEffect(() => subscribeMailThread(thread.id, (payload) => {
        if (payload.eventType === "INSERT") {
            const m = messageFromRealtimeRow(payload.new as Parameters<typeof messageFromRealtimeRow>[0]);
            if (m) setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
        } else {
            void load();
        }
    }), [thread.id, load]);

    const counterpart = counterpartLabel(thread, nombrePara, myUserId);
    const permitirRemotas = cargarImagenesRemotas || verRemotas;
    const hayRemotas = !cargarImagenesRemotas && messages.some((m) => m.attachments.some((a) => a.kind === "image" && esImagenRemota(a.url)));

    const enviarRespuesta = useCallback(async () => {
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
            setConfirmando(false);
        }
    }, [replyBody, replyAttachments, thread.id, onChanged]);

    const handleReply = () => {
        if (confirmarEnvio && !confirmando) {
            setConfirmando(true);
            return;
        }
        void enviarRespuesta();
    };

    const handleForward = () => {
        const last = messages[messages.length - 1];
        if (!last) return;
        onForward({
            subject: thread.subject,
            body: last.body,
            senderLabel: nombrePara(last.sender || thread.creatorId),
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

    const botonCabecera = "ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007FFF] disabled:cursor-not-allowed disabled:opacity-40";

    return (
        <div className="flex h-full min-h-0 flex-col">
            <header className="flex shrink-0 items-center gap-1.5 border-b border-white/[0.08] px-3 py-3 sm:px-4">
                {esMovil && (
                    <button type="button" className={botonCabecera} onClick={onBack} aria-label="Volver a la bandeja" title="Volver a la bandeja">
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                )}
                <div className="min-w-0 flex-1 px-1">
                    <p className="truncate text-[15px] font-semibold text-white">{thread.subject}</p>
                    <p className="truncate text-[12px] text-white/55">
                        {counterpart}
                        {estado.silenciado && " · silenciado"}
                    </p>
                </div>
                <button type="button" className={botonCabecera} aria-label={starred ? "Quitar destacado" : "Destacar"} title={starred ? "Quitar destacado" : "Destacar"} onClick={() => void toggleStar()}>
                    <Star className={cn("h-4 w-4", starred && "fill-[#FFBF00] text-[#FFBF00]")} />
                </button>
                <button type="button" className={botonCabecera} aria-label={archived ? "Desarchivar" : "Archivar"} title={archived ? "Desarchivar" : "Archivar"} onClick={onArchivar}>
                    {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </button>
                {!thread.external && (
                    <button type="button" className={botonCabecera} aria-label="Reenviar" title="Reenviar" onClick={handleForward} disabled={messages.length === 0}>
                        <Forward className="h-4 w-4" />
                    </button>
                )}
                <button type="button" className={botonCabecera} aria-label="Ajustes de este correo" title="Ajustes de este correo" onClick={onAjustes}>
                    <Settings2 className="h-4 w-4" />
                </button>
                {!esMovil && onAlternarEnfoque && (
                    <button
                        type="button"
                        className={botonCabecera}
                        aria-pressed={!!enfocado}
                        aria-label={enfocado ? "Salir del modo enfoque (Esc)" : "Modo enfoque: leer a todo el ancho"}
                        title={enfocado ? "Salir del modo enfoque (Esc)" : "Modo enfoque: leer a todo el ancho"}
                        onClick={onAlternarEnfoque}
                        style={enfocado ? pildoraFantasma(ACENTO.aurora) : undefined}
                    >
                        {enfocado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className={cn("space-y-3 px-4 py-5 sm:px-6", enfocado ? "mx-auto max-w-4xl" : "max-w-3xl")}>
                    {thread.external && (
                        <div className="flex w-fit items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-500/5 px-3 py-1.5 text-[12px] text-amber-200/90">
                            <ExternalLink className="size-3" /> Externo · enviado como mailto: a {thread.externalTo}
                        </div>
                    )}
                    {hayRemotas && !verRemotas && (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-white/70" style={pildoraFantasma(ACENTO.ambar)}>
                            <ImageOff className="h-3.5 w-3.5 shrink-0" />
                            <span className="min-w-0 flex-1">Hay imágenes de fuera de StarSeed sin cargar: podrían avisar al remitente de que lo abriste.</span>
                            <button type="button" onClick={() => setVerRemotas(true)} className="cursor-pointer rounded-lg bg-white/[0.08] px-2.5 py-1 font-semibold text-white hover:bg-white/[0.14]">
                                Mostrar imágenes
                            </button>
                        </div>
                    )}
                    {loading ? (
                        <p className="flex items-center gap-2 text-[13px] text-white/55"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</p>
                    ) : messages.length === 0 ? (
                        <p className="text-[13px] text-white/55">Este correo no tiene contenido.</p>
                    ) : (
                        messages.map((m, i) => {
                            const ultimo = i === messages.length - 1;
                            const plegado = vista === "lista" && !ultimo && !abiertos.has(m.id);
                            const remitente = nombrePara(m.sender || "");
                            if (plegado) {
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => setAbiertos((prev) => new Set(prev).add(m.id))}
                                        aria-expanded={false}
                                        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
                                    >
                                        <AvatarContacto nombre={remitente} tam={28} />
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-center gap-2 text-[12px]">
                                                <span className="font-semibold text-white/85">{remitente}</span>
                                                <span className="text-white/45">{formatWhen(m.createdAt)}</span>
                                            </span>
                                            <span className="block truncate text-[13px] text-white/50">{m.deleted ? "Mensaje eliminado." : m.body.replace(/\s+/g, " ")}</span>
                                        </span>
                                        <ChevronDown className="h-4 w-4 shrink-0 text-white/40" />
                                    </button>
                                );
                            }
                            return (
                                <article key={m.id} className="space-y-2 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3.5">
                                    <div className="flex items-center gap-2.5 text-[12px] text-white/55">
                                        <AvatarContacto nombre={remitente} tam={28} />
                                        <span className="font-semibold text-white/85">{remitente}</span>
                                        <span>·</span>
                                        <span>{formatWhen(m.createdAt)}</span>
                                        {m.editedAt && <span className="italic">(editado)</span>}
                                    </div>
                                    {m.deleted ? (
                                        <p className="text-sm italic text-white/50">Mensaje eliminado.</p>
                                    ) : (
                                        <div className="text-[15px] leading-relaxed text-white/90">
                                            <MessageRenderer text={m.body} media={false} />
                                        </div>
                                    )}
                                    {m.attachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-1">
                                            {m.attachments.map((a, j) => <AttachmentView key={j} attachment={a} permitirRemotas={permitirRemotas} />)}
                                        </div>
                                    )}
                                </article>
                            );
                        })
                    )}
                </div>
            </div>

            {!thread.external && (
                <div className="shrink-0 space-y-2 border-t border-white/[0.08] px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
                    <textarea
                        value={replyBody}
                        onChange={(e) => { setReplyBody(e.target.value); setConfirmando(false); }}
                        placeholder="Responder… admite markdown"
                        aria-label="Respuesta"
                        rows={2}
                        className={cn(CLASE_CAMPO, "resize-none py-2")}
                    />
                    {confirmando ? (
                        <div role="alertdialog" aria-label="Confirmar respuesta" className="flex flex-wrap items-center justify-end gap-2">
                            <span className="mr-auto text-[13px] text-white/80">¿Enviar la respuesta?</span>
                            <button type="button" onClick={() => setConfirmando(false)} className="h-9 cursor-pointer rounded-xl bg-white/[0.06] px-3 text-[13px] font-medium text-white/85 hover:bg-white/[0.12]">
                                Revisar
                            </button>
                            <button type="button" onClick={() => void enviarRespuesta()} disabled={sending} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-[#007FFF] px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                                Sí, enviar
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <AttachFilePickerButton
                                    onPick={(picked) => setReplyAttachments((prev) => [...prev, ...picked])}
                                    folder="correos"
                                    title="Adjuntar a la respuesta"
                                    className={cn(CLASE_PASTILLA, "shrink-0")}
                                >
                                    <Paperclip className="size-3" /> Adjuntar
                                </AttachFilePickerButton>
                                <InviteComposerButton
                                    onPick={(invite: InviteAttachmentPayload) => setReplyAttachments((prev) => [...prev, invite])}
                                    title="Invitar a grupo/página/evento"
                                    className={cn(CLASE_PASTILLA, "shrink-0")}
                                >
                                    <Mail className="size-3" /> Invitar
                                </InviteComposerButton>
                                {replyAttachments.map((a, i) => (
                                    <PendingAttachmentChip key={i} a={a} onRemove={() => setReplyAttachments((prev) => prev.filter((_, j) => j !== i))} />
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={handleReply}
                                disabled={sending || (!replyBody.trim() && replyAttachments.length === 0)}
                                className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#007FFF] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                                Responder
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Panel principal de Correos ───────────────────────────────────────────────

export interface CorreosPanelProps {
    userId: string | null;
    /** Modo enfoque del lector (lo gobierna la página). */
    enfocado?: boolean;
    onAlternarEnfoque?: () => void;
    /** Abre los Ajustes de Mensajería (p. ej. para vincular la dirección externa). */
    onAbrirAjustes?: () => void;
    /** Avisa de si hay un correo abierto (el botón de enfoque solo tiene sentido entonces). */
    onLectorAbierto?: (abierto: boolean) => void;
}

const FOLDERS: Array<[MailFolder, string, typeof Inbox]> = [
    ["inbox", "Recibidos", Inbox],
    ["sent", "Enviados", Send],
    ["starred", "Destacados", Star],
    ["archived", "Archivados", Archive],
];

/** Une listas de hilos sin repetir (la más reciente primero). */
function unir(...listas: MailThreadSummary[][]): MailThreadSummary[] {
    const vistos = new Map<string, MailThreadSummary>();
    for (const l of listas) for (const t of l) if (!vistos.has(t.id)) vistos.set(t.id, t);
    return Array.from(vistos.values()).sort((a, b) => new Date(b.lastMsgAt).getTime() - new Date(a.lastMsgAt).getTime());
}

export function CorreosPanel({ userId, enfocado = false, onAlternarEnfoque, onAbrirAjustes, onLectorAbierto }: CorreosPanelProps) {
    const aj = useAjustesMensajeria();
    const libreta = useContactos();
    const { registrar } = useNombresHilos();
    const esMovil = useEsMovil();
    const [folder, setFolder] = useState<MailFolder>("inbox");
    const [threads, setThreads] = useState<MailThreadSummary[]>([]);
    const [profiles, setProfiles] = useState<Record<string, OsProfile>>({});
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [composeOpen, setComposeOpen] = useState(false);
    const [forwardSeed, setForwardSeed] = useState<ForwardSeed | null>(null);
    const [search, setSearch] = useState("");
    const [etiqueta, setEtiqueta] = useState<string | null>(null);
    const [menuAbierto, setMenuAbierto] = useState<string | null>(null);
    const [ajustesDe, setAjustesDe] = useState<{ id: string; titulo: string } | null>(null);

    // Los avisos leen SIEMPRE los ajustes más recientes (sin recrear `load`).
    const ajRef = useRef(aj);
    ajRef.current = aj;

    // (Adenda 206) La primera carga SIEMBRA los hilos ya existentes como
    // avisados: si no, al abrir Correos el histórico entero se volcaría de
    // golpe en el centro de notificaciones. A partir de ahí, cada hilo nuevo
    // sin leer que aparezca sí avisa (salvo que lo hayas silenciado).
    const primeraCargaRef = useRef(true);

    const load = useCallback(async (which: MailFolder) => {
        // Archivados = los archivados en el servidor + los que archivaste en tus ajustes.
        const rows = which === "archived"
            ? unir(...(await Promise.all([listMailThreads("archived"), listMailThreads("inbox"), listMailThreads("sent")])))
            : await listMailThreads(which);
        setThreads(rows);

        if (which === "inbox") {
            if (primeraCargaRef.current) {
                primeraCargaRef.current = false;
                sembrarAvisados(rows.map((t) => t.id));
            } else {
                for (const t of rows) {
                    if (!t.unread) continue;
                    const ef = ajRef.current.efectivos(t.id, "correo");
                    if (ef.silenciado || !ef.notificaciones.activas || ef.archivado) continue;
                    avisarCorreoRecibido({
                        de: t.externalTo || "la red StarSeed",
                        asunto: ef.notificaciones.vistaPrevia ? (t.subject || "(sin asunto)") : "Nuevo correo",
                        id: t.id,
                        externo: !!t.external,
                    });
                }
            }
        }

        const ids = Array.from(new Set(rows.flatMap((t) => [t.creatorId, ...t.memberIds]).filter(Boolean)));
        if (ids.length) {
            const perfiles = await fetchProfilesByIds(ids);
            setProfiles((prev) => ({ ...prev, ...perfiles }));
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        setLoading(true);
        setSelectedId(null);
        setEtiqueta(null);
        void load(folder);
    }, [folder, load]);

    useEffect(() => subscribeMailThreadsList(() => void load(folder)), [folder, load]);

    // Nombres de los correos para «Chats personalizados» de los Ajustes.
    useEffect(() => {
        if (!threads.length) return;
        registrar(Object.fromEntries(threads.map((t) => [t.id, { nombre: t.subject || "(sin asunto)", tipo: "correo" as const }])));
    }, [threads, registrar]);

    const nombrePara = useCallback<NombrePara>(
        (uid) => {
            if (uid && uid === userId) return "Tú";
            const c = uid ? libreta.porUserId(uid) : undefined;
            if (c) return c.apodo || c.nombre;
            return profiles[uid]?.displayName || profiles[uid]?.username || "Alguien";
        },
        [userId, libreta, profiles],
    );

    const estados = useMemo(() => {
        const m = new Map<string, EstadoCorreo>();
        for (const t of threads) m.set(t.id, estadoCorreo(aj, t));
        return m;
    }, [threads, aj]);

    // Carpeta + ajustes personales (archivados fuera de Recibidos/Enviados/Destacados).
    const enCarpeta = useMemo(
        () => threads.filter((t) => {
            const archivado = estados.get(t.id)?.archivado ?? false;
            // Destacados enseña lo destacado aunque esté archivado (como siempre).
            if (folder === "starred") return true;
            return folder === "archived" ? archivado : !archivado;
        }),
        [threads, estados, folder],
    );

    const etiquetasDisponibles = useMemo(
        () => Array.from(new Set(enCarpeta.flatMap((t) => estados.get(t.id)?.etiquetas ?? []))).sort((a, b) => a.localeCompare(b, "es")),
        [enCarpeta, estados],
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return enCarpeta.filter((t) => {
            if (etiqueta && !(estados.get(t.id)?.etiquetas ?? []).includes(etiqueta)) return false;
            if (!q) return true;
            const hay = [t.subject, t.lastMessage?.body, t.externalTo, counterpartLabel(t, nombrePara, userId)].filter(Boolean).join(" ").toLowerCase();
            return hay.includes(q);
        });
    }, [enCarpeta, search, etiqueta, estados, nombrePara, userId]);

    const fijados = filtered.filter((t) => estados.get(t.id)?.fijado);
    const resto = filtered.filter((t) => !estados.get(t.id)?.fijado);

    const unreadInbox = useMemo(
        () => (folder === "inbox" ? enCarpeta.filter((t) => t.unread && !estados.get(t.id)?.silenciado).length : 0),
        [enCarpeta, folder, estados],
    );
    const selected = useMemo(() => threads.find((t) => t.id === selectedId) || null, [threads, selectedId]);

    useEffect(() => {
        onLectorAbierto?.(!!selected);
    }, [selected, onLectorAbierto]);

    const handleSent = useCallback((threadId: string) => {
        setForwardSeed(null);
        setFolder("sent");
        void load("sent").then(() => setSelectedId(threadId));
    }, [load]);

    const archivarCorreo = async (t: MailThreadSummary, estado: EstadoCorreo) => {
        if (estado.archivado) {
            if (t.flags.archived) await setMailArchived(t.id, false);
            if (aj.ajustes.hilos[t.id]?.archivado) aj.cambiarHilo(t.id, { archivado: false });
            toast.success("Correo desarchivado.");
        } else {
            await setMailArchived(t.id, true);
            toast.success("Correo archivado.");
        }
        if (selectedId === t.id) setSelectedId(null);
        void load(folder);
    };

    const fila = (t: MailThreadSummary) => {
        const estado = estados.get(t.id) ?? estadoCorreo(aj, t);
        const otro = contraparteId(t, userId);
        const avatar = otro ? libreta.porUserId(otro)?.perfil?.avatarUrl || profiles[otro]?.avatarUrl : null;
        return (
            <MailListItem
                key={t.id}
                thread={t}
                nombrePara={nombrePara}
                myUserId={userId}
                isActive={selectedId === t.id}
                onSelect={() => setSelectedId(t.id)}
                estado={estado}
                avatarUrl={avatar}
                onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuAbierto(t.id);
                }}
                menu={
                    <MenuHilo
                        etiqueta={`Opciones del correo «${t.subject}»`}
                        orientacion="vertical"
                        abierto={menuAbierto === t.id}
                        onAbiertoChange={(v) => setMenuAbierto(v ? t.id : null)}
                        fijado={estado.fijado}
                        silencioHasta={estado.silencioHasta}
                        archivado={estado.archivado}
                        formato24h={aj.ajustes.chats.apariencia.formato24h}
                        onFijar={() => aj.cambiarHilo(t.id, { fijado: !estado.fijado })}
                        onSilenciar={(hasta) => aj.cambiarHilo(t.id, { notificaciones: { silencioHasta: hasta } })}
                        onArchivar={() => void archivarCorreo(t, estado)}
                        onMarcarLeido={t.unread ? () => void markMailRead(t.id).then(() => load(folder)) : undefined}
                        onAjustes={() => setAjustesDe({ id: t.id, titulo: t.subject })}
                        etiquetaAjustes="Ajustes de este correo"
                        extrasAntes={[
                            {
                                id: "destacar",
                                etiqueta: t.flags.starred ? "Quitar destacado" : "Destacar",
                                icono: Star,
                                color: ACENTO.ambar,
                                onSelect: () => void setMailStarred(t.id, !t.flags.starred).then(() => load(folder)),
                            },
                        ]}
                        className="opacity-70 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                    />
                }
            />
        );
    };

    const compositor = (
        <ComposeDialog
            open={composeOpen || !!forwardSeed}
            onOpenChange={(o) => { setComposeOpen(o); if (!o) setForwardSeed(null); }}
            forwardSeed={forwardSeed}
            onSent={handleSent}
            firma={aj.ajustes.correos.firma}
            confirmarEnvio={aj.ajustes.correos.confirmarEnvio}
            onAbrirAjustes={onAbrirAjustes ? () => { setComposeOpen(false); setForwardSeed(null); onAbrirAjustes(); } : undefined}
        />
    );

    const lista = (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[20px] font-semibold tracking-tight text-white">Correos</h2>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            className="ss-redondo grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                            aria-label="Actualizar"
                            title="Actualizar"
                            onClick={() => void load(folder)}
                        >
                            <RefreshCcw className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setComposeOpen(true)}
                            disabled={!userId}
                            title={userId ? "Redactar correo" : "Inicia sesión para redactar"}
                            className="ss-redondo inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white transition-transform duration-150 hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40"
                            style={pildoraFantasma(ACENTO.aurora)}
                        >
                            <PenSquare className="h-4 w-4" /> Redactar
                        </button>
                    </div>
                </div>

                <div role="group" aria-label="Carpetas" className="flex flex-wrap gap-1.5">
                    {FOLDERS.map(([key, label, Icon]) => {
                        const activa = folder === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={activa}
                                onClick={() => setFolder(key)}
                                className={cn(
                                    "ss-redondo inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-all duration-150",
                                    activa ? "text-white" : "text-white/60 hover:text-white",
                                )}
                                style={pildoraFantasma(ACENTO.aurora, activa)}
                            >
                                <Icon className="h-3.5 w-3.5" /> {label}
                                {key === "inbox" && unreadInbox > 0 && (
                                    <span className="ml-0.5 min-w-[18px] rounded-full bg-[#007FFF] px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unreadInbox}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                        placeholder="Buscar en tus correos…"
                        aria-label="Buscar en tus correos"
                        className={cn(CLASE_CAMPO, "h-10 rounded-2xl pl-9 pr-9")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button type="button" aria-label="Borrar búsqueda" className="ss-redondo absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white" onClick={() => setSearch("")}>
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {etiquetasDisponibles.length > 0 && (
                    <div role="group" aria-label="Etiquetas" className="flex flex-wrap items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-white/45" aria-hidden />
                        {etiquetasDisponibles.map((e) => (
                            <button
                                key={e}
                                type="button"
                                aria-pressed={etiqueta === e}
                                onClick={() => setEtiqueta((cur) => (cur === e ? null : e))}
                                className={cn("ss-redondo cursor-pointer rounded-full px-2.5 py-0.5 text-[12px] font-medium transition-colors", etiqueta === e ? "text-white" : "text-white/60 hover:text-white")}
                                style={pildoraFantasma(ACENTO.contactos, etiqueta === e)}
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {!userId && !loading && (
                    <div className="mx-2 mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-white/65" style={pildoraFantasma(ACENTO.aurora)}>
                        <Lock className="h-3.5 w-3.5 shrink-0" />
                        <span>
                            <Link href="/login" className="cursor-pointer font-medium text-white underline">Inicia sesión</Link> para ver y redactar tus correos.
                        </span>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-white/55" role="status">
                        <Mail className="mb-2 h-8 w-8 animate-pulse opacity-40" />
                        <p className="text-sm">Cargando tu buzón…</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-14 text-center text-white/55" role="status">
                        <MailOpen className="mb-3 h-10 w-10 opacity-30" />
                        {search ? (
                            <p className="text-sm">Sin resultados para «{search}».</p>
                        ) : etiqueta ? (
                            <p className="text-sm">Ningún correo con la etiqueta «{etiqueta}» aquí.</p>
                        ) : folder === "inbox" ? (
                            <>
                                <p className="text-sm font-medium text-white/80">No tienes correos recibidos.</p>
                                <p className="mt-1 text-xs">Cuando alguien te escriba, aparecerá aquí.</p>
                            </>
                        ) : folder === "sent" ? (
                            <p className="text-sm font-medium text-white/80">No has enviado correos todavía.</p>
                        ) : folder === "starred" ? (
                            <p className="text-sm font-medium text-white/80">No tienes correos destacados.</p>
                        ) : (
                            <p className="text-sm font-medium text-white/80">No tienes correos archivados.</p>
                        )}
                    </div>
                ) : (
                    <>
                        {fijados.length > 0 && (
                            <>
                                <p className={cn(CLASE_ROTULO, "px-3 pb-1 pt-1")}>Fijados</p>
                                <ul className="space-y-0.5" aria-label="Correos fijados">{fijados.map(fila)}</ul>
                                {resto.length > 0 && <p className={cn(CLASE_ROTULO, "px-3 pb-1 pt-3")}>Correos</p>}
                            </>
                        )}
                        <ul className="space-y-0.5" aria-label="Correos">{resto.map(fila)}</ul>
                    </>
                )}
            </div>
        </div>
    );

    const estadoSel = selected ? estados.get(selected.id) ?? estadoCorreo(aj, selected) : null;
    const detalle = selected && estadoSel ? (
        <MailReader
            thread={selected}
            myUserId={userId}
            nombrePara={nombrePara}
            onBack={() => setSelectedId(null)}
            onChanged={() => void load(folder)}
            onForward={(seed) => setForwardSeed(seed)}
            enfocado={enfocado}
            onAlternarEnfoque={onAlternarEnfoque}
            onAjustes={() => setAjustesDe({ id: selected.id, titulo: selected.subject })}
            onArchivar={() => void archivarCorreo(selected, estadoSel)}
            vista={aj.ajustes.correos.vista}
            cargarImagenesRemotas={aj.ajustes.correos.cargarImagenesRemotas}
            confirmarEnvio={aj.ajustes.correos.confirmarEnvio}
            estado={estadoSel}
            esMovil={esMovil}
        />
    ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-white/55">
            <span className="grid h-16 w-16 place-items-center rounded-3xl" style={pildoraFantasma(ACENTO.aurora)}>
                <Mail className="h-7 w-7 text-white/80" />
            </span>
            <p className="text-[15px] font-medium text-white/80">Elige un correo para leerlo</p>
            <p className="max-w-xs text-[13px]">O escribe uno nuevo a cualquier persona de la red.</p>
        </div>
    );

    return (
        <>
            {compositor}
            <MarcoDosPaneles
                lista={lista}
                detalle={detalle}
                verDetalle={!!selected}
                enfocado={enfocado && !!selected}
                esMovil={esMovil}
                etiquetaLista="Bandeja de correo"
                etiquetaDetalle="Correo abierto"
                claveDetalle={selected?.id ?? "vacio"}
            />
            <DialogoAjustesHilo
                open={!!ajustesDe}
                onOpenChange={(v) => !v && setAjustesDe(null)}
                hiloId={ajustesDe?.id ?? null}
                tipo="correo"
                titulo={ajustesDe?.titulo ?? ""}
            />
        </>
    );
}

export default CorreosPanel;
