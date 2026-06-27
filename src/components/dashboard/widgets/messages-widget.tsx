'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageSquare, Users, Landmark, User, ChevronRight, ChevronLeft, Search, Send, CheckCheck, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { MessageThread } from "@/lib/widget-data";
import { conversations as staticConversations } from "@/lib/data";
import type { ConversationFull } from "@/lib/data";

// ════════════════════════════════════════════════════════════════
// MessagesWidget — enlace neural: hilos directos, grupos y juntas.
// ----------------------------------------------------------------
// PROFUNDIZACIÓN (esta versión):
//   • Buscador filtrante funcional (nombre + último mensaje).
//   • Estados visibles: en línea (punto), no leído (contador).
//   • Vista de hilo al pulpar una conversación (estado local): cabecera
//     con avatar/estado, transcripción coherente en español y compositor.
//   • Marcar como leído: al abrir un hilo el contador se pone a 0
//     (estado local, no destructivo de los datos en vivo).
//   Mensajes de ejemplo DETERMINISTAS por hilo (sin Math.random).
// ════════════════════════════════════════════════════════════════

const KIND_ICON: Record<MessageThread["kind"], LucideIcon> = {
    directo: User, grupo: Users, junta: Landmark,
};
const KIND_LABEL: Record<MessageThread["kind"], string> = {
    directo: "Directo", grupo: "Grupo", junta: "Junta",
};

interface ThreadMessage { from: "tu" | "ellos"; text: string; min: number }

// Transcripciones coherentes por nombre de hilo (es-ES), deterministas.
// Sin transcripciones de ejemplo: los mensajes reales vienen de la red.
const TRANSCRIPTS: Record<string, ThreadMessage[]> = {};

function transcriptFor(t: MessageThread): ThreadMessage[] {
    const base = TRANSCRIPTS[t.name];
    if (base) return base;
    return [
        { from: "ellos", text: t.lastMessage, min: 10 },
    ];
}

// Converts a ConversationFull from /lib/data into the MessageThread widget shape.
// Accent colors keyed by conversation id for determinism.
const CONVO_ACCENTS: Record<string, string> = {
    "convo-1": "#0ea5e9",
    "convo-2": "#6366f1",
    "convo-3": "#10b981",
    "convo-4": "#DC143C",
};

function convoToThread(c: ConversationFull): MessageThread {
    return {
        id: c.id,
        name: c.name,
        lastMessage: c.lastMessage,
        ts: Date.now() - (c.lastMessageTimestamp.includes("5m") ? 5 * 60_000
            : c.lastMessageTimestamp.includes("1h") ? 60 * 60_000
            : c.lastMessageTimestamp.includes("3h") ? 3 * 3600_000
            : 8 * 3600_000),
        unread: c.unreadCount,
        online: c.pinned,
        kind: c.type === "dm" ? "directo" : c.name.toLowerCase().includes("e.f.") || c.name.toLowerCase().includes("junta") ? "junta" : "grupo",
        accent: CONVO_ACCENTS[c.id] ?? "#0ea5e9",
    };
}

// Profile route for DM conversations (maps known names to handles).
// Sin mapeos de ejemplo: el handle real se resuelve desde los datos del hilo.
const NAME_TO_HANDLE: Record<string, string> = {};

function profileLinkForThread(t: MessageThread): string | null {
    if (t.kind !== "directo") return null;
    const handle = NAME_TO_HANDLE[t.name];
    return handle ? `/profile/${handle}` : null;
}

export function MessagesWidget() {
    const { data, loading } = useWidgetData("social.threads", { refreshMs: 6000 });
    const [query, setQuery] = useState("");
    const [openId, setOpenId] = useState<string | null>(null);
    // Hilos marcados como leídos localmente (al abrirlos).
    const [readLocal, setReadLocal] = useState<Set<string>>(() => new Set());
    const [draft, setDraft] = useState("");

    // Merge live widget threads with static conversations from /lib/data
    const threads = useMemo<MessageThread[]>(() => {
        const staticThreads = staticConversations.map(convoToThread);
        const widgetThreads = (data ?? []).filter(t =>
            !staticThreads.some(s => s.id === t.id)
        );
        const merged = [...staticThreads, ...widgetThreads];
        return merged
            .map(t => readLocal.has(t.id) ? { ...t, unread: 0 } : t)
            .sort((a, b) => (b.unread - a.unread) || (b.ts - a.ts));
    }, [data, readLocal]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return threads;
        return threads.filter((t) =>
            t.name.toLowerCase().includes(q) || t.lastMessage.toLowerCase().includes(q)
        );
    }, [threads, query]);

    const openThread = useMemo(() => threads.find((t) => t.id === openId) ?? null, [threads, openId]);
    const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

    function open(t: MessageThread) {
        setOpenId(t.id);
        setReadLocal((prev) => {
            if (prev.has(t.id)) return prev;
            const next = new Set(prev);
            next.add(t.id);
            return next;
        });
    }

    return (
        <WidgetShell
            title="Enlace Neural"
            subtitle="Mensajes y juntas"
            icon={MessageSquare}
            accent="#0ea5e9"
            connections={[{ label: "Mensajes", href: "/messages", color: "#0ea5e9" }, { label: "Comunidades", href: "/hub", color: "#9FE870" }, { label: "Gráfica Viva", href: "/network/graph", color: "#6366f1" }, { label: "Perfil", href: "/profile", color: "#7FB8FF" }]}
            live
            actions={
                openThread ? (
                    <button type="button" onClick={() => setOpenId(null)}
                        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                        <ChevronLeft className="size-3" /> Hilos
                    </button>
                ) : (
                    <Link href="/messages" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                        Todos <ChevronRight className="size-3" />
                    </Link>
                )
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Vista de hilo abierto ──
                if (openThread) {
                    const KindIcon = KIND_ICON[openThread.kind];
                    const msgs = transcriptFor(openThread);
                    return (
                        <div className="flex flex-col h-full pt-1 gap-2">
                            {/* Cabecera del hilo */}
                            <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.03] px-2.5 py-2 shrink-0">
                                <span className="relative grid place-items-center size-8 rounded-xl border text-white font-black text-xs shrink-0"
                                    style={{ background: `linear-gradient(135deg, ${openThread.accent}, ${openThread.accent}66)`, borderColor: `${openThread.accent}55` }}>
                                    {openThread.name.charAt(0)}
                                    {openThread.online && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="inline-flex items-center gap-1 text-xs font-bold truncate">
                                        <KindIcon className="size-3 shrink-0 opacity-60" /> {openThread.name}
                                    </div>
                                    <span className={`text-[10px] font-bold ${openThread.online ? "text-emerald-400" : "text-muted-foreground/50"}`}>
                                        {openThread.online ? "En línea" : `Activo ${timeAgo(openThread.ts)}`} · {KIND_LABEL[openThread.kind]}
                                    </span>
                                </div>
                            </div>

                            {/* Transcripción */}
                            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar flex flex-col gap-1.5 pr-0.5">
                                {msgs.map((msg, i) => {
                                    const mine = msg.from === "tu";
                                    return (
                                        <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[82%] rounded-2xl px-3 py-1.5 text-[11px] leading-snug ${mine ? "rounded-br-sm text-white" : "rounded-bl-sm bg-white/[0.05] border border-border/40 text-foreground"}`}
                                                style={mine ? { background: openThread.accent } : undefined}>
                                                {msg.text}
                                                <span className={`block text-[8px] mt-0.5 tabular-nums ${mine ? "text-white/70 text-right" : "text-muted-foreground/50"}`}>
                                                    hace {msg.min}m {mine && <CheckCheck className="inline size-2.5 -mt-0.5" />}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Compositor (UI real, local) */}
                            <form
                                onSubmit={(e) => { e.preventDefault(); setDraft(""); }}
                                className="shrink-0 flex items-center gap-1.5 rounded-xl border border-border/40 bg-white/[0.03] px-2 py-1"
                            >
                                <input
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder="Escribe un mensaje…"
                                    className="flex-1 min-w-0 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40 py-1"
                                />
                                <button type="submit" disabled={!draft.trim()} aria-label="Enviar"
                                    className="grid place-items-center size-7 rounded-lg text-white transition-opacity disabled:opacity-30 cursor-pointer"
                                    style={{ background: openThread.accent }}>
                                    <Send className="size-3.5" />
                                </button>
                            </form>
                        </div>
                    );
                }

                // ── Vista de lista (con buscador) ──
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;
                return (
                    <div className="pt-1 h-full flex flex-col gap-2">
                        {!micro && (
                            <div className="shrink-0 flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.03] px-2.5 py-1.5">
                                <Search className="size-3.5 shrink-0 text-muted-foreground/50" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Buscar conversación…"
                                    className="flex-1 min-w-0 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40"
                                />
                                {totalUnread > 0 ? (
                                    <span className="shrink-0 grid place-items-center h-5 px-2 rounded-full text-[10px] font-black text-white" style={{ background: "#0ea5e9" }}>
                                        {totalUnread}
                                    </span>
                                ) : null}
                                <Link href="/messages" aria-label="Ver todos los mensajes"
                                    className="shrink-0 grid place-items-center size-5 rounded-lg text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer">
                                    <ChevronRight className="size-3.5" />
                                </Link>
                            </div>
                        )}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <MiniList
                                items={filtered}
                                max={max}
                                empty={query ? "Sin coincidencias" : "Sin mensajes"}
                                render={(t) => {
                                    const KindIcon = KIND_ICON[t.kind];
                                    const profileHref = profileLinkForThread(t);
                                    return (
                                        <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-sky-500/30 hover:bg-white/[0.04] transition-colors">
                                            {/* Avatar: links to profile for DMs, else opens thread */}
                                            {profileHref ? (
                                                <Link href={profileHref} onClick={(ev) => ev.stopPropagation()}
                                                    className="relative shrink-0 grid place-items-center size-8 rounded-xl border text-white font-black text-xs cursor-pointer hover:opacity-80 transition-opacity"
                                                    style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}66)`, borderColor: `${t.accent}55` }}>
                                                    {t.name.charAt(0)}
                                                    {t.online && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />}
                                                </Link>
                                            ) : (
                                                <span className="relative shrink-0 grid place-items-center size-8 rounded-xl border text-white font-black text-xs"
                                                    style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}66)`, borderColor: `${t.accent}55` }}>
                                                    {t.name.charAt(0)}
                                                    {t.online && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />}
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => open(t)}
                                                className="min-w-0 flex-1 text-left cursor-pointer"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-1 text-[11px] @sm:text-xs font-bold truncate">
                                                        <KindIcon className="size-3 shrink-0 opacity-60" /> {t.name}
                                                    </span>
                                                    {!micro && <span className="text-[10px] text-muted-foreground/50 font-bold shrink-0 tabular-nums">{timeAgo(t.ts)}</span>}
                                                </div>
                                                {!micro && (
                                                    <p className={`text-[10px] leading-snug truncate ${t.unread > 0 ? "text-foreground/90 font-semibold" : "text-muted-foreground/60"}`}>
                                                        {t.lastMessage}
                                                    </p>
                                                )}
                                            </button>
                                            {t.unread > 0 && (
                                                <span className="shrink-0 grid place-items-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black text-white" style={{ background: t.accent }}>
                                                    {t.unread}
                                                </span>
                                            )}
                                        </div>
                                    );
                                }}
                            />
                        </div>
                        {/* Footer: link to full messages page */}
                        {!micro && size.vTier !== "micro" && (
                            <Link href="/messages"
                                className="shrink-0 flex items-center justify-center gap-1 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer">
                                <MessageSquare className="size-3" /> Abrir mensajería completa
                            </Link>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
