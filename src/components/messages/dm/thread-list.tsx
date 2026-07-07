"use client";

/*
 * ThreadList — lista de conversaciones (panel izquierdo de /messages).
 * Muestra avatar/título, último mensaje, hora y no-leídos. Estilo WhatsApp/Telegram.
 */

import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Search, SquarePen, Users2, Bot } from "lucide-react";
import type { DmThreadSummary } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";

function timeLabel(iso: string | null): string {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        if (sameDay) return d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
        return d.toLocaleDateString("es", { day: "2-digit", month: "2-digit" });
    } catch {
        return "";
    }
}

function threadTitle(t: DmThreadSummary, profiles: Record<string, OsProfile>, myUserId: string | null): string {
    if (t.title) return t.title;
    if (t.kind === "group") return "Grupo sin nombre";
    // DM: título = nombre del otro miembro.
    const otherId = t.memberIds.find((id) => id !== myUserId);
    const p = otherId ? profiles[otherId] : undefined;
    return p?.displayName ?? p?.username ?? "Conversación";
}

function threadAvatar(t: DmThreadSummary, profiles: Record<string, OsProfile>, myUserId: string | null): string | undefined {
    if (t.avatarUrl) return t.avatarUrl;
    if (t.kind === "dm") {
        const otherId = t.memberIds.find((id) => id !== myUserId);
        return otherId ? profiles[otherId]?.avatarUrl : undefined;
    }
    return undefined;
}

function previewOf(t: DmThreadSummary): string {
    const m = t.lastMessage;
    if (!m) return "Sin mensajes todavía";
    if (m.deleted) return "Mensaje eliminado";
    if (m.attachments.length && !m.body.trim()) {
        const kind = m.attachments[0].kind;
        return kind === "image" ? "Imagen" : kind === "audio" ? "Audio" : kind === "video" ? "Vídeo" : "Archivo adjunto";
    }
    return m.body || "Sin mensajes todavía";
}

export interface ThreadListProps {
    threads: DmThreadSummary[];
    profiles: Record<string, OsProfile>;
    myUserId: string | null;
    selectedId: string | null;
    onSelect: (thread: DmThreadSummary) => void;
    onNewChat: () => void;
    loading?: boolean;
    className?: string;
}

export function ThreadList({ threads, profiles, myUserId, selectedId, onSelect, onNewChat, loading, className }: ThreadListProps) {
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return threads;
        return threads.filter((t) => threadTitle(t, profiles, myUserId).toLowerCase().includes(q));
    }, [threads, search, profiles, myUserId]);

    return (
        <div className={cn("flex flex-col h-full", className)}>
            <div className="p-4 border-b border-white/10 shrink-0">
                <div className="flex items-center justify-between mb-3">
                    <h1 className="text-xl font-bold font-headline">Mensajes</h1>
                    <Button
                        variant="ghost"
                        size="icon"
                        title="Nuevo chat o grupo"
                        className="cursor-pointer h-8 w-8"
                        onClick={onNewChat}
                    >
                        <SquarePen className="w-4.5 h-4.5" />
                    </Button>
                </div>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar conversaciones…"
                        className="pl-8 h-8 text-sm bg-muted/50 border-transparent focus:border-input"
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2 space-y-0.5">
                    {loading && (
                        <div className="space-y-2 p-2">
                            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-muted/20 animate-pulse" />)}
                        </div>
                    )}

                    {!loading && filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
                            <SquarePen className="w-8 h-8 opacity-30" />
                            <p className="text-sm">
                                {search ? `Sin resultados para "${search}"` : "Sin conversaciones todavía"}
                            </p>
                            {!search && (
                                <Button size="sm" variant="outline" className="cursor-pointer mt-1" onClick={onNewChat}>
                                    Iniciar un chat
                                </Button>
                            )}
                        </div>
                    )}

                    {!loading && filtered.map((t) => {
                        const title = threadTitle(t, profiles, myUserId);
                        const avatar = threadAvatar(t, profiles, myUserId);
                        return (
                            <button
                                key={t.id}
                                onClick={() => onSelect(t)}
                                className={cn(
                                    "flex items-center gap-3 w-full p-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer",
                                    selectedId === t.id
                                        ? "bg-primary/10 border border-primary/20 shadow-sm"
                                        : "hover:bg-muted/60 border border-transparent",
                                )}
                            >
                                <div className="relative shrink-0">
                                    <Avatar className="h-11 w-11">
                                        <AvatarImage src={avatar} />
                                        <AvatarFallback className="font-semibold text-sm">
                                            {t.kind === "group" ? <Users2 className="w-4 h-4" /> : title.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    {t.agent?.enabled && (
                                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#007FFF] border-2 border-background">
                                            <Bot className="w-2.5 h-2.5 text-white" />
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                        <p className={cn("font-semibold truncate text-sm", selectedId === t.id && "text-primary")}>
                                            {title}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                                            {timeLabel(t.lastMsgAt)}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between gap-1">
                                        <p className="text-xs text-muted-foreground truncate">{previewOf(t)}</p>
                                        {t.unreadCount > 0 && (
                                            <Badge className="h-4 min-w-4 px-1 flex items-center justify-center text-[10px] shrink-0 bg-primary">
                                                {t.unreadCount}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}

export default ThreadList;
export { threadTitle, threadAvatar };
