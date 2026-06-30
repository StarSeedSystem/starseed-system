"use client";

/*
 * Ajustes → Apariencia → "Diseño de los widgets".
 * Elige si los widgets heredan el tema activo o usan su identidad original
 * (cristal líquido teñido con su acento). Se autoguarda en el dashboard
 * (localStorage) y en el perfil (settings-sync). Aditivo y reversible.
 */

import React from "react";
import { LayoutGrid, Palette, Sparkles, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

const OPTS: Array<{ value: "theme" | "original"; label: string; desc: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { value: "theme", label: "Adaptado al tema", desc: "Los widgets siguen el estilo y tema de tu perfil. Coherencia total.", Icon: Palette },
    { value: "original", label: "Identidad original", desc: "Cada widget usa su propio color temático en cristal líquido, sin depender del tema.", Icon: Sparkles },
];

export function WidgetsDesignSettings() {
    const { config, updateConfig } = useAppearance();
    const mode = config.widgets?.designMode ?? "theme";
    const compact = config.widgets?.compact === true;

    return (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 mt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
                <LayoutGrid className="w-4 h-4 text-primary" /> Diseño de los widgets
            </h3>
            <p className="text-[11px] text-muted-foreground/70 mb-3 max-w-prose">
                Decide cómo se ven los widgets de tus tableros. Se guarda al instante en este dispositivo y en tu cuenta.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {OPTS.map(({ value, label, desc, Icon }) => {
                    const active = mode === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => updateConfig({ widgets: { designMode: value } } as any)}
                            className={cn(
                                "text-left p-3 rounded-xl border transition-all cursor-pointer",
                                active
                                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                    : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground")} />
                                <span className="text-sm font-semibold">{label}</span>
                                {active && <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                        </button>
                    );
                })}
            </div>

            {/* ── Modo compacto (densidad) ── */}
            <button
                type="button"
                role="switch"
                aria-checked={compact}
                onClick={() => updateConfig({ widgets: { compact: !compact } } as any)}
                className={cn(
                    "mt-3 w-full flex items-center gap-3 text-left p-3 rounded-xl border transition-all cursor-pointer",
                    compact
                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                )}
            >
                <Rows3 className={cn("w-4 h-4 shrink-0", compact ? "text-primary" : "text-muted-foreground")} />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">Modo compacto</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Mayor densidad: menos espaciado y tipografía algo menor para ver más información sin agrandar los widgets. El modo cómodo es el predeterminado.
                    </p>
                </div>
                <span
                    aria-hidden
                    className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                        compact ? "bg-primary" : "bg-foreground/20"
                    )}
                >
                    <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white transition-transform", compact ? "translate-x-4" : "translate-x-0.5")} />
                </span>
            </button>
        </div>
    );
}
