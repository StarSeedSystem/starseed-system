'use client';

// ════════════════════════════════════════════════════════════════
// WidgetConfigPopover — el "engranaje" → panel de ESTILO por widget
// ----------------------------------------------------------------
// Botón compacto (mismo lenguaje visual que WidgetDataSourceControl)
// que abre un panel de variante de estilo: cristal/sólido/transparente/
// tinte por nodo Trinity. Se persiste en `widget.settings.styleVariant`
// + `settings.trinityNode`, leído por WidgetShell vía
// WidgetStyleOverrideProvider (ver widget-registry.tsx).
//
// El TAMAÑO del widget (S/M/L/XL) tiene su propio control dedicado en
// grid-area.tsx (ciclo S→M→L→XL, dashboard-size.ts) — este panel no lo
// duplica, para no ofrecer dos mandos distintos para lo mismo.
//
// Puramente presentacional + de composición de patch: quien lo usa
// (grid-area.tsx) decide cómo persistir (setWidgets).
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import { Settings2, Gem, Square, Eclipse, Compass, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { DashboardWidget } from '../dashboard-types';
import { TRINITY_TINTS, TRINITY_LABELS, type WidgetStyleVariant, type TrinityNode } from './widget-style-override';

const STYLE_VARIANTS: { id: WidgetStyleVariant; label: string; icon: typeof Gem }[] = [
    { id: 'cristal', label: 'Cristal', icon: Gem },
    { id: 'solido', label: 'Sólido', icon: Square },
    { id: 'transparente', label: 'Transparente', icon: Eclipse },
    { id: 'trinity', label: 'Trinity', icon: Compass },
];

const TRINITY_NODES: TrinityNode[] = ['zenith', 'horizon', 'logic', 'anchor'];

export interface WidgetConfigPopoverProps {
    widget: DashboardWidget;
    /** Aplica un patch parcial a `widget.settings` (fusionado por el llamador). */
    onChangeSettings: (patch: Record<string, any>) => void;
    className?: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
    align?: 'start' | 'center' | 'end';
}

export function WidgetConfigPopover({ widget, onChangeSettings, className, side = 'top', align = 'end' }: WidgetConfigPopoverProps) {
    const [open, setOpen] = React.useState(false);
    const currentVariant: WidgetStyleVariant | undefined = widget.settings?.styleVariant;
    const currentTrinityNode: TrinityNode | undefined = widget.settings?.trinityNode;

    function applyVariant(variant: WidgetStyleVariant) {
        const next = currentVariant === variant ? undefined : variant; // click de nuevo = volver al tema global
        onChangeSettings({ styleVariant: next });
    }

    function applyTrinityNode(node: TrinityNode) {
        onChangeSettings({ styleVariant: 'trinity', trinityNode: node });
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Estilo del widget"
                    title="Estilo del widget (cristal / sólido / transparente / Trinity)"
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                        'grid place-items-center size-7 rounded-full bg-black/50 border border-white/10 backdrop-blur-xl cursor-pointer transition-all duration-200 hover:border-white/30 hover:bg-black/70 z-50',
                        className,
                    )}
                >
                    <Settings2 className="w-3.5 h-3.5 text-white/70" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                side={side}
                align={align}
                sideOffset={8}
                onClick={(e) => e.stopPropagation()}
                className="w-72 p-0 rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl text-white shadow-2xl"
            >
                {/* Estilo */}
                <div className="px-3 pt-3 pb-2.5 border-b border-white/5">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-primary">Estilo</span>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {STYLE_VARIANTS.map((v) => {
                            const Icon = v.icon;
                            const active = currentVariant === v.id;
                            return (
                                <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => applyVariant(v.id)}
                                    className={cn(
                                        'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer',
                                        active ? 'border-primary/60 bg-primary/15 text-primary' : 'border-white/10 text-white/60 hover:border-white/25 hover:text-white',
                                    )}
                                >
                                    <Icon className="size-3.5 shrink-0" />
                                    {v.label}
                                    {active && <Check className="size-3 ml-auto shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-1.5 text-[9px] text-white/35 leading-snug">Vuelve a pulsar el estilo activo para heredar el tema global.</p>
                </div>

                {/* Nodo Trinity (solo si el estilo activo es "trinity") */}
                {currentVariant === 'trinity' && (
                    <div className="px-3 pt-2.5 pb-3">
                        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-primary">Nodo Trinity</span>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                            {TRINITY_NODES.map((node) => {
                                const color = TRINITY_TINTS[node];
                                const active = currentTrinityNode === node;
                                return (
                                    <button
                                        key={node}
                                        type="button"
                                        onClick={() => applyTrinityNode(node)}
                                        className={cn(
                                            'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition-colors cursor-pointer',
                                            active ? 'bg-white/10' : 'hover:bg-white/5',
                                        )}
                                        style={{ borderColor: active ? color : 'rgba(255,255,255,0.1)', color: active ? color : undefined }}
                                    >
                                        <span className="size-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
                                        <span className="text-white/70">{TRINITY_LABELS[node]}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}

export default WidgetConfigPopover;
