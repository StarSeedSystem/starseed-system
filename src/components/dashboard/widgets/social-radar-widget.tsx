'use client';

import Link from "next/link";
import { CalendarDays, MapPin, Users, ChevronRight, type LucideIcon, Landmark, Hammer, Sparkles, Palette, Store } from "lucide-react";
import { WidgetShell, MiniList, Chip } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SocialEvent } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// SocialRadarWidget — eventos próximos de la red (asambleas, talleres,
// rituales, obras, mercados). Datos "social.events". Adaptativo.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<SocialEvent["kind"], { icon: LucideIcon; color: string; label: string }> = {
    asamblea: { icon: Landmark, color: "#f59e0b", label: "Asamblea" },
    taller: { icon: Hammer, color: "#10b981", label: "Taller" },
    ritual: { icon: Sparkles, color: "#a855f7", label: "Ritual" },
    obra: { icon: Palette, color: "#ec4899", label: "Obra" },
    mercado: { icon: Store, color: "#38bdf8", label: "Mercado" },
};
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function SocialRadarWidget() {
    const { data, loading } = useWidgetData("social.events", { refreshMs: 20000 });

    return (
        <WidgetShell
            title="Radar Social"
            subtitle="Eventos próximos"
            icon={CalendarDays}
            accent="#ec4899"
            expandHref="/network/culture"
            actions={
                <Link href="/network/culture" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Calendario <ChevronRight className="size-3" />
                </Link>
            }
            connections={[
                { label: "Cultura", href: "/network/culture", color: "#ec4899", icon: Palette },
                { label: "Asambleas", href: "/network/politics", color: "#f59e0b", icon: Landmark },
                { label: "Hub", href: "/hub", color: "#10b981", icon: Users },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const sorted = [...data].sort((a, b) => a.startTs - b.startTs);
                const max = micro ? 3 : size.vTier === "expanded" ? 5 : 3;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sorted}
                            max={max}
                            empty="Sin eventos próximos"
                            render={(e) => {
                                const meta = KIND_META[e.kind];
                                const Icon = meta.icon;
                                const d = new Date(e.startTs);
                                const hh = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
                                return (
                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors cursor-pointer">
                                        <div className="shrink-0 grid place-items-center size-10 rounded-xl border text-center leading-none"
                                            style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                                            <span className="text-[8px] font-black uppercase">{MONTHS[d.getMonth()]}</span>
                                            <span className="text-base font-black tabular-nums">{d.getDate()}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate">{e.title}</span>
                                                {!micro && <Chip color={meta.color}>{meta.label}</Chip>}
                                            </div>
                                            {!micro && (
                                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                                    <span className="inline-flex items-center gap-1 truncate"><MapPin className="size-3 shrink-0" /> {hh} · {e.place}</span>
                                                    <span className="inline-flex items-center gap-1 ml-auto shrink-0"><Users className="size-3" /> {e.attendees}</span>
                                                </div>
                                            )}
                                        </div>
                                        {micro && <Icon className="size-4 shrink-0" style={{ color: meta.color }} />}
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
