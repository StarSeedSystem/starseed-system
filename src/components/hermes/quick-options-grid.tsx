// src/components/hermes/quick-options-grid.tsx
'use client';

/**
 * Quick Options Grid — el catálogo unificado de accesos rápidos del
 * sistema (Hermes, Sincrómetro, Memoria, perfiles, etc.). Se reutiliza en:
 *   - El OmniDock (Trinity Anchor)
 *   - El menú Nexus
 *   - La página IA (/agent)
 * de modo que el usuario tenga las mismas opciones disponibles desde
 * cualquier superficie y pueda personalizarlas.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Pencil, Check, RotateCcw } from 'lucide-react';
import {
    loadDockConfig,
    saveDockConfig,
    resetDockConfig,
    DOCK_PRESETS,
    DOCK_ICON_MAP,
    DOCK_FALLBACK_ICON,
    type DockItemConfig,
} from '@/components/layout/dock-config';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface QuickOptionsGridProps {
    title?: string;
    description?: string;
    /** Filtra el catálogo. Si se omite, muestra todos. */
    filterIds?: string[];
    /** Solo los enabled del dock (por defecto false: muestra el catálogo entero). */
    onlyEnabled?: boolean;
    /** Permite editar visibilidad y orden inline. */
    editable?: boolean;
    className?: string;
    columns?: 2 | 3 | 4 | 5 | 6;
}

export function QuickOptionsGrid({
    title = 'Accesos rápidos',
    description = 'El mismo catálogo de opciones que aparece en tu dock — también disponibles aquí.',
    filterIds,
    onlyEnabled = false,
    editable = true,
    className,
    columns = 4,
}: QuickOptionsGridProps) {
    const confirm = useConfirm();
    const [items, setItems] = useState<DockItemConfig[]>(DOCK_PRESETS);
    const [editMode, setEditMode] = useState(false);

    useEffect(() => { setItems(loadDockConfig()); }, []);

    const visible = items.filter((it) => {
        if (filterIds && !filterIds.includes(it.id)) return false;
        if (onlyEnabled && !it.enabled) return false;
        return true;
    });

    const toggle = (id: string) => {
        const next = items.map((it) => (it.id === id ? { ...it, enabled: !it.enabled } : it));
        setItems(next);
        saveDockConfig(next);
    };

    const reset = async () => {
        if (!(await confirm({ title: "Restablecer catálogo", description: "¿Restablecer el catálogo de opciones?", destructive: true }))) return;
        resetDockConfig();
        setItems(DOCK_PRESETS);
    };

    const gridCols = {
        2: 'grid-cols-2',
        3: 'grid-cols-2 sm:grid-cols-3',
        4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
        5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
        6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6',
    }[columns];

    return (
        <Card className={cn('liquid-glass-panel border-white/10', className)}>
            <CardContent className="p-4 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider">
                            {title}
                        </h3>
                        <p className="text-[11px] text-muted-foreground">{description}</p>
                    </div>
                    {editable && (
                        <div className="flex items-center gap-1.5">
                            {editMode && (
                                <button
                                    onClick={reset}
                                    className="text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-full border border-white/10 hover:bg-white/5"
                                >
                                    <RotateCcw className="w-3 h-3" /> Reset
                                </button>
                            )}
                            <button
                                onClick={() => setEditMode((v) => !v)}
                                className={cn(
                                    'text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded-full border transition-all',
                                    editMode
                                        ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                                        : 'border-white/10 hover:bg-white/5'
                                )}
                            >
                                {editMode ? <><Check className="w-3 h-3" /> Listo</> : <><Pencil className="w-3 h-3" /> Editar</>}
                            </button>
                        </div>
                    )}
                </div>

                <div className={cn('grid gap-2', gridCols)}>
                    {visible.map((it) => {
                        const Icon = DOCK_ICON_MAP[it.iconKey] ?? DOCK_FALLBACK_ICON;
                        const colorClass = {
                            neutral:  'text-foreground/80',
                            cyan:     'text-cyan-400',
                            crimson:  'text-red-400',
                            amber:    'text-amber-400',
                            emerald:  'text-emerald-400',
                            purple:   'text-purple-400',
                        }[it.color];
                        const borderClass = {
                            neutral:  'border-white/10',
                            cyan:     'border-cyan-500/30',
                            crimson:  'border-red-500/30',
                            amber:    'border-amber-500/30',
                            emerald:  'border-emerald-500/30',
                            purple:   'border-purple-500/30',
                        }[it.color];

                        const content = (
                            <div
                                className={cn(
                                    'group relative flex flex-col items-center gap-1 p-3 rounded-xl border bg-white/[0.02] transition-all duration-200',
                                    borderClass,
                                    it.enabled ? 'opacity-100 hover:bg-white/[0.06] hover:scale-[1.02]' : 'opacity-50'
                                )}
                            >
                                <Icon className={cn('w-5 h-5', colorClass)} />
                                <span className="text-[10px] font-semibold text-center line-clamp-2">{it.label}</span>
                                {editMode && (
                                    <button
                                        onClick={(e) => { e.preventDefault(); toggle(it.id); }}
                                        className={cn(
                                            'absolute top-1 right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all',
                                            it.enabled
                                                ? 'border-emerald-400 bg-emerald-400/20'
                                                : 'border-white/20 bg-white/5'
                                        )}
                                        title={it.enabled ? 'En el dock — click para ocultar' : 'Click para añadir al dock'}
                                    >
                                        {it.enabled && <Check className="w-2.5 h-2.5 text-emerald-300" />}
                                    </button>
                                )}
                            </div>
                        );

                        return editMode ? (
                            <div key={it.id}>{content}</div>
                        ) : (
                            <Link key={it.id} href={it.path} className="block">
                                {content}
                            </Link>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
