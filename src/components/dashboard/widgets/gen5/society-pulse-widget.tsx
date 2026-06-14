'use client';

import { useMemo, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Activity, ChevronRight, TrendingUp, TrendingDown, Minus, Sparkles, Heart, Users, AlertTriangle } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, ProgressRing, ProgressBar, Sparkline } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { Trend, SocietyState, SocietyRegion, SeriesPoint } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// SocietyPulseWidget — Monitor de Cohesión Macro-Social.
// El pulso del organismo colectivo: armonía global, abundancia,
// bienestar, participación ontocrática, salud por región y
// alerta de fractura con invitación a enviar apoyo.
// ----------------------------------------------------------------
// Datos REALES (cuando hay): deriva el pulso de conteos reales de
// `cafe_posts` (actividad → armonía/abundancia/participación), con
// `locations`/`cafe_locals` como regiones (cohesión por reparto de
// actividad) y la serie histórica por día. Realtime: suscripción a
// `cafe_posts` (postgres_changes). Sin red/datos → degrada a
// "society.cohesion" simulado. Invariante: democracia directa,
// soberanía directa, cohesión sin coerción.
// ════════════════════════════════════════════════════════════════

const REGION_ACCENTS = ["#10b981", "#38bdf8", "#a855f7", "#f59e0b", "#ec4899", "#22c55e"];

function TrendIcon({ trend }: { trend: Trend }) {
    if (trend === "up") return <TrendingUp className="size-3 text-emerald-400 shrink-0" />;
    if (trend === "down") return <TrendingDown className="size-3 text-rose-400 shrink-0" />;
    return <Minus className="size-3 text-muted-foreground/50 shrink-0" />;
}

function trendColor(trend: Trend) {
    if (trend === "up") return "#34d399";
    if (trend === "down") return "#fb7185";
    return undefined;
}

// Filas públicas (sólo lo necesario).
interface CafePostRow { id: string; branch: string | null; created_at: string | null }
interface LocationRow { id: string; name: string | null; city: string | null }
interface CafeLocalRow { zone: string; name: string | null }

// Saturación suave 0..1 (escala logarítmica con n posts).
function saturate(n: number, soft = 12): number {
    if (n <= 0) return 0;
    return Math.min(1, Math.log1p(n) / Math.log1p(soft));
}

// Construye un SocietyState real a partir de conteos.
function buildSociety(posts: CafePostRow[], regionsSrc: { id: string; label: string }[]): SocietyState {
    const now = Date.now();
    const total = posts.length;

    // ── Serie histórica por día (últimos 14 días con actividad) ──
    const byDay = new Map<string, number>();
    for (const p of posts) {
        const t = p.created_at ? new Date(p.created_at) : new Date();
        const key = t.toISOString().slice(0, 10);
        byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const days: SeriesPoint[] = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(now - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        days.push({ t: d.getTime(), v: byDay.get(key) ?? 0 });
    }
    // Normaliza la serie a 0..1 para el sparkline de cohesión.
    const maxDay = Math.max(...days.map(p => p.v), 1);
    const history: SeriesPoint[] = days.map(p => ({ t: p.t, v: 0.35 + (p.v / maxDay) * 0.6 }));

    // ── Actividad reciente (últimas 72 h) → participación/armonía ──
    const recent = posts.filter(p => {
        const ts = p.created_at ? new Date(p.created_at).getTime() : now;
        return now - ts < 1000 * 60 * 60 * 72;
    }).length;

    const harmonyIndex = 0.45 + saturate(total, 30) * 0.5;
    const participation = saturate(recent, 10);
    const abundance = 0.4 + saturate(total, 24) * 0.55;
    const wellbeing = 0.5 + saturate(recent, 14) * 0.45;

    // ── Reparto de actividad por región (por branch o reparto estable) ──
    const branchCounts = new Map<string, number>();
    for (const p of posts) {
        const b = (p.branch?.trim() || "").toLowerCase();
        if (b) branchCounts.set(b, (branchCounts.get(b) ?? 0) + 1);
    }
    const regions: SocietyRegion[] = regionsSrc.map((r, i) => {
        // intenta casar la región con un branch por inclusión de nombre
        let count = 0;
        const lname = r.label.toLowerCase();
        for (const [b, c] of branchCounts) {
            if (lname.includes(b) || b.includes(lname.split(" ")[0])) count += c;
        }
        // si no casa nada, reparte el total de forma estable
        if (count === 0 && regionsSrc.length > 0) {
            count = Math.round((total / regionsSrc.length) * (0.7 + ((i * 37) % 11) / 18));
        }
        const cohesion = 0.4 + saturate(count, 12) * 0.55;
        const trend: Trend = cohesion > 0.72 ? "up" : cohesion < 0.5 ? "down" : "flat";
        return {
            id: r.id,
            label: r.label,
            cohesion,
            trend,
            accent: REGION_ACCENTS[i % REGION_ACCENTS.length],
        };
    });

    // ── Detección de fractura: región notablemente más baja ──
    let fracture: SocietyState["fracture"] | undefined;
    if (regions.length > 1) {
        const weakest = [...regions].sort((a, b) => a.cohesion - b.cohesion)[0];
        if (weakest.cohesion < 0.5) {
            fracture = { region: weakest.label, reason: "baja actividad cívica reciente" };
        }
    }

    return { harmonyIndex, regions, abundance, wellbeing, participation, fracture, history };
}

export function SocietyPulseWidget() {
    const supabase = useMemo(() => createClient(), []);
    const { data: sim, loading: simLoading } = useWidgetData("society.cohesion", { refreshMs: 12000 });

    const [real, setReal] = useState<SocietyState | null>(null);

    const reload = useCallback(async () => {
        try {
            const [postsRes, locsRes, localsRes] = await Promise.all([
                supabase.from("cafe_posts").select("id, branch, created_at")
                    .order("created_at", { ascending: false }).limit(300),
                supabase.from("locations").select("id, name, city").limit(8),
                supabase.from("cafe_locals").select("zone, name").limit(8),
            ]);
            if (postsRes.error || !postsRes.data || postsRes.data.length === 0) {
                setReal(null);
                return;
            }
            // Regiones: prioriza locations (ciudades), si no cafe_locals (zonas).
            let regionsSrc: { id: string; label: string }[] = [];
            if (!locsRes.error && locsRes.data && locsRes.data.length > 0) {
                regionsSrc = (locsRes.data as LocationRow[]).map(l => ({
                    id: l.id, label: (l.city || l.name || l.id).trim(),
                }));
            } else if (!localsRes.error && localsRes.data && localsRes.data.length > 0) {
                regionsSrc = (localsRes.data as CafeLocalRow[]).map(l => ({
                    id: l.zone, label: (l.name || l.zone).trim(),
                }));
            }
            setReal(buildSociety(postsRes.data as CafePostRow[], regionsSrc));
        } catch {
            setReal(null); // fallback silencioso a modo simulado
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        void (async () => { if (alive) await reload(); })();
        // Realtime: nuevos posts/cambios refrescan el pulso en vivo.
        const ch = supabase
            .channel("w-society-pulse")
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_posts" }, () => { void reload(); })
            .subscribe();
        return () => { alive = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    const data: SocietyState | null = real ?? sim ?? null;
    const loading = real ? false : (simLoading && !sim);
    const liveReal = !!real;

    return (
        <WidgetShell
            title="Pulso de la Sociedad"
            subtitle={liveReal ? "Cohesión · datos en vivo" : "Cohesión Macro-Social"}
            icon={Activity}
            accent="#10b981"
            live
            actions={
                <Link
                    href="/network/politics"
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer"
                >
                    Red <ChevronRight className="size-3" />
                </Link>
            }
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {liveReal ? "Pulso del Café · datos en vivo" : "Cohesión macro-social · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data;
                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: anillo de armonía + sparkline ──────────────────────
                if (micro) {
                    return (
                        <div className="h-full flex items-center justify-center gap-3">
                            <ProgressRing
                                value={d.harmonyIndex}
                                size={64}
                                stroke={6}
                                color="#10b981"
                                label={`${Math.round(d.harmonyIndex * 100)}`}
                                sublabel="armonía"
                            />
                            <div className="flex-1 min-w-0">
                                <Sparkline data={d.history} color="#10b981" height={36} />
                            </div>
                        </div>
                    );
                }

                const isExpanded = size.vTier === "expanded";
                const isCompact = size.vTier === "compact";

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">

                        {/* ── Alerta de fractura ────────────────────────────────── */}
                        {d.fracture && (
                            <div className="shrink-0 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/[0.07] px-2.5 py-2">
                                <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <span className="block text-[10px] font-black uppercase tracking-wide text-amber-300">
                                        Fractura detectada
                                    </span>
                                    <span className="block text-[9px] text-muted-foreground/80 leading-snug truncate">
                                        <strong className="text-amber-200/90">{d.fracture.region}</strong> — {d.fracture.reason}
                                    </span>
                                </div>
                                <Link
                                    href="/network/politics"
                                    className="shrink-0 inline-flex items-center gap-1 rounded-full border border-amber-400/40 text-amber-300 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide hover:bg-amber-400/15 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                    <Sparkles className="size-2.5" /> Apoyar
                                </Link>
                            </div>
                        )}

                        {/* ── Armonía global + métricas ─────────────────────────── */}
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing
                                value={d.harmonyIndex}
                                size={isExpanded ? 80 : 64}
                                stroke={7}
                                color="#10b981"
                                label={`${Math.round(d.harmonyIndex * 100)}`}
                                sublabel="armonía global"
                            />
                            <div className="flex-1 min-w-0 space-y-1.5">
                                {/* Abundancia */}
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="size-3 shrink-0 text-amber-400/80" />
                                    <div className="flex-1 min-w-0">
                                        <ProgressBar value={d.abundance} color="#f59e0b" height={4} showPct={false} />
                                    </div>
                                    <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right shrink-0">
                                        {Math.round(d.abundance * 100)}%
                                    </span>
                                </div>
                                {/* Bienestar */}
                                <div className="flex items-center gap-1.5">
                                    <Heart className="size-3 shrink-0 text-rose-400/80" />
                                    <div className="flex-1 min-w-0">
                                        <ProgressBar value={d.wellbeing} color="#fb7185" height={4} showPct={false} />
                                    </div>
                                    <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right shrink-0">
                                        {Math.round(d.wellbeing * 100)}%
                                    </span>
                                </div>
                                {/* Participación */}
                                <div className="flex items-center gap-1.5">
                                    <Users className="size-3 shrink-0 text-sky-400/80" />
                                    <div className="flex-1 min-w-0">
                                        <ProgressBar value={d.participation} color="#38bdf8" height={4} showPct={false} />
                                    </div>
                                    <span className="text-[9px] tabular-nums text-muted-foreground/60 w-7 text-right shrink-0">
                                        {Math.round(d.participation * 100)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── Leyenda de las barras ─────────────────────────────── */}
                        {!isCompact && (
                            <div className="shrink-0 flex items-center gap-3 text-[9px] font-bold uppercase tracking-wide text-muted-foreground/50">
                                <span className="inline-flex items-center gap-1"><Sparkles className="size-2.5 text-amber-400/70" /> Abundancia</span>
                                <span className="inline-flex items-center gap-1"><Heart className="size-2.5 text-rose-400/70" /> Bienestar</span>
                                <span className="inline-flex items-center gap-1"><Users className="size-2.5 text-sky-400/70" /> Participación</span>
                            </div>
                        )}

                        {/* ── Regiones ──────────────────────────────────────────── */}
                        <div className="flex-1 min-h-0 overflow-hidden space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 block">
                                Regiones
                            </span>
                            {d.regions.slice(0, isExpanded ? 5 : isCompact ? 2 : 4).map((rg) => (
                                <div key={rg.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2 py-1">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1 mb-0.5">
                                            <span
                                                className="text-[10px] font-bold truncate"
                                                style={{ color: rg.accent }}
                                            >
                                                {rg.label}
                                            </span>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <TrendIcon trend={rg.trend} />
                                                <span
                                                    className="text-[9px] tabular-nums font-black"
                                                    style={{ color: trendColor(rg.trend) ?? "var(--muted-foreground)" }}
                                                >
                                                    {Math.round(rg.cohesion * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                        <ProgressBar
                                            value={rg.cohesion}
                                            color={rg.accent}
                                            height={3}
                                            showPct={false}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── Sparkline histórico ───────────────────────────────── */}
                        <div className="shrink-0">
                            <Sparkline
                                data={d.history}
                                color="#10b981"
                                height={isExpanded ? 44 : 28}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
