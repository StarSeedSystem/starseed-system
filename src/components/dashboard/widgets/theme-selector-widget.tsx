"use client";

import { useTheme } from "next-themes";
import { Sparkles, Sun, Moon, Droplets, Zap, Wind, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetShell } from "../kit";

// ════════════════════════════════════════════════════════════════
// ThemeSelectorWidget — selector de atmósfera (next-themes). No es un
// feed de datos: manipula el tema activo. Adaptativo a cualquier tamaño,
// nunca desborda. Sirve al invariante "adaptable a cualquier tema".
// ════════════════════════════════════════════════════════════════
type ThemeDef = { id: string; name: string; icon: LucideIcon; swatch: string };
const THEMES: ThemeDef[] = [
    { id: "light", name: "Alabaster", icon: Sun, swatch: "#fbbf24" },
    { id: "dark", name: "Obsidian", icon: Moon, swatch: "#52525b" },
    { id: "liquid-crystal", name: "Liquid Crystal", icon: Sparkles, swatch: "#06b6d4" },
    { id: "glass", name: "Prism Glass", icon: Droplets, swatch: "#6366f1" },
    { id: "natural", name: "Gaia Pulse", icon: Zap, swatch: "#10b981" },
    { id: "grey", name: "Monolith", icon: Wind, swatch: "#94a3b8" },
];

export function ThemeSelectorWidget() {
    const { theme: currentTheme, setTheme } = useTheme();

    return (
        <WidgetShell title="Vibrancy" subtitle="Resonancia atmosférica" icon={Sparkles} accent="#8b5cf6">
            {(size) => {
                const micro = size.tier === "micro" || size.vTier === "micro";
                // micro/compact → 3 cols icon-only; regular+ → 2 cols con etiqueta.
                const iconOnly = micro || size.tier === "compact";
                const cols = iconOnly ? "grid-cols-3" : "grid-cols-2";

                return (
                    <div className="h-full pt-1 overflow-y-auto">
                        <div className={cn("grid gap-1.5 content-start", cols)}>
                            {THEMES.map((t) => {
                                const active = currentTheme === t.id;
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id)}
                                        title={t.name}
                                        className={cn(
                                            "group/item relative flex flex-col items-center justify-center gap-1.5 rounded-xl border transition-colors cursor-pointer overflow-hidden",
                                            iconOnly ? "py-2.5" : "py-3 px-2",
                                            active
                                                ? "bg-primary/10 border-primary/40"
                                                : "bg-white/[0.03] border-border/40 hover:bg-white/[0.07] hover:border-border/60"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "grid place-items-center rounded-lg border transition-transform group-hover/item:scale-110",
                                                micro ? "size-7" : "size-9"
                                            )}
                                            style={{
                                                color: active ? t.swatch : undefined,
                                                background: `${t.swatch}1a`,
                                                borderColor: `${t.swatch}40`,
                                            }}
                                        >
                                            <Icon className={cn(active && "drop-shadow", micro ? "size-3.5" : "size-4")} style={{ color: t.swatch }} />
                                        </span>
                                        {!iconOnly && (
                                            <span className={cn(
                                                "text-[10px] font-black uppercase tracking-wider text-center leading-tight transition-colors",
                                                active ? "text-primary" : "text-muted-foreground group-hover/item:text-foreground"
                                            )}>
                                                {t.name}
                                            </span>
                                        )}
                                        {active && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary animate-pulse" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
