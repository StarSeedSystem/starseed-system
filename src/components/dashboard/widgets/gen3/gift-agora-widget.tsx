'use client';

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    Gift, MapPin, Check, Hand, ChevronRight, Apple, Wrench, Shirt,
    Palette, Clock, Lightbulb, type LucideIcon,
} from "lucide-react";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { GiftOffer } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// GiftAgoraWidget — Ágora del Don (Red de Distribución Libre).
// Mapa de abundancia: bienes y servicios de acceso libre y gratuito.
// "Llamado al Enjambre" + filtros de proximidad/categoría. Datos "oikos.gifts".
// Invariante: comunismo de abundancia, mérito ontológico.
// ════════════════════════════════════════════════════════════════
const CAT_ICON: Record<GiftOffer["category"], LucideIcon> = {
    alimentos: Apple, herramientas: Wrench, ropa: Shirt, arte: Palette, tiempo: Clock, asesoria: Lightbulb,
};
const URGENCY: Record<GiftOffer["urgency"], { label: string; color: string }> = {
    alta: { label: "Urgente", color: "#f43f5e" },
    media: { label: "Media", color: "#f59e0b" },
    baja: { label: "Tranquila", color: "#38bdf8" },
};

export function GiftAgoraWidget() {
    const { data, loading } = useWidgetData("oikos.gifts", { refreshMs: 12000 });
    const [taken, setTaken] = useState<Record<string, boolean>>({});
    const [nearOnly, setNearOnly] = useState(false);

    const items = useMemo(() => {
        if (!data) return [];
        const list = nearOnly ? data.filter((g) => g.distanceKm <= 3) : data;
        return [...list].sort((a, b) => (a.available === b.available ? a.distanceKm - b.distanceKm : a.available ? -1 : 1));
    }, [data, nearOnly]);

    const take = useCallback((id: string) => setTaken((p) => ({ ...p, [id]: !p[id] })), []);

    return (
        <WidgetShell
            title="Ágora del Don"
            subtitle="Abundancia de libre acceso"
            icon={Gift}
            accent="#10b981"
            live
            actions={
                <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Red <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const maxList = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 2 : 4;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {!micro && (
                            <div className="shrink-0 flex items-center gap-2">
                                <button
                                    onClick={() => setNearOnly((v) => !v)}
                                    className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer",
                                        nearOnly ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                    )}
                                >
                                    <MapPin className="size-2.5" /> {nearOnly ? "≤ 3 km" : "Todo el radio"}
                                </button>
                                <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">{items.length} ofertas</span>
                            </div>
                        )}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={items}
                                max={maxList}
                                empty="Sin dones disponibles en el radio"
                                render={(g) => {
                                    const Icon = CAT_ICON[g.category];
                                    const u = URGENCY[g.urgency];
                                    const isTaken = taken[g.id];
                                    return (
                                        <div className={cn(
                                            "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors",
                                            g.available ? "border-border/40 bg-white/[0.02] hover:border-emerald-500/30" : "border-border/20 bg-white/[0.01] opacity-60"
                                        )}>
                                            <span className="grid place-items-center size-9 rounded-xl border shrink-0"
                                                style={{ color: g.accent, borderColor: `${g.accent}40`, background: `${g.accent}14` }}>
                                                <Icon className="size-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate">{g.title}</span>
                                                    {!micro && g.urgency !== "baja" && <Chip color={u.color}>{u.label}</Chip>}
                                                </div>
                                                {!micro && (
                                                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                                        <span className="truncate">{g.giver}</span>
                                                        <span className="inline-flex items-center gap-0.5 shrink-0 ml-auto"><MapPin className="size-3" /> {g.distanceKm} km</span>
                                                    </div>
                                                )}
                                            </div>
                                            {!micro && (
                                                <button
                                                    onClick={() => take(g.id)}
                                                    disabled={!g.available && !isTaken}
                                                    className={cn(
                                                        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
                                                        isTaken ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-emerald-500/40"
                                                    )}
                                                >
                                                    {isTaken ? <><Check className="size-2.5" /> Tomado</> : <><Hand className="size-2.5" /> {g.kind === "servicio" ? "Sumarme" : "Tomar"}</>}
                                                </button>
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
