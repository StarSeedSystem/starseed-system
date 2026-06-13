'use client';

import { useState } from "react";
import Link from "next/link";
import { Gem, ChevronRight, TreePine, Clock, Leaf, BadgeCheck } from "lucide-react";
import { WidgetShell, ProgressRing, ProgressBar, StatTile, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { MeritBadge } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// MeritGalleryWidget — Cristalería de Mérito y Abundancia.
// El legado visible del ser (no vanidad): confianza ética verificable,
// huella regenerativa, madurez de habilidades e insignias ganadas.
// Datos "profile.merit". Adaptativo. Invariante: meritocracia del
// entendimiento — la autoridad nace de la sabiduría aplicada.
// ════════════════════════════════════════════════════════════════

const TIER_COLOR: Record<MeritBadge["tier"], string> = {
    bronce: "#b45309",
    plata: "#cbd5e1",
    oro: "#fbbf24",
    cristal: "#22d3ee",
};

export function MeritGalleryWidget() {
    const { data, loading } = useWidgetData("profile.merit", { refreshMs: 20000 });
    const [activeBadge, setActiveBadge] = useState<string | null>(null);

    return (
        <WidgetShell
            title="Cristalería de Mérito"
            subtitle="Legado y abundancia aplicada"
            icon={Gem}
            accent="#06b6d4"
            actions={
                <Link
                    href="/profile"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Perfil <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data!;
                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: anillo de confianza + nº insignias ─────────────────
                if (micro) {
                    return (
                        <div className="h-full flex items-center justify-center gap-3">
                            <ProgressRing
                                value={d.trustScore}
                                size={68}
                                stroke={6}
                                color="#06b6d4"
                                label={`${Math.round(d.trustScore * 100)}`}
                                sublabel="confianza"
                            />
                            <div className="flex flex-col items-center gap-0.5">
                                <span className="text-[18px] font-black tabular-nums text-foreground leading-none">
                                    {d.badges.length}
                                </span>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
                                    insignias
                                </span>
                            </div>
                        </div>
                    );
                }

                const isExpanded = size.vTier === "expanded";
                const isCompact = size.vTier === "compact";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">

                        {/* ── Firma de confianza + huella regen ──────────────────── */}
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing
                                value={d.trustScore}
                                size={isExpanded ? 80 : 64}
                                stroke={6}
                                color="#06b6d4"
                                label={`${Math.round(d.trustScore * 100)}`}
                                sublabel="firma de confianza"
                            />
                            <div className="flex-1 min-w-0 grid grid-cols-3 gap-1.5">
                                <StatTile
                                    label="Árboles"
                                    value={d.regenFootprint.trees}
                                    icon={TreePine}
                                    accent="#10b981"
                                    compact
                                />
                                <StatTile
                                    label="Horas"
                                    value={d.regenFootprint.hours}
                                    icon={Clock}
                                    accent="#f59e0b"
                                    compact
                                />
                                <StatTile
                                    label="CO₂ kg"
                                    value={d.regenFootprint.co2Kg}
                                    icon={Leaf}
                                    accent="#22c55e"
                                    compact
                                />
                            </div>
                        </div>

                        {/* ── Madurez del árbol de habilidades ──────────────────── */}
                        <div className="shrink-0 space-y-0.5">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="font-bold uppercase tracking-wider text-muted-foreground/60">
                                    Madurez de habilidades
                                </span>
                                <span className="tabular-nums font-black text-foreground">
                                    {Math.round(d.skillMaturity * 100)}%
                                </span>
                            </div>
                            <ProgressBar value={d.skillMaturity} color="#06b6d4" height={5} showPct={false} />
                        </div>

                        {/* ── Top skills ─────────────────────────────────────────── */}
                        {!isCompact && (
                            <div className="shrink-0 space-y-1">
                                {d.topSkills.map((sk) => (
                                    <div key={sk.label} className="flex items-center gap-2">
                                        <span className="text-[9px] font-bold text-muted-foreground/70 w-28 shrink-0 truncate">
                                            {sk.label}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <ProgressBar
                                                value={sk.mastery}
                                                color={sk.accent}
                                                height={4}
                                                showPct={false}
                                            />
                                        </div>
                                        <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right shrink-0">
                                            {Math.round(sk.mastery * 100)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Insignias / Medallas ───────────────────────────────── */}
                        <div className="flex-1 min-h-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1">
                                Insignias verificadas
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {d.badges.map((b) => {
                                    const color = b.accent || TIER_COLOR[b.tier];
                                    const isActive = activeBadge === b.id;
                                    return (
                                        <button
                                            key={b.id}
                                            onClick={() => setActiveBadge(isActive ? null : b.id)}
                                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-all cursor-pointer hover:opacity-90 active:scale-95"
                                            style={{
                                                color,
                                                borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                                                background: isActive ? `color-mix(in srgb, ${color} 12%, transparent)` : undefined,
                                            }}
                                        >
                                            <BadgeCheck className="size-2.5 shrink-0" />
                                            <span className="truncate max-w-[80px]">{b.label}</span>
                                            {isExpanded && (
                                                <span
                                                    className="ml-0.5 opacity-60"
                                                    style={{ color }}
                                                >
                                                    {b.tier}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Badge detail on click */}
                            {activeBadge && (() => {
                                const b = d.badges.find((x) => x.id === activeBadge);
                                if (!b) return null;
                                const color = b.accent || TIER_COLOR[b.tier];
                                return (
                                    <div
                                        className="mt-1.5 rounded-xl border px-2.5 py-1.5 text-[10px]"
                                        style={{ borderColor: `color-mix(in srgb, ${color} 30%, transparent)`, background: `color-mix(in srgb, ${color} 6%, transparent)` }}
                                    >
                                        <span className="font-black" style={{ color }}>{b.label}</span>
                                        <span className="ml-1.5 text-muted-foreground/60">· tier {b.tier}</span>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
