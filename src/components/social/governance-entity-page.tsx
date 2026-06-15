// src/components/social/governance-entity-page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shell reutilizable para las páginas de detalle de entidades de gobernanza que
// no viven en Supabase (Partidos, Entidades Federativas y otras entidades nuevas).
// Renderiza una portada con acento, cabecera con métricas, acciones (seguir /
// compartir) y, debajo, el GovernanceToolkit funcional del tipo correspondiente.
// ─────────────────────────────────────────────────────────────────────────────
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { ShareButton } from "@/components/social/SocialActions";
import { GovernanceToolkit } from "@/components/social/toolkits";
import { entityKindMeta } from "@/lib/entity-kinds";
import { Check, Plus } from "lucide-react";

const GOLD = "#E9C46A";

export interface GovStat {
    label: string;
    value: string;
}

export function GovernanceEntityPage({
    kind,
    slug,
    name,
    subtitle,
    accent,
    stats,
    followLabel = "Afiliarme",
    followedLabel = "Afiliado/a",
    backHref = "/network/politics",
    backLabel = "← Volver a Gobernanza",
}: {
    kind: string;
    slug: string;
    name: string;
    subtitle?: string;
    accent?: string;
    stats?: GovStat[];
    followLabel?: string;
    followedLabel?: string;
    backHref?: string;
    backLabel?: string;
}) {
    const meta = entityKindMeta(kind);
    const ac = accent ?? meta.accent;
    const Icon = meta.icon;
    const [following, setFollowing] = useState(false);

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
            {/* ── Portada ── */}
            <GlassCard className="overflow-hidden">
                <div className="relative aspect-[4/1] w-full overflow-hidden">
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `radial-gradient(120% 140% at 0% 0%, ${ac}55 0%, transparent 55%), radial-gradient(120% 140% at 100% 100%, ${ac}33 0%, transparent 60%)`,
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                    <Icon
                        className="absolute right-6 top-1/2 h-24 w-24 -translate-y-1/2 opacity-20"
                        style={{ color: ac }}
                    />
                </div>

                <div className="flex flex-col gap-4 p-[clamp(1rem,3vw,1.75rem)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <Badge
                                variant="outline"
                                className="mb-2 w-fit gap-1.5"
                                style={{ borderColor: `${ac}55`, color: ac }}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {meta.label}
                            </Badge>
                            <h1
                                className="font-headline text-[clamp(1.5rem,5vw,2.5rem)] font-bold leading-tight"
                                style={{ fontFamily: "var(--font-headline, 'Fraunces', serif)" }}
                            >
                                {name}
                            </h1>
                            {subtitle && (
                                <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant={following ? "outline" : "default"}
                                onClick={() => setFollowing((v) => !v)}
                                className="gap-2 cursor-pointer transition-all"
                                style={
                                    following
                                        ? { borderColor: `${ac}88`, color: ac }
                                        : { background: ac, color: "#0b0b12", borderColor: ac }
                                }
                                aria-pressed={following}
                            >
                                {following ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                {following ? followedLabel : followLabel}
                            </Button>
                            <ShareButton title={name} accent={ac} />
                        </div>
                    </div>

                    {stats && stats.length > 0 && (
                        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4">
                            {stats.map((s) => (
                                <div key={s.label} className="min-w-0">
                                    <p className="font-headline text-lg font-bold tabular-nums leading-none">{s.value}</p>
                                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                        {s.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </GlassCard>

            {/* ── Toolkit funcional del tipo ── */}
            <GovernanceToolkit kind={kind} slug={slug} accent={ac} name={name} />

            <p className="text-center text-xs text-muted-foreground">
                <Link href={backHref} className="cursor-pointer hover:underline" style={{ color: GOLD }}>
                    {backLabel}
                </Link>
            </p>
        </div>
    );
}
