'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, Coins, Info, ArrowLeftRight, Sprout, TrendingUp, TrendingDown, PieChart as PieIcon, Building2 } from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
    BarChart, Bar, Cell,
} from "recharts";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, StatTile, Chip } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import { listFederativeEntities } from "@/data/sample-governance";

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
//   • Flujos por E.F. con budgets reales + conteo animado.
//   • Shimmer animado en zona de precio.
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

// ── Hook de animación de conteo ──────────────────────────────────
function useCountUp(target: number, duration = 1200): number {
    const [val, setVal] = useState(0);
    useEffect(() => {
        let start: number | null = null;
        const from = 0;
        function step(ts: number) {
            if (!start) start = ts;
            const p = Math.min((ts - start) / duration, 1);
            setVal(Math.round(from + (target - from) * p));
            if (p < 1) requestAnimationFrame(step);
        }
        const id = requestAnimationFrame(step);
        return () => cancelAnimationFrame(id);
    }, [target, duration]);
    return val;
}

// ── Generador determinista ──────────────────────────────────────
function hash01(seed: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
    return ((h >>> 0) % 100000) / 100000;
}

function dayKey(offset = 0): string {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

interface PricePoint { label: string; v: number }

function syntheticSeries(period: Period): PricePoint[] {
    const base = 1.18;
    const pts: PricePoint[] = [];
    let acc = base;
    for (let i = period - 1; i >= 0; i--) {
        const k = dayKey(i);
        const drift = (hash01("seed-mkt-" + k) - 0.48) * 0.032;
        acc = Math.max(0.4, acc * (1 + drift));
        const dd = new Date();
        dd.setDate(dd.getDate() - i);
        pts.push({ label: `${dd.getDate()}/${dd.getMonth() + 1}`, v: Number(acc.toFixed(4)) });
    }
    return pts;
}

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
        const wobble = (hash01(`${k}-${id}`) - 0.5) * 0.18;
        const value = Math.round(anchor * (1 + wobble));
        const delta = Number(((hash01(`${k}-d-${id}`) - 0.42) * 11).toFixed(1));
        return { id, label, color, value, delta };
    });
}

function periodDelta(pts: PricePoint[]): number | null {
    if (pts.length < 2) return null;
    const a = pts[0].v, b = pts[pts.length - 1].v;
    if (!a) return null;
    return ((b - a) / a) * 100;
}

// ── Componente interno: fila de E.F. con barra proporcional ─────
function EFRow({ name, accent, totalSeeds, maxSeeds, slug }: { name: string; accent: string; totalSeeds: number; maxSeeds: number; slug: string }) {
    const animated = useCountUp(totalSeeds);
    const pct = maxSeeds > 0 ? (totalSeeds / maxSeeds) * 100 : 0;
    return (
        <Link href={`/entidad/${slug}`} className="flex items-center gap-2 group cursor-pointer hover:bg-white/[0.03] rounded-lg px-1 py-0.5 transition-colors">
            <span className="size-2 rounded-full shrink-0" style={{ background: accent }} />
            <span className="text-[10px] font-bold truncate flex-1 text-muted-foreground/80 group-hover:text-foreground transition-colors">{name}</span>
            <div className="w-14 h-1.5 rounded-full bg-white/[0.08] overflow-hidden shrink-0">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: accent }} />
            </div>
            <span className="text-[9px] font-black tabular-nums shrink-0" style={{ color: accent }}>{INT_ES.format(animated)} ◈</span>
        </Link>
    );
}

export function EconomicOverviewWidget() {
    const { data, loading } = useWidgetData("common.metrics", { refreshMs: 3500 });
    const supabase = useMemo(() => createClient(), []);

    const [period, setPeriod] = useState<Period>(7);
    const [market, setMarket] = useState<number[]>([]);
    const [grainsCount, setGrainsCount] = useState<number | null>(null);
    // Hover en fila del tesoro
    const [hoveredTreasury, setHoveredTreasury] = useState<string | null>(null);

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

    // Máximo del periodo (para línea de referencia en gráfica)
    const periodHigh = useMemo(() => priceSeries.length ? Math.max(...priceSeries.map(p => p.v)) : null, [priceSeries]);

    // E.F. con datos de presupuesto para la sección de flujos
    const topEFs = useMemo(() => listFederativeEntities().slice(0, 3), []);
    const maxEFBudget = useMemo(() => Math.max(...topEFs.map(ef => ef.budget.totalSeeds)), [topEFs]);
    const totalEFSeeds = useMemo(() => topEFs.reduce((s, ef) => s + ef.budget.totalSeeds, 0), [topEFs]);
    const animatedEFTotal = useCountUp(totalEFSeeds);

    return (
        <>
            {/* Keyframes para shimmer */}
            <style>{`
                @keyframes eco-shimmer {
                    0%   { background-position: -200% center; }
                    100% { background-position: 200% center; }
                }
                .eco-shimmer {
                    background: linear-gradient(90deg, transparent 0%, rgba(159,232,112,0.15) 40%, rgba(159,232,112,0.3) 50%, rgba(159,232,112,0.15) 60%, transparent 100%);
                    background-size: 200% auto;
                    animation: eco-shimmer 3s ease-in-out infinite;
                }
            `}</style>
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
                            {/* ── Precio + selector de periodo (con shimmer) ── */}
                            <div className="relative rounded-2xl border border-border/40 bg-white/[0.03] p-3 overflow-hidden">
                                {/* Shimmer overlay */}
                                <div className="pointer-events-none absolute inset-0 rounded-2xl eco-shimmer" />
                                <div className="relative flex items-start justify-between gap-2">
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
                                    <div className="relative mt-2 flex items-center gap-1.5">
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
                                                {/* Línea de inicio del periodo */}
                                                {priceSeries.length > 0 && (
                                                    <ReferenceLine y={priceSeries[0].v} stroke="currentColor" strokeOpacity={0.15} strokeDasharray="3 3" />
                                                )}
                                                {/* Línea de máximo del periodo (30d high) */}
                                                {periodHigh !== null && periodHigh !== priceSeries[0]?.v && (
                                                    <ReferenceLine y={periodHigh} stroke={SEED_GREEN} strokeOpacity={0.35} strokeDasharray="2 4"
                                                        label={{ value: "máx", position: "right", fontSize: 8, fill: SEED_GREEN, opacity: 0.7 }} />
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
                                        <Link href="/network/politics" className="text-[10px] font-black tabular-nums cursor-pointer hover:underline" style={{ color: ACCENT }}>
                                            {INT_ES.format(treasuryTotal)} ◈
                                        </Link>
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
                                                <Bar dataKey="value" radius={[4, 4, 0, 0]}
                                                    activeBar={{ fillOpacity: 1, stroke: "white", strokeWidth: 1, strokeOpacity: 0.3 }}>
                                                    {breakdown.map((b) => (
                                                        <Cell key={b.id} fill={b.color} fillOpacity={hoveredTreasury && hoveredTreasury !== b.id ? 0.4 : 0.85} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-1">
                                        {breakdown.map((b) => {
                                            const pct = (b.value / treasuryTotal) * 100;
                                            const href = b.id === "cultura" ? "/network/culture" : b.id === "infra" ? "/hub" : "/network/politics";
                                            return (
                                                <Link key={b.id} href={href}
                                                    onMouseEnter={() => setHoveredTreasury(b.id)}
                                                    onMouseLeave={() => setHoveredTreasury(null)}
                                                    className="flex items-center gap-2 text-[10px] rounded-lg px-1 py-0.5 hover:bg-white/[0.04] transition-colors cursor-pointer group">
                                                    <span className="size-2 rounded-full shrink-0" style={{ background: b.color }} />
                                                    <span className="truncate min-w-0 flex-1 text-muted-foreground/80 font-semibold group-hover:text-foreground transition-colors">{b.label}</span>
                                                    <span className="tabular-nums font-bold text-muted-foreground/60">{pct.toFixed(0)}%</span>
                                                    <span className={`tabular-nums font-black w-12 text-right ${b.delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                        {PCT_1.format(b.delta)}%
                                                    </span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── Flujos por E.F. (solo expanded) ── */}
                            {size.vTier === "expanded" && (
                                <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                    <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                                            <Building2 className="size-3" /> Flujos por E.F.
                                        </span>
                                        <span className="text-[9px] font-black tabular-nums" style={{ color: SEED_GREEN }}>
                                            {INT_ES.format(animatedEFTotal)} ◈ total
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                        {topEFs.map((ef) => (
                                            <EFRow key={ef.slug}
                                                name={ef.name}
                                                accent={ef.accent}
                                                totalSeeds={ef.budget.totalSeeds}
                                                maxSeeds={maxEFBudget}
                                                slug={ef.slug}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ── Métrica Seeds Circulando (compact/normal) ── */}
                            {!compact && size.vTier !== "expanded" && (
                                <div className="rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2 flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">Seeds Circulando</span>
                                    <span className="text-sm font-black tabular-nums" style={{ color: SEED_GREEN }}>
                                        {INT_ES.format(animatedEFTotal)} ◈
                                    </span>
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
        </>
    );
}
