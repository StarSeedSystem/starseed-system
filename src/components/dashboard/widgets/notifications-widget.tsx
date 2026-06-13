'use client';

import { Bell, AlertTriangle, Info, CheckCircle2, Landmark, Users, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Notification } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// NotificationsWidget — monitor sensorial del sistema y la red.
// Datos en vivo "common.notifications". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<Notification["kind"], { icon: LucideIcon; color: string }> = {
    info: { icon: Info, color: "#38bdf8" },
    success: { icon: CheckCircle2, color: "#10b981" },
    warning: { icon: AlertTriangle, color: "#f59e0b" },
    governance: { icon: Landmark, color: "#a855f7" },
    social: { icon: Users, color: "#ec4899" },
};

export function NotificationsWidget() {
    const { data, loading } = useWidgetData("common.notifications", { refreshMs: 10000 });

    return (
        <WidgetShell title="Alertas" subtitle="Monitor sensorial" icon={Bell} accent="#f43f5e" live>
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
                                                <span className="text-[11px] @sm:text-xs font-bold truncate">{n.title}</span>
                                                {!micro && <span className="text-[10px] text-muted-foreground/50 font-bold shrink-0 tabular-nums">{timeAgo(n.ts)}</span>}
                                            </div>
                                            {!micro && <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2">{n.body}</p>}
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
