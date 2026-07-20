"use client";

/**
 * ── SynapsesCarousel — Círculos de afinidad «Sinapsis sugeridas» ─────────────
 * Carrusel horizontal de entidades sugeridas por solapamiento REAL (etiquetas/
 * sistema/diversidad) con score explicado y acciones directas (seguir/unirse/abrir).
 */

import React, { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
    Sparkles, UserPlus, Plus, Check, ArrowUpRight, Lock,
} from "lucide-react";
import { setFollow, setMembership } from "@/lib/os-social";
import { SYSTEM_META, TYPE_META } from "@/lib/hub-social/meta";
import type { Synapse } from "@/lib/hub-social/synapses";

function SynapseCard({ syn, onChanged }: { syn: Synapse; onChanged: () => void }) {
    const { node } = syn;
    const sys = SYSTEM_META[node.system];
    const TypeIcon = TYPE_META[node.type].icon;
    const isJoin = node.type === "grupo";
    const isOpenOnly = node.type === "evento";
    const [active, setActive] = useState(false);
    const [busy, setBusy] = useState(false);
    const [needsAuth, setNeedsAuth] = useState(false);

    const handle = async () => {
        if (isOpenOnly) return;
        setBusy(true);
        const next = !active;
        setActive(next);
        const res = isJoin ? await setMembership(node.slug, next) : await setFollow(node.slug, next);
        setBusy(false);
        if (res.needsAuth) {
            setActive(!next);
            setNeedsAuth(true);
            setTimeout(() => setNeedsAuth(false), 4000);
        } else if (res.ok) {
            onChanged();
        } else {
            setActive(!next);
        }
    };

    const ActionIcon = active ? Check : isJoin ? Plus : UserPlus;
    const actionLabel = active ? (isJoin ? "Miembro" : "Siguiendo") : isJoin ? "Unirse" : "Seguir";

    return (
        <Card
            className="liquid-glass-panel group relative flex h-full w-[15rem] shrink-0 snap-start flex-col overflow-hidden border transition-all duration-300 hover:-translate-y-0.5"
            style={{ borderColor: `${node.accent}2e` }}
        >
            <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${node.accent}, transparent)` }} aria-hidden />
            <CardContent className="flex flex-1 flex-col gap-2.5 p-3.5">
                <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border" style={{ background: `${node.accent}18`, borderColor: `${node.accent}33`, color: node.accent }}>
                        <TypeIcon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                        <Link href={node.href} className="block truncate text-sm font-bold leading-snug text-foreground transition-colors hover:text-primary focus-visible:underline focus-visible:outline-none">
                            {node.name}
                        </Link>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: sys.color }}>
                            <sys.icon className="h-3 w-3" /> {sys.label}
                        </span>
                    </div>
                </div>

                {/* Motivos del score */}
                <div className="flex flex-wrap gap-1">
                    {syn.reasons.slice(0, 3).map((r, i) => (
                        <span key={i} className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground">
                            {r}
                        </span>
                    ))}
                </div>

                <div className="mt-auto flex items-center gap-1.5 pt-0.5">
                    {!isOpenOnly ? (
                        <button
                            type="button"
                            onClick={handle}
                            disabled={busy}
                            aria-pressed={active}
                            className="inline-flex min-h-[2.75rem] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-60 sm:min-h-[2.25rem]"
                            style={active
                                ? { borderColor: `${node.accent}88`, color: node.accent, background: `${node.accent}14` }
                                : { borderColor: node.accent, background: node.accent, color: "#0b0b12" }}
                        >
                            <ActionIcon className="h-3.5 w-3.5" /> {actionLabel}
                        </button>
                    ) : null}
                    <Link
                        href={node.href}
                        aria-label={`Abrir ${node.name}`}
                        className={cn(
                            "inline-flex min-h-[2.75rem] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.03] px-2.5 text-xs font-semibold text-foreground/90 transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem]",
                            isOpenOnly ? "flex-1" : "",
                        )}
                    >
                        Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
                {needsAuth && (
                    <Link href="/login" className="inline-flex items-center justify-center gap-1 text-[10px] text-amber-300 hover:underline">
                        <Lock className="h-2.5 w-2.5" /> Inicia sesión
                    </Link>
                )}
            </CardContent>
        </Card>
    );
}

export function SynapsesCarousel({ synapses, onChanged }: { synapses: Synapse[]; onChanged: () => void }) {
    if (synapses.length === 0) return null;
    return (
        <section aria-label="Sinapsis sugeridas" className="space-y-2.5">
            <div className="section-label flex items-center gap-1.5 px-1">
                <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" /> Sinapsis sugeridas
                <span className="font-normal normal-case tracking-normal text-muted-foreground/70">· afinidad real, no azar</span>
            </div>
            <div className="scrollbar-hide flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1">
                {synapses.map((syn) => (
                    <SynapseCard key={syn.node.slug} syn={syn} onChanged={onChanged} />
                ))}
            </div>
        </section>
    );
}

export default SynapsesCarousel;
