"use client";

/**
 * SmartHomeTab — "Atmósfera del sistema" (pestaña "Hogar" del Centro de Control).
 * ----------------------------------------------------------------------------
 * El template original ("Smart Home": TV/termostato/cerrojo) era un mock de
 * dispositivos IoT sin sentido para un OS social — StarSeed no gestiona
 * hardware doméstico. Se reemplaza por el equivalente real que SÍ existe en
 * este sistema: el estado del fondo/atmósfera visual activa, con controles
 * reales conectados a `useAppearance()` (config.background), igual que hace
 * Ajustes → Apariencia → Fondo.
 *
 * Se mantiene el nombre de archivo y el export `SmartHomeTab` para no romper
 * el import en control-center.tsx.
 */

import React, { useMemo } from "react";
import { Waves, Sparkles, SunDim, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Slider } from "@/components/ui/slider";
import { useAppearance } from "@/context/appearance-context";
import type { AppearanceConfig } from "@/context/appearance-context";

type LivingVariant = NonNullable<AppearanceConfig["background"]["living"]>["variant"];

const LIVING_VARIANTS: Array<{ id: LivingVariant; label: string }> = [
    { id: "aurora", label: "Aurora" },
    { id: "nebula", label: "Nebulosa" },
    { id: "starfield", label: "Campo estelar" },
    { id: "mycelium", label: "Micelio" },
    { id: "plasma", label: "Plasma" },
    { id: "prisma", label: "Prisma" },
    { id: "ocean", label: "Océano" },
];

/** Etiqueta legible del tipo de fondo activo (para los que no son "living"). */
const BG_TYPE_LABELS: Partial<Record<AppearanceConfig["background"]["type"], string>> = {
    solid: "Sólido",
    gradient: "Degradado",
    image: "Imagen",
    video: "Vídeo",
    webgl: "WebGL",
    spline: "Escena Spline",
    living: "Fondo vivo",
    audiomorphic: "Audiomorphic (visualizador)",
    "liquid-aurora": "Líquido · Aurora",
    "liquid-plasma": "Líquido · Plasma",
    "liquid-lava": "Líquido · Lava",
    "liquid-oceanic": "Líquido · Oceánico",
    "liquid-iris": "Líquido · Iris",
    "materia-oro-vivo": "Materia · Oro vivo",
    "materia-cristal-liquido": "Materia · Cristal líquido",
    "materia-bosque-dorado": "Materia · Bosque dorado",
};

export function SmartHomeTab() {
    const { config, updateSection } = useAppearance();
    const bg = config.background;
    const isLiving = bg.type === "living";
    const living = bg.living;

    const currentVariantIndex = useMemo(() => {
        if (!living) return 0;
        const idx = LIVING_VARIANTS.findIndex((v) => v.id === living.variant);
        return idx === -1 ? 0 : idx;
    }, [living]);

    const currentVariantLabel = isLiving && living
        ? (LIVING_VARIANTS[currentVariantIndex]?.label ?? living.variant)
        : (BG_TYPE_LABELS[bg.type] ?? bg.type);

    const cycleVariant = () => {
        if (!isLiving || !living) return;
        const next = LIVING_VARIANTS[(currentVariantIndex + 1) % LIVING_VARIANTS.length];
        updateSection("background", { living: { ...living, variant: next.id } });
    };

    // Intensidad de partículas/efectos: "living.intensity" si el fondo es vivo,
    // o el "intensity" genérico (fondos "materia-*") como equivalente honesto.
    const intensityValue = isLiving && living ? living.intensity : (bg.intensity ?? 0.7);
    const setIntensity = (v: number) => {
        if (isLiving && living) {
            updateSection("background", { living: { ...living, intensity: v } });
        } else {
            updateSection("background", { intensity: v });
        }
    };

    // Brillo del fondo: overlayOpacity más ALTO = overlay más oscuro = fondo
    // MENOS brillante. Mostramos el slider ya invertido (100 = brillo máximo,
    // overlay 0) para que sea intuitivo; ver mismo patrón en quick-settings-tab.
    const overlayOpacity = bg.overlayOpacity ?? 0.1;
    const brightnessPct = Math.round((1 - overlayOpacity) * 100);
    const setBrightnessPct = (pct: number) => {
        updateSection("background", { overlayOpacity: Math.min(1, Math.max(0, 1 - pct / 100)) });
    };

    return (
        <div className="space-y-4 pt-2">
            {/* Estado de la atmósfera activa */}
            <div className="grid grid-cols-2 gap-3">
                <AtmosphereCard
                    label="Fondo activo"
                    icon={Sparkles}
                    value={currentVariantLabel}
                    sub={isLiving ? "Fondo vivo · pulsa para ciclar" : "Tipo de fondo"}
                    color="purple"
                    onClick={isLiving ? cycleVariant : undefined}
                />
                <AtmosphereCard
                    label="Estado del OS"
                    icon={Waves}
                    value="En línea"
                    sub="Sistema · Interfaz Trinity"
                    color="emerald"
                />
            </div>

            {/* Variantes de fondo vivo (solo si el fondo activo es "living") */}
            {isLiving && living ? (
                <div className="grid grid-cols-4 gap-1.5">
                    {LIVING_VARIANTS.map((v) => (
                        <VariantChip
                            key={v.id}
                            label={v.label}
                            active={v.id === living.variant}
                            onClick={() => updateSection("background", { living: { ...living, variant: v.id } })}
                        />
                    ))}
                </div>
            ) : (
                <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-[11px] text-muted-foreground leading-relaxed">
                    El fondo activo no es un "fondo vivo" (canvas), así que no hay variantes que ciclar aquí.
                    Los sliders de abajo siguen afectando a la intensidad y al brillo del fondo actual.
                </div>
            )}

            {/* Sliders reales de atmósfera */}
            <div className="space-y-4 bg-black/20 p-5 rounded-2xl border border-white/5 backdrop-blur-md">
                <AtmosphereSlider
                    icon={Sparkles}
                    value={Math.round((intensityValue ?? 0.7) * 100)}
                    onChange={(v: number[]) => setIntensity(v[0] / 100)}
                    label="Intensidad de partículas/efectos"
                    colorClass="[&>.relative>.absolute]:bg-purple-500"
                />
                <AtmosphereSlider
                    icon={SunDim}
                    value={brightnessPct}
                    onChange={(v: number[]) => setBrightnessPct(v[0])}
                    label="Brillo del fondo"
                    colorClass="[&>.relative>.absolute]:bg-amber-500"
                />
            </div>

            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between gap-3 overflow-hidden">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0">
                        <Wifi className="w-5 h-5 animate-pulse" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-medium truncate">Renderizado</div>
                        <div className="text-xs text-emerald-400 truncate">Aplicado en vivo a toda la interfaz</div>
                    </div>
                </div>
                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] shrink-0" />
            </div>
        </div>
    );
}

function AtmosphereCard({ label, icon: Icon, value, sub, color, onClick }: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    value: string;
    sub: string;
    color: "purple" | "emerald";
    onClick?: () => void;
}) {
    const colorMap: Record<string, string> = {
        purple: "group-hover:text-purple-400 group-hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] group-hover:border-purple-500/50",
        emerald: "group-hover:text-emerald-400 group-hover:shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] group-hover:border-emerald-500/50",
    };

    return (
        <motion.button
            type="button"
            whileHover={onClick ? { scale: 1.02 } : undefined}
            whileTap={onClick ? { scale: 0.98 } : undefined}
            onClick={onClick}
            disabled={!onClick}
            className={cn(
                "group relative h-28 rounded-2xl border bg-black/40 backdrop-blur-md p-2 flex flex-col items-center justify-center gap-2 transition-all duration-300 overflow-hidden",
                "border-white/10",
                colorMap[color],
                onClick ? "cursor-pointer" : "cursor-default"
            )}
        >
            <div className="flex items-center justify-center relative w-full">
                <div className="p-2 rounded-full bg-white/5 transition-colors shrink-0 text-white">
                    <Icon className="w-4 h-4" />
                </div>
                <div className="absolute right-2 top-0 w-1.5 h-1.5 rounded-full shadow-[0_0_8px] animate-pulse bg-current shrink-0" />
            </div>

            <div className="text-center z-10 w-full px-2 flex flex-col items-center justify-center min-w-0">
                <div className="text-[10px] md:text-[11px] text-muted-foreground font-medium mb-0.5 truncate w-full">{label}</div>
                <div className="text-xs md:text-sm font-bold truncate w-full text-white">{value}</div>
                <div className="text-[9px] text-muted-foreground/70 truncate w-full mt-0.5">{sub}</div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
        </motion.button>
    );
}

function VariantChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className={cn(
                "h-12 rounded-xl border flex items-center justify-center text-[10px] font-medium transition-all duration-200 px-1 min-w-0 w-full text-center cursor-pointer",
                active
                    ? "bg-purple-500/20 border-purple-500/40 text-purple-200 shadow-[0_0_12px_-3px_rgba(168,85,247,0.6)]"
                    : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10"
            )}
        >
            <span className="w-full truncate">{label}</span>
        </motion.button>
    );
}

function AtmosphereSlider({ icon: Icon, value, onChange, label, colorClass }: {
    icon: React.ComponentType<{ className?: string }>;
    value: number;
    onChange: (v: number[]) => void;
    label: string;
    colorClass?: string;
}) {
    return (
        <div className="space-y-3">
            <div className="flex justify-between text-xs font-medium text-muted-foreground px-1">
                <span className="flex items-center gap-2"><Icon className="w-3 h-3" /> {label}</span>
                <span>{value}%</span>
            </div>
            <Slider
                value={[value]}
                max={100}
                onValueChange={onChange}
                className={cn("cursor-pointer", colorClass)}
            />
        </div>
    );
}
