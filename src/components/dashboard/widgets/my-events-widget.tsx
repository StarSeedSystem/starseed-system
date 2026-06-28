"use client";

// ════════════════════════════════════════════════════════════════
// MyEventsWidget — eventos REALES próximos de la red (os_events).
// ----------------------------------------------------------------
// Datos reales (tabla os_events) EN VIVO vía useLiveEvents (realtime).
// Prioriza los eventos futuros (cuenta atrás), cae a los más recientes
// si no hay próximos. Cada tarjeta navega a /evento/<slug>. Cabecera con
// acción para abrir el área completa. Estado vacío en español con CTA
// para crear el primer evento. Adaptativo + theme (WidgetShell + kit).
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
    CalendarDays, Plus, MapPin, Users, ChevronRight, Clock, Sparkles,
    Landmark, Wrench, Palette, ShoppingBasket, Flame, type LucideIcon,
} from "lucide-react";
import { WidgetShell, Chip, timeUntil, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useLiveEvents, tsOf, isUpcoming, rowAccent, type OsEventRow } from "@/lib/widget-data/os-live";

const ACCENT = "#f59e0b";

// Iconos por tipo de evento (kind) — coherentes con la red.
const KIND_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
    asamblea: { icon: Landmark, label: "Asamblea", color: "#a855f7" },
    taller:   { icon: Wrench,   label: "Taller",   color: "#10b981" },
    ritual:   { icon: Sparkles, label: "Ritual",   color: "#ec4899" },
    obra:     { icon: Palette,  label: "Obra",     color: "#38bdf8" },
    mercado:  { icon: ShoppingBasket, label: "Mercado", color: "#f59e0b" },
};
function kindMeta(kind: string | null) {
    return KIND_META[(kind ?? "").toLowerCase()] ?? { icon: CalendarDays, label: kind || "Encuentro", color: ACCENT };
}

export function MyEventsWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows, loading } = useLiveEvents();

    // Orden inteligente: próximos primero (asc por fecha), luego pasados (desc).
    const { upcoming, past, nextEvent } = useMemo(() => {
        const up = rows.filter((e) => isUpcoming(e.starts_at)).sort((a, b) => tsOf(a.starts_at) - tsOf(b.starts_at));
        const pa = rows.filter((e) => !isUpcoming(e.starts_at)).sort((a, b) => tsOf(b.starts_at) - tsOf(a.starts_at));
        return { upcoming: up, past: pa, nextEvent: up[0] ?? null };
    }, [rows]);

    const totalAttendees = useMemo(
        () => rows.reduce((s, e) => s + (e.attendee_count ?? 0), 0),
        [rows],
    );

    return (
        <WidgetShell
            title="Eventos"
            subtitle="Encuentros de la red"
            icon={CalendarDays}
            accent={ACCENT}
            live
            connections={[
                { label: "Comunidades", href: "/hub", color: "#9FE870", icon: Users },
                { label: "Red", href: "/network", color: "#38bdf8" },
            ]}
            actions={
                <>
                    <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Todos <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/publish?type=event" className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Crear
                    </Link>
                </>
            }
        >
            {(size) => {
                if (loading && rows.length === 0) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                // ── Estado vacío real (sin eventos en la red) ──
                if (rows.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-amber-400/30 bg-amber-500/10">
                                <CalendarDays className="size-6 text-amber-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay eventos</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Crea el primer encuentro de tu comunidad.</p>
                            </div>
                            <Link href="/publish?type=event" className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Crear evento
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: cuenta atrás del próximo evento ──
                if (micro) {
                    const ev = nextEvent ?? past[0];
                    const meta = kindMeta(ev?.kind ?? null);
                    const Icon = meta.icon;
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <span className="shrink-0 grid place-items-center size-11 rounded-2xl border text-white"
                                style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}66)`, borderColor: `${meta.color}55` }}>
                                <Icon className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                {ev ? (
                                    <Link href={`/evento/${ev.slug}`} className="block cursor-pointer">
                                        <p className="text-[11px] font-black truncate" style={{ color: meta.color }}>{ev.title}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground/70 tabular-nums mt-0.5">
                                            <Clock className="size-2.5 inline mr-0.5" />
                                            {isUpcoming(ev.starts_at) ? timeUntil(tsOf(ev.starts_at)) : timeAgo(tsOf(ev.starts_at))}
                                        </p>
                                    </Link>
                                ) : <p className="text-[10px] text-muted-foreground/50 italic">Sin eventos</p>}
                            </div>
                        </div>
                    );
                }

                const list = upcoming.length > 0 ? upcoming : past;
                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 3 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* Resumen agregado */}
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 tabular-nums">
                                    <CalendarDays className="size-3" />{upcoming.length} próximos
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
                                    <Users className="size-3" />{totalAttendees.toLocaleString()} asistencias
                                </span>
                                {past.length > 0 && (
                                    <span className="ml-auto text-[9px] text-muted-foreground/50 font-bold tabular-nums">{past.length} pasados</span>
                                )}
                            </div>
                        )}

                        {/* Próximo evento destacado (spotlight con cuenta atrás) */}
                        {size.vTier !== "compact" && nextEvent && (() => {
                            const meta = kindMeta(nextEvent.kind);
                            const Icon = meta.icon;
                            const soon = tsOf(nextEvent.starts_at) - Date.now() < 24 * 3600 * 1000;
                            return (
                                <Link href={`/evento/${nextEvent.slug}`} className="block shrink-0 cursor-pointer">
                                    <div className="relative rounded-2xl overflow-hidden px-3 py-2.5 border"
                                        style={{
                                            background: `linear-gradient(135deg, color-mix(in srgb, ${meta.color} 20%, transparent), color-mix(in srgb, ${meta.color} 6%, transparent))`,
                                            borderColor: `color-mix(in srgb, ${meta.color} 35%, transparent)`,
                                        }}>
                                        <div className="flex items-center gap-2.5">
                                            <span className="shrink-0 grid place-items-center size-10 rounded-xl border text-white"
                                                style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}55)`, borderColor: `${meta.color}55` }}>
                                                <Icon className="size-5" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="text-xs font-black truncate" style={{ color: meta.color }}>{nextEvent.title}</span>
                                                    <Chip color={meta.color}>{meta.label}</Chip>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                                    {nextEvent.location && (
                                                        <span className="inline-flex items-center gap-0.5 truncate"><MapPin className="size-2.5 shrink-0" />{nextEvent.location}</span>
                                                    )}
                                                    <span className="ml-auto inline-flex items-center gap-0.5 font-black tabular-nums shrink-0" style={{ color: soon ? "#fb7185" : meta.color }}>
                                                        {soon && animate && <Flame className="size-2.5" />}<Clock className="size-2.5" />{timeUntil(tsOf(nextEvent.starts_at))}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })()}

                        {/* Lista de eventos */}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {list.slice(nextEvent && size.vTier !== "compact" ? 1 : 0, max).map((ev, idx) => {
                                    const meta = kindMeta(ev.kind);
                                    const Icon = meta.icon;
                                    const future = isUpcoming(ev.starts_at);
                                    return (
                                        <motion.div key={ev.id}
                                            initial={animate ? { opacity: 0, x: -10 } : false}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02]">
                                            <Link href={`/evento/${ev.slug}`} className="block px-2.5 py-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <span className="shrink-0 grid place-items-center size-8 rounded-xl border text-white"
                                                        style={{ background: `linear-gradient(135deg, ${meta.color}, ${meta.color}55)`, borderColor: `${meta.color}44` }}>
                                                        <Icon className="size-4" />
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{ev.title}</span>
                                                            <Chip color={meta.color}>{meta.label}</Chip>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground/60">
                                                            {ev.location && <span className="inline-flex items-center gap-0.5 truncate"><MapPin className="size-2.5 shrink-0" />{ev.location}</span>}
                                                            <span className="inline-flex items-center gap-0.5 tabular-nums shrink-0"><Users className="size-2.5" />{(ev.attendee_count ?? 0).toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    <span className="shrink-0 text-[9px] font-black tabular-nums inline-flex items-center gap-0.5"
                                                        style={{ color: future ? meta.color : "#94a3b8" }}>
                                                        <Clock className="size-2.5" />{future ? timeUntil(tsOf(ev.starts_at)) : timeAgo(tsOf(ev.starts_at))}
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
