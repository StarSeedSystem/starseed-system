'use client';

import { useEffect, useMemo, useState } from "react";
import {
    Radar, Radio, Globe, Lock, Bluetooth, Wifi, Route, Send,
    CheckCircle2, XCircle, Clock, AlertTriangle, Gauge, Antenna,
    type LucideIcon,
} from "lucide-react";
import { WidgetShell, Chip } from "../kit";
import { cn } from "@/lib/utils";
import {
    useMeshState, useNearbyBeacons, useDeliveryReceipts,
    describeBands, hasRelayKey, applyModemPreset, recommendPreset, getActiveModemPreset,
    refreshNearbyNow, hasAccountSession, transmit,
    type BandStatus, type RelayBeacon, type DeliveryReceipt, type DeliveryStatus,
} from "@/ai/astraura/mesh";

// ════════════════════════════════════════════════════════════════════════════
// InternetRadarWidget — Radar de Internet / Red Sináptica (Adenda 99).
// ----------------------------------------------------------------------------
// Muestra, con DATOS REALES: (1) el RADAR de neuronas cercanas en línea (faros
// del descubrimiento automático), (2) las BANDAS/antenas que se usan a la vez
// con sus datos y CONFIGS RÁPIDAS, y (3) los INDICADORES de transmisión (¿se
// entregó?, ¿por qué nodos/servidores?) desde los recibos de entrega.
// Honestidad radical: las posiciones del radar son ilustrativas (los faros no
// comparten ubicación salvo opt-in); todo lo demás es medido/real.
// ════════════════════════════════════════════════════════════════════════════

const BAND_ICON: Record<BandStatus["id"], LucideIcon> = {
    lora: Radio, server: Globe, relay: Lock, ble: Bluetooth, wifi: Wifi,
};

const STATUS_META: Record<DeliveryStatus, { icon: LucideIcon; color: string; label: string }> = {
    delivered: { icon: CheckCircle2, color: "#10b981", label: "Entregado" },
    sent: { icon: Send, color: "#818cf8", label: "Enviado" },
    partial: { icon: AlertTriangle, color: "#f59e0b", label: "Parcial" },
    queued: { icon: Clock, color: "#38bdf8", label: "En cola" },
    failed: { icon: XCircle, color: "#ef4444", label: "Falló" },
};

/** Ángulo determinista (0..2π) a partir del id de faro — reparto estable. */
function hashAngle(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
    return (h / 0xffff) * Math.PI * 2;
}
/** Radio 0.4..0.92 determinista (dispersa los puntos sin solaparlos). */
function hashRadius(id: string): number {
    let h = 7;
    for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) & 0x7ff;
    return 0.42 + (h / 0x7ff) * 0.5;
}

export function InternetRadarWidget() {
    const mesh = useMeshState();
    const nearby = useNearbyBeacons();
    const deliveries = useDeliveryReceipts();
    const [tab, setTab] = useState<"bandas" | "actividad">("bandas");
    const [hasAccount, setHasAccount] = useState(false);
    const [relayKey, setRelayKey] = useState(false);
    const [activePreset, setActivePreset] = useState("UNSET");
    const [applying, setApplying] = useState(false);
    const [emitting, setEmitting] = useState(false);
    const [sel, setSel] = useState<string | null>(null);

    // Señales asíncronas/imperativas (cuenta, clave de relé, preset activo).
    useEffect(() => {
        let alive = true;
        void hasAccountSession().then((v) => alive && setHasAccount(v));
        setRelayKey(hasRelayKey());
        setActivePreset(getActiveModemPreset());
        refreshNearbyNow();
        return () => { alive = false; };
    }, [mesh.region, mesh.status]);

    const onlineNeighbors = useMemo(
        () => mesh.nodes.filter((n) => !n.isSelf && n.presence === "online").length,
        [mesh.nodes],
    );

    const bands = useMemo(
        () => describeBands(mesh, {
            wifiHealthy: mesh.wifiHealth.score >= 0.55,
            hasAccount,
            nearbyCount: nearby.length,
            activePreset,
            relayKey,
        }),
        [mesh, hasAccount, nearby.length, activePreset, relayKey],
    );
    const activeBands = bands.filter((b) => b.active).length;

    // Emite la presencia de ESTA neurona por la red sináptica: el enrutador
    // decide la vía (malla directa si hay vecinos, o relé/servidor) y produce un
    // RECIBO real que aparece en los indicadores — cierra el lazo de extremo a
    // extremo con datos verdaderos.
    const emitPresence = async () => {
        if (emitting) return;
        setEmitting(true);
        try {
            await transmit({
                scope: "local-group",
                type: "presence",
                cls: "P1",
                target: "broadcast",
                distance: "local",
                body: {
                    h: mesh.self?.id ?? "neurona",
                    n: mesh.self?.shortName ?? mesh.self?.longName ?? "Neurona",
                    b: mesh.self?.batteryLevel ?? null,
                },
            });
            setTab("actividad");
        } finally {
            setEmitting(false);
        }
    };

    // Config rápida de la LoRa: recomienda + aplica un preset por objetivo.
    const applyGoal = async (goal: "auto" | "distancia" | "velocidad") => {
        if (applying) return;
        setApplying(true);
        try {
            const snrs = mesh.nodes.filter((n) => !n.isSelf && typeof n.snr === "number").map((n) => n.snr as number);
            const avgSnr = snrs.length ? snrs.reduce((a, b) => a + b, 0) / snrs.length : null;
            const reco = recommendPreset(goal, {
                avgSnr, onlineNodes: onlineNeighbors,
                channelUtilPct: mesh.self?.channelUtilization ?? null, region: mesh.region,
            }, activePreset === "UNSET" ? null : activePreset);
            const ok = await applyModemPreset(reco.presetKey);
            if (ok) setActivePreset(reco.presetKey);
        } finally {
            setApplying(false);
        }
    };

    return (
        <WidgetShell
            title="Radar de Internet"
            subtitle="Red sináptica · bandas y nodos"
            icon={Radar}
            accent="#38bdf8"
            live
            connections={[{ label: "Red mesh", href: "/red-mesh", icon: Antenna }]}
        >
            {(size) => {
                const compact = size.vTier === "micro" || size.vTier === "compact";
                const graphH = size.vTier === "expanded" ? 168 : size.vTier === "regular" ? 132 : 96;
                const cx = 50, cy = 50;
                const lastDelivery = deliveries[0] ?? null;

                return (
                    <div className="flex flex-col h-full pt-1 gap-2">
                        {/* Cabecera compacta: bandas activas + vecinos + cercanas */}
                        <div className="flex items-center justify-between gap-2 shrink-0">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-sky-200">
                                <Antenna className="size-3.5" />{activeBands}/{bands.length} bandas
                            </span>
                            <div className="flex items-center gap-1.5">
                                <Chip color="#38bdf8">{nearby.length} cercanas</Chip>
                                <Chip color="#10b981">{onlineNeighbors} malla</Chip>
                            </div>
                        </div>

                        {/* Radar de conexiones cercanas en línea */}
                        <div className="shrink-0 relative">
                            <svg viewBox="0 0 100 100" style={{ height: graphH }} className="w-full">
                                {[0.33, 0.66, 1].map((r, i) => (
                                    <circle key={i} cx={cx} cy={cy} r={r * 45} fill="none"
                                        stroke="hsl(var(--border))" strokeOpacity={0.18} strokeWidth={0.4} />
                                ))}
                                <line x1={cx} y1={5} x2={cx} y2={95} stroke="hsl(var(--border))" strokeOpacity={0.1} strokeWidth={0.3} />
                                <line x1={5} y1={cy} x2={95} y2={cy} stroke="hsl(var(--border))" strokeOpacity={0.1} strokeWidth={0.3} />
                                {/* Barrido (respeta prefers-reduced-motion vía clase global) */}
                                <g className="ss-radar-beam" style={{ transformOrigin: "50px 50px" }}>
                                    <line x1={cx} y1={cy} x2={cx} y2={7} stroke="#38bdf8" strokeOpacity={0.5} strokeWidth={0.7} />
                                </g>
                                {/* Neuronas cercanas (faros) */}
                                {nearby.map((b) => {
                                    const a = hashAngle(b.deviceId);
                                    const rr = hashRadius(b.deviceId) * 45;
                                    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
                                    const color = b.own ? "hsl(var(--primary))" : "#38bdf8";
                                    const isSel = sel === b.deviceId;
                                    return (
                                        <g key={b.deviceId}>
                                            {isSel && <circle cx={x} cy={y} r={4.4} fill="none" stroke={color} strokeWidth={0.6} strokeOpacity={0.7} />}
                                            <circle cx={x} cy={y} r={2.4} fill={color} className="cursor-pointer"
                                                onClick={() => setSel((s) => (s === b.deviceId ? null : b.deviceId))}
                                                style={{ filter: `drop-shadow(0 0 3px ${color})` }} />
                                        </g>
                                    );
                                })}
                                {/* Yo (centro) */}
                                <circle cx={cx} cy={cy} r={3.2} fill="hsl(var(--primary))"
                                    style={{ filter: "drop-shadow(0 0 4px hsl(var(--primary)))" }} />
                            </svg>
                            {nearby.length === 0 && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="text-[10px] text-muted-foreground/60 text-center px-4">
                                        Buscando neuronas en línea…
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Faro seleccionado */}
                        {sel && !compact && (() => {
                            const b = nearby.find((n) => n.deviceId === sel);
                            if (!b) return null;
                            return (
                                <div className="shrink-0 rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-2.5 py-1.5 text-[10px]">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-black truncate">{b.label || "Neurona"}{b.own ? " · tu cuenta" : ""}</span>
                                        <span className="text-muted-foreground/70 tabular-nums">{b.onlineCount} vecinos</span>
                                    </div>
                                    <div className="text-muted-foreground/60 truncate">
                                        {b.region ?? "región ?"} · {b.preset ?? "preset ?"}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Segmentos: Bandas / Actividad */}
                        {!compact && (
                            <>
                                <div className="flex items-center gap-1 shrink-0">
                                    {(["bandas", "actividad"] as const).map((t) => (
                                        <button key={t} type="button" onClick={() => setTab(t)}
                                            className={cn("rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider border transition-colors cursor-pointer",
                                                tab === t ? "bg-sky-500/20 border-sky-500/40 text-sky-200"
                                                    : "border-border/40 bg-white/[0.02] text-muted-foreground hover:text-foreground")}>
                                            {t === "bandas" ? "Bandas" : "Actividad"}
                                        </button>
                                    ))}
                                    <button type="button" disabled={emitting} onClick={() => void emitPresence()}
                                        title="Emitir la presencia de esta neurona por la red sináptica"
                                        className={cn("ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-200 transition-colors cursor-pointer hover:bg-emerald-500/20",
                                            emitting && "opacity-50 cursor-wait")}>
                                        <Send className="size-2.5" />{emitting ? "Emitiendo…" : "Emitir presencia"}
                                    </button>
                                </div>

                                <div className="min-h-0 flex-1 overflow-y-auto ss-scroll pr-0.5">
                                    {tab === "bandas"
                                        ? <BandsList bands={bands} applying={applying} onGoal={applyGoal} />
                                        : <DeliveriesList deliveries={deliveries} />}
                                </div>
                            </>
                        )}

                        {/* Micro: solo el último indicador de transmisión */}
                        {compact && lastDelivery && (
                            <div className="mt-auto shrink-0">
                                <DeliveryRow r={lastDelivery} dense />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

/* ── Lista de bandas activas con config rápida ──────────────────────────────── */

function BandsList({ bands, applying, onGoal }: {
    bands: BandStatus[];
    applying: boolean;
    onGoal: (g: "auto" | "distancia" | "velocidad") => void;
}) {
    return (
        <div className="space-y-1.5">
            {bands.map((b) => {
                const Icon = BAND_ICON[b.id];
                return (
                    <div key={b.id} className={cn("rounded-xl border px-2.5 py-2 transition-colors",
                        b.active ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-border/40 bg-white/[0.02] opacity-70")}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                                <Icon className={cn("size-3.5 shrink-0", b.active ? "text-emerald-300" : "text-muted-foreground")} />
                                <span className="text-[11px] font-black truncate">{b.label}</span>
                            </span>
                            <span className={cn("text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0",
                                b.active ? "bg-emerald-500/15 text-emerald-300" : "bg-muted/30 text-muted-foreground")}>
                                {b.active ? "activa" : "en espera"}
                            </span>
                        </div>
                        <p className="text-[9.5px] text-muted-foreground/70 mt-0.5 leading-snug">{b.detail}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                            {b.metrics.map((m) => (
                                <span key={m.key} className="text-[9px] text-muted-foreground/60">
                                    {m.key} <b className="text-foreground/85 tabular-nums">{m.value}</b>
                                </span>
                            ))}
                        </div>
                        {/* Config rápida: solo la LoRa aplica presets de verdad. */}
                        {b.id === "lora" && b.active && (
                            <div className="flex items-center gap-1 mt-1.5">
                                {([["auto", "Auto"], ["distancia", "Distancia"], ["velocidad", "Velocidad"]] as const).map(([g, lbl]) => (
                                    <button key={g} type="button" disabled={applying} onClick={() => onGoal(g)}
                                        className={cn("inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[9px] font-bold text-sky-200 transition-colors cursor-pointer hover:bg-sky-500/20",
                                            applying && "opacity-50 cursor-wait")}>
                                        <Gauge className="size-2.5" />{lbl}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/* ── Indicadores de transmisión (recibos de entrega) ────────────────────────── */

function DeliveriesList({ deliveries }: { deliveries: DeliveryReceipt[] }) {
    if (!deliveries.length) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-1 text-center py-4">
                <Route className="size-5 text-muted-foreground/40" />
                <span className="text-[10px] text-muted-foreground/60">Sin transmisiones aún.<br />Aquí verás por qué nodos/servidores viaja cada envío.</span>
            </div>
        );
    }
    return (
        <div className="space-y-1.5">
            {deliveries.slice(0, 12).map((r) => <DeliveryRow key={r.id} r={r} />)}
        </div>
    );
}

function DeliveryRow({ r, dense }: { r: DeliveryReceipt; dense?: boolean }) {
    const meta = STATUS_META[r.status];
    const Icon = meta.icon;
    return (
        <div className={cn("rounded-xl border border-border/40 bg-white/[0.02]", dense ? "px-2 py-1" : "px-2.5 py-1.5")}>
            <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                    <Icon className="size-3.5 shrink-0" style={{ color: meta.color }} />
                    <span className="text-[10px] font-bold truncate">{r.summary}</span>
                </span>
                <span className="text-[8px] font-black uppercase tracking-wider shrink-0" style={{ color: meta.color }}>
                    {meta.label}
                </span>
            </div>
            {!dense && (
                <div className="flex flex-wrap gap-1 mt-1">
                    {r.hops.filter((h) => h.status !== "skipped").map((h, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white/[0.03] border border-border/40 px-1.5 py-0.5 text-[8.5px] text-muted-foreground/75">
                            <span className={cn("size-1.5 rounded-full",
                                h.status === "confirmed" ? "bg-emerald-400" : h.status === "sent" ? "bg-sky-400"
                                    : h.status === "queued" ? "bg-amber-400" : "bg-red-400")} />
                            {h.label}{h.through ? ` · ${h.through}` : ""}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
