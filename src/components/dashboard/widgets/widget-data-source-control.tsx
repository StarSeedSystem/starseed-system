'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed — Control de Fuente de Datos por Widget
// ────────────────────────────────────────────────────────────────
// Selector compacto (botón tipo engranaje + popover con radios) que
// permite elegir el proveedor de datos de un widget para un dominio
// concreto. La elección se persiste por widget en localStorage bajo
// la clave `starseed_widget_provider_<id>`.
//
// SSR-safe: la lectura de localStorage ocurre solo tras montar.
// ════════════════════════════════════════════════════════════════

import * as React from 'react';
import { Settings2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
    type DataDomain,
    type DataProvider,
    getProvider,
    providersForDomain,
    defaultProviderIdForDomain,
} from '@/lib/widget-data/providers';

function storageKey(widgetId: string): string {
    return `starseed_widget_provider_${widgetId}`;
}

export interface UseWidgetProviderResult {
    /** Id del proveedor actualmente seleccionado. */
    providerId: string;
    /** Cambia el proveedor (y lo persiste). */
    setProviderId: (id: string) => void;
    /** Objeto del proveedor seleccionado (resuelto dentro del dominio). */
    provider: DataProvider | undefined;
}

/**
 * Hook: gestiona la elección de proveedor de un widget para un dominio.
 * Devuelve `{ providerId, setProviderId, provider }`.
 *
 * - SSR-safe: en el primer render (servidor / hidratación) devuelve el
 *   proveedor por defecto del dominio; tras montar lee localStorage.
 * - Persiste cualquier cambio en `starseed_widget_provider_<widgetId>`.
 */
export function useWidgetProvider(
    widgetId: string,
    domain: DataDomain,
): UseWidgetProviderResult {
    const fallback = defaultProviderIdForDomain(domain);
    const [providerId, setProviderIdState] = React.useState<string>(fallback);

    // Lectura diferida de localStorage (evita mismatch de hidratación).
    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const stored = window.localStorage.getItem(storageKey(widgetId));
            if (stored && getProvider(stored, domain)) {
                setProviderIdState(stored);
            }
        } catch {
            /* localStorage no disponible → conservamos el default */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [widgetId, domain]);

    const setProviderId = React.useCallback(
        (id: string) => {
            setProviderIdState(id);
            if (typeof window === 'undefined') return;
            try {
                window.localStorage.setItem(storageKey(widgetId), id);
            } catch {
                /* persistencia best-effort */
            }
        },
        [widgetId],
    );

    const provider = getProvider(providerId, domain);

    return { providerId, setProviderId, provider };
}

export interface WidgetDataSourceControlProps {
    /** Id estable del widget (clave de persistencia). */
    widgetId: string;
    /** Dominio de datos del widget. */
    domain: DataDomain;
    /** Valor controlado (id del proveedor). */
    value: string;
    /** Callback al cambiar de proveedor. */
    onChange: (id: string) => void;
    /** Clases extra para el botón disparador. */
    className?: string;
    /** Lado preferido del popover. */
    side?: 'top' | 'right' | 'bottom' | 'left';
    /** Alineación del popover. */
    align?: 'start' | 'center' | 'end';
}

/**
 * Control UI: botón pequeño (engranaje) que abre un popover con la lista
 * de proveedores del dominio en formato radio. Estética glass oscuro.
 */
export function WidgetDataSourceControl({
    widgetId,
    domain,
    value,
    onChange,
    className,
    side = 'bottom',
    align = 'end',
}: WidgetDataSourceControlProps) {
    const [open, setOpen] = React.useState(false);
    const options = providersForDomain(domain);
    const selected = getProvider(value, domain);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Elegir fuente de datos"
                    title={selected ? `Fuente: ${selected.label}` : 'Elegir fuente de datos'}
                    className={cn(
                        'group/src flex items-center gap-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur-xl px-2.5 py-1.5 cursor-pointer transition-all duration-200 hover:border-[#06f9c8]/40 hover:bg-black/60',
                        className,
                    )}
                >
                    <Settings2 className="w-3 h-3 text-white/50 group-hover/src:text-[#06f9c8] transition-colors" />
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/40 group-hover/src:text-white/70 transition-colors max-w-[80px] truncate">
                        {selected?.label ?? 'Fuente'}
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent
                side={side}
                align={align}
                sideOffset={8}
                className="w-64 p-0 rounded-2xl border border-white/10 bg-slate-950/90 backdrop-blur-2xl text-white shadow-2xl"
            >
                <div className="px-3 pt-3 pb-2 border-b border-white/5">
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#06f9c8]">
                        Fuente de datos
                    </span>
                    <p className="text-[9px] text-white/40 mt-0.5 capitalize">{domain.replace('_', ' ')}</p>
                </div>
                <RadioGroup
                    value={value}
                    onValueChange={(id) => {
                        onChange(id);
                        setOpen(false);
                    }}
                    className="gap-0 p-1.5"
                >
                    {options.map((opt) => {
                        const isActive = opt.id === value;
                        const itemId = `src-${widgetId}-${opt.id}`;
                        return (
                            <label
                                key={opt.id}
                                htmlFor={itemId}
                                className={cn(
                                    'flex items-start gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer transition-colors',
                                    isActive ? 'bg-[#06f9c8]/10' : 'hover:bg-white/5',
                                )}
                            >
                                <RadioGroupItem
                                    id={itemId}
                                    value={opt.id}
                                    className="mt-0.5 h-3.5 w-3.5 border-white/30 text-[#06f9c8]"
                                />
                                <div className="flex flex-col min-w-0">
                                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-white leading-tight">
                                        {opt.label}
                                        {isActive && <Check className="w-3 h-3 text-[#06f9c8]" />}
                                    </span>
                                    <span className="text-[9px] text-white/40 leading-snug mt-0.5">
                                        {opt.description}
                                    </span>
                                    <span className="flex items-center gap-1.5 mt-1">
                                        {opt.free && (
                                            <span className="text-[6px] font-black uppercase tracking-widest text-emerald-400/80">
                                                Gratis
                                            </span>
                                        )}
                                        {opt.needsKey && (
                                            <span className="text-[6px] font-black uppercase tracking-widest text-amber-400/80">
                                                API key
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </label>
                        );
                    })}
                </RadioGroup>
            </PopoverContent>
        </Popover>
    );
}

export default WidgetDataSourceControl;
