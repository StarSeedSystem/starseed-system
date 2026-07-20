"use client";

/**
 * ── BadgesPanel — Insignias de participación multicultural ────────────────────
 * Tarjetas con anillo de progreso SVG, nivel (semilla/brote/flor), valor real
 * del grafo y explicación de cómo subir. Estética Crystal Liquid Glass.
 */

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Award, Sparkles, Lock, ArrowUp } from "lucide-react";
import { BadgeRing } from "@/components/hub/badge-ring";
import { useBadges, LEVEL_LABEL, LEVEL_COLOR, type ComputedBadge } from "@/lib/hub-social/badges";
import type { GraphMetrics } from "@/lib/hub-social/graph";

function BadgeCard({ b }: { b: ComputedBadge }) {
    const unlocked = b.levelIndex > 0;
    const levelColor = LEVEL_COLOR[b.level];
    return (
        <Card
            className="liquid-glass-panel group relative flex h-full flex-col overflow-hidden border transition-all duration-300 hover:-translate-y-0.5"
            style={{ borderColor: unlocked ? `${b.def.color}33` : "rgba(255,255,255,0.08)" }}
        >
            {unlocked && (
                <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${b.def.color}, transparent)` }} aria-hidden />
            )}
            {b.isNew && (
                <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200">
                    <Sparkles className="h-2.5 w-2.5" /> Nuevo
                </span>
            )}
            <CardContent className="flex flex-1 flex-col items-center gap-3 p-4 text-center">
                <BadgeRing
                    icon={b.def.icon}
                    progressPct={b.progressPct}
                    color={b.def.color}
                    dim={!unlocked}
                    ariaLabel={`${b.def.label}: nivel ${LEVEL_LABEL[b.level]}, ${b.progressPct}% hacia el siguiente`}
                />
                <div className="space-y-1">
                    <div className="flex items-center justify-center gap-1.5">
                        <h4 className="text-sm font-black tracking-tight text-foreground/95">{b.def.label}</h4>
                        <Badge
                            variant="outline"
                            className="gap-1 border-transparent px-1.5 text-[9px] font-bold uppercase tracking-wider"
                            style={{ background: `${levelColor}1a`, color: levelColor, borderColor: `${levelColor}44` }}
                        >
                            {LEVEL_LABEL[b.level]}
                        </Badge>
                    </div>
                    <p className="text-[11px] leading-snug text-muted-foreground">{b.def.description}</p>
                </div>

                {/* Valor real */}
                <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: unlocked ? b.def.color : "#94a3b8" }}>
                    {unlocked ? <span className="tabular-nums">{b.value}</span> : <Lock className="h-3 w-3" />}
                    <span className="text-muted-foreground/80">
                        {unlocked ? `de ${b.def.max} ${b.def.unit}` : `${b.value} / ${b.def.thresholds[0]} ${b.def.unit}`}
                    </span>
                </div>

                {/* Cómo subir */}
                <div className={cn(
                    "mt-auto w-full rounded-lg border px-2.5 py-2 text-[10.5px] leading-relaxed",
                    b.nextThreshold == null
                        ? "border-amber-400/20 bg-amber-400/[0.04] text-amber-100/80"
                        : "border-white/10 bg-white/[0.02] text-muted-foreground",
                )}>
                    <span className="inline-flex items-start gap-1.5">
                        {b.nextThreshold == null
                            ? <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
                            : <ArrowUp className="mt-0.5 h-3 w-3 shrink-0 text-cyan-300" />}
                        <span>{b.howToLevelUp}</span>
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

export function BadgesPanel({ metrics, ready }: { metrics: GraphMetrics; ready: boolean }) {
    const { badges, loading, achieved } = useBadges(metrics, ready);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-amber-300" />
                    <h3 className="font-headline text-lg font-black tracking-tight text-foreground/95">Insignias de participación</h3>
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-[9px] uppercase tracking-widest text-amber-200">
                        {achieved} / {badges.length} despiertas
                    </Badge>
                </div>
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground text-balance">
                    Reconocimientos que crecen — semilla, brote, flor — según cómo tejes la red a través de los
                    sistemas de StarSeed. Autoridad por sabiduría aplicada (Meritocracia del Entendimiento), no por popularidad.
                </p>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-60 animate-pulse rounded-2xl border border-white/10 bg-white/[0.02]" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {badges.map((b) => <BadgeCard key={b.def.id} b={b} />)}
                </div>
            )}
        </div>
    );
}

export default BadgesPanel;
