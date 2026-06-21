'use client';

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
    Bell, AlertTriangle, Info, CheckCircle2, Landmark, Users, Coins,
    Check, X, CheckCheck, Zap, Filter, type LucideIcon
} from "lucide-react";
import Link from "next/link";
import { WidgetShell, Chip, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useWidgetData } from "@/lib/widget-data";
import type { Notification } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// NotificationsWidget v3 — monitor sensorial del sistema y la red.
// ----------------------------------------------------------------
// MEJORAS v3 (sobre v2):
//   • Tira-resumen data-driven: prioridad alta + no leídas con color.
//   • Filtro "Solo sin leer" que reordena/acota la corriente.
//   • Triaje por prioridad: críticas primero, con barra y glow propios.
//   • Animaciones respetan config.animations + prefers-reduced-motion.
//   • Deep-links a rutas reales del ecosistema por tipo de alerta.
//   • Estados vacíos contextuales (sin alertas / todo leído / sin filtro).
// ════════════════════════════════════════════════════════════════

const KIND_META: Record<Notification["kind"], {
    icon: LucideIcon; color: string; label: string;
    glow: string; bg: string; href: string;
}> = {
    info:       { icon: Info,         color: "#38bdf8", label: "Info",       glow: "#38bdf833", bg: "#38bdf810", href: "/dashboard" },
    success:    { icon: CheckCircle2, color: "#10b981", label: "OK",         glow: "#10b98133", bg: "#10b98110", href: "/network" },
    warning:    { icon: AlertTriangle,color: "#f59e0b", label: "Aviso",      glow: "#f59e0b44", bg: "#f59e0b12", href: "/explorer" },
    governance: { icon: Landmark,     color: "#a855f7", label: "Gobernanza", glow: "#a855f755", bg: "#a855f712", href: "/network/politics" },
    social:     { icon: Users,        color: "#ec4899", label: "Social",     glow: "#ec489933", bg: "#ec489910", href: "/network" },
};

type FilterId = "todo" | "governance" | "red" | "sistema" | "economia";
const FILTERS: Array<{ id: FilterId; label: string; icon: LucideIcon; match: (k: Notification["kind"]) => boolean }> = [
    { id: "todo",       label: "Todo",       icon: Bell,    match: () => true },
    { id: "governance", label: "Gobernanza", icon: Landmark, match: (k) => k === "governance" },
    { id: "red",        label: "Red",        icon: Users,   match: (k) => k === "social" },
    { id: "sistema",    label: "Sistema",    icon: Zap,     match: (k) => k === "info" || k === "warning" },
    { id: "economia",   label: "Economía",   icon: Coins,   match: (k) => k === "success" },
];

function isHighPriority(n: Notification): boolean {
    return n.kind === "warning" || n.kind === "governance";
}

/** ¿Reciente? (<15 min) → realza la marca de tiempo (data-driven). */
function isFresh(ts: number): boolean {
    return Date.now() - ts < 15 * 60_000;
}

export function NotificationsWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { data, loading } = useWidgetData("common.notifications", { refreshMs: 10000 });

    const [filter, setFilter] = useState<FilterId>("todo");
    const [onlyUnread, setOnlyUnread] = useState(false);
    const [readLocal, setReadLocal] = useState<Set<string>>(() => new Set());
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

    const merged = useMemo<Notification[]>(() => {
        return (data ?? [])
            .filter((n) => !dismissed.has(n.id))
            .map((n) => (readLocal.has(n.id) ? { ...n, read: true } : n))
            .sort((a, b) =>
                (Number(a.read) - Number(b.read)) ||
                (Number(isHighPriority(b)) - Number(isHighPriority(a))) ||
                (b.ts - a.ts)
            );
    }, [data, readLocal, dismissed]);

    const counts = useMemo(() => {
        const c: Record<FilterId, number> = { todo: 0, governance: 0, red: 0, sistema: 0, economia: 0 };
        for (const n of merged) for (const f of FILTERS) if (f.match(n.kind)) c[f.id] += 1;
        return c;
    }, [merged]);

    const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
    const visible = useMemo(
        () => merged.filter((n) => activeFilter.match(n.kind) && (!onlyUnread || !n.read)),
        [merged, activeFilter, onlyUnread]
    );
    const unread = merged.filter((n) => !n.read).length;
    // Triaje data-driven: alertas críticas (alta prioridad y no leídas).
    const criticalCount = useMemo(() => merged.filter((n) => isHighPriority(n) && !n.read).length, [merged]);

    function markRead(id: string) {
        setReadLocal((prev) => { const s = new Set(prev); s.add(id); return s; });
    }
    function dismiss(id: string) {
        setDismissed((prev) => { const s = new Set(prev); s.add(id); return s; });
    }
    function markAllRead() {
        setReadLocal((prev) => { const s = new Set(prev); for (const n of merged) s.add(n.id); return s; });
    }

    return (
        <WidgetShell
            title="Alertas"
            subtitle="Monitor sensorial"
            icon={Bell}
            accent="#f43f5e"
            live
            expandHref="/dashboard"
            actions={
                unread > 0 ? (
                    <motion.span
                        key={unread}
                        initial={animate ? { scale: 0.6, opacity: 0 } : false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 18 }}
                        className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500/20 border border-rose-500/50 text-[10px] font-black tabular-nums text-rose-300"
                        style={{ boxShadow: "0 0 8px #f43f5e55" }}
                    >
                        {unread}
                    </motion.span>
                ) : undefined
            }
            connections={[
                { label: "Gobernanza", href: "/network/politics", color: "#a855f7", icon: Landmark },
                { label: "Red",        href: "/network",          color: "#ec4899", icon: Users },
                { label: "Exocórtex",  href: "/agent",            color: "#38bdf8", icon: Info },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                // ── Micro: compact icon list ──────────────────────────────
                if (micro) {
                    const topItems = merged.slice(0, 3);
                    return (
                        <div className="h-full flex flex-col gap-1.5 pt-1">
                            {topItems.map((n, i) => {
                                const meta = KIND_META[n.kind];
                                const Icon = meta.icon;
                                const high = isHighPriority(n) && !n.read;
                                return (
                                    <motion.div
                                        key={n.id}
                                        initial={animate ? { opacity: 0, x: -8 } : false}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: animate ? i * 0.06 : 0, ease: [0.16, 1, 0.3, 1] }}
                                        className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
                                        style={{
                                            borderColor: n.read ? "hsl(var(--border)/0.3)" : `${meta.color}40`,
                                            background: n.read ? undefined : meta.bg,
                                        }}
                                    >
                                        <span className="shrink-0 grid place-items-center size-5 rounded-md"
                                            style={{ color: meta.color, background: meta.bg }}>
                                            <Icon className="size-3" />
                                        </span>
                                        <span className="text-[10px] font-semibold truncate min-w-0 flex-1">{n.title}</span>
                                        {high && (
                                            <span className={`size-1.5 rounded-full shrink-0 ${animate ? "animate-pulse" : ""}`}
                                                style={{ background: meta.color }} />
                                        )}
                                    </motion.div>
                                );
                            })}
                            {topItems.length === 0 && (
                                <div className="flex-1 grid place-items-center text-[10px] text-muted-foreground/50 italic">Sin alertas</div>
                            )}
                        </div>
                    );
                }

                return (
                    <div className="pt-1 h-full flex flex-col gap-2">
                        {/* ── Tira-resumen de triaje (data-driven) ───────── */}
                        {size.tier !== "compact" && merged.length > 0 && (
                            <div className="shrink-0 flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                {criticalCount > 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-300 tabular-nums">
                                        <AlertTriangle className="size-2.5" />{criticalCount} críticas
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-400">
                                        <CheckCircle2 className="size-2.5" /> Sin críticas
                                    </span>
                                )}
                                <span className="text-[10px] font-bold text-muted-foreground/60 tabular-nums">
                                    {unread} sin leer · {merged.length} total
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setOnlyUnread((v) => !v)}
                                    aria-pressed={onlyUnread}
                                    className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${onlyUnread ? "border-rose-500/50 bg-rose-500/15 text-rose-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"}`}
                                >
                                    <Filter className="size-2.5" /> Sin leer
                                </button>
                            </div>
                        )}

                        {/* ── Filtros ─────────────────────────────────────── */}
                        <div className="shrink-0 flex flex-col gap-1.5">
                            <div className="flex items-center gap-1 overflow-x-auto -mx-0.5 px-0.5 pb-0.5 no-scrollbar">
                                {FILTERS.map((f) => {
                                    const FIcon = f.icon;
                                    const active = f.id === filter;
                                    const n = counts[f.id];
                                    return (
                                        <motion.button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setFilter(f.id)}
                                            aria-pressed={active}
                                            whileHover={animate ? { scale: 1.04 } : undefined}
                                            whileTap={animate ? { scale: 0.96 } : undefined}
                                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                                            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${
                                                active
                                                    ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                                                    : "border-border/40 bg-white/[0.02] text-muted-foreground/70 hover:text-foreground"
                                            }`}
                                        >
                                            <FIcon className="size-3" /> {f.label}
                                            {n > 0 && (
                                                <span className="tabular-nums opacity-70">{n}</span>
                                            )}
                                        </motion.button>
                                    );
                                })}
                            </div>
                            {unread > 0 && (
                                <button
                                    type="button"
                                    onClick={markAllRead}
                                    className="self-end inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-rose-300 transition-colors cursor-pointer"
                                >
                                    <CheckCheck className="size-3" /> Marcar todo leído
                                </button>
                            )}
                        </div>

                        {/* ── Lista ───────────────────────────────────────── */}
                        <div className="flex-1 min-h-0 overflow-auto no-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                <AnimatePresence initial={false}>
                                    {visible.slice(0, max).map((n, i) => {
                                        const meta = KIND_META[n.kind];
                                        const Icon = meta.icon;
                                        const high = isHighPriority(n) && !n.read;
                                        const fresh = isFresh(n.ts) && !n.read;
                                        return (
                                            <motion.div
                                                key={n.id}
                                                layout={animate}
                                                initial={animate ? { opacity: 0, y: 6, scale: 0.98 } : false}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={animate ? { opacity: 0, x: 16, scale: 0.95 } : { opacity: 0 }}
                                                transition={{ delay: animate ? i * 0.04 : 0, ease: [0.16, 1, 0.3, 1], duration: animate ? 0.28 : 0 }}
                                                className={`relative flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                                                    n.read
                                                        ? "border-border/40 bg-white/[0.02] opacity-75"
                                                        : "border-border/50 bg-white/[0.04]"
                                                }`}
                                                style={
                                                    high
                                                        ? {
                                                            borderColor: `${meta.color}50`,
                                                            background: meta.bg,
                                                            boxShadow: `0 0 0 1px ${meta.color}30, 0 4px 18px -8px ${meta.glow}`,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {/* Priority bar */}
                                                {!n.read && (
                                                    <span
                                                        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
                                                        style={{ background: `linear-gradient(to bottom, ${meta.color}, ${meta.color}44)` }}
                                                    />
                                                )}

                                                {/* Icon */}
                                                <span
                                                    className="shrink-0 grid place-items-center size-7 rounded-lg border"
                                                    style={{ color: meta.color, borderColor: `${meta.color}40`, background: meta.bg }}
                                                >
                                                    {!n.read && high && animate ? (
                                                        <motion.span
                                                            animate={{ scale: [1, 1.2, 1] }}
                                                            transition={{ repeat: Infinity, duration: 2, ease: [0.16, 1, 0.3, 1] }}
                                                            className="grid place-items-center"
                                                        >
                                                            <Icon className="size-3.5" />
                                                        </motion.span>
                                                    ) : (
                                                        <Icon className="size-3.5" />
                                                    )}
                                                </span>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Link
                                                            href={meta.href}
                                                            className="inline-flex items-center gap-1 text-[11px] @sm:text-xs font-bold truncate min-w-0 hover:underline cursor-pointer"
                                                        >
                                                            {high && (
                                                                <AlertTriangle className="size-3 shrink-0" style={{ color: meta.color }} />
                                                            )}
                                                            {n.title}
                                                        </Link>
                                                        <span className={`text-[10px] font-bold shrink-0 tabular-nums inline-flex items-center gap-1 ${fresh ? "text-emerald-400" : "text-muted-foreground/50"}`}>
                                                            {fresh && <span className={`size-1 rounded-full bg-emerald-400 ${animate ? "animate-pulse" : ""}`} />}
                                                            {timeAgo(n.ts)}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2 mt-0.5">
                                                        {n.body}
                                                    </p>
                                                    <div className="mt-1 flex items-center justify-between gap-2">
                                                        <Chip color={meta.color}>{meta.label}</Chip>
                                                        <div className="flex items-center gap-1">
                                                            {!n.read && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => markRead(n.id)}
                                                                    title="Marcar como leída"
                                                                    aria-label="Marcar como leída"
                                                                    className="grid place-items-center size-6 rounded-lg text-muted-foreground/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                                                                >
                                                                    <Check className="size-3.5" />
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => dismiss(n.id)}
                                                                title="Descartar"
                                                                aria-label="Descartar"
                                                                className="grid place-items-center size-6 rounded-lg text-muted-foreground/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                                            >
                                                                <X className="size-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                {visible.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                                        <span className="grid place-items-center size-10 rounded-2xl border border-border/40 bg-muted/20">
                                            <CheckCircle2 className="size-5 text-emerald-400/60" strokeWidth={1.5} />
                                        </span>
                                        <span className="text-xs text-muted-foreground/60">
                                            {onlyUnread ? "Todo al día — sin alertas sin leer" : filter !== "todo" ? "Sin alertas en esta categoría" : "Sin alertas pendientes"}
                                        </span>
                                        {(onlyUnread || filter !== "todo") && (
                                            <button type="button" onClick={() => { setOnlyUnread(false); setFilter("todo"); }}
                                                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-300 hover:text-rose-200 transition-colors cursor-pointer">
                                                Ver todas
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
