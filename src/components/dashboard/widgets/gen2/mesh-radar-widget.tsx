'use client';

import { useMemo, useState } from "react";
import { Radar, Lock, Wifi, Bluetooth, Radio, Sun, Activity, Users, type LucideIcon } from "lucide-react";
import { WidgetShell, Chip, ProgressBar } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { MeshNode } from "@/lib/widget-data/types";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// MeshRadarWidget — Radar de Malla Soberana (Red).
// ----------------------------------------------------------------
// PROFUNDIZACIÓN (esta versión):
//   • Topología real en SVG: nodos posicionados + ENLACES dibujados
//     (al "yo" y entre pares cercanos) con grosor ∝ señal.
//   • Selección de nodo → panel de detalle (protocolo, latencia derivada,
//     ancho compartido, peers, cifrado, estado) con barra de señal.
//   • Filtro por estado: todos / fuertes / cifrados (resalta y oscurece).
//   • Métrica de conectividad global (media de señal de la malla).
// Invariante: descentralización (fediverso), identidad cifrada.
// ════════════════════════════════════════════════════════════════

const protoIcon: Record<MeshNode["protocol"], LucideIcon> = { wifi: Wifi, bluetooth: Bluetooth, rf: Radio, lifi: Sun };
const protoLabel: Record<MeshNode["protocol"], string> = { wifi: "Wi-Fi", bluetooth: "Bluetooth", rf: "Radio RF", lifi: "Li-Fi" };
const kindAccent: Record<MeshNode["kind"], string> = {
    self: "hsl(var(--primary))", peer: "#38bdf8", router: "#10b981", satellite: "#f59e0b",
};
const kindLabel: Record<MeshNode["kind"], string> = { self: "Tú", peer: "Par", router: "Router", satellite: "Satélite" };

type FilterId = "all" | "strong" | "encrypted";
const FILTERS: { id: FilterId; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "strong", label: "Fuertes" },
    { id: "encrypted", label: "Cifrados" },
];

// Latencia derivada de forma determinista (distancia + protocolo).
function latencyOf(n: MeshNode): number {
    const base = n.protocol === "lifi" ? 4 : n.protocol === "wifi" ? 9 : n.protocol === "bluetooth" ? 24 : 38;
    return Math.round(base + n.distance * 60 * (1.2 - n.signal));
}

export function MeshRadarWidget() {
    const { data, loading } = useWidgetData("network.mesh", { refreshMs: 3500 });
    const [sel, setSel] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterId>("all");

    const matches = useMemo(() => {
        return (n: MeshNode) => {
            if (n.kind === "self") return true;
            if (filter === "strong") return n.signal >= 0.6;
            if (filter === "encrypted") return n.encrypted;
            return true;
        };
    }, [filter]);

    return (
        <WidgetShell title="Radar Mesh" subtitle="Red soberana" icon={Radar} accent="#38bdf8" live>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;

                const self = data.find((n) => n.kind === "self");
                const peers = data.filter((n) => n.kind !== "self");
                const connectivity = peers.length ? peers.reduce((a, n) => a + n.signal, 0) / peers.length : 0;
                const selected = data.find((n) => n.id === sel) ?? null;
                const graphH = size.vTier === "expanded" ? 196 : size.vTier === "regular" ? 152 : 112;
                const cx = 50, cy = 50;

                // Posiciones precomputadas.
                const pos = data.map((n) => ({
                    n,
                    x: cx + Math.cos(n.angle) * n.distance * 45,
                    y: cy + Math.sin(n.angle) * n.distance * 45,
                    visible: matches(n),
                }));
                const byId = Object.fromEntries(pos.map((p) => [p.n.id, p]));

                return (
                    <div className="flex flex-col h-full pt-1 gap-2">
                        {/* Filtros + métrica de conectividad */}
                        {size.vTier !== "micro" && (
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1">
                                    {FILTERS.map((f) => (
                                        <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                                            className={cn("rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border transition-colors cursor-pointer",
                                                filter === f.id ? "bg-sky-500/20 border-sky-500/40 text-sky-200" : "border-border/40 bg-white/[0.02] text-muted-foreground hover:text-foreground")}>
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-black tabular-nums text-emerald-300">
                                    <Activity className="size-3" />{Math.round(connectivity * 100)}%
                                </span>
                            </div>
                        )}

                        {/* Topología SVG con enlaces */}
                        <div className="shrink-0">
                            <svg viewBox="0 0 100 100" style={{ height: graphH }} className="w-full">
                                {[0.33, 0.66, 1].map((r, i) => (
                                    <circle key={i} cx={cx} cy={cy} r={r * 45} fill="none" stroke="hsl(var(--border))" strokeOpacity={0.18} strokeWidth={0.4} />
                                ))}
                                {/* Enlaces de cada par al nodo "yo" */}
                                {self && pos.filter((p) => p.n.kind !== "self").map((p) => {
                                    const sp = byId[self.id];
                                    const dim = !p.visible;
                                    const isSel = sel === p.n.id || sel === self.id;
                                    return (
                                        <line key={`l-${p.n.id}`} x1={sp.x} y1={sp.y} x2={p.x} y2={p.y}
                                            stroke={kindAccent[p.n.kind]}
                                            strokeOpacity={dim ? 0.06 : isSel ? 0.6 : 0.22}
                                            strokeWidth={0.3 + p.n.signal * 0.9} />
                                    );
                                })}
                                {/* Enlaces de malla entre pares vecinos (router actúa de hub) */}
                                {(() => {
                                    const router = pos.find((p) => p.n.kind === "router");
                                    if (!router) return null;
                                    return pos.filter((p) => p.n.kind === "peer" || p.n.kind === "satellite").map((p) => (
                                        <line key={`m-${p.n.id}`} x1={router.x} y1={router.y} x2={p.x} y2={p.y}
                                            stroke="#10b981" strokeOpacity={p.visible && router.visible ? 0.14 : 0.04}
                                            strokeWidth={0.3} strokeDasharray="1.5 1.5" />
                                    ));
                                })()}
                                {/* Nodos */}
                                {pos.map((p) => {
                                    const color = kindAccent[p.n.kind];
                                    const isSelf = p.n.kind === "self";
                                    const isSel = sel === p.n.id;
                                    const r = isSelf ? 3.4 : 2.2 + p.n.signal * 1.6;
                                    return (
                                        <g key={p.n.id}>
                                            {isSel && <circle cx={p.x} cy={p.y} r={r + 2} fill="none" stroke={color} strokeWidth={0.6} strokeOpacity={0.7} />}
                                            <circle cx={p.x} cy={p.y} r={r} fill={color}
                                                className="cursor-pointer"
                                                opacity={p.visible ? 1 : 0.25}
                                                onClick={() => setSel((s) => (s === p.n.id ? null : p.n.id))}
                                                style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>

                        {/* Panel de detalle / resumen */}
                        {size.vTier !== "micro" && (
                            <div className="mt-auto rounded-2xl border border-border/40 bg-white/[0.03] px-3 py-2">
                                {selected ? (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-xs font-black truncate">{selected.label}</div>
                                                <div className="text-[10px] text-muted-foreground/60">{kindLabel[selected.kind]} · {protoLabel[selected.protocol]}</div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {(() => { const I = protoIcon[selected.protocol]; return <I className="size-3.5 text-sky-400" />; })()}
                                                {selected.encrypted
                                                    ? <Lock className="size-3.5 text-emerald-400" />
                                                    : <span title="sin cifrar" className="text-[9px] font-bold text-amber-400">abierto</span>}
                                            </div>
                                        </div>
                                        <ProgressBar value={selected.signal} label="Señal" showPct color={kindAccent[selected.kind]} height={5} />
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground/70">
                                            <span>Latencia <b className="tabular-nums text-foreground/90">{latencyOf(selected)} ms</b></span>
                                            <span>Ancho <b className="tabular-nums text-foreground/90">{selected.bandwidthShared ?? 0} Mbps</b></span>
                                        </div>
                                        <button type="button" onClick={() => setSel(null)}
                                            className="w-full mt-0.5 text-[9px] uppercase tracking-wider font-bold text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer">
                                            Cerrar detalle
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between w-full">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                                            <Users className="size-3.5" />{peers.length} nodos · toca uno
                                        </span>
                                        <Chip color="#10b981">{data.filter((n) => n.encrypted).length} cifrados</Chip>
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
