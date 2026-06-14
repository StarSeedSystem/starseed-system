'use client';

import { History, FileEdit, Vote, Users, CheckCircle2, GitBranch, Boxes, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { ActivityEvent } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// RecentActivityWidget — registro acásico reciente del usuario.
// Datos en vivo "common.activity". Adaptativo + theme-aware.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<ActivityEvent["kind"], { icon: LucideIcon; color: string }> = {
    vote: { icon: Vote, color: "#f59e0b" },
    post: { icon: FileEdit, color: "#38bdf8" },
    join: { icon: Users, color: "#10b981" },
    mission: { icon: CheckCircle2, color: "#a855f7" },
    delegation: { icon: GitBranch, color: "#ec4899" },
    resource: { icon: Boxes, color: "#22d3ee" },
};

export function RecentActivityWidget() {
    const { data, loading } = useWidgetData("common.activity", { refreshMs: 9000 });

    return (
        <WidgetShell
            title="Actividad Reciente"
            subtitle="Tu registro acásico"
            icon={History}
            accent="#38bdf8"
            live
            expandHref="/profile"
            connections={[
                { label: "Perfil", href: "/profile", color: "#38bdf8", icon: History },
                { label: "Red", href: "/network", color: "#10b981", icon: Users },
                { label: "Gobernanza", href: "/network/politics", color: "#f59e0b", icon: Vote },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={data}
                            max={max}
                            render={(a) => {
                                const meta = KIND_META[a.kind];
                                const Icon = meta.icon;
                                return (
                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                                        <span className="shrink-0 grid place-items-center size-7 rounded-lg border"
                                            style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                                            <Icon className="size-3.5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] @sm:text-xs leading-snug truncate">
                                                <span className="font-bold">{a.actor}</span>{" "}
                                                <span className="text-muted-foreground/80">{a.action}</span>{" "}
                                                <span className="font-semibold">{a.target}</span>
                                            </p>
                                        </div>
                                        {!micro && <span className="shrink-0 text-[10px] font-bold text-muted-foreground/60 tabular-nums">{timeAgo(a.ts)}</span>}
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
