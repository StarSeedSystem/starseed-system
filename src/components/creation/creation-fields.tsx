"use client";

// src/components/creation/creation-fields.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Campos reutilizables del Centro de Creación (/crear): selector de DESTINO
// (Mi Perfil · Política · Educación · Cultura · Biblioteca · entidad propia),
// selector de TIPO especializado por destino y hook de entidades propias
// (páginas/grupos del usuario vía fetchMyEntities). Estilo Crystal Liquid
// Glass; acento esmeralda de creación.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { fetchMyEntities, type OsEntityType } from "@/lib/os-social";
import {
    CREATION_DESTS,
    TIPOS_POR_DEST,
    tagsForDest,
    type CreationDest,
} from "@/components/creation/creation-config";
import { BookOpen, Users2, Search, Check } from "lucide-react";

// ── Entidades propias (destino "propia") ─────────────────────────────────────

export interface OwnEntityOption {
    entityType: OsEntityType;
    entitySlug: string;
    name: string;
    kind: string;
}

/** Páginas y grupos PROPIOS del usuario (dueño), para publicar en ellos. */
export function useMyOwnEntities(): { own: OwnEntityOption[]; loading: boolean } {
    const [own, setOwn] = useState<OwnEntityOption[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const mine = await fetchMyEntities();
                if (!active) return;
                const opts: OwnEntityOption[] = [
                    ...mine.pages.map((p) => ({
                        entityType: "page" as OsEntityType,
                        entitySlug: p.slug,
                        name: p.name,
                        kind: p.kind,
                    })),
                    ...mine.groups.map((g) => ({
                        entityType: "group" as OsEntityType,
                        entitySlug: g.slug,
                        name: g.name,
                        kind: g.kind,
                    })),
                ];
                setOwn(opts);
            } catch {
                if (active) setOwn([]);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    return { own, loading };
}

// ── Selector de destino ──────────────────────────────────────────────────────

interface DestSelectorProps {
    value: CreationDest;
    onChange: (dest: CreationDest) => void;
    /** Limita los destinos mostrados (p. ej. las 4 secciones de la Zona de Publicación). */
    dests?: CreationDest[];
    /** Entidad propia elegida (cuando value === "propia"). */
    ownValue?: OwnEntityOption | null;
    onOwnChange?: (own: OwnEntityOption | null) => void;
    className?: string;
}

export function DestSelector({
    value,
    onChange,
    dests,
    ownValue,
    onOwnChange,
    className,
}: DestSelectorProps) {
    const { own, loading } = useMyOwnEntities();
    const visible = useMemo(
        () => CREATION_DESTS.filter((d) => !dests || dests.includes(d.id)),
        [dests],
    );
    const showOwnPicker = value === "propia" && !!onOwnChange;

    return (
        <div className={cn("space-y-3", className)}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {visible.map((d) => {
                    const Icon = d.icon;
                    const active = value === d.id;
                    return (
                        <button
                            key={d.id}
                            type="button"
                            onClick={() => onChange(d.id)}
                            className={cn(
                                "flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-all duration-200 cursor-pointer",
                                active
                                    ? cn("bg-white/[0.06] ring-1 ring-emerald-400/30", d.accent)
                                    : "border-white/10 bg-white/[0.02] text-white/50 hover:bg-white/[0.05] hover:text-white/80",
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="text-xs font-medium leading-tight">{d.label}</span>
                            <span className="text-[10px] text-white/35 leading-tight">{d.desc}</span>
                        </button>
                    );
                })}
            </div>

            {showOwnPicker && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                        Elige tu página o grupo
                    </p>
                    {loading ? (
                        <p className="text-xs text-white/35">Cargando tus entidades…</p>
                    ) : own.length === 0 ? (
                        <p className="text-xs text-white/35">
                            Aún no tienes páginas ni grupos propios. Créalos desde la fila
                            «Crear entidades».
                        </p>
                    ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                            {own.map((o) => {
                                const active = ownValue?.entitySlug === o.entitySlug;
                                const Icon = o.entityType === "group" ? Users2 : BookOpen;
                                return (
                                    <button
                                        key={`${o.entityType}-${o.entitySlug}`}
                                        type="button"
                                        onClick={() => onOwnChange?.(active ? null : o)}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 cursor-pointer",
                                            active
                                                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
                                                : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.07]",
                                        )}
                                    >
                                        <Icon className="w-3 h-3" />
                                        <span className="max-w-[140px] truncate">{o.name}</span>
                                        <span className="text-[9px] text-white/35">({o.kind})</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Selector de tipo especializado ───────────────────────────────────────────

interface TipoSelectorProps {
    dest: CreationDest;
    value: string;
    onChange: (tipo: string) => void;
    className?: string;
}

export function TipoSelector({ dest, value, onChange, className }: TipoSelectorProps) {
    const tipos = TIPOS_POR_DEST[dest] ?? [];
    if (tipos.length === 0) return null;
    return (
        <div className={cn("flex flex-wrap gap-1.5", className)}>
            {tipos.map((t) => {
                const Icon = t.icon;
                const active = value === t.id;
                return (
                    <button
                        key={t.id}
                        type="button"
                        title={t.desc}
                        onClick={() => onChange(t.id)}
                        className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 cursor-pointer",
                            active
                                ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.12)]"
                                : "border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.07] hover:text-white/80",
                        )}
                    >
                        <Icon className="w-3.5 h-3.5" />
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}

// ── Selector de ETIQUETAS MÚLTIPLES (Adenda 66 §6) ───────────────────────────

interface TagSelectorProps {
    dest: CreationDest;
    /** Ids de etiquetas seleccionadas. */
    value: string[];
    onChange: (tags: string[]) => void;
    className?: string;
}

/**
 * Multi-selección de etiquetas (chips seleccionables + búsqueda). Las etiquetas
 * relevantes al destino se muestran primero (`tagsForDest`). El orden de `value`
 * importa: la PRIMERA etiqueta se usa como `tipo` primario (compat).
 */
export function TagSelector({ dest, value, onChange, className }: TagSelectorProps) {
    const [query, setQuery] = useState("");
    const all = useMemo(() => tagsForDest(dest), [dest]);
    const q = query.trim().toLowerCase();
    const visible = useMemo(
        () =>
            q
                ? all.filter(
                      (t) =>
                          t.label.toLowerCase().includes(q) ||
                          t.desc.toLowerCase().includes(q) ||
                          t.id.includes(q),
                  )
                : all,
        [all, q],
    );
    const selected = new Set(value);

    const toggle = (id: string) => {
        if (selected.has(id)) {
            onChange(value.filter((v) => v !== id));
        } else {
            onChange([...value, id]);
        }
    };

    return (
        <div className={cn("space-y-2.5", className)}>
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Busca una etiqueta…"
                    className="h-8 bg-black/30 border-white/10 pl-8 text-xs"
                />
            </div>

            {value.length > 0 && (
                <p className="text-[10px] text-white/35">
                    {value.length} etiqueta{value.length === 1 ? "" : "s"} · la primera define el tipo
                </p>
            )}

            <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                {visible.map((t) => {
                    const Icon = t.icon;
                    const active = selected.has(t.id);
                    return (
                        <button
                            key={t.id}
                            type="button"
                            title={t.desc}
                            onClick={() => toggle(t.id)}
                            aria-pressed={active}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer",
                                active
                                    ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
                                    : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07] hover:text-white/85",
                            )}
                        >
                            {active ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                            {t.label}
                        </button>
                    );
                })}
                {visible.length === 0 && (
                    <p className="text-xs text-white/35 py-1">Sin etiquetas para «{query}».</p>
                )}
            </div>
        </div>
    );
}
