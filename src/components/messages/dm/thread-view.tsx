"use client";

/*
 * ThreadView — chat activo (panel derecho de /messages).
 * Cabecera con título/miembros + toggle Aurora del hilo. Burbujas con
 * MessageBubble. Composer con adjuntos de cualquier formato (dataURL si son
 * pequeños) + botón "Preguntar a Aurora" cuando el hilo tiene el agente activo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
    ArrowLeft, Bot, Loader2, Paperclip, Reply, Send, Sparkles, Users2, X,
} from "lucide-react";
import {
    listMessages, sendMessage, editMessage, softDeleteMessage, subscribeThread,
    markRead, setThreadAgent, mentionsAurora, messageFromRealtimeRow,
    type DmAttachment, type DmMessage, type DmThreadSummary, type ThreadAgentConfig,
} from "@/lib/messages/dm";
import { askAuroraInThread } from "@/lib/messages/aurora-thread";
import { fetchProfilesByIds, type OsProfile } from "@/lib/social/os-profiles";
import { threadTitle, threadAvatar } from "@/components/messages/dm/thread-list";
import { MessageBubble } from "@/components/messages/dm/message-bubble";
// Subida universal de archivos (Adenda 64 §9): adjuntos grandes van a storage
// (URL real, sincronizada entre dispositivos); el dataURL inline queda solo
// como fallback offline para archivos pequeños (ver MAX_INLINE_BYTES abajo).
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import type { UniversalAttachment } from "@/lib/files/os-files";

const MAX_INLINE_BYTES = 300_000; // ~0.3MB: fallback offline (dataURL) para adjuntos muy pequeños.

function fileToAttachmentKind(file: File): DmAttachment["kind"] {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("video/")) return "video";
    return "file";
}

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** ¿Hay sesión activa AHORA MISMO (best-effort, sin red)? Heurística simple para decidir el fallback offline. */
function looksOffline(): boolean {
    try {
        return typeof navigator !== "undefined" && navigator.onLine === false;
    } catch {
        return false;
    }
}

export interface ThreadViewProps {
    thread: DmThreadSummary;
    myUserId: string | null;
    onBack?: () => void;
    onThreadUpdated: (thread: DmThreadSummary) => void;
    /** Adjunto de servidor prellenado (desde ?attachServer=<slug>), si aplica. */
    pendingServerAttachment?: DmAttachment | null;
    onConsumePendingAttachment?: () => void;
}

export function ThreadView({ thread, myUserId, onBack, onThreadUpdated, pendingServerAttachment, onConsumePendingAttachment }: ThreadViewProps) {
    const [messages, setMessages] = useState<DmMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<Record<string, OsProfile>>({});
    const [input, setInput] = useState("");
    const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
    const [pendingAttachments, setPendingAttachments] = useState<DmAttachment[]>([]);
    const [sending, setSending] = useState(false);
    const [asking, setAsking] = useState(false);
    const [auroraStatus, setAuroraStatus] = useState("");
    const [agentPanelOpen, setAgentPanelOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const autoRepliedIds = useRef<Set<string>>(new Set());

    const title = threadTitle(thread, profiles, myUserId);
    const avatar = threadAvatar(thread, profiles, myUserId);
    const isGroup = thread.kind === "group";

    const reload = useCallback(async () => {
        const msgs = await listMessages(thread.id);
        setMessages(msgs);
        const senderIds = Array.from(new Set(msgs.map((m) => m.sender).filter((s): s is string => !!s)));
        if (senderIds.length) setProfiles(await fetchProfilesByIds(senderIds));
        setLoading(false);
        void markRead(thread.id);
    }, [thread.id]);

    useEffect(() => {
        setLoading(true);
        void reload();
    }, [reload]);

    useEffect(() => {
        return subscribeThread(thread.id, (payload) => {
            if (payload.eventType === "INSERT") {
                const msg = messageFromRealtimeRow(payload.new);
                if (msg) {
                    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
                    if (msg.sender && !profiles[msg.sender]) {
                        void fetchProfilesByIds([msg.sender]).then((p) => setProfiles((prev) => ({ ...prev, ...p })));
                    }
                }
            } else if (payload.eventType === "UPDATE") {
                const msg = messageFromRealtimeRow(payload.new);
                if (msg) setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [thread.id]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages.length]);

    // Adjunto de servidor prellenado desde ?attachServer=<slug>.
    useEffect(() => {
        if (pendingServerAttachment) {
            setPendingAttachments((prev) => [...prev, pendingServerAttachment]);
            onConsumePendingAttachment?.();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingServerAttachment]);

    // Auto-respuesta cuando el hilo tiene Aurora activa y alguien menciona @aurora.
    useEffect(() => {
        if (!thread.agent?.enabled || !thread.agent.autoReplyOnMention) return;
        const last = messages[messages.length - 1];
        if (!last || last.kind !== "user" || last.deleted) return;
        if (!mentionsAurora(last.body)) return;
        if (autoRepliedIds.current.has(last.id)) return;
        autoRepliedIds.current.add(last.id);
        void askAuroraInThread(thread.id, { invokerId: myUserId, agent: thread.agent }).then((res) => {
            if (!res.ok) {
                // Silencioso: no interrumpe el chat si Aurora falla puntualmente.
                autoRepliedIds.current.delete(last.id);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, thread.agent, thread.id, myUserId]);

    const handleSend = async () => {
        const body = input.trim();
        if (!body && pendingAttachments.length === 0) return;
        setSending(true);
        try {
            const saved = await sendMessage(thread.id, {
                body,
                attachments: pendingAttachments,
                replyTo: replyTo?.id ?? null,
            });
            if (!saved) {
                toast.error("No se pudo enviar el mensaje.");
                return;
            }
            setMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved]));
            setInput("");
            setPendingAttachments([]);
            setReplyTo(null);
        } finally {
            setSending(false);
        }
    };

    const handleFilesPicked = async (files: FileList | null) => {
        if (!files || !files.length) return;
        for (const file of Array.from(files)) {
            if (file.size > MAX_INLINE_BYTES) {
                toast.error(`«${file.name}» supera el límite de adjunto inline offline (~300KB). Usa el selector de archivos (subida real a la nube).`);
                continue;
            }
            try {
                const url = await readFileAsDataUrl(file);
                setPendingAttachments((prev) => [
                    ...prev,
                    { kind: fileToAttachmentKind(file), name: file.name, mime: file.type, url, size: file.size },
                ]);
            } catch {
                toast.error(`No se pudo leer «${file.name}».`);
            }
        }
    };

    /** Adjuntos entregados por el selector universal (ya subidos a storage, con URL real). */
    const handleUniversalAttachments = (attachments: UniversalAttachment[]) => {
        setPendingAttachments((prev) => [
            ...prev,
            ...attachments.map(
                (a): DmAttachment => ({
                    kind: a.kind,
                    name: a.name,
                    mime: a.mime,
                    url: a.url,
                    size: a.size,
                    refKind: a.fileId ? "file" : undefined,
                    refId: a.fileId,
                }),
            ),
        ]);
    };

    const handleAskAurora = async () => {
        if (!thread.agent?.enabled) return;
        setAsking(true);
        try {
            const res = await askAuroraInThread(thread.id, {
                invokerId: myUserId,
                agent: thread.agent,
                prompt: input.trim() || undefined,
                onStatus: setAuroraStatus,
            });
            if (!res.ok) {
                toast.error(res.error || "Aurora no pudo responder ahora mismo.");
                return;
            }
            if (res.message) setMessages((prev) => (prev.some((m) => m.id === res.message!.id) ? prev : [...prev, res.message!]));
            setInput("");
        } finally {
            setAsking(false);
            setAuroraStatus("");
        }
    };

    const handleToggleAgent = async (enabled: boolean) => {
        const next: ThreadAgentConfig = {
            enabled,
            name: thread.agent?.name || "Aurora",
            persona: thread.agent?.persona,
            autoReplyOnMention: thread.agent?.autoReplyOnMention !== false,
        };
        const ok = await setThreadAgent(thread.id, next);
        if (ok) onThreadUpdated({ ...thread, agent: next });
        else toast.error("No se pudo actualizar Aurora en este hilo.");
    };

    const replyToMessageFor = (m: DmMessage): DmMessage | null =>
        m.replyTo ? messages.find((mm) => mm.id === m.replyTo) ?? null : null;

    return (
        <div className="flex flex-col h-full">
            <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-background/80 backdrop-blur-xl shrink-0">
                {onBack && (
                    <Button variant="ghost" size="icon" className="cursor-pointer shrink-0 h-8 w-8" onClick={onBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                )}
                <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={avatar} />
                    <AvatarFallback className="text-xs font-semibold">
                        {isGroup ? <Users2 className="w-4 h-4" /> : title.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{title}</p>
                    <p className="text-[11px] text-muted-foreground">
                        {isGroup ? `${thread.memberIds.length} miembros` : "Directo"}
                        {thread.agent?.enabled && " · Aurora activa"}
                    </p>
                </div>

                <Popover open={agentPanelOpen} onOpenChange={setAgentPanelOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            variant={thread.agent?.enabled ? "default" : "ghost"}
                            size="icon"
                            title="Aurora en este hilo"
                            className={cn("cursor-pointer h-8 w-8 shrink-0", thread.agent?.enabled && "bg-[#007FFF] hover:bg-[#007FFF]/90")}
                        >
                            <Bot className="h-4 w-4" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="agent-toggle" className="text-sm font-semibold flex items-center gap-1.5">
                                    <Bot className="w-3.5 h-3.5 text-[#007FFF]" /> Aurora en este hilo
                                </Label>
                                <Switch id="agent-toggle" checked={!!thread.agent?.enabled} onCheckedChange={(v) => void handleToggleAgent(v)} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Cuando está activa, cualquiera puede pedirle una respuesta o mencionarla con
                                <span className="font-mono text-[11px] mx-1 text-[#7fb8ff]">@aurora</span>
                                para que responda automáticamente.
                            </p>
                        </div>
                    </PopoverContent>
                </Popover>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loading && (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                )}
                {!loading && messages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
                        <Send className="w-8 h-8 opacity-30" />
                        <p className="text-sm">Aún no hay mensajes. Escribe el primero.</p>
                    </div>
                )}
                {!loading && messages.map((m) => (
                    <MessageBubble
                        key={m.id}
                        message={m}
                        isMine={m.sender === myUserId && m.kind !== "agent"}
                        sender={m.sender ? profiles[m.sender] ?? null : null}
                        replyToMessage={replyToMessageFor(m)}
                        isAgentThread={m.kind === "agent"}
                        onReply={setReplyTo}
                        onEdit={async (id, body) => {
                            const ok = await editMessage(id, body);
                            if (ok) setMessages((prev) => prev.map((mm) => (mm.id === id ? { ...mm, body, editedAt: new Date().toISOString() } : mm)));
                            else toast.error("No se pudo editar el mensaje.");
                        }}
                        onDelete={async (id) => {
                            const ok = await softDeleteMessage(id);
                            if (ok) setMessages((prev) => prev.map((mm) => (mm.id === id ? { ...mm, deleted: true, body: "" } : mm)));
                            else toast.error("No se pudo eliminar el mensaje.");
                        }}
                    />
                ))}
            </div>

            <footer className="px-4 py-3 border-t border-white/10 bg-background/90 backdrop-blur-sm shrink-0 space-y-2">
                {replyTo && (
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs">
                        <Reply className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate flex-1 text-muted-foreground">
                            Respondiendo: {replyTo.body.slice(0, 60) || "Adjunto"}
                        </span>
                        <button type="button" className="cursor-pointer" onClick={() => setReplyTo(null)}>
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {pendingAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {pendingAttachments.map((a, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px]">
                                {a.name || a.kind}
                                <button type="button" className="cursor-pointer" onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}>
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {(asking || auroraStatus) && (
                    <p className="text-[11px] text-[#7fb8ff] flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> {auroraStatus || "Aurora está pensando…"}
                    </p>
                )}

                <div
                    className="flex items-center gap-2 bg-muted/50 rounded-2xl border border-border/60 px-3 py-2 focus-within:border-primary/40 transition-all"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        // Fallback offline: arrastrar y soltar guarda archivos pequeños (<300KB)
                        // como dataURL inline sin depender de red/sesión (ver MAX_INLINE_BYTES).
                        // El botón de clip (selector universal) sigue siendo el camino principal.
                        if (looksOffline()) void handleFilesPicked(e.dataTransfer.files);
                    }}
                >
                    <AttachFilePickerButton
                        onPick={handleUniversalAttachments}
                        folder="mensajes"
                        title="Adjuntar archivo al mensaje"
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    >
                        <Paperclip className="w-4 h-4" />
                    </AttachFilePickerButton>

                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void handleSend();
                            }
                        }}
                        placeholder={thread.agent?.enabled ? "Escribe un mensaje… o menciona @aurora" : "Escribe un mensaje…"}
                        className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 px-0 h-8 text-sm"
                    />

                    {thread.agent?.enabled && (
                        <Button
                            variant="ghost"
                            size="icon"
                            title="Preguntar a Aurora"
                            className="cursor-pointer h-7 w-7 shrink-0 rounded-full hover:bg-[#007FFF]/10 text-[#7fb8ff]"
                            onClick={() => void handleAskAurora()}
                            disabled={asking}
                        >
                            {asking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        </Button>
                    )}

                    <Button
                        size="icon"
                        className={cn(
                            "cursor-pointer h-7 w-7 shrink-0 rounded-full transition-all",
                            (input.trim() || pendingAttachments.length) ? "bg-primary hover:bg-primary/90" : "bg-muted text-muted-foreground",
                        )}
                        onClick={() => void handleSend()}
                        disabled={sending || (!input.trim() && pendingAttachments.length === 0)}
                    >
                        {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </Button>
                </div>
            </footer>
        </div>
    );
}

export default ThreadView;
