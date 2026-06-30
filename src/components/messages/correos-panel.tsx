"use client";

// src/components/messages/correos-panel.tsx
// -----------------------------------------------------------------------------
// MÓDULO MENSAJES — Sección "Correos" (buzón interno @star.seed) · ADITIVO
//
// Unifica el correo interno (Correos / buzón @star.seed) con los chats dentro
// del módulo de Mensajes. Reutiliza ÍNTEGRAMENTE el backend de correo ya
// existente (`@/lib/mail/starseed-mail`) — NO crea tablas ni APIs nuevas:
//   · listInbox("inbox"|"sent")  → bandeja real (tabla `ss_mail`, RLS por user).
//   · sendInternalMail({...})    → enviar correo interno (@star.seed).
//   · markRead(id)               → marcar leído.
//   · listAccountEmails()        → resuelve la dirección interna del usuario.
// Realtime con el mismo primitivo del módulo (`useRealtime`) sobre `ss_mail`.
//
// Estructura visual (alineada con la estética shadcn/Tailwind de Mensajes):
//   · Lista de correos (Recibidos / Enviados) con badge de no-leídos.
//   · Panel de lectura del correo seleccionado.
//   · Acción "Redactar" (compose) con destinatario @star.seed, asunto y cuerpo.
//   · Entrada de "creación de cuenta unificada": enlaces a /bienvenida (crear
//     identidad + @star.seed) y /cuenta (gestionar identidad/correos). NO se
//     duplica lógica: sólo se enlaza al flujo existente.
//
// Defensivo: guards/try-catch en el backend; estados vacíos y de carga; SSR-safe
// (todas las llamadas suceden en efectos/manejadores cliente). Los chats siguen
// funcionando intactos: este panel es una vista hermana, no reemplaza nada.
// -----------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import {
    Inbox, Send, Mail, PenSquare, ArrowLeft, RefreshCcw, AtSign,
    UserPlus, ShieldCheck, X, Search, MailOpen,
} from "lucide-react";
import { useRealtime } from "@/lib/realtime/realtime";
import {
    listInbox,
    sendInternalMail,
    markRead,
    listAccountEmails,
    type SsMail,
    type AccountEmail,
} from "@/lib/mail/starseed-mail";

type MailFolder = "inbox" | "sent";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatWhen(raw?: string | null): string {
    if (!raw) return "";
    try {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return "";
        return d.toLocaleString("es", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

function initialsFromAddress(addr?: string | null): string {
    const a = (addr || "").trim();
    if (!a) return "@";
    const local = a.split("@")[0] || a;
    return local.slice(0, 2).toUpperCase();
}

// ── Entrada de creación de cuenta unificada ──────────────────────────────────
// Sólo ENLAZA al flujo existente (/bienvenida crea identidad + @star.seed,
// /cuenta gestiona identidad/correos). No duplica ninguna lógica de signUp.

function UnifiedAccountCallout({ hasInternal }: { hasInternal: boolean }) {
    return (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
            <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0">
                    <AtSign className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight">
                        {hasInternal
                            ? "Tu cuenta StarSeed unificada"
                            : "Crea tu cuenta StarSeed unificada"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {hasInternal
                            ? "Gestiona tu identidad (@handle), tu dirección @star.seed y tus correos vinculados."
                            : "Una identidad (@handle), tu dirección de correo @star.seed y tu recuperación, todo en un paso."}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                        {!hasInternal && (
                            <Button asChild size="sm" className="h-8 cursor-pointer">
                                <Link href="/bienvenida">
                                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                                    Crear cuenta + @star.seed
                                </Link>
                            </Button>
                        )}
                        <Button
                            asChild
                            size="sm"
                            variant={hasInternal ? "default" : "outline"}
                            className="h-8 cursor-pointer"
                        >
                            <Link href="/cuenta">
                                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                                Gestionar identidad y correos
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Compositor de correo interno (@star.seed) ────────────────────────────────

function MailComposer({
    fromAddress,
    onClose,
    onSent,
}: {
    fromAddress: string;
    onClose: () => void;
    onSent: (note?: string) => void;
}) {
    const [to, setTo] = useState("");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSend = useCallback(async () => {
        const dst = to.trim().toLowerCase();
        if (!dst.endsWith("@star.seed")) {
            setError("El destinatario interno debe terminar en @star.seed.");
            return;
        }
        setError(null);
        setSending(true);
        try {
            const res = await sendInternalMail({
                fromAddress: fromAddress || "tu@star.seed",
                toAddress: dst,
                subject,
                body,
            });
            if (res.ok) {
                onSent(res.error); // `error` aquí puede ser una nota informativa (entrega pendiente).
            } else {
                setError(res.error || "No se pudo enviar el correo.");
            }
        } catch (e) {
            setError((e as Error)?.message || "No se pudo enviar el correo.");
        } finally {
            setSending(false);
        }
    }, [to, subject, body, fromAddress, onSent]);

    return (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <PenSquare className="w-4 h-4 text-primary" />
                    <p className="text-sm font-semibold">Nuevo correo interno</p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    onClick={onClose}
                    title="Cerrar"
                >
                    <X className="w-3.5 h-3.5" />
                </Button>
            </div>

            <div className="space-y-2">
                <Input
                    autoFocus
                    placeholder="alguien@star.seed"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-9 text-sm font-mono"
                />
                <Input
                    placeholder="Asunto"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-9 text-sm"
                />
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Escribe tu mensaje interno…"
                    rows={5}
                    className="w-full resize-none rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
                />
            </div>

            {error && (
                <p className="text-xs text-destructive">{error}</p>
            )}

            <div className="flex items-center gap-2">
                <Button
                    size="sm"
                    className="h-8 cursor-pointer"
                    onClick={handleSend}
                    disabled={sending}
                >
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    {sending ? "Enviando…" : "Enviar"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                    Entrega dentro de la red StarSeed (cuentas @star.seed).
                </span>
            </div>
        </div>
    );
}

// ── Lectura de un correo ─────────────────────────────────────────────────────

function MailReader({
    mail,
    folder,
    onBack,
}: {
    mail: SsMail;
    folder: MailFolder;
    onBack: () => void;
}) {
    const counterpart = folder === "inbox" ? mail.from_address : mail.to_address;
    return (
        <div className="flex flex-col h-full">
            <header className="flex items-center gap-3 px-4 py-3 border-b bg-background/80 backdrop-blur-xl shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer shrink-0 h-8 w-8"
                    onClick={onBack}
                    title="Volver a la bandeja"
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-xs font-semibold">
                        {initialsFromAddress(counterpart)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                        {mail.subject || "(sin asunto)"}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                        {folder === "inbox" ? "de " : "para "}
                        {counterpart || "—"}
                    </p>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatWhen(mail.created_at)}
                </span>
            </header>

            <ScrollArea className="flex-1">
                <div className="px-5 py-4 max-w-2xl">
                    <div className="text-[11px] text-muted-foreground font-mono mb-4 space-y-0.5">
                        <p>De: {mail.from_address || "—"}</p>
                        <p>Para: {mail.to_address || "—"}</p>
                    </div>
                    <Separator className="mb-4" />
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {mail.body || "(vacío)"}
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}

// ── Item de la lista de correos ──────────────────────────────────────────────

function MailListItem({
    mail,
    folder,
    isActive,
    onSelect,
}: {
    mail: SsMail;
    folder: MailFolder;
    isActive: boolean;
    onSelect: () => void;
}) {
    const counterpart = folder === "inbox" ? mail.from_address : mail.to_address;
    const unread = folder === "inbox" && !mail.read;
    return (
        <button
            onClick={onSelect}
            className={cn(
                "flex items-start gap-3 w-full p-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer border",
                isActive
                    ? "bg-primary/10 border-primary/20 shadow-sm"
                    : "hover:bg-muted/60 border-transparent",
            )}
        >
            <div className="relative shrink-0">
                <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs font-semibold">
                        {initialsFromAddress(counterpart)}
                    </AvatarFallback>
                </Avatar>
                {unread && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-background" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                    <p
                        className={cn(
                            "truncate text-sm",
                            unread ? "font-bold" : "font-semibold",
                        )}
                    >
                        {mail.subject || "(sin asunto)"}
                    </p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatWhen(mail.created_at)}
                    </span>
                </div>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {folder === "inbox" ? "de " : "para "}
                    {counterpart || "—"}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {(mail.body || "").slice(0, 90) || "—"}
                </p>
            </div>
        </button>
    );
}

// ── Panel principal de Correos ───────────────────────────────────────────────

export function CorreosPanel({ userId }: { userId: string | null }) {
    const [folder, setFolder] = useState<MailFolder>("inbox");
    const [mail, setMail] = useState<SsMail[]>([]);
    const [loading, setLoading] = useState(true);
    const [emails, setEmails] = useState<AccountEmail[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [composing, setComposing] = useState(false);
    const [search, setSearch] = useState("");
    const [note, setNote] = useState<string | null>(null);

    const internal = useMemo(
        () => emails.find((e) => e.kind === "internal") || null,
        [emails],
    );
    const internalAddress = internal?.address || "";
    const hasInternal = !!internalAddress;

    const flash = useCallback((t: string) => {
        setNote(t);
        window.setTimeout(() => setNote(null), 4500);
    }, []);

    // Carga la bandeja seleccionada (defensivo: degrada a lista vacía).
    const loadMail = useCallback(async (which: MailFolder) => {
        try {
            const rows = await listInbox(which);
            setMail(Array.isArray(rows) ? rows : []);
        } catch {
            setMail([]);
        }
    }, []);

    // Resuelve los correos de la cuenta (para la dirección interna @star.seed).
    const loadEmails = useCallback(async () => {
        try {
            const list = await listAccountEmails();
            setEmails(Array.isArray(list) ? list : []);
        } catch {
            setEmails([]);
        }
    }, []);

    // Carga inicial.
    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            await Promise.all([loadEmails(), loadMail("inbox")]);
            if (active) setLoading(false);
        })();
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // Recarga al cambiar de carpeta (Recibidos/Enviados).
    useEffect(() => {
        void loadMail(folder);
        setSelectedId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folder]);

    // Realtime: buzón interno (`ss_mail`). Escuchamos lo dirigido a mí y lo que
    // envío, y recargamos la carpeta activa. RLS sigue aplicándose en servidor.
    useRealtime(
        "ss_mail",
        { filter: userId ? `to_user=eq.${userId}` : undefined },
        () => { void loadMail(folder); },
    );
    useRealtime(
        "ss_mail",
        { filter: userId ? `from_user=eq.${userId}` : undefined },
        () => { void loadMail(folder); },
    );
    // Realtime: correos vinculados (puede cambiar la dirección interna).
    useRealtime(
        "account_emails",
        { filter: userId ? `user_id=eq.${userId}` : undefined },
        () => { void loadEmails(); },
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return mail;
        return mail.filter((m) => {
            const hay = [m.subject, m.body, m.from_address, m.to_address]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [mail, search]);

    const unreadCount = useMemo(
        () => (folder === "inbox" ? mail.filter((m) => !m.read).length : 0),
        [mail, folder],
    );

    const selected = useMemo(
        () => mail.find((m) => m.id === selectedId) || null,
        [mail, selectedId],
    );

    const handleOpen = useCallback(
        async (m: SsMail) => {
            setSelectedId(m.id);
            if (folder === "inbox" && !m.read) {
                // Optimista + persistente (defensivo).
                setMail((prev) =>
                    prev.map((row) => (row.id === m.id ? { ...row, read: true } : row)),
                );
                try {
                    await markRead(m.id, true);
                } catch {
                    /* best-effort */
                }
            }
        },
        [folder],
    );

    const handleSent = useCallback(
        (infoNote?: string) => {
            setComposing(false);
            setFolder("sent");
            flash(infoNote || "Correo interno enviado.");
            void loadMail("sent");
        },
        [flash, loadMail],
    );

    // Si hay un correo seleccionado, mostramos el lector a pantalla completa del panel.
    if (selected) {
        return (
            <MailReader
                mail={selected}
                folder={folder}
                onBack={() => setSelectedId(null)}
            />
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header de Correos */}
            <div className="px-4 py-3 border-b bg-background/80 backdrop-blur-xl shrink-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <Mail className="w-5 h-5 text-primary shrink-0" />
                        <h2 className="text-lg font-bold font-headline truncate">Correos</h2>
                        {internalAddress && (
                            <Badge
                                variant="outline"
                                className="font-mono text-[10px] hidden sm:inline-flex"
                            >
                                {internalAddress}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 cursor-pointer"
                            title="Actualizar"
                            onClick={() => loadMail(folder)}
                        >
                            <RefreshCcw className="w-4 h-4" />
                        </Button>
                        <Button
                            size="sm"
                            className="h-8 cursor-pointer"
                            onClick={() => setComposing((c) => !c)}
                            disabled={!hasInternal}
                            title={hasInternal ? "Redactar correo" : "Necesitas tu dirección @star.seed"}
                        >
                            <PenSquare className="mr-1.5 h-3.5 w-3.5" />
                            Redactar
                        </Button>
                    </div>
                </div>

                {/* Conmutador Recibidos / Enviados */}
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setFolder("inbox")}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer border",
                            folder === "inbox"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground",
                        )}
                    >
                        <Inbox className="w-3.5 h-3.5" />
                        Recibidos
                        {unreadCount > 0 && (
                            <Badge className="h-4 min-w-4 px-1 ml-0.5 text-[10px] bg-background text-foreground">
                                {unreadCount}
                            </Badge>
                        )}
                    </button>
                    <button
                        onClick={() => setFolder("sent")}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer border",
                            folder === "sent"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground",
                        )}
                    >
                        <Send className="w-3.5 h-3.5" />
                        Enviados
                    </button>
                </div>

                {/* Búsqueda */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Buscar en tus correos…"
                        className="pl-8 h-8 text-sm bg-muted/50 border-transparent focus:border-input"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setSearch("")}
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Nota informativa (flash) */}
            {note && (
                <div className="px-4 pt-3 shrink-0">
                    <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
                        {note}
                    </div>
                </div>
            )}

            {/* Cuerpo */}
            <ScrollArea className="flex-1">
                <div className="p-3 space-y-3">
                    {/* Creación de cuenta unificada (entrada clara) */}
                    {!loading && <UnifiedAccountCallout hasInternal={hasInternal} />}

                    {/* Compositor (cuando está activo) */}
                    {composing && hasInternal && (
                        <MailComposer
                            fromAddress={internalAddress}
                            onClose={() => setComposing(false)}
                            onSent={handleSent}
                        />
                    )}

                    {/* Lista de correos */}
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
                                    <p className="text-sm font-medium">
                                        No tienes correos internos todavía.
                                    </p>
                                    <p className="text-xs mt-1">
                                        Cuando alguien escriba a tu @star.seed, aparecerá aquí.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm font-medium">
                                        No has enviado correos internos.
                                    </p>
                                    <p className="text-xs mt-1">
                                        Tus correos enviados aparecerán aquí.
                                    </p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map((m) => (
                                <MailListItem
                                    key={m.id}
                                    mail={m}
                                    folder={folder}
                                    isActive={selectedId === m.id}
                                    onSelect={() => handleOpen(m)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}

export default CorreosPanel;
