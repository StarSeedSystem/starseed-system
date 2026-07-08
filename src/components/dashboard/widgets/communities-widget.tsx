"use client";

// ════════════════════════════════════════════════════════════════
// CommunitiesWidget — comunidades REALES de la red (os_pages, kind=comunidad).
// ----------------------------------------------------------------
// Datos reales EN VIVO: filtra os_pages por kind="comunidad" vía
// useLivePages (realtime). Cada tarjeta navega a /pagina/<slug>. Resalta
// la comunidad con más miembros (momentum). Cabecera con acción al Hub.
// Estado vacío en español con CTA para fundar la primera comunidad.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Globe2, Plus, Users, ChevronRight, Sprout, Flame } from "lucide-react";
import { WidgetShell, Chip, ProgressRing } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useLivePages, rowAccent, type OsPageRow } from "@/lib/widget-data/os-live";

const ACCENT = "#9FE870";

export function CommunitiesWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows, loading } = useLivePages();

    const communities = useMemo(
        () => rows.filter((p) => (p.kind ?? "").toLowerCase() === "comunidad")
            .sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)),
        [rows],
    );

    const totalMembers = useMemo(() => communities.reduce((s, c) => s + (c.member_count ?? 0), 0), [communities]);
    const top = communities[0] ?? null;
    const maxMembers = top?.member_count ?? 1;

    return (
        <WidgetShell
            title="Comunidades"
            subtitle="Sanghas · biorregiones · colectivos"
            icon={Globe2}
            accent={ACCENT}
            live
            connections={[
                { label: "Hub", href: "/hub", color: "#9FE870" },
                { label: "Explorar", href: "/explorer", color: "#f59e0b" },
            ]}
            actions={
                <>
                    <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Hub <ChevronRight className="size-3" />
                    </Link>
                    <Link href="?createEntity=page" className="inline-flex items-center gap-1 rounded-full border border-lime-400/30 bg-lime-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-lime-300 hover:bg-lime-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Fundar
                    </Link>
                </>
            }
        >
            {(size) => {
                if (loading && rows.length === 0) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (communities.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-lime-400/30 bg-lime-500/10">
                                <Sprout className="size-6 text-lime-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay comunidades</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Funda la primera y reúne a tu gente.</p>
                            </div>
                            <Link href="?createEntity=page" className="inline-flex items-center gap-1.5 rounded-full border border-lime-400/40 bg-lime-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-lime-300 hover:bg-lime-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Fundar comunidad
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={1} size={52} stroke={5} color={rowAccent(top?.accent)} label={String(communities.length)} sublabel="com." />
                            <div className="min-w-0 flex-1">
                                {top && (
                                    <Link href={`/pagina/${top.slug}`} className="block cursor-pointer">
                                        <p className="text-[11px] font-black truncate" style={{ color: rowAccent(top.accent) }}>{top.name}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground/70 tabular-nums mt-0.5"><Users className="size-2.5 inline mr-0.5" />{(top.member_count ?? 0).toLocaleString()}</p>
                                    </Link>
                                )}
                            </div>
                        </div>
                    );
                }

                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 3 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-lime-300 tabular-nums">
                                    <Globe2 className="size-3" />{communities.length} comunidades
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
                                    <Users className="size-3" />{totalMembers.toLocaleString()} miembros
                                </span>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {communities.slice(0, max).map((c, idx) => {
                                    const accent = rowAccent(c.accent);
                                    const share = Math.max(0.06, (c.member_count ?? 0) / maxMembers);
                                    const hot = idx === 0;
                                    return (
                                        <motion.div key={c.id}
                                            initial={animate ? { opacity: 0, x: -10 } : false}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02]">
                                            <Link href={`/pagina/${c.slug}`} className="block px-2.5 py-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <span className="shrink-0 relative grid place-items-center size-8 rounded-xl border text-white font-black text-xs"
                                                        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}55)`, borderColor: `${accent}44` }}>
                                                        {c.name.charAt(0)}
                                                        {hot && animate && (
                                                            <motion.span animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.4, repeat: Infinity }}
                                                                className="absolute inset-0 rounded-xl border-2 pointer-events-none" style={{ borderColor: accent }} />
                                                        )}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{c.name}</span>
                                                            {hot && <span className="inline-flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wide" style={{ color: accent }}><Flame className="size-2.5" />Pujante</span>}
                                                        </div>
                                                        <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                                                            <motion.div className="h-full rounded-full" style={{ background: accent }}
                                                                initial={animate ? { width: 0 } : false} animate={{ width: `${share * 100}%` }} transition={{ duration: animate ? 0.7 : 0 }} />
                                                        </div>
                                                    </div>
                                                    <span className="shrink-0 text-[9px] font-black tabular-nums inline-flex items-center gap-0.5" style={{ color: accent }}>
                                                        <Users className="size-2.5" />{(c.member_count ?? 0).toLocaleString()}
                                                    </span>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
