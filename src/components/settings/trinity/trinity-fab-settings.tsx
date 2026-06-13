"use client";

/*
 * Panel de Ajustes → pestaña "Trinity": visibilidad del botón flotante
 * TrinityFab (acceso a los 4 menús cardinales en pantallas táctiles).
 * Archivo nuevo e independiente — NO toca settings/appearance/**.
 * SOP: architecture/integracion-portal-starseed-os.md · "Trinity Móvil · Bloque 2".
 */

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Compass, Smartphone, Eye, EyeOff, Sparkles, Layout, Settings2, LayoutGrid } from "lucide-react";
import {
    readTrinityFabPref,
    writeTrinityFabPref,
    trinityFabAutoEligible,
    type TrinityFabPref,
} from "@/components/layout/trinity-fab";

const OPTIONS: Array<{
    value: TrinityFabPref;
    label: string;
    description: string;
    Icon: React.ComponentType<{ className?: string }>;
}> = [
        {
            value: "auto",
            label: "Auto",
            description: "Aparece solo en pantallas táctiles o ventanas ≤1024px (recomendado).",
            Icon: Smartphone,
        },
        {
            value: "on",
            label: "Visible",
            description: "Siempre visible, también con ratón y en pantallas grandes.",
            Icon: Eye,
        },
        {
            value: "off",
            label: "Oculto",
            description: "Nunca se muestra. Los sensores de borde y atajos siguen activos.",
            Icon: EyeOff,
        },
    ];

const NODE_LEGEND = [
    { color: "#007FFF", name: "Zenith", role: "Guía IA y explorador universal (norte)", Icon: Sparkles },
    { color: "#39FF14", name: "Horizon", role: "Lienzo de creación y pizarras (oeste)", Icon: Layout },
    { color: "#FFBF00", name: "Logic", role: "Centro de control del sistema (este)", Icon: Settings2 },
    { color: "#DC143C", name: "Anchor", role: "Dock Trinity de navegación (sur)", Icon: LayoutGrid },
];

export function TrinityFabSettings() {
    const [pref, setPref] = useState<TrinityFabPref>("auto");
    const [eligible, setEligible] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setPref(readTrinityFabPref());
        const evalAuto = () => setEligible(trinityFabAutoEligible());
        evalAuto();
        window.addEventListener("resize", evalAuto);
        return () => window.removeEventListener("resize", evalAuto);
    }, []);

    const select = (value: TrinityFabPref) => {
        setPref(value);
        writeTrinityFabPref(value); // persiste en localStorage y avisa al FAB en vivo
    };

    const visibleNow = mounted && pref !== "off" && (pref === "on" || eligible);

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Compass className="w-5 h-5 text-primary" />
                    Botón Trinity flotante
                </CardTitle>
                <CardDescription>
                    En móvil, los gestos desde los bordes chocan con los del sistema
                    (atrás, centro de control…). El botón Trinity despliega los 4 nodos
                    cardinales en cruz para abrir cualquier menú con un toque. Puedes
                    arrastrarlo y se ancla al borde más cercano.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Selector Auto / Visible / Oculto */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {OPTIONS.map(({ value, label, description, Icon }) => {
                        const active = pref === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => select(value)}
                                aria-pressed={active}
                                className={cn(
                                    "text-left p-4 rounded-2xl border transition-all duration-300 cursor-pointer group",
                                    active
                                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30 shadow-[0_0_18px_hsl(var(--primary)/0.15)]"
                                        : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-primary/25"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                                    <span className="text-sm font-semibold">{label}</span>
                                    {active && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                            </button>
                        );
                    })}
                </div>

                {/* Estado en vivo */}
                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/30 border border-dashed border-border/60">
                    <span
                        className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            visibleNow ? "bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse" : "bg-muted-foreground/40"
                        )}
                    />
                    <p className="text-xs text-muted-foreground">
                        {mounted
                            ? visibleNow
                                ? "Ahora mismo el botón se muestra en este dispositivo."
                                : pref === "off"
                                    ? "Oculto por tu preferencia."
                                    : "Oculto: este dispositivo tiene puntero fino y ventana >1024px (modo Auto)."
                            : "Comprobando dispositivo…"}
                    </p>
                </div>

                {/* Leyenda de los 4 nodos cardinales */}
                <div>
                    <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground mb-2.5">
                        Los 4 nodos cardinales
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {NODE_LEGEND.map(({ color, name, role, Icon }) => (
                            <div
                                key={name}
                                className="flex items-center gap-3 p-2.5 rounded-xl border border-border/50 bg-card/30"
                            >
                                <span
                                    className="grid place-items-center w-8 h-8 rounded-full shrink-0 border"
                                    style={{
                                        color,
                                        borderColor: `${color}55`,
                                        backgroundColor: `${color}14`,
                                        boxShadow: `0 0 10px ${color}33`,
                                    }}
                                >
                                    <Icon className="w-4 h-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold leading-none">{name}</p>
                                    <p className="text-[11px] text-muted-foreground truncate mt-1">{role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
