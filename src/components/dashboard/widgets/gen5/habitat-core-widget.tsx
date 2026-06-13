'use client';

import { useState } from "react";
import Link from "next/link";
import {
    Home, ChevronRight, Thermometer, Lightbulb, Wind, Bot, Sun, Sunset, Moon,
} from "lucide-react";
import { WidgetShell, MiniList, ProgressBar, ProgressRing, StatTile } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { HabitatRoom, HabitatRobot } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// HabitatCoreWidget — Núcleo de Simbiosis Habitacional.
// Domótica integrada en el Oikos. Gradientes de clima/luz por
// habitación + robots de apoyo. Iluminación circadiana opcional.
// Datos "devices.habitat". Adaptativo.
// ════════════════════════════════════════════════════════════════

const CIRCADIAN_META = {
    dia:   { icon: Sun,    label: "Día",   color: "#f59e0b", desc: "Luz plena · máximo metabolismo" },
    tarde: { icon: Sunset, label: "Tarde", color: "#f97316", desc: "Luz cálida · transición energética" },
    noche: { icon: Moon,   label: "Noche", color: "#818cf8", desc: "Oscuridad suave · recuperación" },
} as const;

function RoomCard({ room, circadian }: { room: HabitatRoom; circadian: boolean }) {
    const lightColor = circadian
        ? CIRCADIAN_META[room.light > 0.7 ? "dia" : room.light > 0.45 ? "tarde" : "noche"].color
        : room.accent;
    const airColor = room.airQuality > 0.75 ? "#10b981" : room.airQuality > 0.5 ? "#f59e0b" : "#fb7185";

    return (
        <div
            className="rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-opacity-60 transition-colors"
            style={{ borderColor: `color-mix(in srgb, ${room.accent} 25%, transparent)` }}
        >
            <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[10px] font-black truncate" style={{ color: room.accent }}>{room.label}</span>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-muted-foreground/70 shrink-0">
                    <Thermometer className="size-2.5" style={{ color: room.accent }} />
                    {room.tempC.toFixed(1)}°C
                </span>
            </div>
            <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                    <Lightbulb className="size-2.5 shrink-0 text-muted-foreground/50" />
                    <div className="flex-1"><ProgressBar value={room.light} color={lightColor} height={3} /></div>
                    <span className="text-[8px] tabular-nums text-muted-foreground/50 w-5 text-right">{Math.round(room.light * 100)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Wind className="size-2.5 shrink-0 text-muted-foreground/50" />
                    <div className="flex-1"><ProgressBar value={room.airQuality} color={airColor} height={3} /></div>
                    <span className="text-[8px] tabular-nums text-muted-foreground/50 w-5 text-right">{Math.round(room.airQuality * 100)}%</span>
                </div>
            </div>
        </div>
    );
}

function RobotRow({ robot }: { robot: HabitatRobot }) {
    return (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2 py-1.5">
            <Bot className="size-3.5 shrink-0 text-muted-foreground/60" />
            <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold truncate block">{robot.label}</span>
                <span className="text-[8px] text-muted-foreground/50 truncate block">{robot.task}</span>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1 w-12">
                <span
                    className={cn(
                        "inline-block size-1.5 rounded-full",
                        robot.active ? "bg-emerald-400 shadow-[0_0_4px_#10b981]" : "bg-muted/40"
                    )}
                />
                <div className="w-full">
                    <ProgressBar value={robot.battery} color={robot.battery > 0.3 ? "#f59e0b" : "#fb7185"} height={3} />
                </div>
            </div>
        </div>
    );
}

export function HabitatCoreWidget() {
    const { data, loading } = useWidgetData("devices.habitat", { refreshMs: 8000 });
    const [circadianLighting, setCircadianLighting] = useState(true);

    return (
        <WidgetShell
            title="Núcleo Habitacional"
            subtitle="Simbiosis del Oikos"
            icon={Home}
            accent="#f59e0b"
            live
            actions={
                <Link
                    href="/dashboard?cat=habitat"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Hábitat <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data!;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const cm = CIRCADIAN_META[d.circadianMode];
                const CircIcon = cm.icon;

                if (micro) {
                    const avgTemp = d.rooms.reduce((a, r) => a + r.tempC, 0) / Math.max(1, d.rooms.length);
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-1.5">
                            <ProgressRing
                                value={d.energyHarmony}
                                size={60}
                                color="#f59e0b"
                                sublabel="sincronía"
                            />
                            <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground/70">
                                <CircIcon className="size-3" style={{ color: cm.color }} />
                                <span style={{ color: cm.color }}>{cm.label}</span>
                                <span className="text-muted-foreground/50">·</span>
                                <Thermometer className="size-3 text-muted-foreground/50" />
                                <span>{avgTemp.toFixed(1)}°C</span>
                            </div>
                        </div>
                    );
                }

                const maxRooms  = size.vTier === "expanded" ? 4 : 2;
                const maxRobots = size.vTier === "expanded" ? 3 : size.vTier === "compact" ? 1 : 2;

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {/* Modo circadiano + energyHarmony */}
                        <div className="shrink-0 flex items-center gap-3">
                            <ProgressRing
                                value={d.energyHarmony}
                                size={56}
                                color="#f59e0b"
                                sublabel="sincronía"
                            />
                            <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-1.5">
                                    <CircIcon className="size-3.5 shrink-0" style={{ color: cm.color }} />
                                    <span className="text-[10px] font-black" style={{ color: cm.color }}>{cm.label}</span>
                                </div>
                                <p className="text-[9px] text-muted-foreground/60 leading-snug">{cm.desc}</p>
                                {/* Toggle iluminación circadiana */}
                                <button
                                    onClick={() => setCircadianLighting((v) => !v)}
                                    className={cn(
                                        "inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide rounded-full border px-2 py-0.5 transition-colors cursor-pointer",
                                        circadianLighting
                                            ? "border-amber-500/40 text-amber-300 bg-amber-500/10"
                                            : "border-border/40 text-muted-foreground/50 hover:border-border/60"
                                    )}
                                >
                                    <Lightbulb className="size-2.5" />
                                    {circadianLighting ? "Circadiana ON" : "Circadiana OFF"}
                                </button>
                            </div>
                        </div>

                        {/* Habitaciones */}
                        {size.vTier !== "micro" && (
                            <>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0">
                                    Habitaciones
                                </span>
                                <div className={cn("shrink-0 grid gap-2", maxRooms > 2 ? "grid-cols-2" : "grid-cols-2")}>
                                    {d.rooms.slice(0, maxRooms).map((room) => (
                                        <RoomCard key={room.id} room={room} circadian={circadianLighting} />
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Robots */}
                        {size.vTier !== "compact" && (
                            <div className="flex-1 min-h-0 flex flex-col gap-1">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0">
                                    Robots de apoyo
                                </span>
                                <div className="flex-1 min-h-0">
                                    <MiniList
                                        items={d.robots}
                                        max={maxRobots}
                                        empty="Sin robots activos"
                                        render={(robot) => <RobotRow robot={robot} />}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Compact fallback: stat tiles */}
                        {size.vTier === "compact" && (
                            <div className="grid grid-cols-2 gap-2 shrink-0">
                                <StatTile
                                    label="Habitaciones"
                                    value={d.rooms.length}
                                    accent="#f59e0b"
                                    compact
                                />
                                <StatTile
                                    label="Robots activos"
                                    value={d.robots.filter((r) => r.active).length}
                                    icon={Bot}
                                    accent="#10b981"
                                    compact
                                />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
