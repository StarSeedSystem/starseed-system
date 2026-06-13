'use client';

import { useState } from "react";
import { Library, FileText, Image as ImageIcon, Music, Box, Code2, ShieldCheck } from "lucide-react";
import { WidgetShell, RadialNodeGraph, MiniList, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { CodexNode } from "@/lib/widget-data/types";

const kindIcon = { doc: FileText, image: ImageIcon, audio: Music, model3d: Box, code: Code2 } as const;
const kindColor = { doc: "#38bdf8", image: "#a78bfa", audio: "#10b981", model3d: "#f59e0b", code: "#f43f5e" } as const;

export function AkashicCodexWidget() {
    const { data, loading } = useWidgetData("files.codex", { refreshMs: 20000 });
    const [sel, setSel] = useState<string | null>(null);

    return (
        <WidgetShell title="Códice Akáshico" subtitle="Entidades únicas" icon={Library} accent="#a78bfa">
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;

                // Place nodes around a radial layout deterministically
                const nodes = data.map((n, i) => ({
                    id: n.id, label: n.label,
                    distance: i === 0 ? 0 : 0.4 + (i % 3) * 0.22,
                    angle: (i / data.length) * Math.PI * 2,
                    signal: n.redundancy, accent: kindColor[n.kind],
                }));

                // small/medium → list; large → graph + list
                const showGraph = size.tier !== "micro" && size.vTier === "expanded";
                const max = size.vTier === "micro" ? 3 : size.vTier === "compact" ? 4 : 6;

                return (
                    <div className="flex flex-col h-full pt-1 gap-2">
                        {showGraph && <div className="shrink-0"><RadialNodeGraph nodes={nodes} height={150} onSelect={setSel} /></div>}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <MiniList
                                items={sel ? data.filter(d => d.id === sel || data.find(x => x.id === sel)?.connections.includes(d.id)) : data}
                                max={max}
                                render={(n: CodexNode) => {
                                    const Icon = kindIcon[n.kind];
                                    return (
                                        <button onClick={() => setSel(sel === n.id ? null : n.id)}
                                            className="w-full flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.03] p-2 hover:border-violet-500/40 transition-colors text-left">
                                            <span className="grid place-items-center size-8 rounded-lg shrink-0"
                                                style={{ background: `color-mix(in srgb, ${kindColor[n.kind]} 16%, transparent)`, color: kindColor[n.kind] }}>
                                                <Icon className="size-4" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-xs font-bold truncate">{n.label}</div>
                                                <div className="mt-1"><ProgressBar value={n.redundancy} color={kindColor[n.kind]} height={4} /></div>
                                            </div>
                                            {n.redundancy > 0.85 && <ShieldCheck className="size-3.5 text-emerald-400 shrink-0" />}
                                        </button>
                                    );
                                }}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
