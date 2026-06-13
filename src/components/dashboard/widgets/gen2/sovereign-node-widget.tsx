'use client';

import { Server, Cpu, MemoryStick, Thermometer, Share2 } from "lucide-react";
import { WidgetShell, ProgressRing, ProgressBar, StatTile } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";

export function SovereignNodeWidget() {
    const { data, loading } = useWidgetData("system.node", { refreshMs: 2500 });

    return (
        <WidgetShell title="Nodo Soberano" subtitle="Tu infraestructura" icon={Server} accent="#06b6d4" live>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const tempColor = data.temperature > 58 ? "#f43f5e" : data.temperature > 50 ? "#f59e0b" : "#06b6d4";

                if (micro) {
                    return (
                        <div className="h-full grid grid-cols-2 gap-2 place-items-center">
                            <ProgressRing value={data.cpu} size={52} color="#06b6d4" sublabel="cpu" />
                            <ProgressRing value={data.memory} size={52} color="#8b5cf6" sublabel="ram" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        <div className="grid grid-cols-3 gap-2">
                            <div className="flex flex-col items-center gap-1">
                                <ProgressRing value={data.cpu} size={size.tier === "expanded" ? 64 : 54} color="#06b6d4" sublabel="cpu" />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <ProgressRing value={data.memory} size={size.tier === "expanded" ? 64 : 54} color="#8b5cf6" sublabel="ram" />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                                <ProgressRing value={Math.min(1, data.temperature / 80)} size={size.tier === "expanded" ? 64 : 54}
                                    color={tempColor} label={`${data.temperature}°`} sublabel="temp" />
                            </div>
                        </div>

                        {size.vTier !== "compact" && (
                            <div className="grid grid-cols-2 gap-2">
                                <StatTile label="Pares IPFS" value={data.ipfsPeers} accent="#06b6d4" compact />
                                <StatTile label="Donado" value={`${Math.round(data.contributedShare * 100)}`} unit="%" accent="#10b981" icon={Share2} compact />
                            </div>
                        )}

                        {size.vTier === "expanded" && (
                            <div className="mt-auto space-y-1.5">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-cyan-300/70">
                                    <span>Hilos</span><span>Ledger {Math.round(data.ledgerSync * 100)}%</span>
                                </div>
                                {data.threads.map((t) => (
                                    <ProgressBar key={t.id} value={t.load} label={t.label} showPct color="#06b6d4" height={5} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
