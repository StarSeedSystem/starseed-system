"use client";

/**
 * ── EntityPhaseEditor — El dueño declara fase/oikos de su entidad ────────────
 * Popover para que el DUEÑO declare la Fase (Semilla/Fruto/Cosecha) y el
 * Oikos/biorregión de una entidad propia. Persiste en entity_state (local-first).
 */

import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SlidersHorizontal, MapPin, Check } from "lucide-react";
import { PHASES, PHASE_META, type Phase, type EntityDecl } from "@/lib/hub-social/phase-oikos";
import type { ConnType } from "@/lib/hub-social/meta";

export function EntityPhaseEditor({
    slug, type, current, onSave,
}: {
    slug: string; type: ConnType; current: EntityDecl; onSave: (slug: string, patch: EntityDecl, type: ConnType) => Promise<void>;
}) {
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<Phase | undefined>(current.phase);
    const [oikos, setOikos] = useState(current.oikos ?? "");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    React.useEffect(() => {
        if (open) { setPhase(current.phase); setOikos(current.oikos ?? ""); setSaved(false); }
    }, [open, current.phase, current.oikos]);

    const save = async () => {
        setSaving(true);
        await onSave(slug, { phase, oikos: oikos.trim() || undefined }, type);
        setSaving(false);
        setSaved(true);
        setTimeout(() => { setSaved(false); setOpen(false); }, 900);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Declarar fase y oikos"
                    title="Declarar fase y oikos (dueño)"
                    className="inline-flex min-h-[2.75rem] min-w-[2.75rem] cursor-pointer items-center justify-center rounded-lg border border-amber-400/25 bg-amber-400/[0.06] text-amber-200 transition-colors duration-200 hover:border-amber-400/45 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem] sm:min-w-[2.25rem]"
                >
                    <SlidersHorizontal className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 border-white/12 bg-background/95 p-3.5 backdrop-blur-xl">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300/80">Declara como dueño</p>
                <p className="mb-2.5 mt-0.5 text-[11px] text-muted-foreground">Solo tú, como dueño, defines la fase y el hogar de esta entidad.</p>

                <label className="mb-1.5 block text-[11px] font-semibold text-foreground/80">Fase evolutiva</label>
                <div className="mb-3 flex flex-wrap gap-1.5">
                    <PhaseChip active={phase === undefined} onClick={() => setPhase(undefined)} label="Sin declarar" color="#64748b" />
                    {PHASES.map((p) => (
                        <PhaseChip
                            key={p}
                            active={phase === p}
                            onClick={() => setPhase(p)}
                            label={PHASE_META[p].label}
                            color={PHASE_META[p].color}
                            Icon={PHASE_META[p].icon}
                        />
                    ))}
                </div>

                <label className="mb-1.5 block text-[11px] font-semibold text-foreground/80">Oikos / biorregión</label>
                <div className="relative mb-3">
                    <MapPin className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={oikos}
                        onChange={(e) => setOikos(e.target.value)}
                        placeholder="p. ej. Valle del Sur"
                        className="h-10 rounded-lg border-white/12 bg-background/40 pl-8 text-sm"
                    />
                </div>

                <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving}
                    className="inline-flex min-h-[2.75rem] w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/15 px-3 text-xs font-bold text-amber-100 transition-colors duration-200 hover:bg-amber-400/20 disabled:opacity-60 sm:min-h-[2.5rem]"
                >
                    {saved ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Declarado</> : saving ? "Guardando…" : "Declarar"}
                </button>
            </PopoverContent>
        </Popover>
    );
}

function PhaseChip({
    active, onClick, label, color, Icon,
}: {
    active: boolean; onClick: () => void; label: string; color: string; Icon?: React.ComponentType<{ className?: string }>;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex min-h-[2.25rem] cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            )}
            style={active
                ? { background: `${color}22`, borderColor: `${color}66`, color }
                : { background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.12)", color: "#94a3b8" }}
        >
            {Icon && <Icon className="h-3 w-3" />} {label}
        </button>
    );
}

export default EntityPhaseEditor;
