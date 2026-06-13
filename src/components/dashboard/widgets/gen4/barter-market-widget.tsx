'use client';

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { ArrowLeftRight, ChevronRight, MapPin, Sparkles, Check, Send } from "lucide-react";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { BarterListing } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// BarterMarketWidget — Mercado de Intercambio (Trueque).
// Economía del don / post-escasez: ofrece↔busca. Filtro por categoría,
// orden por afinidad de match, botón Proponer. Datos "oikos.barter".
// ════════════════════════════════════════════════════════════════
const CATS: { id: BarterListing["category"]; label: string }[] = [
    { id: "alimentos", label: "Alimentos" },
    { id: "herramientas", label: "Herramientas" },
    { id: "saberes", label: "Saberes" },
    { id: "tiempo", label: "Tiempo" },
    { id: "arte", label: "Arte" },
    { id: "tecnologia", label: "Tecnología" },
];

export function BarterMarketWidget() {
    const { data, loading } = useWidgetData("oikos.barter", { refreshMs: 14000 });
    const [cat, setCat] = useState<BarterListing["category"] | "todas">("todas");
    const [proposed, setProposed] = useState<Record<string, boolean>>({});

    const listings = useMemo(() => {
        const list = data?.listings ?? [];
        return cat === "todas" ? list : list.filter((l) => l.category === cat);
    }, [data, cat]);

    const propose = useCallback((id: string) => setProposed((p) => ({ ...p, [id]: !p[id] })), []);

    return (
        <WidgetShell
            title="Mercado de Trueque"
            subtitle={data ? `${data.yourMatches} coincidencias para ti` : "Intercambio comunitario"}
            icon={ArrowLeftRight}
            accent="#10b981"
            live
            actions={
                <Link href="/library" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Mercado <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 2 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {!micro && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto pb-0.5 custom-scrollbar">
                                {(["todas", ...CATS.map((c) => c.id)] as const).map((id) => {
                                    const label = id === "todas" ? "Todas" : CATS.find((c) => c.id === id)?.label;
                                    return (
                                        <button key={id} onClick={() => setCat(id)}
                                            className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                                cat === id ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground")}>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={listings}
                                max={max}
                                empty="Sin ofertas en esta categoría"
                                render={(l) => {
                                    const done = proposed[l.id];
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-emerald-500/30 transition-colors">
                                            <div className="flex items-center gap-1.5 text-[11px] @sm:text-xs">
                                                <span className="font-bold truncate flex-1" style={{ color: l.accent }}>{l.offers}</span>
                                                <ArrowLeftRight className="size-3 shrink-0 text-muted-foreground/50" />
                                                <span className="font-semibold truncate flex-1 text-right">{l.wants}</span>
                                            </div>
                                            {!micro && (
                                                <div className="mt-1.5 flex items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground/60">
                                                        <MapPin className="size-2.5" /> {l.distanceKm} km · {l.owner}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        {l.matchScore > 0.6 && <Chip color="#34d399"><Sparkles className="size-2.5" /> {Math.round(l.matchScore * 100)}%</Chip>}
                                                        <button onClick={() => propose(l.id)}
                                                            className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer",
                                                                done ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-emerald-500/40")}>
                                                            {done ? <><Check className="size-2.5" /> Enviado</> : <><Send className="size-2.5" /> Proponer</>}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
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
