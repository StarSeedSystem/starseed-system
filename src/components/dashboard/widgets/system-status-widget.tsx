'use client';

import { useEffect, useId, useRef, useState } from "react";
import { motion, useSpring } from "framer-motion";
import { Activity, Cpu, MemoryStick, Thermometer, Network, GitBranch, HeartHandshake, RefreshCw, Cable } from "lucide-react";
import { WidgetShell, StatTile, ProgressRing, ProgressBar, Bars, MiniList, LivePulseDot, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import { getRealtimeSyncStatus, onRealtimeSyncStatus, type RealtimeSyncStatus } from "@/lib/sync/realtime-sync";
import { listNeurons, type Neuron } from "@/lib/neurons/neurons";

// ════════════════════════════════════════════════════════════════
// SystemStatusWidget v2 — telemetría del nodo soberano del usuario.
// ----------------------------------------------------------------
// MEJORAS v2:
//   • Anillos SVG animados para CPU/RAM con número interpolado.
//   • Mapa de calor de temperatura con fondo de color reactivo.
//   • Barra de procomún animada con glow verde.
//   • "Latido" de red: pulso cada 2.5 s como el refresh.
//   • Mini-gauge de temperatura circular en modo expandido.
//   • Hilos activos con micro barras de color.
// ════════════════════════════════════════════════════════════════

// Animated counter that springs to the target value
function AnimCounter({ value, decimals = 0 }: { value: number; decimals?: number }) {
    const spring = useSpring(value, { stiffness: 120, damping: 22, mass: 0.5 });
    useEffect(() => { spring.set(value); }, [spring, value]);
    const [display, setDisplay] = useState(value);
    useEffect(() => spring.on("change", (v) => setDisplay(v)), [spring]);
    return <span>{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}</span>;
}

// Thin SVG gauge arc (half-circle donut)
function GaugeArc({
    value, color, size = 56, stroke = 6, label,
}: { value: number; color: string; size?: number; stroke?: number; label: string }) {
    const id = useId();
    const r = (size - stroke) / 2;
    const circ = Math.PI * r; // half-circle
    const clamped = Math.max(0, Math.min(1, value));
    return (
        <div className="relative inline-grid place-items-center" style={{ width: size, height: size / 2 + stroke / 2 }}>
            <svg width={size} height={size} style={{ marginTop: -(size / 2) }} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                    <linearGradient id={`ga-${id}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={color} stopOpacity="0.5" />
                        <stop offset="100%" stopColor={color} />
                    </linearGradient>
                </defs>
                {/* track */}
                <circle cx={size/2} cy={size/2} r={r} fill="none"
                    stroke="hsl(var(--border))" strokeOpacity={0.2} strokeWidth={stroke}
                    strokeDasharray={circ} strokeDashoffset={0}
                    strokeLinecap="round"
                    transform={`rotate(180 ${size/2} ${size/2})`} />
                {/* fill */}
                <motion.circle
                    cx={size/2} cy={size/2} r={r} fill="none"
                    stroke={`url(#ga-${id})`} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={circ}
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: circ * (1 - clamped) }}
                    transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                    transform={`rotate(180 ${size/2} ${size/2})`}
                    style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                />
            </svg>
            <div className="absolute bottom-0 inset-x-0 text-center">
                <div className="text-[11px] font-black tabular-nums leading-none" style={{ color }}>
                    <AnimCounter value={Math.round(clamped * 100)} />%
                </div>
                <div className="text-[8px] uppercase tracking-wider text-muted-foreground/50 font-bold">{label}</div>
            </div>
        </div>
    );
}

// Network pulse dot
function PulseDot({ color }: { color: string }) {
    return (
        <span className="relative inline-flex size-2 shrink-0">
            <motion.span
                className="absolute inline-flex size-full rounded-full opacity-75"
                style={{ background: color }}
                animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className="relative inline-flex rounded-full size-2" style={{ background: color }} />
        </span>
    );
}

const SYNC_META: Record<RealtimeSyncStatus["state"], { label: string; color: string }> = {
    connected: { label: "Sincronizado", color: "#10b981" },
    connecting: { label: "Conectando", color: "#f59e0b" },
    error: { label: "Error de sync", color: "#f43f5e" },
    disabled: { label: "Sync desactivado", color: "#64748b" },
    "no-session": { label: "Sin sesión", color: "#64748b" },
    idle: { label: "Inactivo", color: "#64748b" },
};

export function SystemStatusWidget() {
    const { data, loading } = useWidgetData("system.node", { refreshMs: 2500 });
    const [updatedTs, setUpdatedTs] = useState<number>(() => Date.now());
    useEffect(() => { if (data) setUpdatedTs(Date.now()); }, [data]);

    // ── Datos REALES (no simulados): estado del motor de sync en tiempo real
    // + neuronas (dispositivos) de la cuenta. Complementa la telemetría del
    // "nodo soberano" (arriba, conceptual) con el estado real de la red
    // personal del usuario. Nunca lanza; sin sesión degrada con elegancia.
    const [sync, setSync] = useState<RealtimeSyncStatus>(() => getRealtimeSyncStatus());
    useEffect(() => onRealtimeSyncStatus(setSync), []);
    const [neurons, setNeurons] = useState<Neuron[] | null>(null);
    useEffect(() => {
        let alive = true;
        const load = () => { void listNeurons().then((list) => { if (alive) setNeurons(list); }); };
        load();
        const t = setInterval(load, 30_000);
        return () => { alive = false; clearInterval(t); };
    }, []);
    const onlineNeurons = neurons?.filter((n) => n.online).length ?? 0;
    const syncMeta = SYNC_META[sync.state] ?? SYNC_META.idle;

    return (
        <WidgetShell
            title="Nodo Soberano"
            subtitle="Telemetría del núcleo"
            icon={Activity}
            accent="#38bdf8"
            live
            expandHref="/explorer"
            connections={[
                { label: "Mesh",      href: "/network/graph", color: "#10b981", icon: Network },
                { label: "Identidad", href: "/profile",       color: "#a855f7", icon: HeartHandshake },
                { label: "Explorer",  href: "/explorer",      color: "#38bdf8", icon: GitBranch },
            ]}
            footer={
                !loading && data ? (
                    <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/60 min-w-0">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                            <PulseDot color="#38bdf8" />
                            <span className="truncate tabular-nums">{data.ipfsPeers} pares IPFS · 2,5 s</span>
                        </span>
                        <span className="shrink-0 tabular-nums">act. {timeAgo(updatedTs)}</span>
                    </div>
                ) : undefined
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing
                                value={data.ledgerSync}
                                size={Math.min(96, Math.max(64, size.height - 30))}
                                stroke={7} color="#38bdf8" sublabel="Sync"
                            />
                        </div>
                    );
                }

                const tempColor = data.temperature > 45 ? "#f43f5e" : data.temperature > 38 ? "#f59e0b" : "#10b981";
                const cpuColor  = data.cpu > 0.85 ? "#f43f5e" : data.cpu > 0.6 ? "#f59e0b" : "#38bdf8";
                const ramColor  = data.memory > 0.85 ? "#f43f5e" : data.memory > 0.6 ? "#f59e0b" : "#a855f7";
                const isExpanded = size.tier === "expanded";
                const isRegular  = size.tier === "regular";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {/* ── CPU / RAM gauges ─────────────────────────── */}
                        <div className={`grid gap-2 shrink-0 ${isExpanded ? "grid-cols-4" : "grid-cols-2"}`}>
                            {/* CPU gauge */}
                            <div className="relative rounded-2xl border border-border/40 bg-white/[0.03] p-3 overflow-hidden flex flex-col items-center gap-1"
                                style={{ boxShadow: `0 0 16px -6px ${cpuColor}55` }}>
                                <div className="absolute inset-0 pointer-events-none"
                                    style={{ background: `radial-gradient(ellipse at 50% 120%, ${cpuColor}18 0%, transparent 70%)` }} />
                                <Cpu className="size-3.5 shrink-0" style={{ color: cpuColor }} />
                                <GaugeArc value={data.cpu} color={cpuColor} size={52} stroke={5} label="CPU" />
                            </div>
                            {/* RAM gauge */}
                            <div className="relative rounded-2xl border border-border/40 bg-white/[0.03] p-3 overflow-hidden flex flex-col items-center gap-1"
                                style={{ boxShadow: `0 0 16px -6px ${ramColor}55` }}>
                                <div className="absolute inset-0 pointer-events-none"
                                    style={{ background: `radial-gradient(ellipse at 50% 120%, ${ramColor}18 0%, transparent 70%)` }} />
                                <MemoryStick className="size-3.5 shrink-0" style={{ color: ramColor }} />
                                <GaugeArc value={data.memory} color={ramColor} size={52} stroke={5} label="RAM" />
                            </div>
                            {/* Temp */}
                            {!size.tier.startsWith("compact") && (
                                <div className="relative rounded-2xl border border-border/40 bg-white/[0.03] p-3 overflow-hidden flex flex-col items-center gap-1"
                                    style={{ boxShadow: `0 0 16px -6px ${tempColor}44` }}>
                                    <div className="absolute inset-0 pointer-events-none"
                                        style={{ background: `radial-gradient(ellipse at 50% 120%, ${tempColor}15 0%, transparent 70%)` }} />
                                    <Thermometer className="size-3.5 shrink-0" style={{ color: tempColor }} />
                                    <GaugeArc value={(data.temperature - 20) / 60} color={tempColor} size={52} stroke={5} label="Temp" />
                                    <span className="text-[9px] text-muted-foreground/50 font-black tabular-nums -mt-1">
                                        <AnimCounter value={data.temperature} decimals={1} />°C
                                    </span>
                                </div>
                            )}
                            {/* IPFS peers */}
                            {isExpanded && (
                                <StatTile label="Pares IPFS" value={data.ipfsPeers} unit="nodos" accent="#10b981" icon={Network} compact />
                            )}
                        </div>

                        {/* ── Sync + Neuronas (datos REALES, no telemetría simulada) ── */}
                        {size.vTier !== "compact" && (
                            <div className="shrink-0 grid grid-cols-2 gap-2">
                                <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5 min-w-0">
                                    {sync.state === "connected" ? <LivePulseDot color={syncMeta.color} size={7} /> : <RefreshCw className="size-3 shrink-0" style={{ color: syncMeta.color }} />}
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black uppercase tracking-wide truncate" style={{ color: syncMeta.color }}>{syncMeta.label}</p>
                                        <p className="text-[8px] text-muted-foreground/50 tabular-nums truncate">{sync.lastChangeAt ? `act. ${timeAgo(sync.lastChangeAt)}` : "sin cambios aún"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5 min-w-0">
                                    <Cable className="size-3 shrink-0 text-emerald-400" />
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black uppercase tracking-wide text-emerald-300 truncate">
                                            {neurons === null ? "…" : `${onlineNeurons}/${neurons.length} neuronas`}
                                        </p>
                                        <p className="text-[8px] text-muted-foreground/50 truncate">online / total</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Procomún contribution bar ────────────────── */}
                        {size.vTier !== "compact" && (
                            <motion.div
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                                className="shrink-0 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2"
                                style={{ boxShadow: `0 0 12px -6px #10b98133` }}
                            >
                                <div className="flex items-center justify-between gap-2 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                    <span className="inline-flex items-center gap-1.5 min-w-0">
                                        <HeartHandshake className="size-3 text-emerald-400 shrink-0" />
                                        Capacidad al procomún
                                    </span>
                                    <span className="tabular-nums text-emerald-400 shrink-0 font-black">
                                        <AnimCounter value={Math.round(data.contributedShare * 100)} />%
                                    </span>
                                </div>
                                <ProgressBar value={data.contributedShare} color="#10b981" height={6} />
                            </motion.div>
                        )}

                        {/* ── Threads expanded ─────────────────────────── */}
                        {size.vTier === "expanded" && data.threads.length > 0 && (
                            <div className="flex-1 min-h-0">
                                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                                    <GitBranch className="size-3" /> Hilos activos
                                </div>
                                <MiniList
                                    items={data.threads}
                                    max={4}
                                    render={(t) => {
                                        const tc = t.load > 0.8 ? "#f43f5e" : t.load > 0.5 ? "#f59e0b" : "#38bdf8";
                                        return (
                                            <div className="flex items-center gap-2 text-[10px]">
                                                <span className="w-20 truncate text-muted-foreground/70">{t.label}</span>
                                                <div className="flex-1">
                                                    <ProgressBar value={t.load} color={tc} height={4} />
                                                </div>
                                                <span className="w-8 text-right tabular-nums font-black" style={{ color: tc }}>
                                                    {Math.round(t.load * 100)}%
                                                </span>
                                            </div>
                                        );
                                    }}
                                />
                            </div>
                        )}

                        {/* ── Threads regular: mini bars ───────────────── */}
                        {isRegular && size.vTier !== "compact" && (
                            <div className="flex-1 min-h-0 flex items-end">
                                <Bars
                                    data={data.threads.map((t) => ({ label: t.label, value: t.load }))}
                                    color="#38bdf8"
                                    height={Math.max(28, size.height - 210)}
                                />
                            </div>
                        )}

                        {/* ── Ledger sync ring (compact) ───────────────── */}
                        {size.tier === "compact" && (
                            <div className="flex-1 grid place-items-center">
                                <ProgressRing value={data.ledgerSync} size={64} stroke={6} color="#38bdf8" sublabel="Sync" />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
