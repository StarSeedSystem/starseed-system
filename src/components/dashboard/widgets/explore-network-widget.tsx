'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Compass, TrendingUp, ChevronRight, Users, Telescope, Globe } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, ProgressRing } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { NetworkEntity } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// ExploreNetworkWidget — comunidades y entidades en tendencia.
// Datos en vivo "social.entities". Lista de momentum + filtro kind.
// Adaptativo + theme-aware. Accent "#f59e0b". Link a /explorer.
// ════════════════════════════════════════════════════════════════

const ACCENT = "#f59e0b";

const KIND_META: Record<NetworkEntity["kind"], { label: string; emoji: string }> = {
    comunidad:  { label: "Comunidad",  emoji: "🏘" },
    sangha:     { label: "Sangha",     emoji: "🌿" },
    colectivo:  { label: "Colectivo",  emoji: "✊" },
    biorregion: { label: "Biorregión", emoji: "🌍" },
};

const KIND_KEYS: Array<NetworkEntity["kind"] | "todas"> = ["todas", "comunidad", "sangha", "colectivo", "biorregion"];

export function ExploreNetworkWidget() {
    const { data, loading } = useWidgetData("social.entities", { refreshMs: 6000 });
    const [filter, setFilter] = useState<NetworkEntity["kind"] | "todas">("todas");
    const [joined, setJoined] = useState<Set<string>>(new Set());

    const sorted = useMemo(() => {
        const list = data ?? [];
        const filtered = filter === "todas" ? list : list.filter(e => e.kind === filter);
        return [...filtered].sort((a, b) => b.momentum - a.momentum);
    }, [data, filter]);

    const top = sorted[0];
    const totalMembers = (data ?? []).reduce((acc, e) => acc + e.members, 0);

    return (
        <WidgetShell
            title="Explorar Red"
            subtitle="Entidades en tendencia"
            icon={Telescope}
            accent={ACCENT}
            connections={[{ label: "Gráfica Viva", href: "/network/graph", color: "#6366f1" }, { label: "Comunidades", href: "/hub", color: "#9FE870" }, { label: "Explorer", href: "/explorer", color: "#22d3ee" }]}
            live
            actions={
                <Link href="/explorer" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Explorer <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: top entidad + ring de momentum ──────────
                if (micro) {
                    if (!top) return <div className="h-full grid place-items-center text-xs text-muted-foreground/50 italic">Sin entidades</div>;
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={top.momentum} size={52} stroke={5} color={top.accent ?? ACCENT}
                                label={`${Math.round(top.momentum * 100)}%`} sublabel="mom." />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate" style={{ color: top.accent ?? ACCENT }}>{top.name}</p>
                                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide truncate">{KIND_META[top.kind]?.label}</p>
                                <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5">
                                    <Users className="size-2.5 inline mr-0.5" />{top.members.toLocaleString()}
                                </p>
                            </div>
                        </div>
                    );
                }

                const maxItems = size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 3 : 4;
                const showFilter = size.tier !== "compact" && size.vTier !== "compact";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">

                        {/* Cabecera: conteo total + filtro kind */}
                        <div className="shrink-0 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
                                <Globe className="size-3" /> {(data ?? []).length} entidades · {totalMembers.toLocaleString()} miembros
                            </span>
                            {showFilter && (
                                <div className="flex items-center gap-1">
                                    {KIND_KEYS.slice(0, 3).map(k => (
                                        <button key={k} onClick={() => setFilter(k)}
                                            className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${filter === k ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"}`}>
                                            {k === "todas" ? "Todo" : KIND_META[k as NetworkEntity["kind"]]?.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Lista de entidades */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={sorted}
                                max={maxItems}
                                empty="Sin entidades en tendencia"
                                render={(e) => {
                                    const isJoined = joined.has(e.id);
                                    return (
                                        <motion.div
                                            whileHover={{ scale: 1.01 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-amber-500/25 transition-colors"
                                        >
                                            <div className="flex items-center gap-2">
                                                {/* Avatar inicial */}
                                                <div className="shrink-0 grid place-items-center size-7 rounded-lg text-[11px] font-black text-white"
                                                    style={{ background: `linear-gradient(135deg, ${e.accent}, color-mix(in srgb, ${e.accent} 50%, #000))` }}>
                                                    {e.name.charAt(0)}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] @sm:text-xs font-bold truncate">{e.name}</span>
                                                        <Chip color={e.accent ?? ACCENT}>{KIND_META[e.kind]?.label ?? e.kind}</Chip>
                                                    </div>
                                                    <p className="text-[9px] text-muted-foreground/60 truncate leading-tight">{e.focus}</p>
                                                </div>

                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-black text-emerald-400">
                                                        <TrendingUp className="size-2.5" />{Math.round(e.momentum * 100)}
                                                    </span>
                                                    <button
                                                        onClick={() => setJoined(prev => {
                                                            const next = new Set(prev);
                                                            next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                                                            return next;
                                                        })}
                                                        className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide transition-colors cursor-pointer ${isJoined ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}`}
                                                    >
                                                        {isJoined ? "Miembro" : "Unirse"}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-1.5 flex items-center gap-2">
                                                <div className="flex-1"><ProgressBar value={e.momentum} color={e.accent ?? ACCENT} height={3} /></div>
                                                <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60">
                                                    <Users className="size-2.5" />{e.members.toLocaleString()}
                                                </span>
                                            </div>
                                        </motion.div>
                                    );
                                }}
                            />
                        </div>

                        {/* Footer expandido: top entidad destacada */}
                        {size.vTier === "expanded" && top && (
                            <div className="shrink-0 rounded-xl border px-2.5 py-1.5" style={{ borderColor: `color-mix(in srgb, ${top.accent} 25%, transparent)`, background: `color-mix(in srgb, ${top.accent} 5%, transparent)` }}>
                                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: top.accent }}>Top momentum</span>
                                <p className="text-[11px] font-semibold leading-snug truncate">{top.name} — {top.focus}</p>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
