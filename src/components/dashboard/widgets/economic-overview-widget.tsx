'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet, Coins, Info, ArrowLeftRight, Sprout } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, StatTile, Sparkline, Chip } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SeriesPoint } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// EconomicOverviewWidget — pulso de recursos del ecosistema StarSeed.
// ----------------------------------------------------------------
// Datos REALES (cuando hay): lee la Bolsa de la Semilla (seed_market)
// y el catálogo de granos (grain_types) del proyecto Supabase
// compartido — igual que CarteraStarseedWidget — para mostrar el
// precio de la Semilla en € con su variación a 7 días y un sparkline.
// TIEMPO REAL: suscripción realtime (postgres_changes) a `seed_market`
// y `grain_types` para refrescar el precio y el conteo en vivo.
// Si no hay sesión/datos/red, degrada con elegancia a las métricas
// simuladas (common.metrics). Theme-aware vía WidgetShell + kit.
// ════════════════════════════════════════════════════════════════

const ACCENT = "#10b981";
const SEED_GREEN = "#9FE870";

// Formateadores localizados y estables (es-ES).
const EUR_4 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const PCT_1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

interface SeedMarketRow { day: string; seed_eur: number }

/** Variación % entre el último punto y el de hace 7 días (7 filas atrás). */
function delta7d(points: number[]): number | null {
    if (points.length < 8) return null;
    const last = points[points.length - 1];
    const prev = points[points.length - 8];
    if (!prev) return null;
    return ((last - prev) / prev) * 100;
}

export function EconomicOverviewWidget() {
    const { data, loading } = useWidgetData("common.metrics", { refreshMs: 3500 });
    const supabase = useMemo(() => createClient(), []);

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
            // Sin red/sesión → fallback silencioso a métricas simuladas.
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        void (async () => { if (alive) await reload(); })();
        // TIEMPO REAL: cambios en la bolsa o el catálogo de granos → refresco.
        const ch = supabase
            .channel("w-economic-overview")
            .on("postgres_changes", { event: "*", schema: "public", table: "seed_market" }, () => { void reload(); })
            .on("postgres_changes", { event: "*", schema: "public", table: "grain_types" }, () => { void reload(); })
            .subscribe();
        return () => { alive = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    // ¿Tenemos serie real de mercado para construir el bloque principal?
    const hasMarket = market.length >= 2;
    const lastEur = hasMarket ? market[market.length - 1] : null;
    const marketDelta = hasMarket ? delta7d(market) : null;
    const marketSeries: SeriesPoint[] = useMemo(
        () => market.map((v, i) => ({ t: i, v })),
        [market]
    );

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
                    {hasMarket ? "Bolsa de la Semilla · datos en beta" : "Métricas de red · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Bloque principal: precio real de la Semilla si lo hay ──
                const seedBlock = hasMarket && lastEur !== null ? (
                    <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] @sm:text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
                                Semilla · precio
                            </span>
                            <Sprout className="size-3.5 shrink-0 opacity-60" style={{ color: SEED_GREEN }} />
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
                            <span className="font-black tracking-tighter tabular-nums text-2xl @sm:text-3xl" style={{ color: SEED_GREEN }}>
                                {EUR_4.format(lastEur)}
                            </span>
                            <span className="text-[10px] font-bold text-muted-foreground/50 uppercase">€ / Semilla</span>
                        </div>
                        {marketDelta !== null && (
                            <div className="mt-2 flex items-center gap-1.5">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums ${marketDelta >= 0 ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" : "text-rose-400 bg-rose-500/15 border-rose-500/30"}`}>
                                    {PCT_1.format(marketDelta)}%
                                </span>
                                <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground/50">7 días</span>
                            </div>
                        )}
                    </div>
                ) : null;

                if (micro) {
                    // En micro: si hay precio real, muéstralo; si no, la mejor métrica.
                    if (hasMarket && lastEur !== null) {
                        return (
                            <div className="h-full flex flex-col justify-center">
                                <div className="flex items-baseline gap-1.5 min-w-0">
                                    <Sprout className="size-4 shrink-0" style={{ color: SEED_GREEN }} />
                                    <span className="text-2xl font-black tracking-tighter tabular-nums truncate" style={{ color: SEED_GREEN }}>
                                        {EUR_4.format(lastEur)}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase text-muted-foreground/50">€</span>
                                </div>
                                {marketDelta !== null && (
                                    <span className={`mt-0.5 text-[10px] font-black tabular-nums ${marketDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                        {PCT_1.format(marketDelta)}% · 7d
                                    </span>
                                )}
                            </div>
                        );
                    }
                    const lead = data[0];
                    return (
                        <div className="h-full flex flex-col justify-center">
                            <StatTile label={lead.label} value={lead.display ?? lead.value} unit={lead.unit}
                                change={lead.change} trend={lead.trend} accent={lead.color ?? ACCENT} compact />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-3 pt-1 h-full">
                        {/* Precio real de la Semilla (o métricas líder si no hay datos) */}
                        {seedBlock ?? (
                            <div className="grid grid-cols-2 gap-2">
                                {data.slice(0, size.vTier === "compact" ? 2 : 4).map((m) => (
                                    <StatTile key={m.id} label={m.label} value={m.display ?? m.value} unit={m.unit}
                                        change={m.change} trend={m.trend} accent={m.color ?? ACCENT}
                                        compact={size.tier !== "expanded"} icon={Coins} />
                                ))}
                            </div>
                        )}

                        {/* Métricas secundarias de red (siempre útiles) */}
                        {seedBlock && (
                            <div className="grid grid-cols-2 gap-2">
                                {data.slice(0, size.vTier === "compact" ? 2 : 2).map((m) => (
                                    <StatTile key={m.id} label={m.label} value={m.display ?? m.value} unit={m.unit}
                                        change={m.change} trend={m.trend} accent={m.color ?? ACCENT}
                                        compact icon={Coins} />
                                ))}
                            </div>
                        )}

                        {/* Sparkline: serie real del mercado si existe; si no, la simulada */}
                        {size.vTier !== "compact" && (hasMarket || data[0].series) && (
                            <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 truncate min-w-0">
                                        {hasMarket ? "Semilla · bolsa 60d" : `${data[0].label} · 20m`}
                                    </span>
                                    {hasMarket
                                        ? <Chip color={SEED_GREEN}>{grainsCount !== null ? `${INT_ES.format(grainsCount)} granos` : "EUR"}</Chip>
                                        : <Chip color={data[0].color ?? ACCENT}>{data[0].trend ?? "flat"}</Chip>}
                                </div>
                                <Sparkline
                                    data={hasMarket ? marketSeries : data[0].series!}
                                    color={hasMarket ? SEED_GREEN : (data[0].color ?? ACCENT)}
                                    height={size.vTier === "expanded" ? 48 : 34}
                                />
                            </div>
                        )}

                        {size.vTier === "expanded" && (
                            <div className="mt-auto grid grid-cols-2 gap-2">
                                <button className="flex items-center justify-center gap-2 rounded-2xl bg-primary/10 border border-primary/25 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-primary transition-colors hover:bg-primary/20 cursor-pointer">
                                    <ArrowLeftRight className="size-4" /> Intercambiar
                                </button>
                                <button className="flex items-center justify-center gap-2 rounded-2xl bg-white/5 border border-border/40 px-3 py-2.5 text-[11px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:bg-white/10 cursor-pointer">
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
