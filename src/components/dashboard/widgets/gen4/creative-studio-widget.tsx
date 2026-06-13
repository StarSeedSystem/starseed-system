'use client';

import Link from "next/link";
import {
    Palette, ChevronRight, Music, Image, PenTool, Box, Video, Layers, Users, Quote, type LucideIcon,
} from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, timeAgo } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { StudioProject } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// CreativeStudioWidget — Estudio Creativo (El Estudio).
// Proyectos creativos en curso (música, visual, 3d, video, escritura),
// herramientas del Lienzo Universal e inspiración del día.
// Datos "culture.studio". Adaptativo.
// ════════════════════════════════════════════════════════════════
const MEDIUM_ICON: Record<StudioProject["medium"], LucideIcon> = {
    "música": Music, visual: Image, escritura: PenTool, "3d": Box, video: Video, mixto: Layers,
};

export function CreativeStudioWidget() {
    const { data, loading } = useWidgetData("culture.studio", { refreshMs: 20000 });

    return (
        <WidgetShell
            title="Estudio Creativo"
            subtitle="Tu lienzo de obras vivas"
            icon={Palette}
            accent="#ec4899"
            actions={
                <Link href="/publish" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Crear <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 2 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {!micro && data?.inspirationOfDay && (
                            <div className="shrink-0 rounded-xl border border-pink-500/20 bg-pink-500/[0.04] px-2.5 py-1.5 flex items-start gap-1.5">
                                <Quote className="size-3 text-pink-400/70 shrink-0 mt-0.5" />
                                <p className="text-[10px] italic leading-snug text-pink-100/80">{data.inspirationOfDay}</p>
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={data?.projects ?? []}
                                max={max}
                                empty="Sin proyectos activos"
                                render={(p) => {
                                    const Icon = MEDIUM_ICON[p.medium];
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-pink-500/30 transition-colors">
                                            <div className="flex items-center gap-2">
                                                <div className="shrink-0 grid place-items-center size-7 rounded-lg" style={{ background: `color-mix(in srgb, ${p.accent} 22%, transparent)` }}>
                                                    <Icon className="size-3.5" style={{ color: p.accent }} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate block">{p.title}</span>
                                                    {!micro && (
                                                        <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/60">
                                                            <Users className="size-2.5" /> {p.collaborators} · {timeAgo(p.updatedTs)}
                                                        </span>
                                                    )}
                                                </div>
                                                <Chip color={p.accent}>{p.medium}</Chip>
                                            </div>
                                            {!micro && <div className="mt-1.5"><ProgressBar value={p.progress} color={p.accent} height={4} showPct /></div>}
                                        </div>
                                    );
                                }}
                            />
                        </div>
                        {size.vTier === "expanded" && data?.tools?.length ? (
                            <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto custom-scrollbar pt-0.5">
                                {data.tools.map((t) => (
                                    <span key={t.id} className="shrink-0 rounded-full border border-border/40 px-2 py-0.5 text-[9px] font-bold text-muted-foreground/70">{t.label}</span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
