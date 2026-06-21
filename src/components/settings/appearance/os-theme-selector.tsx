"use client";

// ════════════════════════════════════════════════════════════════
// OsThemeSelector — "Tema del sistema" (Ajustes → Apariencia → Galería)
// ----------------------------------------------------------------
// Selector del tema de identidad global del OS (themeStore.osTheme).
// applyStyles() lo refleja como html[data-os-theme="…"] y globals.css
// recubre TODAS las variables del design system (claro + oscuro).
// "default" mantiene el comportamiento histórico byte a byte.
// Persistencia: igual que el resto de la config (appearance-config-v2).
// SOP: architecture/integracion-portal-starseed-os.md → "Tema StarSeed Café".
// ════════════════════════════════════════════════════════════════

import React from "react";
import { toast } from "sonner";
import { Check, Coffee, Orbit, Waves, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance, type OsThemeId } from "@/context/appearance-context";

interface OsThemePreset {
    id: OsThemeId;
    name: string;
    tagline: string;
    icon: React.ReactNode;
    /** [fondo dark, tarjeta dark, primario dark, acento dark] */
    dark: [string, string, string, string];
    /** [fondo light, tarjeta light, primario light, acento light] */
    light: [string, string, string, string];
    serif?: boolean;
}

const OS_THEMES: OsThemePreset[] = [
    {
        id: "default",
        name: "Aurora StarSeed",
        tagline: "Nebula violeta + cian. La identidad original del OS.",
        icon: <Orbit className="w-4 h-4" />,
        dark: ["#0a0118", "#160b30", "#c084fc", "#22d3ee"],
        light: ["#f6f3fb", "#fdfcff", "#9333ea", "#0f766e"],
    },
    {
        id: "cafe",
        name: "StarSeed Café",
        tagline: "Verde-negro + oro fundido · pergamino crema + tinta café. Serif Fraunces.",
        icon: <Coffee className="w-4 h-4" />,
        dark: ["#0d130e", "#141b14", "#E9C46A", "#9FE870"],
        light: ["#fdf7ea", "#fefbf2", "#C05C3B", "#3f7a2a"],
        serif: true,
    },
    {
        id: "omnifrecuencias",
        name: "Omnifrecuencias",
        tagline: "Holográfico cian/turquesa + violeta sobre negro profundo. Ondas y brillos de frecuencia.",
        icon: <Waves className="w-4 h-4" />,
        dark: ["#030712", "#0a1626", "#22D3EE", "#A855F7"],
        light: ["#eef9fc", "#fbfeff", "#0891B2", "#7C3AED"],
    },
    {
        id: "audiomorphic",
        name: "Audiomorphic",
        tagline: "Geometría sagrada · violeta + oro sobre negro. Místico, resonante, ceremonial.",
        icon: <Sparkles className="w-4 h-4" />,
        dark: ["#08040f", "#150b24", "#A855F7", "#D4AF37"],
        light: ["#f6f1fd", "#fdfbff", "#7C3AED", "#B8860B"],
    },
];

/** Mini-preview de una variante (ventana en miniatura: header + botón + chip) */
function VariantPreview({
    colors, serif, label,
}: { colors: [string, string, string, string]; serif?: boolean; label: string }) {
    const [bg, card, primary, accent] = colors;
    const isDarkBg = bg.startsWith("#0") || bg.startsWith("#1");
    const ink = isDarkBg ? "rgba(238,243,230,0.92)" : "rgba(59,40,24,0.88)";
    return (
        <div
            className="relative flex-1 min-w-0 overflow-hidden rounded-xl border border-black/20 p-1.5"
            style={{ background: `radial-gradient(120% 100% at 80% -10%, ${card}, ${bg} 70%)` }}
            aria-label={label}
        >
            {/* titular */}
            <div
                className="truncate text-[8px] font-bold leading-none mb-1"
                style={{ color: ink, fontFamily: serif ? "Fraunces, Georgia, serif" : undefined }}
            >
                Aa
            </div>
            {/* tarjeta */}
            <div className="rounded-md px-1 py-0.5 mb-1" style={{ background: card, border: `1px solid ${primary}40` }}>
                <div className="h-0.5 w-3/4 rounded-full" style={{ background: `${ink}55` }} />
            </div>
            {/* botón primario + chip acento */}
            <div className="flex items-center gap-1">
                <div className="h-2 flex-1 rounded-full" style={{ background: `linear-gradient(180deg, ${primary}, ${primary}cc)` }} />
                <div className="size-2 rounded-full shrink-0" style={{ background: accent, boxShadow: `0 0 5px ${accent}` }} />
            </div>
            <span className="absolute bottom-0.5 right-1 text-[6px] font-semibold uppercase tracking-wider" style={{ color: `${ink}` , opacity: 0.45 }}>
                {label}
            </span>
        </div>
    );
}

export function OsThemeSelector({ compact = false }: { compact?: boolean }) {
    const { config, updateSection } = useAppearance();
    const active: OsThemeId = config.themeStore?.osTheme ?? "default";

    const apply = (id: OsThemeId) => {
        updateSection("themeStore", { osTheme: id });
        const t = OS_THEMES.find((x) => x.id === id);
        toast.success(id === "default" ? "Tema del sistema restaurado" : `Tema "${t?.name}" aplicado a todo el OS`);
    };

    return (
        <div>
            <h3 className="text-sm font-semibold text-foreground/70 uppercase tracking-wider mb-1 flex items-center gap-2">
                <Coffee className="w-3.5 h-3.5 text-amber-600" /> Tema del sistema
            </h3>
            <p className="text-[11px] text-muted-foreground/70 mb-3 max-w-prose">
                Identidad completa de color, tipografía y movimiento para todo el OS.
                Convive con la atmósfera clara/oscura y con el fondo: cada tema trae su variante diurna y nocturna.
            </p>
            <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
                {OS_THEMES.map((t) => {
                    const isActive = active === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => apply(t.id)}
                            aria-pressed={isActive}
                            className={cn(
                                "group relative text-left rounded-2xl border p-3 transition-all duration-300 cursor-pointer",
                                "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                                isActive
                                    ? "border-primary/60 bg-primary/10 shadow-md ring-1 ring-primary/30"
                                    : "border-border/50 bg-foreground/[0.02] hover:border-border"
                            )}
                        >
                            {/* Mini-preview doble: variante oscura + clara */}
                            <div className="flex gap-1.5 h-16 mb-2.5">
                                <VariantPreview colors={t.dark} serif={t.serif} label="Dark" />
                                <VariantPreview colors={t.light} serif={t.serif} label="Light" />
                            </div>

                            <div className="flex items-center gap-2">
                                <span className={cn(
                                    "grid place-items-center size-7 rounded-xl border shrink-0 transition-colors",
                                    isActive ? "bg-primary/20 border-primary/40 text-primary" : "bg-foreground/[0.04] border-border/50 text-muted-foreground"
                                )}>
                                    {t.icon}
                                </span>
                                <div className="min-w-0">
                                    <p className={cn("text-xs font-bold leading-tight", isActive ? "text-primary" : "text-foreground/85")}>
                                        {t.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground/70 leading-snug line-clamp-2">{t.tagline}</p>
                                </div>
                            </div>

                            {isActive && (
                                <span className="absolute -top-1.5 -right-1.5 grid place-items-center size-5 rounded-full bg-primary shadow-lg shadow-primary/40">
                                    <Check className="w-3 h-3 text-primary-foreground" />
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
