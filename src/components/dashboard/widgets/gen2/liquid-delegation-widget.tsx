'use client';

import { useState } from "react";
import { Network, RotateCcw, User, Building, Landmark, ShieldCheck } from "lucide-react";
import { WidgetShell, ProgressRing, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Delegation } from "@/lib/widget-data/types";
import { cn } from "@/lib/utils";

const kindIcon = { persona: User, organizacion: Building, junta: Landmark } as const;

export function LiquidDelegationWidget() {
    const { data, loading } = useWidgetData("politics.delegations", { refreshMs: 8000 });
    const [revoked, setRevoked] = useState<Record<string, boolean>>({});

    return (
        <WidgetShell title="Delegación Líquida" subtitle="Voto revocable" icon={Network}>
            {(size) => {
                if (loading || !data) return <div className="pt-2 space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-14 rounded-2xl bg-muted/15 animate-pulse" />)}</div>;
                const max = size.vTier === "micro" ? 1 : size.vTier === "compact" ? 2 : size.vTier === "regular" ? 3 : 5;
                const showRing = size.tier !== "micro";
                return (
                    <MiniList
                        items={data}
                        max={max}
                        render={(d: Delegation) => {
                            const Icon = kindIcon[d.delegateKind];
                            const isRevoked = revoked[d.id];
                            return (
                                <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-white/[0.03] p-2.5">
                                    {showRing && (
                                        <ProgressRing value={d.affinity} size={size.tier === "expanded" ? 56 : 48} stroke={5}
                                            color={d.divergence > 0.3 ? "#f59e0b" : "hsl(var(--primary))"} sublabel="afín" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <Icon className="size-3 text-muted-foreground/60 shrink-0" />
                                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 truncate">{d.topic}</span>
                                        </div>
                                        <h4 className="text-xs @sm:text-sm font-black truncate">{d.delegateName}</h4>
                                        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                            <Chip color="#10b981">{Math.round(d.successRate * 100)}% éxito</Chip>
                                            {d.divergence > 0.3 && <Chip color="#f59e0b">divergente</Chip>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setRevoked(r => ({ ...r, [d.id]: !r[d.id] }))}
                                        title={isRevoked ? "Restaurar" : "Revocar"}
                                        className={cn("shrink-0 grid place-items-center size-8 rounded-xl border transition-colors",
                                            isRevoked ? "bg-rose-500/20 border-rose-500/40 text-rose-300" : "bg-white/5 border-border/40 text-muted-foreground hover:text-foreground")}>
                                        {isRevoked ? <ShieldCheck className="size-3.5" /> : <RotateCcw className="size-3.5" />}
                                    </button>
                                </div>
                            );
                        }}
                    />
                );
            }}
        </WidgetShell>
    );
}
