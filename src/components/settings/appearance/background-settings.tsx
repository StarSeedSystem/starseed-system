"use client";

/*
 * Ajustes → Apariencia → "Fondo animado vivo".
 * ----------------------------------------------------------------------
 * Panel para personalizar el fondo "living" del OS (canvas vivo). Permite
 * activarlo/desactivarlo, elegir entre 7 variantes creativas, ajustar
 * velocidad/intensidad, definir una paleta propia (o usar los acentos del
 * tema), rotar variantes automáticamente y aplicar presets de un toque.
 *
 * Todo se autoguarda vía useAppearance().updateConfig (deep-merge →
 * localStorage + perfil). Aditivo y reversible: al desactivar se vuelve al
 * tipo de fondo anterior. SOP: architecture/integracion-portal-starseed-os.md
 */

import React from "react";
import {
    Sparkles,
    Waves,
    Star,
    Network,
    Flame,
    Sun,
    Aperture,
    Gauge,
    Palette,
    Timer,
    RotateCcw,
    Power,
    Maximize2,
    Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";

type Variant = "aurora" | "nebula" | "starfield" | "mycelium" | "plasma" | "prisma" | "ocean";

const VARIANTS: Array<{
    value: Variant;
    label: string;
    desc: string;
    Icon: React.ComponentType<{ className?: string }>;
}> = [
    { value: "aurora", label: "Aurora", desc: "Velos de luz que ondulan en calma.", Icon: Sparkles },
    { value: "nebula", label: "Nebulosa", desc: "Nubes cosmicas densas y profundas.", Icon: Aperture },
    { value: "starfield", label: "Campo estelar", desc: "Lluvia de estrellas en parallax.", Icon: Star },
    { value: "mycelium", label: "Micelio", desc: "Red viva de nodos interconectados.", Icon: Network },
    { value: "plasma", label: "Plasma", desc: "Energia fluida en movimiento rapido.", Icon: Flame },
    { value: "prisma", label: "Prisma", desc: "Abanico radial de colores girando.", Icon: Sun },
    { value: "ocean", label: "Oceano", desc: "Olas en capas que respiran.", Icon: Waves },
];

interface Preset {
    name: string;
    desc: string;
    variant: Variant;
    speed: number;
    intensity: number;
    colors: string[];
    Icon: React.ComponentType<{ className?: string }>;
}

const PRESETS: Preset[] = [
    {
        name: "Aurora boreal",
        desc: "Verdes y cianes serenos",
        variant: "aurora",
        speed: 0.6,
        intensity: 0.7,
        colors: ["#39FF14", "#10B981", "#7FB8FF", "#C9A8FF"],
        Icon: Sparkles,
    },
    {
        name: "Nebulosa dorada",
        desc: "Oro y purpura cosmico",
        variant: "nebula",
        speed: 0.5,
        intensity: 0.85,
        colors: ["#E9C46A", "#D4AF37", "#C9A8FF", "#7FB8FF"],
        Icon: Aperture,
    },
    {
        name: "Micelio vivo",
        desc: "Red organica luminosa",
        variant: "mycelium",
        speed: 0.8,
        intensity: 0.6,
        colors: ["#9FE870", "#39FF14", "#10B981"],
        Icon: Network,
    },
    {
        name: "Oceano cristal",
        desc: "Olas azuladas profundas",
        variant: "ocean",
        speed: 0.7,
        intensity: 0.75,
        colors: ["#007FFF", "#7FB8FF", "#10B981", "#0A0E27"],
        Icon: Waves,
    },
    {
        name: "Plasma solar",
        desc: "Energia calida y rapida",
        variant: "plasma",
        speed: 1.4,
        intensity: 0.9,
        colors: ["#F15A22", "#FFBF00", "#DC143C", "#E9C46A"],
        Icon: Flame,
    },
];

const AUTO_CYCLE_OPTS: Array<{ value: number; label: string }> = [
    { value: 0, label: "Off" },
    { value: 15, label: "15 s" },
    { value: 30, label: "30 s" },
    { value: 60, label: "60 s" },
    { value: 120, label: "120 s" },
];

const DEFAULT_PALETTE = ["#E9C46A", "#9FE870", "#7FB8FF", "#C9A8FF"];

export function BackgroundSettings() {
    const { config, updateConfig } = useAppearance();

    const living = config.background.living ?? {
        variant: "aurora" as Variant,
        speed: 0.8,
        intensity: 0.7,
        colors: [] as string[],
        autoCycleSec: 0,
    };
    const isLiving = config.background.type === "living";

    // Recuerda el tipo de fondo previo para poder volver al desactivar.
    const prevTypeRef = React.useRef<string>("materia-oro-vivo");
    React.useEffect(() => {
        if (config.background.type !== "living") {
            prevTypeRef.current = config.background.type;
        }
    }, [config.background.type]);

    const setLiving = (patch: Partial<typeof living>) => {
        updateConfig({ background: { living: patch } } as any);
    };

    const enableLiving = () => {
        updateConfig({ background: { type: "living" } } as any);
    };

    const disableLiving = () => {
        const back = prevTypeRef.current === "living" ? "materia-oro-vivo" : prevTypeRef.current;
        updateConfig({ background: { type: back } } as any);
    };

    const pickVariant = (variant: Variant) => {
        updateConfig({ background: { type: "living", living: { variant } } } as any);
    };

    const useThemeColors = living.colors.length === 0;

    const setColorAt = (idx: number, hex: string) => {
        const base = living.colors.length ? [...living.colors] : [...DEFAULT_PALETTE];
        base[idx] = hex;
        setLiving({ colors: base });
    };

    const removeColorAt = (idx: number) => {
        const base = living.colors.length ? [...living.colors] : [...DEFAULT_PALETTE];
        base.splice(idx, 1);
        setLiving({ colors: base });
    };

    const addColor = () => {
        const base = living.colors.length ? [...living.colors] : [...DEFAULT_PALETTE];
        if (base.length >= 6) return;
        base.push("#7FB8FF");
        setLiving({ colors: base });
    };

    const applyPreset = (p: Preset) => {
        updateConfig({
            background: {
                type: "living",
                living: {
                    variant: p.variant,
                    speed: p.speed,
                    intensity: p.intensity,
                    colors: p.colors,
                },
            },
        } as any);
    };

    const resetDefault = () => {
        updateConfig({
            background: {
                type: "living",
                living: {
                    variant: "aurora",
                    speed: 0.8,
                    intensity: 0.7,
                    colors: [],
                    autoCycleSec: 0,
                },
            },
        } as any);
    };

    const toggleFullscreen = () => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent("starseed:toggle-fullscreen", { detail: { active: true } })
            );
        }
    };

    const paletteColors = living.colors.length ? living.colors : DEFAULT_PALETTE;

    return (
        <div className="rounded-2xl border border-border/50 bg-card/30 p-4 mt-4 space-y-5">
            {/* Cabecera + activacion */}
            <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-primary" /> Fondo animado vivo
                </h3>
                <p className="text-[11px] text-muted-foreground/70 mb-3 max-w-prose">
                    Un fondo de canvas que respira y se mueve. Elige una variante, ajustala a tu gusto o aplica un preset.
                    Se guarda al instante en este dispositivo y en tu cuenta.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                        type="button"
                        aria-pressed={isLiving}
                        onClick={enableLiving}
                        className={cn(
                            "text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-2",
                            isLiving
                                ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                        )}
                    >
                        <Power className={cn("w-4 h-4 shrink-0", isLiving ? "text-primary" : "text-muted-foreground")} />
                        <div className="min-w-0">
                            <span className="text-sm font-semibold block truncate">Activar fondo vivo</span>
                            <span className="text-xs text-muted-foreground">Pinta el canvas animado</span>
                        </div>
                        {isLiving && (
                            <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        )}
                    </button>
                    <button
                        type="button"
                        aria-pressed={!isLiving}
                        onClick={disableLiving}
                        className={cn(
                            "text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-2",
                            !isLiving
                                ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                        )}
                    >
                        <RotateCcw className={cn("w-4 h-4 shrink-0", !isLiving ? "text-primary" : "text-muted-foreground")} />
                        <div className="min-w-0">
                            <span className="text-sm font-semibold block truncate">Volver al anterior</span>
                            <span className="text-xs text-muted-foreground">Restaura tu fondo previo</span>
                        </div>
                        {!isLiving && (
                            <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                        )}
                    </button>
                </div>
            </div>

            {/* Galeria de variantes */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Variante
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {VARIANTS.map(({ value, label, desc, Icon }) => {
                        const active = isLiving && living.variant === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => pickVariant(value)}
                                className={cn(
                                    "text-left p-3 rounded-xl border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                                    <span className="text-sm font-semibold truncate">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                            <Gauge className="w-3.5 h-3.5 text-primary" /> Velocidad
                        </span>
                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                            {living.speed.toFixed(1)}x
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0.2}
                        max={2}
                        step={0.1}
                        value={living.speed}
                        onChange={(e) => setLiving({ speed: parseFloat(e.target.value) })}
                        className="w-full accent-primary cursor-pointer"
                    />
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-primary" /> Intensidad
                        </span>
                        <span className="text-xs font-mono text-muted-foreground tabular-nums">
                            {Math.round(living.intensity * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={living.intensity}
                        onChange={(e) => setLiving({ intensity: parseFloat(e.target.value) })}
                        className="w-full accent-primary cursor-pointer"
                    />
                </div>
            </div>

            {/* Paleta */}
            <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-primary" /> Paleta de colores
                    </span>
                    <button
                        type="button"
                        aria-pressed={useThemeColors}
                        onClick={() => setLiving({ colors: useThemeColors ? [...DEFAULT_PALETTE] : [] })}
                        className={cn(
                            "text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer",
                            useThemeColors
                                ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30"
                                : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/25"
                        )}
                    >
                        {useThemeColors ? "Usando colores del tema" : "Usar colores del tema"}
                    </button>
                </div>
                {useThemeColors ? (
                    <p className="text-xs text-muted-foreground">
                        El fondo hereda automaticamente los acentos de tu tema activo.
                    </p>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        {paletteColors.map((c, i) => (
                            <div key={i} className="relative group">
                                <input
                                    type="color"
                                    value={c}
                                    onChange={(e) => setColorAt(i, e.target.value)}
                                    className="w-10 h-10 rounded-lg border border-border/60 bg-transparent cursor-pointer p-0.5"
                                    aria-label={`Color ${i + 1}`}
                                />
                                {paletteColors.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => removeColorAt(i)}
                                        aria-label={`Quitar color ${i + 1}`}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    >
                                        x
                                    </button>
                                )}
                            </div>
                        ))}
                        {paletteColors.length < 6 && (
                            <button
                                type="button"
                                onClick={addColor}
                                className="w-10 h-10 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer flex items-center justify-center text-lg"
                                aria-label="Anadir color"
                            >
                                +
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Auto-rotacion */}
            <div className="rounded-xl border border-border/60 bg-card/40 p-3">
                <span className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    <Timer className="w-3.5 h-3.5 text-primary" /> Auto-rotacion
                    <span className="text-muted-foreground font-normal">(Automatico)</span>
                </span>
                <div className="flex flex-wrap gap-2">
                    {AUTO_CYCLE_OPTS.map((opt) => {
                        const active = (living.autoCycleSec ?? 0) === opt.value;
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setLiving({ autoCycleSec: opt.value })}
                                className={cn(
                                    "text-xs px-3 py-1.5 rounded-full border transition-all cursor-pointer",
                                    active
                                        ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30"
                                        : "border-border/60 bg-card/40 text-muted-foreground hover:border-primary/25"
                                )}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[11px] text-muted-foreground/70 mt-2">
                    Rota entre las 7 variantes cada cierto tiempo. "Off" mantiene la elegida.
                </p>
            </div>

            {/* Presets */}
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground/90 mb-2 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" /> Presets creativos
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {PRESETS.map((p) => (
                        <button
                            key={p.name}
                            type="button"
                            onClick={() => applyPreset(p)}
                            className="text-left p-3 rounded-xl border border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25 transition-all cursor-pointer"
                        >
                            <div className="flex items-center gap-2 mb-1.5">
                                <p.Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                                <span className="text-sm font-semibold truncate">{p.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2 truncate">{p.desc}</p>
                            <div className="flex gap-1">
                                {p.colors.map((c, i) => (
                                    <span
                                        key={i}
                                        className="w-4 h-4 rounded-full border border-border/40"
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Acciones finales */}
            <div className="flex flex-wrap gap-2 pt-1">
                <button
                    type="button"
                    onClick={resetDefault}
                    className="text-xs px-3 py-2 rounded-lg border border-border/60 bg-card/40 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5"
                >
                    <RotateCcw className="w-3.5 h-3.5" /> Restablecer a predeterminado
                </button>
                <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="text-xs px-3 py-2 rounded-lg border border-border/60 bg-card/40 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all cursor-pointer flex items-center gap-1.5"
                >
                    <Maximize2 className="w-3.5 h-3.5" /> Modo wallpaper / pantalla completa
                </button>
            </div>
        </div>
    );
}
