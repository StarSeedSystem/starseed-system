'use client';

import Link from "next/link";
import { MessageSquare, Users, Landmark, User, ChevronRight, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { MessageThread } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// MessagesWidget — enlace neural: hilos directos, grupos y juntas.
// Datos en vivo "social.threads". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const KIND_ICON: Record<MessageThread["kind"], LucideIcon> = {
    directo: User, grupo: Users, junta: Landmark,
};

export function MessagesWidget() {
    const { data, loading } = useWidgetData("social.threads", { refreshMs: 6000 });

    return (
        <WidgetShell
            title="Enlace Neural"
            subtitle="Mensajes y juntas"
            icon={MessageSquare}
            accent="#0ea5e9"
            connections={[{ label: "Comunidades", href: "/hub", color: "#9FE870" }, { label: "Gráfica Viva", href: "/network/graph", color: "#6366f1" }, { label: "Perfil", href: "/profile", color: "#7FB8FF" }]}
            live
            actions={
                <Link href="/network" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Abrir <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const sorted = [...data].sort((a, b) => (b.unread - a.unread) || (b.ts - a.ts));
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sorted}
                            max={max}
                            empty="Sin mensajes"
                            render={(t) => {
                                const KindIcon = KIND_ICON[t.kind];
                                return (
                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors cursor-pointer">
                                        <span className="relative shrink-0 grid place-items-center size-8 rounded-xl border text-white font-black text-xs"
                                            style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accent}66)`, borderColor: `${t.accent}55` }}>
                                            {t.name.charAt(0)}
                                            {t.online && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-background" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="inline-flex items-center gap-1 text-[11px] @sm:text-xs font-bold truncate">
                                                    <KindIcon className="size-3 shrink-0 opacity-60" /> {t.name}
                                                </span>
                                                {!micro && <span className="text-[10px] text-muted-foreground/50 font-bold shrink-0 tabular-nums">{timeAgo(t.ts)}</span>}
                                            </div>
                                            {!micro && <p className="text-[10px] text-muted-foreground/70 leading-snug truncate">{t.lastMessage}</p>}
                                        </div>
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
                );
            }}
        </WidgetShell>
    );
}
