'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, Coins, Info, ArrowLeftRight, Sprout, TrendingUp, TrendingDown, PieChart as PieIcon } from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
    BarChart, Bar, Cell,
} from "recharts";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, StatTile, Chip } from "../kit";
import { useWidgetData } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// EconomicOverviewWidget — pulso de recursos del ecosistema StarSeed.
// ----------------------------------------------------------------
// Datos REALES (cuando hay): lee la Bolsa de la Semilla (seed_market)
// y el catálogo de granos (grain_types) del proyecto Supabase
// compartido para mostrar el precio de la Semilla en € con su variación
// y un área de mercado. TIEMPO REAL vía postgres_changes.
//
// PROFUNDIZACIÓN (esta versión):
//   • Selector de periodo 7d / 30d que reconstruye la serie.
//   • Series DETERMINISTAS derivadas de la fecha (hash estable por día):
//     mismas cifras durante toda la sesión, sin Math.random.
//   • Mini-gráficas con recharts (área de precio + barras por categoría).
//   • Desglose por categoría del tesoro común con % y delta de tendencia.
//   • Delta del periodo (Δ% inicio→fin) con color e icono de tendencia.
// Si no hay sesión/datos/red, degrada con elegancia a la serie sintética.
// Theme-aware vía WidgetShell + kit.
// ════════════════════════════════════════════════════════════════

const ACCENT = "#10b981";
const SEED_GREEN = "#9FE870";

// Formateadores localizados y estables (es-ES).
const EUR_4 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const PCT_1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

interface SeedMarketRow { day: string; seed_eur: number }
type Period = 7 | 30;

// ── Generador determinista ──────────────────────────────────────
// Hash estable (mulberry-like) para producir ruido reproducible por
// clave de cadena. NO usa Math.random: misma entrada → misma salida.
function hash01(seed: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    // dispersión final
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) % 100000) / 100000;
}

/** Clave de día estable (cambia 1 vez/día, no por render). */
function dayKey(offset = 0): string {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

interface PricePoint { label: string; v: number }

/** Serie sintética determinista del precio de la Semilla para N días. */
function syntheticSeries(period: Period): PricePoint[] {
    const base = 1.18; // € por Semilla, ancla estable
    const pts: PricePoint[] = [];
    let acc = base;
    for (let i = period - 1; i >= 0; i--) {
        const k = dayKey(i);
        // paseo aleatorio determinista acotado: ±1.6% diario
        const drift = (hash01("seed-mkt-" + k) - 0.48) * 0.032;
        acc = Math.max(0.4, acc * (1 + drift));
        const dd = new Date();
        dd.setDate(dd.getDate() - i);
        pts.push({ label: `${dd.getDate()}/${dd.getMonth() + 1}`, v: Number(acc.toFixed(4)) });
    }
    return pts;
}

/** Desglose determinista del tesoro común por categoría (€ y delta). */
function treasuryBreakdown(): { id: string; label: string; color: string; value: number; delta: number }[] {
    const defs: Array<[string, string, string, number]> = [
        ["energia", "Energía", "#f59e0b", 38200],
        ["alimento", "Alimento", SEED_GREEN, 27600],
        ["cultura", "Cultura", "#a855f7", 14900],
        ["infra", "Infraestructura", "#38bdf8", 21300],
        ["salud", "Salud", "#ec4899", 17400],
    ];
    const k = dayKey(0);
    return defs.map(([id, label, color, anchor]) => {
        const wobble = (hash01(`${k}-${id}`) - 0.5) * 0.18;       // ±9% sobre el ancla
        const value = Math.round(anchor * (1 + wobble));
        const delta = Number(((hash01(`${k}-d-${id}`) - 0.42) * 11).toFixed(1)); // −4.6%..+6.4%
        return { id, label, color, value, delta };
    });
}

/** Variación % entre primer y último punto de la serie. */
function periodDelta(pts: PricePoint[]): number | null {
    if (pts.length < 2) return null;
    const a = pts[0].v, b = pts[pts.length - 1].v;
    if (!a) return null;
    return ((b - a) / a) * 100;
}

export function EconomicOverviewWidget() {
    const { data, loading } = useWidgetData("common.metrics", { refreshMs: 3500 });
    const supabase = useMemo(() => createClient(), []);

    // Periodo seleccionado (estado local interactivo).
    const [period, setPeriod] = useState<Period>(7);

    // Estado de la Bolsa de la Semilla (datos reales, opcional).
    const [market, setMarket] = useState<number[]>([]);
    const [grainsCount, setGrainsCount] = useState<number | null>(null);

    const reload = useCallback(async () => {
        try {
            const [marketRes, grainsRes] = await Promise.all([
                supabase.from("seed_market").select("day, seed_eur").order("day", { ascending: false }).limit(60),
                supabase.from("grain_types").select("id", { count: "exact", head: true }),
            ]);
            if (!marketRes.error && marketRes.data) {
                const pts = (marketRes.data as SeedMarketRow[])
                    .slice().reverse()
                    .map(r => Number(r.seed_eur))
                    .filter(v => Number.isFinite(v));
                setMarket(pts);
            }
            if (!grainsRes.error && typeof grainsRes.count === "number") {
                setGrainsCount(grainsRes.count);
            }
        } catch {
            // Sin red/sesión → fallback silencioso a serie sintética.
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        void (async () => { if (alive) await reload(); })();
        const ch = supabase
            .channel("w-economic-overview")
            .on("postgres_changes", { event: "*", schema: "public", table: "seed_market" }, () => { void reload(); })
            .on("postgres_changes", { event: "*", schema: "public", table: "grain_types" }, () => { void reload(); })
            .subscribe();
        return () => { alive = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    // Serie de precio para el periodo: real si hay suficientes filas, si no sintética.
    const priceSeries = useMemo<PricePoint[]>(() => {
        if (market.length >= period) {
            const slice = market.slice(-period);
            const start = market.length - period;
            return slice.map((v, i) => {
                const dd = new Date();
                dd.setDate(dd.getDate() - (period - 1 - i));
                void start;
                return { label: `${dd.getDate()}/${dd.getMonth() + 1}`, v: Number(v.toFixed(4)) };
            });
        }
        return syntheticSeries(period);
    }, [market, period]);

    const usingReal = market.length >= period;
    const lastEur = priceSeries.length ? priceSeries[priceSeries.length - 1].v : null;
    const pDelta = periodDelta(priceSeries);
    const breakdown = useMemo(() => treasuryBreakdown(), []);
    const treasuryTotal = useMemo(() => breakdown.reduce((s, b) => s + b.value, 0), [breakdown]);

    return (
        <WidgetShell
            title="Pulso Económico"
            subtitle="Bolsa de la Semilla"
            icon={Wallet}
            accent={ACCENT}
            connections={[{ label: "Fundación", href: "https://starseed-nexus.vercel.app/#fundacion", color: "#FF8A5C" }, { label: "Comunidades", href: "/hub", color: "#9FE870" }]}
            live
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {usingReal ? "Bolsa de la Semilla · datos en beta" : "Serie de mercado · modelo determinista"}
                </p>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    return (
                        <div className="h-full flex flex-col justify-center">
                            <div className="flex items-baseline gap-1.5 min-w-0">
                                <Sprout className="size-4 shrink-0" style={{ color: SEED_GREEN }} />
                                <span className="text-2xl font-black tracking-tighter tabular-nums truncate" style={{ color: SEED_GREEN }}>
                                    {lastEur !== null ? EUR_4.format(lastEur) : "—"}
                                </span>
                                <span className="text-[10px] font-bold uppercase text-muted-foreground/50">€</span>
                            </div>
                            {pDelta !== null && (
                                <span className={`mt-0.5 text-[10px] font-black tabular-nums ${pDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                    {PCT_1.format(pDelta)}% · {period}d
                                </span>
                            )}
                        </div>
                    );
                }

                const DeltaIcon = (pDelta ?? 0) >= 0 ? TrendingUp : TrendingDown;
                const compact = size.vTier === "compact";

                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        {/* ── Precio + selector de periodo ── */}
                        <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <span className="text-[10px] @sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
                                        Semilla · precio
                                    </span>
                                    <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
                                        <span className="font-black tracking-tighter tabular-nums text-2xl @sm:text-3xl" style={{ color: SEED_GREEN }}>
                                            {lastEur !== null ? EUR_4.format(lastEur) : "—"}
                                        </span>
                                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase">€ / Semilla</span>
                                    </div>
                                </div>
                                {/* Selector de periodo */}
                                <div className="shrink-0 inline-flex rounded-full border border-border/50 bg-white/[0.04] p-0.5">
                                    {([7, 30] as Period[]).map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setPeriod(p)}
                                            aria-pressed={period === p}
                                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${period === p ? "text-background" : "text-muted-foreground/70 hover:text-foreground"}`}
                                            style={period === p ? { background: SEED_GREEN } : undefined}
                                        >
                                            {p}d
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {pDelta !== null && (
                                <div className="mt-2 flex items-center gap-1.5">
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums ${pDelta >= 0 ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" : "text-rose-400 bg-rose-500/15 border-rose-500/30"}`}>
                                        <DeltaIcon className="size-3" /> {PCT_1.format(pDelta)}%
                                    </span>
                                    <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/50">en {period} días</span>
                                </div>
                            )}
                        </div>

                        {/* ── Área de mercado (recharts) ── */}
                        {!compact && (
                            <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 truncate min-w-0">
                                        Bolsa · {period}d
                                    </span>
                                    <Chip color={SEED_GREEN}>{grainsCount !== null ? `${INT_ES.format(grainsCount)} granos` : "EUR"}</Chip>
                                </div>
                                <div style={{ height: size.vTier === "expanded" ? 96 : 64 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={priceSeries} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="ecoArea" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor={SEED_GREEN} stopOpacity={0.4} />
                                                    <stop offset="100%" stopColor={SEED_GREEN} stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="label" hide />
                                            <YAxis hide domain={["dataMin", "dataMax"]} />
                                            {priceSeries.length > 0 && (
                                                <ReferenceLine y={priceSeries[0].v} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="3 3" />
                                            )}
                                            <Tooltip
                                                cursor={{ stroke: SEED_GREEN, strokeOpacity: 0.3 }}
                                                contentStyle={{ background: "rgba(10,12,16,0.92)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 11, padding: "6px 10px" }}
                                                labelStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700 }}
                                                formatter={(val: number) => [`${EUR_4.format(val)} €`, "Semilla"]}
                                            />
                                            <Area type="monotone" dataKey="v" stroke={SEED_GREEN} strokeWidth={2} fill="url(#ecoArea)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* ── Métricas de red (líder) ── */}
                        <div className="grid grid-cols-2 gap-2">
                            {data.slice(0, 2).map((m) => (
                                <StatTile key={m.id} label={m.label} value={m.display ?? m.value} unit={m.unit}
                                    change={m.change} trend={m.trend} accent={m.color ?? ACCENT} compact icon={Coins} />
                            ))}
                        </div>

                        {/* ── Desglose del tesoro común por categoría (recharts barras) ── */}
                        {size.vTier === "expanded" && (
                            <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                                        <PieIcon className="size-3" /> Tesoro común
                                    </span>
                                    <span className="text-[10px] font-black tabular-nums" style={{ color: ACCENT }}>
                                        {INT_ES.format(treasuryTotal)} ◈
                                    </span>
                                </div>
                                <div style={{ height: 72 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={breakdown} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                                            <XAxis dataKey="label" tick={{ fontSize: 8, fill: "currentColor", opacity: 0.5 }} axisLine={false} tickLine={false} interval={0} />
                                            <YAxis hide />
                                            <Tooltip
                                                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                                                contentStyle={{ background: "rgba(10,12,16,0.92)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, fontSize: 11, padding: "6px 10px" }}
                                                formatter={(val: number) => [`${INT_ES.format(val)} ◈`, "Asignado"]}
                                            />
                                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                                {breakdown.map((b) => <Cell key={b.id} fill={b.color} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-2 grid grid-cols-1 gap-1">
                                    {breakdown.map((b) => {
                                        const pct = (b.value / treasuryTotal) * 100;
                                        return (
                                            <div key={b.id} className="flex items-center gap-2 text-[10px]">
                                                <span className="size-2 rounded-full shrink-0" style={{ background: b.color }} />
                                                <span className="truncate min-w-0 flex-1 text-muted-foreground/80 font-semibold">{b.label}</span>
                                                <span className="tabular-nums font-bold text-muted-foreground/60">{pct.toFixed(0)}%</span>
                                                <span className={`tabular-nums font-black w-12 text-right ${b.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                    {PCT_1.format(b.delta)}%
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {size.vTier === "expanded" && (
                            <div className="mt-auto grid grid-cols-2 gap-2">
                                <button type="button" className="flex items-center justify-center gap-2 rounded-2xl bg-primary/10 border border-primary/25 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 cursor-pointer">
                                    <ArrowLeftRight className="size-4" /> Intercambiar
                                </button>
                                <button type="button" className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-border/40 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:bg-white/10 cursor-pointer">
                                    <Info className="size-4" /> Libro Mayor
                                </button>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
