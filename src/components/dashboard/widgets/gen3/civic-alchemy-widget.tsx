'use client';

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
    FlaskConical, Sparkles, MapPin, Scale, PenLine, Send, Check,
    ChevronRight, Landmark, type LucideIcon, Globe, Building2, Home, Trees,
} from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { CivicInitiative } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// CivicAlchemyWidget — Transmutador de Quejas a Iniciativas.
// El ciudadano escribe un problema en lenguaje natural; la IA (Exocórtex)
// lo redacta como iniciativa formal, busca leyes relacionadas y abre
// firmas vecinales. Datos "politics.initiatives". Adaptativo + funcional.
// Invariante: soberanía directa, micro-política orgánica.
// ════════════════════════════════════════════════════════════════
const SCOPES: { id: CivicInitiative["scope"]; label: string; icon: LucideIcon }[] = [
    { id: "vecinal", label: "Vecinal", icon: Home },
    { id: "municipal", label: "Municipal", icon: Building2 },
    { id: "biorregional", label: "Biorregional", icon: Trees },
    { id: "global", label: "Global", icon: Globe },
];
const STAGE_META: Record<CivicInitiative["stage"], { label: string; color: string }> = {
    queja: { label: "Queja", color: "#94a3b8" },
    redaccion: { label: "Redacción IA", color: "#a855f7" },
    firmas: { label: "Recolectando firmas", color: "#f59e0b" },
    debate: { label: "En debate", color: "#38bdf8" },
    aprobada: { label: "Aprobada", color: "#10b981" },
};

// Redacción heurística local (placeholder del Exocórtex real vía registerAdapter).
function transmute(raw: string): { title: string; proposal: string } {
    const clean = raw.trim().replace(/\s+/g, " ");
    const first = clean.charAt(0).toUpperCase() + clean.slice(1);
    const title = clean.length > 48 ? clean.slice(0, 45).trimEnd() + "…" : first;
    return {
        title: `Iniciativa: ${title}`,
        proposal: `Se propone a la asamblea abordar lo siguiente, expresado por un ciudadano: «${first}». El Exocórtex sugiere convertirlo en una acción comunitaria concreta, verificar leyes preexistentes y abrir firmas vecinales.`,
    };
}

export function CivicAlchemyWidget() {
    const { data, loading } = useWidgetData("politics.initiatives", { refreshMs: 15000 });
    const [draft, setDraft] = useState("");
    const [scope, setScope] = useState<CivicInitiative["scope"]>("vecinal");
    const [localNew, setLocalNew] = useState<CivicInitiative[]>([]);
    const [signed, setSigned] = useState<Record<string, boolean>>({});

    const items = useMemo(() => [...localNew, ...(data ?? [])], [localNew, data]);

    const handleTransmute = useCallback(() => {
        if (!draft.trim()) return;
        const { title, proposal } = transmute(draft);
        setLocalNew((prev) => [{
            id: `local-${Date.now()}`,
            rawComplaint: draft.trim(),
            draftedTitle: title,
            draftedProposal: proposal,
            stage: "redaccion",
            scope,
            signatures: 0,
            threshold: scope === "vecinal" ? 200 : scope === "municipal" ? 550 : 900,
            relatedLaws: [],
            createdTs: Date.now(),
        }, ...prev]);
        setDraft("");
    }, [draft, scope]);

    const sign = useCallback((id: string) => {
        setSigned((p) => ({ ...p, [id]: !p[id] }));
    }, []);

    return (
        <WidgetShell
            title="Alquimia Cívica"
            subtitle="Transmuta quejas en iniciativas"
            icon={FlaskConical}
            accent="#f59e0b"
            actions={
                <Link href="/network/politics" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Parlamento <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const compact = size.vTier === "compact";
                const maxList = size.vTier === "expanded" ? 5 : compact ? 2 : 3;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* Compositor — campo de transmutación */}
                        {!micro && (
                            <div className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400/80 mb-1">
                                    <PenLine className="size-3" /> Describe un problema cotidiano
                                </div>
                                <textarea
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    rows={compact ? 1 : 2}
                                    placeholder="Ej: la calle frente a mi casa está destruida…"
                                    className="w-full resize-none rounded-lg bg-black/20 border border-border/40 px-2 py-1.5 text-[11px] leading-snug outline-none focus:border-amber-500/40 transition-colors placeholder:text-muted-foreground/40"
                                />
                                <div className="mt-1.5 flex items-center gap-1.5">
                                    <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
                                        {SCOPES.map((s) => {
                                            const SIcon = s.icon;
                                            return (
                                                <button
                                                    key={s.id}
                                                    onClick={() => setScope(s.id)}
                                                    title={s.label}
                                                    className={cn(
                                                        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer shrink-0",
                                                        scope === s.id ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"
                                                    )}
                                                >
                                                    <SIcon className="size-2.5" /> {!compact && s.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={handleTransmute}
                                        disabled={!draft.trim()}
                                        className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/40 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
                                    >
                                        <Sparkles className="size-3" /> Transmutar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Lista de iniciativas */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={items}
                                max={maxList}
                                empty="Sin iniciativas activas"
                                render={(it) => {
                                    const meta = STAGE_META[it.stage];
                                    const isSigned = signed[it.id];
                                    const sigs = it.signatures + (isSigned ? 1 : 0);
                                    const pct = Math.min(1, sigs / it.threshold);
                                    return (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-amber-500/30 transition-colors">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold leading-snug line-clamp-2">{it.draftedTitle}</span>
                                                <Chip color={meta.color}>{meta.label}</Chip>
                                            </div>
                                            {!micro && (
                                                <>
                                                    {it.place && (
                                                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground/60">
                                                            <MapPin className="size-3" /> {it.place}
                                                        </div>
                                                    )}
                                                    {size.vTier === "expanded" && it.relatedLaws.length > 0 && (
                                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                                            <Scale className="size-3 text-muted-foreground/40" />
                                                            {it.relatedLaws.map((l) => (
                                                                <span key={l} className="rounded-md bg-white/[0.04] border border-border/40 px-1.5 py-0.5 text-[9px] text-muted-foreground/70">{l}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {it.stage !== "queja" && it.stage !== "redaccion" && (
                                                        <div className="mt-1.5 flex items-center gap-2">
                                                            <div className="flex-1"><ProgressBar value={pct} color={meta.color} height={4} /></div>
                                                            <span className="text-[9px] font-bold tabular-nums text-muted-foreground/60 shrink-0">{sigs}/{it.threshold}</span>
                                                            <button
                                                                onClick={() => sign(it.id)}
                                                                className={cn(
                                                                    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer shrink-0",
                                                                    isSigned ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-amber-500/40"
                                                                )}
                                                            >
                                                                {isSigned ? <><Check className="size-2.5" /> Firmada</> : <><Send className="size-2.5" /> Firmar</>}
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
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
