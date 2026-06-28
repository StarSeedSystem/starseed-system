'use client';

// ════════════════════════════════════════════════════════════════
// MessagesWidget — Enlace Neural: conversaciones REALES del usuario.
// ----------------------------------------------------------------
// Datos reales con alcance al propietario (owner = uid) EN VIVO vía
// useMyConversations (tabla conversations, realtime). Buscador funcional,
// estados por tipo (directo/grupo/EF/comunidad), navegación a /messages.
// Estados: cargando, sin sesión, vacío (CTA para iniciar la primera
// conversación). NUNCA inyecta datos: si aún no hay tabla/filas, estado
// vacío limpio (honest-stub que se enciende solo al existir datos).
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    MessageSquare, Users, Landmark, User, Globe2, ChevronRight, Search,
    Plus, LogIn, type LucideIcon,
} from "lucide-react";
import { WidgetShell, MiniList, timeAgo } from "../kit";
import { useMyConversations, tsOf, type ConversationRow } from "@/lib/widget-data/os-live";

const ACCENT = "#0ea5e9";

const KIND_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
    dm:        { icon: User,    label: "Directo",   color: "#0ea5e9" },
    group:     { icon: Users,   label: "Grupo",     color: "#6366f1" },
    ef:        { icon: Landmark,label: "E.F.",      color: "#a855f7" },
    community: { icon: Globe2,  label: "Comunidad", color: "#10b981" },
};
function kindMeta(kind: string | null) {
    return KIND_META[(kind ?? "").toLowerCase()] ?? { icon: MessageSquare, label: kind || "Hilo", color: ACCENT };
}

function memberCount(c: ConversationRow): number {
    return Array.isArray(c.members) ? c.members.length : 0;
}

export function MessagesWidget() {
    const { rows, loading, authPending, needsAuth } = useMyConversations();
    const [query, setQuery] = useState("");

    const threads = useMemo(
        () => [...rows].sort((a, b) => tsOf(b.updated_at) - tsOf(a.updated_at)),
        [rows],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return threads;
        return threads.filter((t) => (t.title ?? "").toLowerCase().includes(q));
    }, [threads, query]);

    return (
        <WidgetShell
            title="Enlace Neural"
            subtitle="Mensajes y juntas"
            icon={MessageSquare}
            accent={ACCENT}
            live
            connections={[
                { label: "Mensajes", href: "/messages", color: "#0ea5e9" },
                { label: "Comunidades", href: "/hub", color: "#9FE870" },
                { label: "Conexiones", href: "/conexiones", color: "#6366f1" },
            ]}
            actions={
                <>
                    <Link href="/messages" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                        Todos <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/messages" className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Nuevo
                    </Link>
                </>
            }
        >
            {(size) => {
                if (authPending || (loading && rows.length === 0 && !needsAuth)) {
                    return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                }

                if (needsAuth) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-sky-400/30 bg-sky-500/10">
                                <LogIn className="size-6 text-sky-300/70" strokeWidth={1.5} />
                            </span>
                            <p className="text-[11px] text-muted-foreground/70">Entra para ver tus conversaciones.</p>
                            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/25 transition-colors cursor-pointer">
                                <LogIn className="size-3.5" /> Entrar
                            </Link>
                        </div>
                    );
                }

                if (rows.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-sky-400/30 bg-sky-500/10">
                                <MessageSquare className="size-6 text-sky-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay mensajes</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Inicia la primera conversación de la red.</p>
                            </div>
                            <Link href="/messages" className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Nueva conversación
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
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
                                <span className="shrink-0 text-[9px] text-muted-foreground/50 font-bold tabular-nums">{threads.length}</span>
                            </div>
                        )}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <MiniList
                                items={filtered}
                                max={max}
                                empty={query ? "Sin coincidencias" : "Sin conversaciones"}
                                render={(t) => {
                                    const meta = kindMeta(t.kind);
                                    const KindIcon = meta.icon;
                                    const title = t.title?.trim() || "Conversación";
                                    return (
                                        <Link href="/messages" className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-sky-500/30 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                            <span className="relative shrink-0 grid place-items-center size-8 rounded-xl border text-white font-black text-xs"
                                                style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}66)`, borderColor: `${meta.color}55` }}>
                                                {title.charAt(0).toUpperCase()}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-1 text-[11px] @sm:text-xs font-bold truncate">
                                                        <KindIcon className="size-3 shrink-0 opacity-60" /> {title}
                                                    </span>
                                                    {!micro && <span className="text-[10px] text-muted-foreground/50 font-bold shrink-0 tabular-nums">{t.updated_at ? timeAgo(tsOf(t.updated_at)) : ""}</span>}
                                                </div>
                                                {!micro && (
                                                    <p className="text-[10px] leading-snug truncate text-muted-foreground/60">
                                                        {meta.label}{memberCount(t) > 0 ? ` · ${memberCount(t)} miembros` : ""}{t.folder ? ` · ${t.folder}` : ""}
                                                    </p>
                                                )}
                                            </div>
                                        </Link>
                                    );
                                }}
                            />
                        </div>
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
