'use client';

import { Bell, AlertTriangle, Info, CheckCircle2, Landmark, Users, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, Chip, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Notification } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// NotificationsWidget — monitor sensorial del sistema y la red.
// Datos en vivo "common.notifications". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<Notification["kind"], { icon: LucideIcon; color: string; label: string }> = {
    info: { icon: Info, color: "#38bdf8", label: "Info" },
    success: { icon: CheckCircle2, color: "#10b981", label: "OK" },
    warning: { icon: AlertTriangle, color: "#f59e0b", label: "Aviso" },
    governance: { icon: Landmark, color: "#a855f7", label: "Gobernanza" },
    social: { icon: Users, color: "#ec4899", label: "Social" },
};

export function NotificationsWidget() {
    const { data, loading } = useWidgetData("common.notifications", { refreshMs: 10000 });

    const unread = (data ?? []).filter((n) => !n.read).length;

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
                const sorted = [...data].sort((a, b) => b.ts - a.ts);
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sorted}
                            max={max}
                            empty="Sin alertas"
                            render={(n) => {
                                const meta = KIND_META[n.kind];
                                const Icon = meta.icon;
                                return (
                                    <div className={`relative flex items-start gap-2.5 rounded-xl border px-2.5 py-2 transition-colors cursor-pointer ${n.read ? "border-border/40 bg-white/[0.02]" : "border-border/50 bg-white/[0.05]"}`}>
                                        {!n.read && <span className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: meta.color }} />}
                                        <span className="shrink-0 grid place-items-center size-7 rounded-lg border"
                                            style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                                            <Icon className="size-3.5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate min-w-0">{n.title}</span>
                                                {!micro && <span className="text-[10px] text-muted-foreground/50 font-bold shrink-0 tabular-nums">{timeAgo(n.ts)}</span>}
                                            </div>
                                            {!micro && <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2">{n.body}</p>}
                                            {!micro && size.vTier === "expanded" && (
                                                <div className="mt-1"><Chip color={meta.color}>{meta.label}</Chip></div>
                                            )}
                                        </div>
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
