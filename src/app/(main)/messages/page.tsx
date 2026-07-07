"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS · Mensajes (/messages) — reconstruido sobre backend real
 * ---------------------------------------------------------------------------
 * DMs y grupos estilo WhatsApp/Telegram sobre `os_dm_threads/os_dm_members/
 * os_dm_messages` (ver src/lib/messages/dm.ts). Aurora opcional por hilo.
 * Dos paneles en escritorio (lista + chat activo); apilado en móvil.
 * Conmutador Mensajes ↔ Correos (buzón interno @star.seed) conservado.
 *
 * SOP: architecture/libreria-biblioteca-sync.md §8.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import { NotificationCenter } from "@/components/layout/notification-center";
import { UserNav } from "@/components/layout/user-nav";
import { cn } from "@/lib/utils";
import { Mail, MessageSquare, MessageSquareOff } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { CorreosPanel } from "@/components/messages/correos-panel";
import { ThreadList } from "@/components/messages/dm/thread-list";
import { ThreadView } from "@/components/messages/dm/thread-view";
import { NewChatDialog } from "@/components/messages/dm/new-chat-dialog";
import {
    listThreads, subscribeThreadsList, type DmAttachment, type DmThreadSummary,
} from "@/lib/messages/dm";
import { seedMyProfile, fetchProfilesByIds, type OsProfile } from "@/lib/social/os-profiles";

type MessagesSurface = "chats" | "mail";

function SurfaceSwitch({ surface, onChange, className }: { surface: MessagesSurface; onChange: (s: MessagesSurface) => void; className?: string }) {
    return (
        <div className={cn("inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/40 p-0.5", className)}>
            <button
                onClick={() => onChange("chats")}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer",
                    surface === "chats" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                title="Conversaciones"
            >
                <MessageSquare className="w-3.5 h-3.5" /> Mensajes
            </button>
            <button
                onClick={() => onChange("mail")}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer",
                    surface === "mail" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                title="Correos (@star.seed)"
            >
                <Mail className="w-3.5 h-3.5" /> Correos
            </button>
        </div>
    );
}

function EmptyThreadState() {
    return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
                <MessageSquareOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecciona una conversación</p>
            </div>
        </div>
    );
}

export default function MessagesPage() {
    const [surface, setSurface] = useState<MessagesSurface>("chats");
    const [userId, setUserId] = useState<string | null>(null);
    const [threads, setThreads] = useState<DmThreadSummary[]>([]);
    const [profiles, setProfiles] = useState<Record<string, OsProfile>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [mobileView, setMobileView] = useState<"list" | "thread">("list");
    const [pendingServerAttachment, setPendingServerAttachment] = useState<DmAttachment | null>(null);

    // Usuario actual + siembra del perfio propio en el directorio.
    useEffect(() => {
        (async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.auth.getUser();
                setUserId(data.user?.id ?? null);
            } catch {
                setUserId(null);
            }
            void seedMyProfile();
        })();
    }, []);

    const reloadThreads = useCallback(async () => {
        const rows = await listThreads();
        setThreads(rows);
        const allMemberIds = Array.from(new Set(rows.flatMap((t) => t.memberIds)));
        if (allMemberIds.length) setProfiles(await fetchProfilesByIds(allMemberIds));
        setLoading(false);
        if (!selectedId && rows.length) setSelectedId(rows[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setLoading(true);
        void reloadThreads();
    }, [reloadThreads]);

    useEffect(() => subscribeThreadsList(() => void reloadThreads()), [reloadThreads]);

    // Deep-link ?attachServer=<slug> → prepara un adjunto de servidor para el
    // hilo activo. SSR-safe: lee `window.location` en cliente (evita el boundary
    // de Suspense que exige `useSearchParams` en App Router), igual que /hub.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const slug = new URLSearchParams(window.location.search).get("attachServer");
        if (!slug) return;
        setPendingServerAttachment({ kind: "server", name: slug, refKind: "server", refId: slug, route: `/servidores-apps?panel=${encodeURIComponent(slug)}` });
    }, []);

    const selectedThread = threads.find((t) => t.id === selectedId) ?? null;

    const handleThreadCreated = (threadId: string) => {
        void reloadThreads().then(() => {
            setSelectedId(threadId);
            setMobileView("thread");
        });
    };

    const handleThreadUpdated = (updated: DmThreadSummary) => {
        setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    };

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onCreated={handleThreadCreated} />

            {/* ── DESKTOP: two-pane layout ── */}
            <div className="hidden md:flex flex-1 overflow-hidden bg-muted/10">
                {surface === "chats" ? (
                    <>
                        <div className="w-80 lg:w-96 shrink-0 flex flex-col border-r border-white/10 bg-background/60 backdrop-blur-sm overflow-hidden">
                            <div className="px-3 py-2 border-b border-white/10 shrink-0">
                                <SurfaceSwitch surface={surface} onChange={setSurface} />
                            </div>
                            <ThreadList
                                threads={threads}
                                profiles={profiles}
                                myUserId={userId}
                                selectedId={selectedId}
                                onSelect={(t) => setSelectedId(t.id)}
                                onNewChat={() => setNewChatOpen(true)}
                                loading={loading}
                                className="flex-1 min-h-0"
                            />
                        </div>
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {selectedThread ? (
                                <ThreadView
                                    thread={selectedThread}
                                    myUserId={userId}
                                    onThreadUpdated={handleThreadUpdated}
                                    pendingServerAttachment={pendingServerAttachment}
                                    onConsumePendingAttachment={() => setPendingServerAttachment(null)}
                                />
                            ) : (
                                <EmptyThreadState />
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-white/10 bg-background/60 backdrop-blur-sm shrink-0 flex items-center justify-between gap-3">
                            <SurfaceSwitch surface={surface} onChange={setSurface} />
                            <div className="flex items-center gap-1 shrink-0">
                                <NotificationCenter />
                                <UserNav />
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden mx-auto w-full max-w-3xl">
                            <CorreosPanel userId={userId} />
                        </div>
                    </div>
                )}
            </div>

            {/* ── MOBILE: single-pane, apilado ── */}
            <div className="flex md:hidden flex-1 flex-col overflow-hidden">
                {surface === "mail" ? (
                    <div className="flex flex-col h-full">
                        <header className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-background/80 backdrop-blur-xl shrink-0">
                            <SurfaceSwitch surface={surface} onChange={setSurface} />
                            <div className="flex items-center gap-1">
                                <NotificationCenter />
                                <UserNav />
                            </div>
                        </header>
                        <div className="flex-1 overflow-hidden">
                            <CorreosPanel userId={userId} />
                        </div>
                    </div>
                ) : mobileView === "list" ? (
                    <div className="flex flex-col h-full">
                        <header className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-background/80 backdrop-blur-xl shrink-0">
                            <SurfaceSwitch surface={surface} onChange={setSurface} />
                            <div className="flex items-center gap-1">
                                <NotificationCenter />
                                <UserNav />
                            </div>
                        </header>
                        <ThreadList
                            threads={threads}
                            profiles={profiles}
                            myUserId={userId}
                            selectedId={selectedId}
                            onSelect={(t) => {
                                setSelectedId(t.id);
                                setMobileView("thread");
                            }}
                            onNewChat={() => setNewChatOpen(true)}
                            loading={loading}
                            className="flex-1 min-h-0"
                        />
                    </div>
                ) : (
                    selectedThread && (
                        <ThreadView
                            thread={selectedThread}
                            myUserId={userId}
                            onBack={() => setMobileView("list")}
                            onThreadUpdated={handleThreadUpdated}
                            pendingServerAttachment={pendingServerAttachment}
                            onConsumePendingAttachment={() => setPendingServerAttachment(null)}
                        />
                    )
                )}
            </div>
        </div>
    );
}
