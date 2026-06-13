'use client';

import Link from "next/link";
import { Orbit, ChevronRight, Users, Glasses, Box, Monitor, Boxes, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { MultiverseWorld } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// MultiverseHubWidget — Multiverso (mundos inmersivos).
// Espacios de realidad de la red (VR/AR/2D/espacial). Presencia viva,
// intensidad sensorial, mundos en directo. Datos "culture.multiverse".
// ════════════════════════════════════════════════════════════════
const MODE_META: Record<MultiverseWorld["mode"], { icon: LucideIcon; label: string }> = {
    vr: { icon: Glasses, label: "VR" },
    ar: { icon: Box, label: "AR" },
    "2d": { icon: Monitor, label: "2D" },
    espacial: { icon: Boxes, label: "Espacial" },
};

export function MultiverseHubWidget() {
    const { data, loading } = useWidgetData("culture.multiverse", { refreshMs: 9000 });

    return (
        <WidgetShell
            title="Multiverso"
            subtitle={data ? `${data.totalPresence.toLocaleString()} presencias activas` : "Mundos inmersivos"}
            icon={Orbit}
            accent="#22d3ee"
            live
            actions={
                <Link href="/network/culture" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Explorar <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 2 : 4;

                return (
                    <div className="flex-1 min-h-0 h-full pt-1">
                        <MiniList
                            items={data?.worlds ?? []}
                            max={max}
                            empty="Sin mundos activos"
                            render={(w) => {
                                const meta = MODE_META[w.mode];
                                const MIcon = meta.icon;
                                return (
                                    <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-cyan-500/30 transition-colors">
                                        <div className="flex items-center gap-2">
                                            <div className="shrink-0 grid place-items-center size-7 rounded-lg" style={{ background: `color-mix(in srgb, ${w.accent} 22%, transparent)` }}>
                                                <MIcon className="size-3.5" style={{ color: w.accent }} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate">{w.name}</span>
                                                    {w.live && <span className="shrink-0 size-1.5 rounded-full bg-rose-400 animate-pulse" />}
                                                </div>
                                                {!micro && <span className="text-[9px] text-muted-foreground/60 truncate block">{w.theme}</span>}
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-0.5">
                                                <Chip color={w.accent}>{meta.label}</Chip>
                                                <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60"><Users className="size-2.5" /> {w.activeUsers}</span>
                                            </div>
                                        </div>
                                        {size.vTier === "expanded" && (
                                            <div className="mt-1.5"><ProgressBar value={w.intensity} color={w.accent} height={3} /></div>
                                        )}
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
