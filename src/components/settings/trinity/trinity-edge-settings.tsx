"use client";

/*
 * Ajustes → Trinity → "Gestos y bordes táctiles".
 * Controla la pulsación mantenida del dashboard (Bloque 1) y el acceso por
 * bordes: asas + deslizamiento desde cada orilla (Bloque 4). Todo aditivo:
 * escribe en config.trinity.touch / config.trinity.edgeAccess vía updateConfig
 * (deepMerge, preserva el resto). No toca settings/appearance/**.
 * SOP: architecture/integracion-portal-starseed-os.md · "Trinity Móvil".
 */

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Hand, Compass, Sparkles, Layout, Settings2, LayoutGrid, Smartphone, Eye, EyeOff } from "lucide-react";
import { useAppearance } from "@/context/appearance-context";

type Edge = "zenith" | "horizon" | "logic" | "anchor";

const EDGES: Array<{ edge: Edge; name: string; pos: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { edge: "zenith", name: "Zenith", pos: "Borde superior · Guía IA", color: "#007FFF", Icon: Sparkles },
    { edge: "horizon", name: "Horizon", pos: "Borde izquierdo · Creación", color: "#39FF14", Icon: Layout },
    { edge: "logic", name: "Logic", pos: "Borde derecho · Control", color: "#FFBF00", Icon: Settings2 },
    { edge: "anchor", name: "Anchor", pos: "Borde inferior · Dock", color: "#DC143C", Icon: LayoutGrid },
];

const MODE_OPTS: Array<{ value: "auto" | "on" | "off"; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
    { value: "auto", label: "Auto", Icon: Smartphone },
    { value: "on", label: "Siempre", Icon: Eye },
    { value: "off", label: "Desactivado", Icon: EyeOff },
];

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={label}
            onClick={onClick}
            className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer",
                on ? "bg-primary/80" : "bg-foreground/15"
            )}
        >
            <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", on ? "translate-x-4" : "translate-x-1")} />
        </button>
    );
}

function Slider({ value, min, max, step, onChange, suffix }: {
    value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="flex-1 accent-[hsl(var(--primary))] cursor-pointer"
            />
            <span className="text-xs font-mono tabular-nums text-muted-foreground w-16 text-right">
                {value}{suffix}
            </span>
        </div>
    );
}

export function TrinityEdgeSettings() {
    const { config, updateConfig } = useAppearance();
    const touch = config.trinity?.touch ?? { holdMs: 3000, haptics: true };
    const ea = config.trinity?.edgeAccess ?? {
        mode: "auto" as const,
        edges: {
            zenith: { handle: true, swipe: true },
            horizon: { handle: true, swipe: true },
            logic: { handle: true, swipe: true },
            anchor: { handle: true, swipe: true },
        },
        handleLength: 28, handleThickness: 5, handleOpacity: 0.22, swipeThreshold: 56,
    };
    const showEdgeIndicators = config.trinity?.showEdgeIndicators ?? false;
    const dockDensity = config.trinity?.dockDensity ?? "comfortable";
    const dockIconShape = (config.trinity as { dockIconShape?: string } | undefined)?.dockIconShape ?? "round";

    const setTouch = (patch: Partial<typeof touch>) => updateConfig({ trinity: { touch: { ...touch, ...patch } } } as any);
    const setEA = (patch: any) => updateConfig({ trinity: { edgeAccess: patch } } as any);
    const setEdge = (edge: Edge, patch: { handle?: boolean; swipe?: boolean }) =>
        updateConfig({ trinity: { edgeAccess: { edges: { [edge]: patch } } } } as any);

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Hand className="w-5 h-5 text-primary" />
                    Gestos y bordes táctiles
                </CardTitle>
                <CardDescription>
                    Controla cómo se comporta el dashboard al tocar y cómo se abren los
                    menús Trinity en pantallas táctiles, sin gestos de borde del sistema.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-7">

                {/* ── Forma de los iconos del dock (Adenda 190) ────── */}
                <section className="space-y-3">
                    <div>
                        <p className="text-sm font-semibold">Iconos del OmniDock</p>
                        <p className="text-xs text-muted-foreground">
                            Redondos es el diseño clásico predeterminado. Cuadrados (esquinas
                            redondeadas) es una variante de tema por perfil.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {([
                            { value: "round" as const, label: "Redondos (predeterminado)" },
                            { value: "square" as const, label: "Cuadrados" },
                        ]).map(({ value, label }) => {
                            const activo = dockIconShape === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => updateConfig({ trinity: { dockIconShape: value } } as any)}
                                    aria-pressed={activo}
                                    className={cn(
                                        "p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                                        activo ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30" : "border-border/60 bg-card/40 hover:bg-card/70"
                                    )}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </section>

                <div className="h-px bg-border/50" />

                {/* ── Tamaño del dock ──────────────────────────────── */}
                <section className="space-y-3">
                    <div>
                        <p className="text-sm font-semibold">Tamaño del OmniDock</p>
                        <p className="text-xs text-muted-foreground">
                            Cómodo mantiene el tamaño clásico de los iconos y etiquetas. Compacto
                            reduce el tamaño para mostrar más accesos a la vez.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {([
                            { value: "comfortable" as const, label: "Cómodo" },
                            { value: "compact" as const, label: "Compacto" },
                        ]).map(({ value, label }) => {
                            const active = dockDensity === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => updateConfig({ trinity: { dockDensity: value } } as any)}
                                    aria-pressed={active}
                                    className={cn(
                                        "p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                                        active ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30" : "border-border/60 bg-card/40 hover:bg-card/70"
                                    )}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </section>

                <div className="h-px bg-border/50" />

                {/* ── Indicadores sutiles de borde ─────────────────── */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold">Indicadores de borde</p>
                            <p className="text-xs text-muted-foreground">
                                Una línea muy tenue con el color de cada nodo, siempre visible en
                                el borde correspondiente (con ratón), para saber dónde está cada
                                acceso sin tener que pasar el cursor por encima.
                            </p>
                        </div>
                        <Toggle
                            on={showEdgeIndicators}
                            onClick={() => updateConfig({ trinity: { showEdgeIndicators: !showEdgeIndicators } } as any)}
                            label="Indicadores de borde"
                        />
                    </div>
                </section>

                <div className="h-px bg-border/50" />

                {/* ── Pulsación mantenida (Bloque 1) ───────────────── */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold">Mover widgets: pulsación mantenida</p>
                            <p className="text-xs text-muted-foreground">
                                En táctil, deslizar = scroll. Un widget solo entra en modo arrastre
                                tras mantenerlo pulsado este tiempo. Súbelo si se mueven por accidente.
                            </p>
                        </div>
                    </div>
                    <Slider
                        value={Math.round(touch.holdMs)}
                        min={300} max={4000} step={100}
                        onChange={(v) => setTouch({ holdMs: v })}
                        suffix=" ms"
                    />
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Vibración al activar el arrastre</span>
                        <Toggle on={touch.haptics} onClick={() => setTouch({ haptics: !touch.haptics })} label="Vibración háptica" />
                    </div>
                </section>

                <div className="h-px bg-border/50" />

                {/* ── Acceso por bordes (Bloque 4) ─────────────────── */}
                <section className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Compass className="w-4 h-4 text-primary" />
                        <p className="text-sm font-semibold">Acceso Trinity por bordes</p>
                    </div>

                    {/* Modo global */}
                    <div className="grid grid-cols-3 gap-2">
                        {MODE_OPTS.map(({ value, label, Icon }) => {
                            const active = ea.mode === value;
                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setEA({ mode: value })}
                                    aria-pressed={active}
                                    className={cn(
                                        "flex items-center justify-center gap-1.5 p-2.5 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                                        active ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30" : "border-border/60 bg-card/40 hover:bg-card/70"
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5" /> {label}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-1">
                        Auto = solo en pantallas táctiles o ventanas ≤1024px. Los sensores de ratón y el botón Trinity siguen activos en todos los casos.
                    </p>

                    {/* Asa + deslizar por orilla */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {EDGES.map(({ edge, name, pos, color, Icon }) => {
                            const e = ea.edges?.[edge] ?? { handle: true, swipe: true };
                            return (
                                <div key={edge} className="p-3 rounded-xl border border-border/50 bg-card/30 space-y-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <span className="grid place-items-center w-7 h-7 rounded-full shrink-0 border"
                                            style={{ color, borderColor: `${color}55`, backgroundColor: `${color}14`, boxShadow: `0 0 8px ${color}33` }}>
                                            <Icon className="w-3.5 h-3.5" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-semibold leading-none">{name}</p>
                                            <p className="text-[10px] text-muted-foreground truncate mt-1">{pos}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-muted-foreground">Asa visible</span>
                                        <Toggle on={!!e.handle} onClick={() => setEdge(edge, { handle: !e.handle })} label={`Asa ${name}`} />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] text-muted-foreground">Deslizar desde el borde</span>
                                        <Toggle on={!!e.swipe} onClick={() => setEdge(edge, { swipe: !e.swipe })} label={`Deslizar ${name}`} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Apariencia de las asas */}
                    <div className="space-y-3 pt-1">
                        <div className="space-y-1">
                            <span className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">Longitud del asa</span>
                            <Slider value={ea.handleLength} min={10} max={60} step={1} onChange={(v) => setEA({ handleLength: v })} suffix=" %" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">Grosor del asa</span>
                            <Slider value={ea.handleThickness} min={3} max={12} step={1} onChange={(v) => setEA({ handleThickness: v })} suffix=" px" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">Opacidad en reposo (no intrusivo)</span>
                            <Slider value={Math.round(ea.handleOpacity * 100)} min={5} max={100} step={5} onChange={(v) => setEA({ handleOpacity: v / 100 })} suffix=" %" />
                        </div>
                        <div className="space-y-1">
                            <span className="text-[11px] uppercase tracking-wider font-mono text-muted-foreground">Sensibilidad del deslizamiento</span>
                            <Slider value={ea.swipeThreshold} min={16} max={120} step={4} onChange={(v) => setEA({ swipeThreshold: v })} suffix=" px" />
                        </div>
                    </div>
                </section>
            </CardContent>
        </Card>
    );
}
