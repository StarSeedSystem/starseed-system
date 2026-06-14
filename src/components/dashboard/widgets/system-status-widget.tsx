'use client';

import { Activity, Cpu, MemoryStick, Thermometer, Network, GitBranch, HeartHandshake } from "lucide-react";
import { WidgetShell, StatTile, ProgressRing, ProgressBar, Bars, MiniList } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// SystemStatusWidget — telemetría del nodo soberano del usuario.
// Datos en vivo "system.node". Adaptativo + theme-aware.
// La cuota contribuida refleja la invariante de procomún (Tríada).
// ════════════════════════════════════════════════════════════════
export function SystemStatusWidget() {
    const { data, loading } = useWidgetData("system.node", { refreshMs: 2500 });

    return (
        <WidgetShell
            title="Nodo Soberano"
            subtitle="Telemetría del núcleo"
            icon={Activity}
            accent="#38bdf8"
            live
            expandHref="/explorer"
            connections={[
                { label: "Mesh", href: "/network/graph", color: "#10b981", icon: Network },
                { label: "Identidad", href: "/profile", color: "#a855f7", icon: HeartHandshake },
                { label: "Explorer", href: "/explorer", color: "#38bdf8", icon: GitBranch },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={data.ledgerSync} size={Math.min(96, Math.max(64, size.height - 30))} stroke={7} color="#38bdf8" sublabel="Sync" />
                        </div>
                    );
                }

                const tempColor = data.temperature > 45 ? "#f43f5e" : data.temperature > 38 ? "#f59e0b" : "#10b981";
                const cpuColor = data.cpu > 0.85 ? "#f43f5e" : data.cpu > 0.6 ? "#f59e0b" : "#38bdf8";
                const ramColor = data.memory > 0.85 ? "#f43f5e" : data.memory > 0.6 ? "#f59e0b" : "#a855f7";
                const cols = size.tier === "expanded" ? "grid-cols-4" : size.tier === "regular" ? "grid-cols-2" : "grid-cols-2";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className={`grid ${cols} gap-2 shrink-0`}>
                            <StatTile label="CPU" value={`${Math.round(data.cpu * 100)}%`} accent={cpuColor} icon={Cpu} compact />
                            <StatTile label="RAM" value={`${Math.round(data.memory * 100)}%`} accent={ramColor} icon={MemoryStick} compact />
                            {size.tier !== "compact" && (
                                <>
                                    <StatTile label="Temp" value={`${data.temperature.toFixed(1)}°`} accent={tempColor} icon={Thermometer} compact />
                                    <StatTile label="Pares" value={data.ipfsPeers} accent="#10b981" icon={Network} compact />
                                </>
                            )}
                        </div>

                        {size.vTier !== "compact" && (
                            <div className="shrink-0 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                    <HeartHandshake className="size-3 text-emerald-400" /> Procomún donado
                                </div>
                                <ProgressBar value={data.contributedShare} color="#10b981" showPct height={6} />
                            </div>
                        )}

                        {size.vTier === "expanded" && data.threads.length > 0 && (
                            <div className="flex-1 min-h-0">
                                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                    <GitBranch className="size-3" /> Hilos activos
                                </div>
                                <MiniList
                                    items={data.threads}
                                    max={4}
                                    render={(t) => (
                                        <div className="flex items-center gap-2 text-[10px]">
                                            <span className="w-20 truncate text-muted-foreground/70">{t.label}</span>
                                            <div className="flex-1"><ProgressBar value={t.load} color="#38bdf8" height={4} /></div>
                                            <span className="w-8 text-right tabular-nums font-bold text-foreground/80">{Math.round(t.load * 100)}%</span>
                                        </div>
                                    )}
                                />
                            </div>
                        )}

                        {size.vTier === "regular" && (
                            <div className="flex-1 min-h-0 flex items-end">
                                <Bars data={data.threads.map(t => ({ label: t.label, value: t.load }))} color="#38bdf8" height={Math.max(28, size.height - 200)} />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
