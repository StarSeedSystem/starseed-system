'use client';

// ════════════════════════════════════════════════════════════════
// ActivitySummaryWidget — "Resumen de actividad"
// ----------------------------------------------------------------
// Panorámica NUMÉRICA de la red, en vivo, a partir de DATOS REALES
// (os_posts / os_pages / os_groups / os_events). Complementa al feed
// "Actividad Reciente" con métricas agregadas: total de publicaciones,
// comunidades, grupos y próximos eventos, además de una sparkline con
// las publicaciones de los últimos 7 días (derivada de created_at real).
// Sin datos simulados: si no hay filas, muestra ceros honestos y un
// estado vacío con CTA. Realtime vía los hooks de os-live.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import {
    Activity, FileEdit, Users, Sparkles, CalendarPlus, TrendingUp,
    ChevronRight,
} from "lucide-react";
import { WidgetShell, StatTile, Sparkline } from "../kit";
import type { SeriesPoint } from "@/lib/widget-data/types";
import {
    useLivePosts, useLiveEvents, useLivePages, useLiveGroups, tsOf, isUpcoming,
} from "@/lib/widget-data/os-live";

const ACCENT = "#34d399";
const DAY = 24 * 60 * 60 * 1000;

/** Serie de publicaciones por día (últimos `days` días) desde created_at real. */
function postsPerDay(createdAts: number[], days = 7): SeriesPoint[] {
    const now = Date.now();
    const start = now - (days - 1) * DAY;
    const buckets = new Array(days).fill(0);
    for (const ts of createdAts) {
        if (ts <= 0 || ts < start) continue;
        const idx = Math.min(days - 1, Math.floor((ts - start) / DAY));
        if (idx >= 0) buckets[idx] += 1;
    }
    return buckets.map((v, i) => ({ t: start + i * DAY, v }));
}

export function ActivitySummaryWidget() {
    const { rows: posts, loading: lp } = useLivePosts(120);
    const { rows: events, loading: le } = useLiveEvents();
    const { rows: pages, loading: lg } = useLivePages();
    const { rows: groups, loading: lgr } = useLiveGroups();

    const loading = lp && le && lg && lgr && posts.length === 0;

    const stats = useMemo(() => {
        const postTs = posts.map((p) => tsOf(p.created_at)).filter((t) => t > 0);
        const communities = pages.filter((p) => (p.kind ?? "").toLowerCase() === "comunidad").length;
        const upcoming = events.filter((e) => isUpcoming(e.starts_at)).length;

        // Tendencia: publicaciones de las últimas 24h vs las 24h previas.
        const now = Date.now();
        const last24 = postTs.filter((t) => now - t < DAY).length;
        const prev24 = postTs.filter((t) => now - t >= DAY && now - t < 2 * DAY).length;
        const change = prev24 === 0 ? (last24 > 0 ? 100 : 0) : ((last24 - prev24) / prev24) * 100;
        const trend: "up" | "down" | "flat" = last24 > prev24 ? "up" : last24 < prev24 ? "down" : "flat";

        return {
            posts: posts.length,
            communities,
            groups: groups.length,
            upcoming,
            series: postsPerDay(postTs, 7),
            last24,
            change: Math.round(change),
            trend,
            total: posts.length + pages.length + groups.length + events.length,
        };
    }, [posts, events, pages, groups]);

    return (
        <WidgetShell
            title="Resumen de actividad"
            subtitle="Pulso de la red · en vivo"
            icon={Activity}
            accent={ACCENT}
            live
            expandHref="/network"
            connections={[
                { label: "Red", href: "/network", color: "#38bdf8", icon: FileEdit },
                { label: "Hub", href: "/hub", color: "#9FE870", icon: Users },
                { label: "Eventos", href: "/hub", color: "#fb7185", icon: CalendarPlus },
            ]}
        >
            {(size) => {
                if (loading) {
                    return (
                        <div className="grid h-full grid-cols-2 gap-2">
                            {[0, 1, 2, 3].map((i) => (
                                <div key={i} className="rounded-2xl bg-muted/15 animate-pulse" />
                            ))}
                        </div>
                    );
                }

                if (stats.total === 0) {
                    return (
                        <div className="flex h-full flex-col items-center justify-center gap-3 px-3 text-center">
                            <span className="grid size-12 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-500/10">
                                <Activity className="size-6 text-emerald-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Sin actividad todavía</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground/60">Publica o crea una entidad para ver el pulso.</p>
                            </div>
                            <Link href="/publish" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer">
                                Publicar <ChevronRight className="size-3.5" />
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="flex h-full flex-col justify-center gap-1.5 pt-1">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-black tabular-nums tracking-tighter" style={{ color: ACCENT }}>{stats.posts}</span>
                                <span className="text-[10px] font-bold uppercase text-muted-foreground/60">publicaciones</span>
                            </div>
                            <Sparkline data={stats.series} color={ACCENT} height={28} />
                        </div>
                    );
                }

                return (
                    <div className="flex h-full flex-col gap-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                            <StatTile label="Publicaciones" value={stats.posts} icon={FileEdit} accent="#38bdf8" change={stats.change} trend={stats.trend} compact />
                            <StatTile label="Comunidades" value={stats.communities} icon={Sparkles} accent="#9FE870" compact />
                            <StatTile label="Grupos" value={stats.groups} icon={Users} accent="#10b981" compact />
                            <StatTile label="Próx. eventos" value={stats.upcoming} icon={CalendarPlus} accent="#fb7185" compact />
                        </div>

                        {size.vTier !== "compact" && (
                            <div className="mt-auto rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                <div className="mb-1 flex items-center justify-between">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                        <TrendingUp className="size-3" style={{ color: ACCENT }} /> Publicaciones · 7 días
                                    </span>
                                    <span className="text-[10px] font-black tabular-nums" style={{ color: ACCENT }}>+{stats.last24} hoy</span>
                                </div>
                                <Sparkline data={stats.series} color={ACCENT} height={36} />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default ActivitySummaryWidget;
