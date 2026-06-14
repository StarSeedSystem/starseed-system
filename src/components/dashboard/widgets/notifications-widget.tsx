'use client';

import { useMemo, useState } from "react";
import { Bell, AlertTriangle, Info, CheckCircle2, Landmark, Users, Coins, Check, X, CheckCheck, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, Chip, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Notification } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// NotificationsWidget — monitor sensorial del sistema y la red.
// ----------------------------------------------------------------
// PROFUNDIZACIÓN (esta versión):
//   • Filtros por tipo (Todo / Gobernanza / Red / Sistema / Economía)
//     con conteo por categoría.
//   • Marcar como leída (✓) y descartar (✕) por alerta — estado local
//     no destructivo de los datos en vivo.
//   • "Marcar todo leído" cuando hay no leídas.
//   • Prioridad visual: aviso/gobernanza destacan con barra y glow.
//   El feed combina datos en vivo (common.notifications) con overrides
//   locales (leídas / descartadas) sin Math.random.
// ════════════════════════════════════════════════════════════════

const KIND_META: Record<Notification["kind"], { icon: LucideIcon; color: string; label: string }> = {
    info: { icon: Info, color: "#38bdf8", label: "Info" },
    success: { icon: CheckCircle2, color: "#10b981", label: "OK" },
    warning: { icon: AlertTriangle, color: "#f59e0b", label: "Aviso" },
    governance: { icon: Landmark, color: "#a855f7", label: "Gobernanza" },
    social: { icon: Users, color: "#ec4899", label: "Social" },
};

// Agrupación de tipos en categorías de filtro (alineadas al ecosistema).
type FilterId = "todo" | "governance" | "red" | "sistema" | "economia";
const FILTERS: Array<{ id: FilterId; label: string; icon: LucideIcon; match: (k: Notification["kind"]) => boolean }> = [
    { id: "todo", label: "Todo", icon: Bell, match: () => true },
    { id: "governance", label: "Gobernanza", icon: Landmark, match: (k) => k === "governance" },
    { id: "red", label: "Red", icon: Users, match: (k) => k === "social" },
    { id: "sistema", label: "Sistema", icon: Info, match: (k) => k === "info" || k === "warning" },
    { id: "economia", label: "Economía", icon: Coins, match: (k) => k === "success" },
];

// ¿Es alerta de prioridad alta? (avisos del sistema y gobernanza)
function isHighPriority(n: Notification): boolean {
    return n.kind === "warning" || n.kind === "governance";
}

export function NotificationsWidget() {
    const { data, loading } = useWidgetData("common.notifications", { refreshMs: 10000 });

    const [filter, setFilter] = useState<FilterId>("todo");
    const [readLocal, setReadLocal] = useState<Set<string>>(() => new Set());
    const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

    // Fusiona datos en vivo con overrides locales (leídas / descartadas).
    const merged = useMemo<Notification[]>(() => {
        return (data ?? [])
            .filter((n) => !dismissed.has(n.id))
            .map((n) => (readLocal.has(n.id) ? { ...n, read: true } : n))
            .sort((a, b) => (Number(a.read) - Number(b.read)) || (Number(isHighPriority(b)) - Number(isHighPriority(a))) || (b.ts - a.ts));
    }, [data, readLocal, dismissed]);

    const counts = useMemo(() => {
        const c: Record<FilterId, number> = { todo: 0, governance: 0, red: 0, sistema: 0, economia: 0 };
        for (const n of merged) {
            for (const f of FILTERS) if (f.match(n.kind)) c[f.id] += 1;
        }
        return c;
    }, [merged]);

    const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
    const visible = useMemo(() => merged.filter((n) => activeFilter.match(n.kind)), [merged, activeFilter]);
    const unread = merged.filter((n) => !n.read).length;

    function markRead(id: string) {
        setReadLocal((prev) => { const next = new Set(prev); next.add(id); return next; });
    }
    function dismiss(id: string) {
        setDismissed((prev) => { const next = new Set(prev); next.add(id); return next; });
    }
    function markAllRead() {
        setReadLocal((prev) => { const next = new Set(prev); for (const n of merged) next.add(n.id); return next; });
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
                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-[10px] font-black tabular-nums text-rose-400">
                        {unread}
                    </span>
                ) : undefined
            }
            connections={[
                { label: "Gobernanza", href: "/network/politics", color: "#a855f7", icon: Landmark },
                { label: "Red", href: "/network", color: "#ec4899", icon: Users },
                { label: "Astraura", href: "/agent", color: "#38bdf8", icon: Info },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                return (
                    <div className="pt-1 h-full flex flex-col gap-2">
                        {/* ── Filtros por tipo + marcar todo ── */}
                        {!micro && (
                            <div className="shrink-0 flex flex-col gap-1.5">
                                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar -mx-0.5 px-0.5 pb-0.5">
                                    {FILTERS.map((f) => {
                                        const FIcon = f.icon;
                                        const active = f.id === filter;
                                        const n = counts[f.id];
                                        return (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onClick={() => setFilter(f.id)}
                                                aria-pressed={active}
                                                className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer ${active ? "border-rose-500/50 bg-rose-500/15 text-rose-300" : "border-border/40 bg-white/[0.02] text-muted-foreground/70 hover:text-foreground"}`}
                                            >
                                                <FIcon className="size-3" /> {f.label}
                                                {n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
                                            </button>
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
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <MiniList
                                items={visible}
                                max={max}
                                empty="Sin alertas"
                                render={(n) => {
                                    const meta = KIND_META[n.kind];
                                    const Icon = meta.icon;
                                    const high = isHighPriority(n) && !n.read;
                                    return (
                                        <div
                                            className={`relative flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${n.read ? "border-border/40 bg-white/[0.02] opacity-80" : "border-border/50 bg-white/[0.05]"}`}
                                            style={high ? { boxShadow: `0 0 0 1px ${meta.color}55, 0 4px 18px -8px ${meta.color}88` } : undefined}
                                        >
                                            {!n.read && <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: meta.color }} />}
                                            <span className="shrink-0 grid place-items-center size-7 rounded-lg border"
                                                style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                                                <Icon className="size-3.5" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-1 text-[11px] @sm:text-xs font-bold truncate min-w-0">
                                                        {high && <AlertTriangle className="size-3 shrink-0" style={{ color: meta.color }} />}
                                                        {n.title}
                                                    </span>
                                                    {!micro && <span className="text-[10px] text-muted-foreground/50 font-bold shrink-0 tabular-nums">{timeAgo(n.ts)}</span>}
                                                </div>
                                                {!micro && <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2">{n.body}</p>}
                                                {!micro && (
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
                                                )}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
