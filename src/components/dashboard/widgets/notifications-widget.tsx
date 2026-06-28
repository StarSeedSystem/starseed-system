'use client';

// ════════════════════════════════════════════════════════════════
// NotificationsWidget — alertas REALES del usuario (tabla notifications).
// ----------------------------------------------------------------
// Datos reales con alcance al propietario (user_id = uid) EN VIVO vía
// useMyNotifications (realtime). Filtro "sólo sin leer", marcar como leída
// (persistido: seen=true en Supabase), deep-link al campo `link`. Estados:
// cargando, sin sesión, vacío (todo al día). NUNCA inyecta datos falsos.
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
    Bell, AlertTriangle, Info, CheckCircle2, Landmark, Users, Coins,
    Check, CheckCheck, Filter, LogIn, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { WidgetShell, Chip, timeAgo } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { createClient } from "@/utils/supabase/client";
import { useMyNotifications, tsOf, type NotificationRow } from "@/lib/widget-data/os-live";

// Estética por tipo (kind) — tolerante a valores desconocidos.
const KIND_META: Record<string, { icon: LucideIcon; color: string; label: string; bg: string; glow: string }> = {
    info:       { icon: Info,          color: "#38bdf8", label: "Info",       bg: "#38bdf810", glow: "#38bdf833" },
    success:    { icon: CheckCircle2,  color: "#10b981", label: "OK",         bg: "#10b98110", glow: "#10b98133" },
    warning:    { icon: AlertTriangle, color: "#f59e0b", label: "Aviso",      bg: "#f59e0b12", glow: "#f59e0b44" },
    governance: { icon: Landmark,      color: "#a855f7", label: "Gobernanza", bg: "#a855f712", glow: "#a855f755" },
    social:     { icon: Users,         color: "#ec4899", label: "Social",     bg: "#ec489910", glow: "#ec489933" },
    economy:    { icon: Coins,         color: "#10b981", label: "Economía",   bg: "#10b98110", glow: "#10b98133" },
};
function kindMeta(kind: string | null) {
    return KIND_META[(kind ?? "").toLowerCase()] ?? KIND_META.info;
}
function isHigh(n: NotificationRow): boolean {
    const k = (n.kind ?? "").toLowerCase();
    return k === "warning" || k === "governance";
}

export function NotificationsWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows, loading, authPending, needsAuth, reload } = useMyNotifications();
    const [onlyUnread, setOnlyUnread] = useState(false);
    // Optimismo local para "leído" mientras Supabase confirma vía realtime.
    const [readLocal, setReadLocal] = useState<Set<string>>(() => new Set());

    const merged = useMemo<NotificationRow[]>(() => {
        return [...rows]
            .map((n) => (readLocal.has(n.id) ? { ...n, seen: true } : n))
            .sort((a, b) =>
                (Number(!!a.seen) - Number(!!b.seen)) ||
                (Number(isHigh(b)) - Number(isHigh(a))) ||
                (tsOf(b.created_at) - tsOf(a.created_at)),
            );
    }, [rows, readLocal]);

    const unread = merged.filter((n) => !n.seen).length;
    const critical = merged.filter((n) => isHigh(n) && !n.seen).length;
    const visible = useMemo(() => merged.filter((n) => !onlyUnread || !n.seen), [merged, onlyUnread]);

    async function markRead(id: string) {
        setReadLocal((prev) => { const s = new Set(prev); s.add(id); return s; });
        try {
            await createClient().from("notifications").update({ seen: true }).eq("id", id);
        } catch {
            /* el optimismo local ya marcó la fila; realtime reconciliará */
        }
    }
    async function markAllRead() {
        const ids = merged.filter((n) => !n.seen).map((n) => n.id);
        setReadLocal((prev) => { const s = new Set(prev); for (const i of ids) s.add(i); return s; });
        try {
            const c = createClient();
            await Promise.all(ids.map((id) => c.from("notifications").update({ seen: true }).eq("id", id)));
            void reload();
        } catch {
            /* noop */
        }
    }

    return (
        <WidgetShell
            title="Alertas"
            subtitle="Monitor sensorial"
            icon={Bell}
            accent="#f43f5e"
            live
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
                { label: "Red", href: "/network", color: "#ec4899", icon: Users },
                { label: "Notificaciones", href: "/notifications", color: "#38bdf8", icon: Bell },
            ]}
        >
            {(size) => {
                if (authPending || (loading && rows.length === 0 && !needsAuth)) {
                    return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                }

                if (needsAuth) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-11 rounded-2xl border border-rose-400/30 bg-rose-500/10">
                                <LogIn className="size-5 text-rose-300/70" strokeWidth={1.5} />
                            </span>
                            <p className="text-[11px] text-muted-foreground/70">Entra para ver tus alertas.</p>
                            <Link href="/login" className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-rose-300 hover:bg-rose-500/25 transition-colors cursor-pointer">
                                <LogIn className="size-3.5" /> Entrar
                            </Link>
                        </div>
                    );
                }

                if (merged.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-3">
                            <span className="grid place-items-center size-11 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                                <CheckCircle2 className="size-5 text-emerald-400/70" strokeWidth={1.5} />
                            </span>
                            <p className="text-sm font-bold text-foreground/90">Todo al día</p>
                            <p className="text-[11px] text-muted-foreground/60">No tienes alertas pendientes.</p>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                if (micro) {
                    return (
                        <div className="h-full flex flex-col gap-1.5 pt-1">
                            {merged.slice(0, 3).map((n, i) => {
                                const meta = kindMeta(n.kind);
                                const Icon = meta.icon;
                                return (
                                    <motion.div key={n.id}
                                        initial={animate ? { opacity: 0, x: -8 } : false}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: animate ? i * 0.06 : 0 }}
                                        className="flex items-center gap-2 rounded-lg border px-2 py-1.5"
                                        style={{ borderColor: n.seen ? "hsl(var(--border)/0.3)" : `${meta.color}40`, background: n.seen ? undefined : meta.bg }}>
                                        <span className="shrink-0 grid place-items-center size-5 rounded-md" style={{ color: meta.color, background: meta.bg }}><Icon className="size-3" /></span>
                                        <span className="text-[10px] font-semibold truncate min-w-0 flex-1">{n.title || "Alerta"}</span>
                                        {!n.seen && <span className="size-1.5 rounded-full shrink-0" style={{ background: meta.color }} />}
                                    </motion.div>
                                );
                            })}
                        </div>
                    );
                }

                return (
                    <div className="pt-1 h-full flex flex-col gap-2">
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                {critical > 0 ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-300 tabular-nums">
                                        <AlertTriangle className="size-2.5" />{critical} críticas
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-400">
                                        <CheckCircle2 className="size-2.5" /> Sin críticas
                                    </span>
                                )}
                                <span className="text-[10px] font-bold text-muted-foreground/60 tabular-nums">{unread} sin leer · {merged.length} total</span>
                                <button type="button" onClick={() => setOnlyUnread((v) => !v)} aria-pressed={onlyUnread}
                                    className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${onlyUnread ? "border-rose-500/50 bg-rose-500/15 text-rose-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"}`}>
                                    <Filter className="size-2.5" /> Sin leer
                                </button>
                            </div>
                        )}

                        {unread > 0 && (
                            <button type="button" onClick={markAllRead}
                                className="shrink-0 self-end inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-rose-300 transition-colors cursor-pointer">
                                <CheckCheck className="size-3" /> Marcar todo leído
                            </button>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto no-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                <AnimatePresence initial={false}>
                                    {visible.slice(0, max).map((n, i) => {
                                        const meta = kindMeta(n.kind);
                                        const Icon = meta.icon;
                                        const high = isHigh(n) && !n.seen;
                                        const href = n.link || "/notifications";
                                        return (
                                            <motion.div key={n.id}
                                                layout={animate}
                                                initial={animate ? { opacity: 0, y: 6, scale: 0.98 } : false}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={animate ? { opacity: 0, x: 16, scale: 0.95 } : { opacity: 0 }}
                                                transition={{ delay: animate ? i * 0.04 : 0, duration: animate ? 0.28 : 0 }}
                                                className={`relative flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${n.seen ? "border-border/40 bg-white/[0.02] opacity-75" : "border-border/50 bg-white/[0.04]"}`}
                                                style={high ? { borderColor: `${meta.color}50`, background: meta.bg, boxShadow: `0 0 0 1px ${meta.color}30, 0 4px 18px -8px ${meta.glow}` } : undefined}>
                                                {!n.seen && <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl" style={{ background: `linear-gradient(to bottom, ${meta.color}, ${meta.color}44)` }} />}
                                                <span className="shrink-0 grid place-items-center size-7 rounded-lg border" style={{ color: meta.color, borderColor: `${meta.color}40`, background: meta.bg }}><Icon className="size-3.5" /></span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Link href={href} className="inline-flex items-center gap-1 text-[11px] @sm:text-xs font-bold truncate min-w-0 hover:underline cursor-pointer">
                                                            {high && <AlertTriangle className="size-3 shrink-0" style={{ color: meta.color }} />}
                                                            {n.title || "Alerta"}
                                                        </Link>
                                                        <span className="text-[10px] font-bold shrink-0 tabular-nums text-muted-foreground/50">{n.created_at ? timeAgo(tsOf(n.created_at)) : ""}</span>
                                                    </div>
                                                    {n.body && <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2 mt-0.5">{n.body}</p>}
                                                    <div className="mt-1 flex items-center justify-between gap-2">
                                                        <Chip color={meta.color}>{meta.label}</Chip>
                                                        {!n.seen && (
                                                            <button type="button" onClick={() => markRead(n.id)} title="Marcar como leída" aria-label="Marcar como leída"
                                                                className="grid place-items-center size-6 rounded-lg text-muted-foreground/60 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer">
                                                                <Check className="size-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                {visible.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                                        <CheckCircle2 className="size-6 text-emerald-400/60" strokeWidth={1.5} />
                                        <span className="text-xs text-muted-foreground/60">{onlyUnread ? "Todo al día — sin alertas sin leer" : "Sin alertas pendientes"}</span>
                                        {onlyUnread && (
                                            <button type="button" onClick={() => setOnlyUnread(false)} className="text-[10px] font-bold uppercase tracking-wider text-rose-300 hover:text-rose-200 transition-colors cursor-pointer">Ver todas</button>
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
