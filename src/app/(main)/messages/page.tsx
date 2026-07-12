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

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NotificationCenter } from "@/components/layout/notification-center";
import { UserNav } from "@/components/layout/user-nav";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2, Mail, MessageSquare, MessageSquareOff, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { CorreosPanel } from "@/components/messages/correos-panel";
import { ThreadList } from "@/components/messages/dm/thread-list";
import { ThreadView } from "@/components/messages/dm/thread-view";
import { NewChatDialog } from "@/components/messages/dm/new-chat-dialog";
import {
    createDm, listThreads, subscribeThreadsList, type DmAttachment, type DmThreadSummary,
} from "@/lib/messages/dm";
import {
    seedMyProfile, fetchProfilesByIds, fetchProfileByUsername, type OsProfile,
} from "@/lib/social/os-profiles";

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

/* ── Estado del deep-link `?to=<handle>` (Adenda 63 · P-4) ─────────────────
   Honesto: mientras resuelve el perfil se avisa; si el @ no existe (o eres tú
   mismo, o no hay sesión) se muestra un aviso descartable — nunca un crash. */
type DeepLink =
    | { state: "idle" }
    | { state: "resolving"; handle: string }
    | { state: "error"; message: string };

function DeepLinkBanner({ deepLink, onDismiss }: { deepLink: DeepLink; onDismiss: () => void }) {
    if (deepLink.state === "idle") return null;
    const resolving = deepLink.state === "resolving";
    return (
        <div
            role="status"
            className={cn(
                "shrink-0 flex items-center gap-2 px-4 py-2 text-xs border-b",
                resolving
                    ? "border-white/10 bg-primary/10 text-foreground"
                    : "border-amber-400/20 bg-amber-500/10 text-amber-200",
            )}
        >
            {resolving ? (
                <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span className="truncate">Abriendo tu conversación con @{deepLink.handle}…</span>
                </>
            ) : (
                <>
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span className="min-w-0 flex-1">{deepLink.message}</span>
                    <button
                        type="button"
                        onClick={onDismiss}
                        aria-label="Descartar aviso"
                        className="shrink-0 grid place-items-center w-5 h-5 rounded-full hover:bg-foreground/10 transition-colors cursor-pointer"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </>
            )}
        </div>
    );
}

function MessagesContent() {
    const searchParams = useSearchParams();
    const [surface, setSurface] = useState<MessagesSurface>("chats");
    const [userId, setUserId] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [threads, setThreads] = useState<DmThreadSummary[]>([]);
    const [profiles, setProfiles] = useState<Record<string, OsProfile>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [newChatOpen, setNewChatOpen] = useState(false);
    const [mobileView, setMobileView] = useState<"list" | "thread">("list");
    const [pendingServerAttachment, setPendingServerAttachment] = useState<DmAttachment | null>(null);
    const [deepLink, setDeepLink] = useState<DeepLink>({ state: "idle" });
    const [focusComposer, setFocusComposer] = useState(false);
    /** @handle ya procesado (evita recrear/reabrir en cada render o realtime). */
    const handledToRef = useRef<string | null>(null);

    // Usuario actual + siembra del perfil propio en el directorio.
    useEffect(() => {
        (async () => {
            try {
                const supabase = createClient();
                const { data } = await supabase.auth.getUser();
                setUserId(data.user?.id ?? null);
            } catch {
                setUserId(null);
            } finally {
                setAuthReady(true);
            }
            void seedMyProfile();
        })();
    }, []);

    const reloadThreads = useCallback(async () => {
        const rows = await listThreads();
        setThreads(rows);
        const allMemberIds = Array.from(new Set(rows.flatMap((t) => t.memberIds)));
        if (allMemberIds.length) {
            const fetched = await fetchProfilesByIds(allMemberIds);
            setProfiles((prev) => ({ ...prev, ...fetched }));
        }
        setLoading(false);
        // Selección por defecto SOLO si no hay ninguna: actualización funcional
        // para no leer un `selectedId` obsoleto (este callback tiene deps []; con
        // la lectura directa, cada recarga realtime saltaba al primer hilo y
        // pisaba la selección del deep-link `?to=`).
        setSelectedId((cur) => cur ?? (rows.length ? rows[0].id : null));
    }, []);

    useEffect(() => {
        setLoading(true);
        void reloadThreads();
    }, [reloadThreads]);

    useEffect(() => subscribeThreadsList(() => void reloadThreads()), [reloadThreads]);

    // Deep-link ?attachServer=<slug> → prepara un adjunto de servidor para el
    // hilo activo.
    useEffect(() => {
        const slug = searchParams?.get("attachServer");
        if (!slug) return;
        setPendingServerAttachment({ kind: "server", name: slug, refKind: "server", refId: slug, route: `/servidores-apps?panel=${encodeURIComponent(slug)}` });
    }, [searchParams]);

    // ── Deep-link ?to=<handle> (Adenda 63 · P-4) ────────────────────────────
    // Resuelve el @ en el directorio (os_profiles), abre el DM existente con esa
    // persona o crea uno nuevo (createDm ya reutiliza el hilo 1:1 si existe) y
    // enfoca el compositor. Idempotente: `handledToRef` impide reprocesarlo.
    const toHandle = (searchParams?.get("to") ?? "").trim().replace(/^@+/, "");

    useEffect(() => {
        if (!toHandle || !authReady) return;
        if (handledToRef.current === toHandle) return;
        handledToRef.current = toHandle;

        if (!userId) {
            setDeepLink({ state: "error", message: `Inicia sesión para escribir a @${toHandle}.` });
            return;
        }

        let alive = true;
        (async () => {
            setSurface("chats");
            setDeepLink({ state: "resolving", handle: toHandle });

            const profile = await fetchProfileByUsername(toHandle);
            if (!alive) return;
            if (!profile) {
                setDeepLink({ state: "error", message: `No encontramos a @${toHandle} en el directorio. Puede que el @ haya cambiado o que esa cuenta no aparezca en búsquedas.` });
                return;
            }
            if (profile.userId === userId) {
                setDeepLink({ state: "error", message: "Ese eres tú: no puedes abrir una conversación contigo mismo." });
                return;
            }

            setProfiles((prev) => ({ ...prev, [profile.userId]: profile }));

            const res = await createDm(profile.userId);
            if (!alive) return;
            if (!res.ok || !res.thread) {
                setDeepLink({
                    state: "error",
                    message: res.needsAuth
                        ? `Inicia sesión para escribir a @${toHandle}.`
                        : `No se pudo abrir la conversación con @${toHandle}. Inténtalo de nuevo.`,
                });
                return;
            }

            await reloadThreads();
            if (!alive) return;
            setSelectedId(res.thread.id);
            setMobileView("thread");
            setFocusComposer(true);
            setDeepLink({ state: "idle" });
        })();

        return () => { alive = false; };
    }, [toHandle, authReady, userId, reloadThreads]);

    const selectedThread = threads.find((t) => t.id === selectedId) ?? null;

    const selectThread = useCallback((threadId: string) => {
        setSelectedId(threadId);
        setFocusComposer(false);
    }, []);

    const handleThreadCreated = (threadId: string) => {
        void reloadThreads().then(() => {
            setSelectedId(threadId);
            setMobileView("thread");
            setFocusComposer(true);
        });
    };

    const handleThreadUpdated = (updated: DmThreadSummary) => {
        setThreads((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    };

    return (
        <div className="h-screen flex flex-col overflow-hidden">
            <NewChatDialog open={newChatOpen} onOpenChange={setNewChatOpen} onCreated={handleThreadCreated} />

            <DeepLinkBanner deepLink={deepLink} onDismiss={() => setDeepLink({ state: "idle" })} />

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
                                onSelect={(t) => selectThread(t.id)}
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
                                    autoFocusComposer={focusComposer}
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
                                selectThread(t.id);
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
                            autoFocusComposer={focusComposer}
                        />
                    )
                )}
            </div>
        </div>
    );
}

/**
 * `useSearchParams` exige un boundary de Suspense en el App Router (si no, el
 * build falla con "should be wrapped in a suspense boundary"). Regla del repo:
 * componente interno con los hooks + export por defecto que lo envuelve.
 */
export default function MessagesPage() {
    return (
        <Suspense
            fallback={
                <div className="h-screen flex items-center justify-center text-sm text-muted-foreground">
                    Cargando tus mensajes…
                </div>
            }
        >
            <MessagesContent />
        </Suspense>
    );
}
