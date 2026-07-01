"use client";

// src/components/reach/reach-selector.tsx
// ─────────────────────────────────────────────────────────────────────────────
// ReachSelector · control unificado de ALCANCE de una publicación.
//
// "Publicar a todo StarSeed o a comunidades específicas." Un selector claro con
// cinco opciones de alto nivel:
//     Todo StarSeed · Comunidades específicas · Entidades federativas ·
//     Mi perfil · Privado
// Cuando el alcance requiere objetivos (comunidades/grupos o entidades), muestra
// una multi-selección de destinos REALES cargados con `listDestinations(...)` de
// la capa de publicación existente (con estado vacío si no hay ninguno).
//
// Emite un objeto `Reach` (de `@/lib/reach/reach`). El composer lo traduce a sus
// destinos internos con `reachToDestinations`, de modo que el flujo de publicar
// existente sigue funcionando sin cambios estructurales.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import {
    Globe,
    Users2,
    Flag,
    UserCheck,
    Lock,
    Check,
    Loader2,
    Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    REACH_OPTIONS,
    describeReach,
    type Reach,
    type ReachKind,
} from "@/lib/reach/reach";
import {
    listDestinations,
    type DestinationOption,
    type DestinationKindId,
} from "@/lib/publish/publish";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
    Globe,
    Users2,
    Flag,
    UserCheck,
    Lock,
};

function ReachIcon({ name, className }: { name: string; className?: string }) {
    const C = ICONS[name] ?? Globe;
    return <C className={className} />;
}

export interface ReachSelectorProps {
    value: Reach;
    onChange: (reach: Reach) => void;
    /** Etiquetas resueltas targetId→nombre (para la descripción). Opcional. */
    className?: string;
}

/**
 * Qué tipos de destino (del composer) alimentan la multi-selección de cada
 * alcance que requiere objetivos.
 */
const TARGET_KINDS_FOR: Partial<Record<ReachKind, DestinationKindId[]>> = {
    communities: ["comunidad", "grupo"],
    entities: ["entidad_federativa"],
};

export default function ReachSelector({ value, onChange, className }: ReachSelectorProps) {
    const [options, setOptions] = useState<DestinationOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState("");

    const needsTargets = value.kind === "communities" || value.kind === "entities";

    // Carga las opciones reales cuando el alcance requiere objetivos.
    useEffect(() => {
        if (!needsTargets) {
            setOptions([]);
            return;
        }
        const kinds = TARGET_KINDS_FOR[value.kind] ?? [];
        let alive = true;
        setLoading(true);
        Promise.all(kinds.map((k) => listDestinations(k)))
            .then((groups) => {
                if (!alive) return;
                // Aplana y deduplica por id.
                const flat: DestinationOption[] = [];
                const seen = new Set<string>();
                for (const g of groups) {
                    for (const o of g) {
                        if (seen.has(o.id)) continue;
                        seen.add(o.id);
                        flat.push(o);
                    }
                }
                setOptions(flat);
            })
            .catch(() => alive && setOptions([]))
            .finally(() => alive && setLoading(false));
        return () => {
            alive = false;
        };
    }, [value.kind, needsTargets]);

    // Mapa id→nombre para describir el alcance de forma legible.
    const labelsById = useMemo(() => {
        const m: Record<string, string> = {};
        for (const o of options) m[o.id] = o.label;
        return m;
    }, [options]);

    const filtered = useMemo(() => {
        const f = filter.trim().toLowerCase();
        if (!f) return options;
        return options.filter((o) => o.label.toLowerCase().includes(f));
    }, [options, filter]);

    const selectedIds = value.targetIds ?? [];

    function pickKind(kind: ReachKind) {
        // Al cambiar de alcance, resetea objetivos si el nuevo no los usa.
        if (kind === "communities" || kind === "entities") {
            onChange({ kind, targetIds: value.kind === kind ? value.targetIds ?? [] : [], targetKinds: value.kind === kind ? value.targetKinds ?? [] : [] });
        } else {
            onChange({ kind, targetIds: [], targetKinds: [] });
        }
        setFilter("");
    }

    function toggleTarget(opt: DestinationOption) {
        const ids = new Set(selectedIds);
        const kinds = [...(value.targetKinds ?? [])];
        const idx = selectedIds.indexOf(opt.id);
        if (ids.has(opt.id)) {
            ids.delete(opt.id);
            if (idx >= 0) kinds.splice(idx, 1);
        } else {
            ids.add(opt.id);
            kinds.push(opt.kind);
        }
        // Reconstruye targetKinds alineado al orden de targetIds resultante.
        const nextIds = Array.from(ids);
        const nextKinds = nextIds.map((id) => {
            const existingIdx = selectedIds.indexOf(id);
            if (existingIdx >= 0) return (value.targetKinds ?? [])[existingIdx] ?? opt.kind;
            return opt.kind;
        });
        onChange({ kind: value.kind, targetIds: nextIds, targetKinds: nextKinds });
    }

    return (
        <div className={cn("space-y-4", className)}>
            {/* Opciones de alcance */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {REACH_OPTIONS.map((opt) => {
                    const activeOpt = opt.kind === value.kind;
                    return (
                        <button
                            key={opt.kind}
                            type="button"
                            onClick={() => pickKind(opt.kind)}
                            className={cn(
                                "flex items-start gap-3 rounded-xl border p-3 text-left transition-all",
                                activeOpt
                                    ? "border-amber-400/60 bg-amber-400/10 shadow-[0_0_0_1px_rgba(233,196,106,0.3)]"
                                    : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                                    activeOpt ? "bg-amber-400/20 text-amber-200" : "bg-white/5 text-white/60",
                                )}
                            >
                                <ReachIcon name={opt.icon} className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="flex items-center gap-1.5 text-sm font-medium text-amber-50">
                                    {opt.label}
                                    {activeOpt && <Check className="h-3.5 w-3.5 text-amber-300" />}
                                </span>
                                <span className="block text-[11px] leading-snug text-white/45">
                                    {opt.blurb}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Multi-selección de objetivos (comunidades/grupos o entidades) */}
            {needsTargets && (
                <div className="space-y-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.03] p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-amber-100">
                            {value.kind === "communities"
                                ? "Elige comunidades / grupos"
                                : "Elige entidades federativas"}
                        </span>
                        {selectedIds.length > 0 && (
                            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                                {selectedIds.length} seleccionada(s)
                            </span>
                        )}
                    </div>

                    {options.length > 4 && (
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                            <Input
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder="Filtrar…"
                                className="h-8 bg-white/[0.03] pl-8 text-sm text-amber-50"
                            />
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center gap-2 px-1 py-2 text-xs text-white/50">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando destinos…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-white/45">
                            {options.length === 0
                                ? value.kind === "communities"
                                    ? "No perteneces a ninguna comunidad o grupo todavía. Únete a una para poder dirigir tu publicación."
                                    : "No hay entidades federativas disponibles todavía."
                                : "Ningún destino coincide con el filtro."}
                        </div>
                    ) : (
                        <div className="grid gap-1.5 sm:grid-cols-2">
                            {filtered.map((opt) => {
                                const on = selectedIds.includes(opt.id);
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => toggleTarget(opt)}
                                        className={cn(
                                            "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                                            on
                                                ? "border-amber-400/60 bg-amber-400/10"
                                                : "border-white/10 hover:border-white/25",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                                on
                                                    ? "border-amber-400 bg-amber-400/30 text-amber-100"
                                                    : "border-white/25",
                                            )}
                                        >
                                            {on && <Check className="h-3 w-3" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm text-amber-50">
                                                {opt.label}
                                            </span>
                                            {opt.sub && (
                                                <span className="block truncate text-[11px] text-white/40">
                                                    {opt.sub}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Descripción del alcance */}
            <p className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/50">
                <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/70" />
                <span>{describeReach(value, labelsById)}</span>
            </p>
        </div>
    );
}
