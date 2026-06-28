'use client';

// ════════════════════════════════════════════════════════════════
// RecentActivityWidget — registro acásico REAL de la red, en vivo.
// ----------------------------------------------------------------
// Construye la corriente de actividad a partir de DATOS REALES de varias
// áreas, todos EN VIVO (realtime): publicaciones (os_posts), nuevos
// eventos (os_events), nuevas comunidades/páginas (os_pages) y grupos
// (os_groups). Cada entrada navega a su entidad REAL (/pagina, /grupo,
// /evento, /network). Estado vacío en español con CTA para publicar.
// Sin datos simulados.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
    History, FileEdit, Users, CalendarPlus, Sparkles, ChevronRight,
    type LucideIcon,
} from "lucide-react";
import { WidgetShell, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import {
    useLivePosts, useLiveEvents, useLivePages, useLiveGroups, tsOf,
} from "@/lib/widget-data/os-live";

type ActKind = "post" | "event" | "community" | "group";

interface ActItem {
    id: string;
    actor: string;
    action: string;
    target: string;
    kind: ActKind;
    ts: number;
    href: string;
}

const KIND_META: Record<ActKind, { icon: LucideIcon; color: string }> = {
    post:      { icon: FileEdit,     color: "#38bdf8" },
    event:     { icon: CalendarPlus, color: "#f59e0b" },
    community: { icon: Sparkles,     color: "#9FE870" },
    group:     { icon: Users,        color: "#10b981" },
};

function entityHrefFor(entityType: string | null, slug: string | null): string {
    const t = (entityType ?? "").toLowerCase();
    if (!slug) return "/network";
    if (t === "group") return `/grupo/${slug}`;
    if (t === "event") return `/evento/${slug}`;
    return `/pagina/${slug}`;
}

function isRecent(ts: number): boolean {
    return Date.now() - ts < 5 * 60 * 1000;
}

export function RecentActivityWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows: posts } = useLivePosts(16);
    const { rows: events } = useLiveEvents();
    const { rows: pages } = useLivePages();
    const { rows: groups } = useLiveGroups();
    const loadingAll = !posts && !events && !pages && !groups;

    const items = useMemo<ActItem[]>(() => {
        const out: ActItem[] = [];

        for (const p of posts) {
            out.push({
                id: `post-${p.id}`,
                actor: p.author_name?.trim() || "Ciudadano",
                action: "publicó en",
                target: p.entity_slug ? p.entity_slug.replace(/-/g, " ") : "la red",
                kind: "post",
                ts: tsOf(p.created_at),
                href: entityHrefFor(p.entity_type, p.entity_slug),
            });
        }
        for (const e of events) {
            out.push({
                id: `event-${e.id}`,
                actor: "Nuevo evento",
                action: "anunciado:",
                target: e.title,
                kind: "event",
                ts: tsOf(e.created_at) || tsOf(e.starts_at),
                href: `/evento/${e.slug}`,
            });
        }
        for (const pg of pages) {
            const isCommunity = (pg.kind ?? "").toLowerCase() === "comunidad";
            out.push({
                id: `page-${pg.id}`,
                actor: pg.name,
                action: isCommunity ? "se fundó como comunidad" : "se registró",
                target: "",
                kind: isCommunity ? "community" : "community",
                ts: tsOf(pg.created_at),
                href: `/pagina/${pg.slug}`,
            });
        }
        for (const g of groups) {
            out.push({
                id: `group-${g.id}`,
                actor: g.name,
                action: "abrió como grupo",
                target: "",
                kind: "group",
                ts: tsOf(g.created_at),
                href: `/grupo/${g.slug}`,
            });
        }

        return out.filter((i) => i.ts > 0).sort((a, b) => b.ts - a.ts);
    }, [posts, events, pages, groups]);

    return (
        <WidgetShell
            title="Actividad Reciente"
            subtitle="Registro acásico · en vivo"
            icon={History}
            accent="#38bdf8"
            live
            expandHref="/network"
            connections={[
                { label: "Red", href: "/network", color: "#38bdf8", icon: History },
                { label: "Hub", href: "/hub", color: "#10b981", icon: Users },
                { label: "Eventos", href: "/hub", color: "#f59e0b", icon: CalendarPlus },
            ]}
        >
            {(size) => {
                if (loadingAll) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (items.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-sky-400/30 bg-sky-500/10">
                                <History className="size-6 text-sky-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay actividad</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Publica algo o crea una entidad para empezar.</p>
                            </div>
                            <Link href="/publish" className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/25 transition-colors cursor-pointer">
                                Publicar <ChevronRight className="size-3.5" />
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;
                const shown = items.slice(0, max);

                return (
                    <div className="pt-1 h-full relative">
                        {!micro && shown.length > 1 && (
                            <motion.div
                                className="absolute rounded-full pointer-events-none"
                                style={{ background: "rgba(56,189,248,0.15)", height: `${shown.length * 52}px`, top: "1.5rem", left: "27px", width: "1.5px", transformOrigin: "top" }}
                                initial={animate ? { scaleY: 0 } : false}
                                animate={{ scaleY: 1 }}
                                transition={{ duration: animate ? 0.6 : 0, ease: "easeOut", delay: 0.15 }}
                            />
                        )}

                        <div className="flex flex-col gap-1.5">
                            {shown.map((a, idx) => {
                                const meta = KIND_META[a.kind];
                                const Icon = meta.icon;
                                const recent = isRecent(a.ts);
                                return (
                                    <motion.div key={a.id}
                                        initial={animate ? { opacity: 0, x: -12 } : false}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.04 : 0, ease: "easeOut" }}>
                                        <Link href={a.href} className="block cursor-pointer">
                                            <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-sky-400/25 hover:bg-white/[0.04] transition-colors">
                                                <span className="relative shrink-0 grid place-items-center size-7 rounded-lg border" style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                                                    <Icon className="size-3.5" />
                                                    {recent && animate && (
                                                        <motion.span animate={{ scale: [1, 1.7, 1], opacity: [0.7, 0, 0.7] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                                                            className="absolute inset-0 rounded-lg border pointer-events-none" style={{ borderColor: meta.color }} />
                                                    )}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] @sm:text-xs leading-snug truncate">
                                                        <span className="font-bold">{a.actor}</span>{" "}
                                                        <span className="text-muted-foreground/80">{a.action}</span>{a.target ? " " : ""}
                                                        <span className="font-semibold capitalize">{a.target}</span>
                                                    </p>
                                                    {recent && !micro && (
                                                        <span className="inline-flex items-center gap-1 mt-0.5">
                                                            <motion.span animate={animate ? { opacity: [0.5, 1, 0.5] } : undefined} transition={{ duration: 1.5, repeat: Infinity }} className="size-1.5 rounded-full bg-emerald-400" />
                                                            <span className="text-[9px] font-bold text-emerald-400/80 uppercase tracking-wider">ahora</span>
                                                        </span>
                                                    )}
                                                </div>
                                                {!micro && (
                                                    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: `${meta.color}15`, color: meta.color }}>
                                                        {timeAgo(a.ts)}
                                                    </span>
                                                )}
                                            </div>
                                        </Link>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
