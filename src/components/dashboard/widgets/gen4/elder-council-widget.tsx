'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { Crown, ChevronRight, BadgeCheck, Users2, Wifi } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// ElderCouncilWidget — Consejo de Sabios.
// Meritocracia del Entendimiento: autoridad por sabiduría aplicada
// verificable (insignias), nunca por riqueza. Voto delegado líquido.
// Datos "politics.council". Adaptativo + filtro "solo en línea".
// ════════════════════════════════════════════════════════════════
export function ElderCouncilWidget() {
    const { data, loading } = useWidgetData("politics.council", { refreshMs: 12000 });
    const [onlyOnline, setOnlyOnline] = useState(false);

    const sages = useMemo(() => {
        const list = data?.sages ?? [];
        return onlyOnline ? list.filter((s) => s.online) : list;
    }, [data, onlyOnline]);

    return (
        <WidgetShell
            title="Consejo de Sabios"
            subtitle="Meritocracia del entendimiento"
            icon={Crown}
            accent="#FFBF00"
            live
            actions={
                <Link href="/network/politics" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Ágora <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 3 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {!micro && (
                            <div className="shrink-0 flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
                                    <Users2 className="size-3" /> {data?.yourTrustGiven ?? 0} delegaciones tuyas
                                </span>
                                <button
                                    onClick={() => setOnlyOnline((v) => !v)}
                                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${onlyOnline ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"}`}
                                >
                                    <Wifi className="size-2.5" /> En línea
                                </button>
                            </div>
                        )}

                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={sages}
                                max={max}
                                empty="Sin sabios disponibles"
                                render={(s) => (
                                    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-amber-500/30 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <div className="relative shrink-0 grid place-items-center size-7 rounded-lg text-[11px] font-black text-white" style={{ background: s.accent }}>
                                                {s.name.charAt(0)}
                                                {s.online && <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 border border-background" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate">{s.name}</span>
                                                    <BadgeCheck className="size-3 shrink-0" style={{ color: s.accent }} />
                                                </div>
                                                <span className="text-[9px] text-muted-foreground/60 truncate block">{s.domain}</span>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <div className="text-[11px] font-black tabular-nums" style={{ color: s.accent }}>{s.badges}</div>
                                                <div className="text-[8px] uppercase tracking-wide text-muted-foreground/50">insignias</div>
                                            </div>
                                        </div>
                                        {!micro && (
                                            <div className="mt-1.5 flex items-center gap-2">
                                                <div className="flex-1"><ProgressBar value={s.reputation} color={s.accent} height={4} /></div>
                                                <Chip color={s.accent}>{s.delegatedVoices.toLocaleString()} voces</Chip>
                                            </div>
                                        )}
                                    </div>
                                )}
                            />
                        </div>

                        {size.vTier === "expanded" && data?.openConsultations?.length ? (
                            <div className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-1.5">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/80">Consulta abierta</span>
                                <p className="text-[11px] font-semibold leading-snug truncate">{data.openConsultations[0].topic}</p>
                            </div>
                        ) : null}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
