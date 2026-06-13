'use client';

import { useState } from "react";
import { Radar, Lock, Wifi, Bluetooth, Radio, Sun } from "lucide-react";
import { WidgetShell, RadialNodeGraph, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { MeshNode } from "@/lib/widget-data/types";

const protoIcon = { wifi: Wifi, bluetooth: Bluetooth, rf: Radio, lifi: Sun } as const;
const kindAccent: Record<MeshNode["kind"], string> = {
    self: "hsl(var(--primary))", peer: "#38bdf8", router: "#10b981", satellite: "#f59e0b",
};

export function MeshRadarWidget() {
    const { data, loading } = useWidgetData("network.mesh", { refreshMs: 3500 });
    const [sel, setSel] = useState<string | null>(null);

    return (
        <WidgetShell title="Radar Mesh" subtitle="Red soberana" icon={Radar} accent="#38bdf8" live>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const nodes = data.map((n) => ({ id: n.id, label: n.label, distance: n.distance, angle: n.angle, signal: n.signal, accent: kindAccent[n.kind] }));
                const selected = data.find((n) => n.id === sel);
                const graphH = size.vTier === "expanded" ? 200 : size.vTier === "regular" ? 150 : 110;

                return (
                    <div className="flex flex-col h-full pt-1">
                        <div className="shrink-0"><RadialNodeGraph nodes={nodes} height={graphH} onSelect={setSel} /></div>
                        {size.vTier !== "micro" && (
                            <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl border border-border/40 bg-white/[0.03] px-3 py-2">
                                {selected ? (
                                    <>
                                        <div className="min-w-0">
                                            <div className="text-xs font-black truncate">{selected.label}</div>
                                            <div className="text-[10px] text-muted-foreground/60">señal {Math.round(selected.signal * 100)}% · {selected.bandwidthShared} Mbps</div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {(() => { const I = protoIcon[selected.protocol]; return <I className="size-3.5 text-sky-400" />; })()}
                                            {selected.encrypted && <Lock className="size-3.5 text-emerald-400" />}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex items-center justify-between w-full">
                                        <span className="text-[11px] text-muted-foreground/70">{data.length - 1} nodos conectados</span>
                                        <Chip color="#10b981">{data.filter(n => n.encrypted).length} cifrados</Chip>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
