'use client';

import { useMemo, useState } from "react";
import {
    Network, RotateCcw, User, Building, Landmark, ShieldCheck, Search, Vote, type LucideIcon,
} from "lucide-react";
import { WidgetShell, ProgressRing, ProgressBar, Chip, MiniList } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Delegation } from "@/lib/widget-data/types";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// LiquidDelegationWidget — Delegación Líquida (Parlamento).
// ----------------------------------------------------------------
// PROFUNDIZACIÓN (esta versión):
//   • Gestión por tema: DELEGAR (recupera) o REVOCAR (voto directo) cada
//     delegación con estado local — alterna entre delegado y soberano.
//   • Barra de PODER DE VOTO: % del poder que ejerces directamente vs
//     delegado, recalculada en vivo según lo que revocas.
//   • Buscador de temas (filtra por tema o nombre del delegado).
//   • Resumen: delegaciones activas / voto directo / afinidad media.
// Invariante: voto delegado líquido, revocable, nunca alienado.
// ════════════════════════════════════════════════════════════════

const kindIcon: Record<Delegation["delegateKind"], LucideIcon> = { persona: User, organizacion: Building, junta: Landmark };

export function LiquidDelegationWidget() {
    const { data, loading } = useWidgetData("politics.delegations", { refreshMs: 8000 });
    const [revoked, setRevoked] = useState<Record<string, boolean>>({});
    const [query, setQuery] = useState("");

    const summary = useMemo(() => {
        if (!data) return null;
        const total = data.length;
        const direct = data.filter((d) => revoked[d.id]).length;
        const delegated = total - direct;
        const avgAff = data.length ? data.reduce((a, d) => a + d.affinity, 0) / data.length : 0;
        // Poder de voto: cada tema pesa 1/total; el ejercido directamente cuenta como tuyo.
        const directPower = total ? direct / total : 0;
        return { total, direct, delegated, avgAff, directPower };
    }, [data, revoked]);

    const filtered = useMemo(() => {
        if (!data) return [];
        const q = query.trim().toLowerCase();
        if (!q) return data;
        return data.filter((d) => d.topic.toLowerCase().includes(q) || d.delegateName.toLowerCase().includes(q));
    }, [data, query]);

    return (
        <WidgetShell title="Delegación Líquida" subtitle="Voto revocable" icon={Network} accent="#a78bfa">
            {(size) => {
                if (loading || !data || !summary) return <div className="pt-2 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-2xl bg-muted/15 animate-pulse" />)}</div>;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "micro" ? 1 : size.vTier === "compact" ? 2 : size.vTier === "regular" ? 3 : 5;
                const showRing = size.tier !== "micro";

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={summary.directPower} size={64} color="#a78bfa"
                                label={`${Math.round(summary.directPower * 100)}%`} sublabel="directo" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* Poder de voto */}
                        <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-2.5 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                                <span className="inline-flex items-center gap-1 text-violet-300/80"><Vote className="size-3" />Poder de voto</span>
                                <span className="tabular-nums text-violet-300">{Math.round(summary.directPower * 100)}% directo</span>
                            </div>
                            <ProgressBar value={summary.directPower} color="#a78bfa" height={7} />
                            <div className="flex items-center justify-between text-[9px] text-muted-foreground/70">
                                <span>{summary.direct} directo · {summary.delegated} delegado</span>
                                <span>afinidad media {Math.round(summary.avgAff * 100)}%</span>
                            </div>
                        </div>

                        {/* Buscador de temas */}
                        {size.vTier !== "compact" && (
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Buscar tema o delegado…"
                                    className="w-full rounded-xl border border-border/40 bg-white/[0.03] pl-8 pr-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-violet-500/40 transition-colors"
                                />
                            </div>
                        )}

                        {/* Lista de delegaciones */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={filtered}
                                max={max}
                                empty={query ? "Sin coincidencias" : "Sin delegaciones"}
                                render={(d: Delegation) => {
                                    const Icon = kindIcon[d.delegateKind];
                                    const isRevoked = revoked[d.id];
                                    return (
                                        <div className={cn("flex items-center gap-2.5 rounded-2xl border p-2.5 transition-colors",
                                            isRevoked ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-border/40 bg-white/[0.03]")}>
                                            {showRing && (
                                                <ProgressRing value={d.affinity} size={size.tier === "expanded" ? 54 : 46} stroke={5}
                                                    color={isRevoked ? "#f59e0b" : d.divergence > 0.3 ? "#f59e0b" : "#a78bfa"} sublabel="afín" />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <Icon className="size-3 text-muted-foreground/60 shrink-0" />
                                                    <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 truncate">{d.topic}</span>
                                                </div>
                                                <h4 className="text-xs @sm:text-sm font-black truncate">{isRevoked ? "Voto directo (tú)" : d.delegateName}</h4>
                                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                    {isRevoked
                                                        ? <Chip color="#f59e0b">soberano</Chip>
                                                        : <Chip color="#10b981">{Math.round(d.successRate * 100)}% éxito</Chip>}
                                                    {!isRevoked && d.divergence > 0.3 && <Chip color="#f59e0b">divergente</Chip>}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setRevoked((r) => ({ ...r, [d.id]: !r[d.id] }))}
                                                title={isRevoked ? `Delegar de nuevo en ${d.delegateName}` : "Revocar y votar directo"}
                                                className={cn("shrink-0 grid place-items-center size-8 rounded-xl border transition-colors cursor-pointer",
                                                    isRevoked ? "bg-violet-500/20 border-violet-500/40 text-violet-200 hover:bg-violet-500/30" : "bg-white/5 border-border/40 text-muted-foreground hover:text-foreground")}>
                                                {isRevoked ? <RotateCcw className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                                            </button>
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
