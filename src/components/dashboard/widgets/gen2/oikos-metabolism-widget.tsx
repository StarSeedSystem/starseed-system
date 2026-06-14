'use client';

import { useMemo, useState } from "react";
import { Leaf, Zap, Droplets, Wheat, ArrowRightLeft, type LucideIcon } from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { WidgetShell, ProgressRing, ProgressBar, StatTile } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SeriesPoint } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// OikosMetabolismWidget — metabolismo del hogar común (Oikos).
// ----------------------------------------------------------------
// PROFUNDIZACIÓN (esta versión):
//   • Conmutador de recurso: Energía / Agua / Alimento. Cada recurso
//     tiene su propia balanza entrada→salida, excedente/déficit y serie.
//   • Diagrama de flujo (mini-sankey en SVG): cinta de entrada que se
//     bifurca hacia consumo y excedente enrutado, ancho ∝ magnitud.
//   • Estado de SUPERÁVIT / DÉFICIT con color e icono claros.
//   • Área de tendencia con recharts (línea de equilibrio de referencia).
//   • Mezcla de fuentes por barras (energía) o destinos (agua/alimento).
//   Datos deterministas: derivados del adaptador oikos.flow + cifras
//   ancla por recurso (sin Math.random en el render).
// ════════════════════════════════════════════════════════════════

type ResourceId = "energia" | "agua" | "alimento";

interface ResourceModel {
    id: ResourceId;
    label: string;
    unit: string;
    icon: LucideIcon;
    color: string;
    input: number;            // entrada (generación / captación / cosecha)
    output: number;           // salida (consumo / uso)
    routing: { to: string; amount: number }[];
    sources: { id: string; label: string; share: number }[];
    history: SeriesPoint[];
    decimals: number;
}

export function OikosMetabolismWidget() {
    const { data, loading } = useWidgetData("oikos.flow", { refreshMs: 3000 });
    const [resource, setResource] = useState<ResourceId>("energia");

    // Modelos por recurso, derivados de forma determinista de oikos.flow.
    const models = useMemo<Record<ResourceId, ResourceModel> | null>(() => {
        if (!data) return null;
        const e = data;

        // Escalas estables derivadas de la energía generada (sin azar nuevo).
        const waterIn = e.waterCaptured;                       // L captados
        const waterOut = Math.round(e.waterCaptured * 0.82);   // 82% uso
        const foodIn = Math.round(40 + e.energyGenerated * 6); // kg cosecha
        const foodOut = Math.round(34 + e.energyConsumed * 5);

        const histScale = (factor: number): SeriesPoint[] =>
            e.history.map((p) => ({ t: p.t, v: Number((p.v * factor).toFixed(2)) }));

        return {
            energia: {
                id: "energia", label: "Energía", unit: "kW", icon: Zap, color: "#f59e0b",
                input: e.energyGenerated, output: e.energyConsumed,
                routing: e.surplusRouting,
                sources: e.sources.map(s => ({ id: s.id, label: s.label, share: s.share })),
                history: e.history, decimals: 1,
            },
            agua: {
                id: "agua", label: "Agua", unit: "L", icon: Droplets, color: "#38bdf8",
                input: waterIn, output: waterOut,
                routing: [
                    { to: "Riego vivero", amount: Math.round(waterIn * 0.11) },
                    { to: "Cisterna Sangha", amount: Math.round(waterIn * 0.05) },
                    { to: "Red vecinal", amount: Math.round(waterIn * 0.02) },
                ],
                sources: [
                    { id: "lluvia", label: "Lluvia", share: 0.58 },
                    { id: "niebla", label: "Niebla", share: 0.27 },
                    { id: "reciclaje", label: "Reciclaje", share: 0.15 },
                ],
                history: histScale(60), decimals: 0,
            },
            alimento: {
                id: "alimento", label: "Alimento", unit: "kg", icon: Wheat, color: "#9FE870",
                input: foodIn, output: foodOut,
                routing: [
                    { to: "Comedor común", amount: Math.round(foodIn * 0.12) },
                    { to: "Reserva semillas", amount: Math.round(foodIn * 0.06) },
                    { to: "Trueque vecinal", amount: Math.round(foodIn * 0.04) },
                ],
                sources: [
                    { id: "huerto", label: "Huerto", share: 0.49 },
                    { id: "invernadero", label: "Invernadero", share: 0.34 },
                    { id: "micelio", label: "Micelio", share: 0.17 },
                ],
                history: histScale(8), decimals: 0,
            },
        };
    }, [data]);

    return (
        <WidgetShell title="Metabolismo Oikos" subtitle="Energía · agua · alimento" icon={Leaf} accent="#10b981" live>
            {(size) => {
                if (loading || !data || !models) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const m = models[resource];
                const net = m.input - m.output;
                const surplus = net >= 0;
                const ratio = Math.max(0, Math.min(1, m.input / (m.output || 1) / 2));
                const stateColor = surplus ? "#10b981" : "#f59e0b";
                const micro = size.tier === "micro" || size.vTier === "micro";
                const nf = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: m.decimals });

                if (micro) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-1">
                            <ProgressRing value={ratio} size={64} color={stateColor}
                                label={`${surplus ? "+" : ""}${net.toFixed(m.decimals)}`} sublabel={`${m.unit} net`} />
                        </div>
                    );
                }

                // Anchos del mini-sankey (proporción salida vs excedente).
                const routed = m.routing.reduce((s, r) => s + r.amount, 0);
                const consumedW = Math.max(8, Math.min(90, (m.output / m.input) * 100));
                const surplusW = Math.max(0, Math.min(90, (Math.max(0, net) / m.input) * 100));

                const chartData = m.history.map((p, i) => ({ i, v: p.v }));
                const avg = chartData.length ? chartData.reduce((s, d) => s + d.v, 0) / chartData.length : 0;

                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        {/* ── Conmutador de recurso ── */}
                        <div className="inline-flex self-start rounded-full border border-border/50 bg-white/[0.04] p-0.5">
                            {(Object.values(models)).map((rm) => {
                                const RIcon = rm.icon;
                                const active = rm.id === resource;
                                return (
                                    <button
                                        key={rm.id}
                                        type="button"
                                        onClick={() => setResource(rm.id)}
                                        aria-pressed={active}
                                        title={rm.label}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${active ? "text-background" : "text-muted-foreground/70 hover:text-foreground"}`}
                                        style={active ? { background: rm.color } : undefined}
                                    >
                                        <RIcon className="size-3" /> {rm.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* ── Balanza + ring de estado ── */}
                        <div className="flex items-center gap-3">
                            <ProgressRing value={ratio} size={size.tier === "expanded" ? 84 : 68}
                                color={stateColor} label={`${surplus ? "+" : ""}${net.toFixed(m.decimals)}`} sublabel={`${m.unit} net`} />
                            <div className="flex-1 grid grid-cols-2 gap-2">
                                <StatTile label="Entrada" value={nf(m.input)} unit={m.unit} accent={m.color} icon={m.icon} compact />
                                <StatTile label="Salida" value={nf(m.output)} unit={m.unit} accent="#94a3b8" compact />
                            </div>
                        </div>

                        {/* ── Estado superávit/déficit ── */}
                        <div className="flex items-center justify-between rounded-2xl border px-3 py-2"
                            style={{ borderColor: `${stateColor}40`, background: `${stateColor}14` }}>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider" style={{ color: stateColor }}>
                                <ArrowRightLeft className="size-3.5" /> {surplus ? "Superávit" : "Déficit"}
                            </span>
                            <span className="text-[11px] font-black tabular-nums" style={{ color: stateColor }}>
                                {surplus ? "+" : ""}{nf(net)} {m.unit}
                            </span>
                        </div>

                        {/* ── Mini-sankey de flujo (SVG) ── */}
                        <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider font-bold text-muted-foreground/60 mb-1.5">
                                <span>Entrada {nf(m.input)} {m.unit}</span>
                                <span>Reparto</span>
                            </div>
                            <svg viewBox="0 0 100 26" preserveAspectRatio="none" className="w-full" style={{ height: 40 }}>
                                <defs>
                                    <linearGradient id="oikIn" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor={m.color} stopOpacity={0.85} />
                                        <stop offset="100%" stopColor={m.color} stopOpacity={0.45} />
                                    </linearGradient>
                                </defs>
                                {/* cinta de entrada */}
                                <rect x="0" y="9" width="34" height="8" rx="2" fill="url(#oikIn)" />
                                {/* bifurcación a consumo */}
                                <path d={`M34,11 C46,11 46,${4} 60,${4} L100,${4} L100,${4 + (consumedW / 100) * 9} L60,${4 + (consumedW / 100) * 9} C46,${4 + (consumedW / 100) * 9} 46,13 34,13 Z`}
                                    fill="#94a3b8" fillOpacity={0.5} />
                                {/* bifurcación a excedente */}
                                {surplusW > 1 && (
                                    <path d={`M34,15 C46,15 46,${22 - (surplusW / 100) * 8} 60,${22 - (surplusW / 100) * 8} L100,${22 - (surplusW / 100) * 8} L100,22 L60,22 C46,22 46,15 34,15 Z`}
                                        fill={stateColor} fillOpacity={0.6} />
                                )}
                            </svg>
                            <div className="flex items-center justify-between text-[9px] font-bold mt-1">
                                <span className="text-slate-400">Consumo {nf(m.output)} {m.unit}</span>
                                {routed > 0 && <span style={{ color: stateColor }}>Excedente {nf(routed)} {m.unit}</span>}
                            </div>
                        </div>

                        {/* ── Tendencia (recharts) ── */}
                        {size.vTier !== "compact" && (
                            <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                                    {m.label} · tendencia neta
                                </span>
                                <div style={{ height: size.vTier === "expanded" ? 80 : 52 }} className="mt-1">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id={`oik-${m.id}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={m.color} stopOpacity={0.4} />
                                                    <stop offset="100%" stopColor={m.color} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="i" hide />
                                            <YAxis hide domain={["dataMin", "dataMax"]} />
                                            <ReferenceLine y={avg} stroke="currentColor" strokeOpacity={0.18} strokeDasharray="3 3" />
                                            <Tooltip
                                                cursor={{ stroke: m.color, strokeOpacity: 0.3 }}
                                                contentStyle={{ background: "rgba(10,12,16,0.92)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 11, padding: "6px 10px" }}
                                                formatter={(val: number) => [`${nf(val)} ${m.unit}`, m.label]}
                                                labelFormatter={() => ""}
                                            />
                                            <Area type="monotone" dataKey="v" stroke={m.color} strokeWidth={2} fill={`url(#oik-${m.id})`} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* ── Mezcla de fuentes ── */}
                        {size.vTier !== "compact" && (
                            <div className="space-y-1.5">
                                {m.sources.map((s) => (
                                    <ProgressBar key={s.id} value={s.share} label={s.label} showPct color={m.color} />
                                ))}
                            </div>
                        )}

                        {/* ── Excedente enrutado ── */}
                        {size.vTier === "expanded" && routed > 0 && (
                            <div className="mt-auto rounded-2xl border p-2.5"
                                style={{ borderColor: `${stateColor}33`, background: `${stateColor}10` }}>
                                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: stateColor }}>
                                    <ArrowRightLeft className="size-3" /> Excedente enrutado
                                </div>
                                <div className="space-y-1">
                                    {m.routing.map((r) => (
                                        <div key={r.to} className="flex justify-between text-[11px]">
                                            <span className="text-muted-foreground/70 truncate">{r.to}</span>
                                            <span className="font-bold tabular-nums" style={{ color: stateColor }}>{nf(r.amount)} {m.unit}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
