'use client';

// ════════════════════════════════════════════════════════════════
// CarteraStarseedWidget — Cartera StarSeed 🌱 (cuenta soberana unificada)
// ----------------------------------------------------------------
// Consume el proyecto Supabase COMPARTIDO (Portal/Café/SOSD) vía el
// cliente browser existente (@/utils/supabase/client):
//   • Público (siempre): grain_types + últimas ~60 filas de seed_market
//     → sparkline SVG inline de seed_eur (stroke #9FE870) + delta 7d.
//   • Con sesión (RLS auth.uid()): wallets (semillas + granos jsonb)
//     y últimos 6 movimientos de economy_ledger.
// Estados: skeleton de carga, error con reintento, sin sesión (mercado
// público + CTA iniciar sesión) y con sesión (cartera completa).
// Solo lectura · "modo beta simulada". SOP: architecture/
// integracion-portal-starseed-os.md → "Widget Cartera StarSeed (v1)".
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { Wallet, LogIn, RefreshCw, AlertTriangle, Sprout } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, timeAgo } from "../kit";
import { cn } from "@/lib/utils";

// ── Tipos de fila (tablas de la cuenta unificada) ───────────────
interface GrainTypeRow {
    id: string;
    name: string;
    color: string | null;
    emoji: string | null;
    seeds_per_100g: number | null;
}

interface SeedMarketRow {
    day: string;
    seed_eur: number;
}

interface WalletRow {
    semillas: number | null;
    granos: Record<string, unknown> | null;
}

interface LedgerRow {
    kind: string | null;
    seeds: number | null;
    granos: Record<string, unknown> | null;
    name: string | null;
    ts: string | null;
}

type FetchStatus = "loading" | "ready" | "error";

const ACCENT = "#9FE870"; // verde semilla (mismo tono que el Portal)

// ── Helpers ─────────────────────────────────────────────────────
function formatEur(v: number): string {
    return `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €`;
}

function gramsFor(granos: Record<string, unknown> | null | undefined, grain: GrainTypeRow): number {
    if (!granos) return 0;
    const raw = granos[grain.id] ?? granos[grain.name] ?? granos[grain.name?.toLowerCase?.() ?? ""];
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

/** Delta % entre el último punto y el de hace 7 días (7 filas atrás). */
function delta7d(points: number[]): number | null {
    if (points.length < 8) return null;
    const last = points[points.length - 1];
    const prev = points[points.length - 8];
    if (!prev) return null;
    return ((last - prev) / prev) * 100;
}

// ── Sparkline SVG inline (stroke #9FE870 + degradado sutil) ─────
function SeedSparkline({ points, height = 48 }: { points: number[]; height?: number }) {
    const gid = useId();
    if (points.length < 2) {
        return <div style={{ height }} className="w-full rounded-xl bg-muted/15" />;
    }
    const W = 100;
    const H = 32;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const coords = points.map((v, i) => {
        const x = (i / (points.length - 1)) * W;
        const y = (H - 4) - ((v - min) / range) * (H - 8) + 2;
        return [x, y] as const;
    });
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const area = `${line} L${W},${H} L0,${H} Z`;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} className="w-full">
            <defs>
                <linearGradient id={`cartera-spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#cartera-spark-${gid})`} />
            <path
                d={line}
                fill="none"
                stroke={ACCENT}
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

// ── Pill de grano (emoji + gramos, color por tipo) ──────────────
function GrainPill({ grain, grams }: { grain: GrainTypeRow; grams: number | null }) {
    const color = grain.color || ACCENT;
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums",
                grams === 0 && "opacity-50"
            )}
            style={{
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
                color,
            }}
            title={grain.name}
        >
            <span aria-hidden>{grain.emoji ?? "🌾"}</span>
            {grams === null
                ? grain.name
                : `${grams.toLocaleString("es-ES", { maximumFractionDigits: 0 })} g`}
        </span>
    );
}

// ── Bloque de mercado (sparkline + último valor + delta 7d) ─────
function MarketBlock({ market }: { market: SeedMarketRow[] }) {
    const points = market.map(r => Number(r.seed_eur)).filter(v => Number.isFinite(v));
    const last = points.length ? points[points.length - 1] : null;
    const delta = delta7d(points);
    const deltaUp = (delta ?? 0) >= 0;
    return (
        <div className="rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
            <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70">
                    Semilla · bolsa 60d
                </span>
                <span className="flex items-baseline gap-1.5">
                    {last !== null && (
                        <span className="text-xs font-black tabular-nums" style={{ color: ACCENT }}>
                            {formatEur(last)}
                        </span>
                    )}
                    {delta !== null && (
                        <span className={cn(
                            "text-[10px] font-black tabular-nums",
                            deltaUp ? "text-emerald-400" : "text-rose-400"
                        )}>
                            {deltaUp ? "+" : ""}{delta.toFixed(1)}% 7d
                        </span>
                    )}
                </span>
            </div>
            <SeedSparkline points={points} />
        </div>
    );
}

// ── Widget principal ────────────────────────────────────────────
export function CarteraStarseedWidget() {
    const supabase = useMemo(() => createClient(), []);

    const [status, setStatus] = useState<FetchStatus>("loading");
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [hasSession, setHasSession] = useState(false);
    const [grains, setGrains] = useState<GrainTypeRow[]>([]);
    const [market, setMarket] = useState<SeedMarketRow[]>([]);
    const [wallet, setWallet] = useState<WalletRow | null>(null);
    const [ledger, setLedger] = useState<LedgerRow[]>([]);

    const load = useCallback(async () => {
        setStatus("loading");
        setErrorMsg(null);
        try {
            // Público (siempre): catálogo de granos + últimas ~60 filas de la bolsa
            const [grainsRes, marketRes, sessionRes] = await Promise.all([
                supabase.from("grain_types").select("id, name, color, emoji, seeds_per_100g").order("name"),
                supabase.from("seed_market").select("day, seed_eur").order("day", { ascending: false }).limit(60),
                supabase.auth.getSession(),
            ]);
            if (grainsRes.error) throw grainsRes.error;
            if (marketRes.error) throw marketRes.error;

            setGrains((grainsRes.data ?? []) as GrainTypeRow[]);
            setMarket(((marketRes.data ?? []) as SeedMarketRow[]).slice().reverse()); // asc para la sparkline

            const user = sessionRes.data.session?.user ?? null;
            setHasSession(!!user);

            if (user) {
                // Privado (RLS auth.uid()): cartera + últimos 6 movimientos
                const [walletRes, ledgerRes] = await Promise.all([
                    supabase.from("wallets").select("semillas, granos").eq("user_id", user.id).maybeSingle(),
                    supabase.from("economy_ledger").select("kind, seeds, granos, name, ts")
                        .eq("user_id", user.id).order("ts", { ascending: false }).limit(6),
                ]);
                if (walletRes.error) throw walletRes.error;
                if (ledgerRes.error) throw ledgerRes.error;
                setWallet((walletRes.data ?? null) as WalletRow | null);
                setLedger((ledgerRes.data ?? []) as LedgerRow[]);
            } else {
                setWallet(null);
                setLedger([]);
            }
            setStatus("ready");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "No se pudo conectar con la cuenta unificada.";
            setErrorMsg(msg);
            setStatus("error");
        }
    }, [supabase]);

    useEffect(() => { void load(); }, [load]);

    const semillas = Number(wallet?.semillas ?? 0) || 0;

    return (
        <WidgetShell
            title="Cartera StarSeed 🌱"
            subtitle="Cuenta soberana unificada"
            icon={Wallet}
            accent={ACCENT}
            actions={
                <button
                    onClick={() => void load()}
                    title="Actualizar cartera"
                    className="p-1.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <RefreshCw className={cn("size-3.5", status === "loading" && "animate-spin")} />
                </button>
            }
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    Bolsa y cartera en modo beta simulada
                </p>
            }
        >
            {(size) => {
                // ── Skeleton de carga ────────────────────────────
                if (status === "loading") {
                    return (
                        <div className="flex flex-col gap-2.5 pt-1 animate-pulse" aria-busy>
                            <div className="h-12 rounded-2xl bg-muted/20" />
                            <div className="flex gap-1.5">
                                <div className="h-5 w-16 rounded-full bg-muted/20" />
                                <div className="h-5 w-14 rounded-full bg-muted/20" />
                                <div className="h-5 w-16 rounded-full bg-muted/20" />
                            </div>
                            <div className="h-16 rounded-2xl bg-muted/15" />
                            <div className="h-4 rounded-lg bg-muted/15" />
                            <div className="h-4 rounded-lg bg-muted/10" />
                        </div>
                    );
                }

                // ── Estado de error ──────────────────────────────
                if (status === "error") {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-4">
                            <AlertTriangle className="size-6 text-amber-400" />
                            <p className="text-xs text-muted-foreground max-w-[220px] line-clamp-3">
                                {errorMsg ?? "Error al cargar la cartera."}
                            </p>
                            <button
                                onClick={() => void load()}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-white/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <RefreshCw className="size-3" /> Reintentar
                            </button>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Sin sesión: mercado público + CTA login ──────
                if (!hasSession) {
                    if (micro) {
                        return (
                            <div className="h-full flex flex-col justify-center gap-2">
                                <MarketBlock market={market} />
                            </div>
                        );
                    }
                    return (
                        <div className="flex flex-col gap-2.5 pt-1">
                            <MarketBlock market={market} />
                            {grains.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {grains.map(g => <GrainPill key={g.id} grain={g} grams={null} />)}
                                </div>
                            )}
                            <Link
                                href="/login"
                                className="mt-1 flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                                style={{
                                    background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`,
                                    borderColor: `color-mix(in srgb, ${ACCENT} 30%, transparent)`,
                                    color: ACCENT,
                                }}
                            >
                                <LogIn className="size-4" /> Iniciar sesión para ver tu cartera
                            </Link>
                            <p className="text-[10px] text-muted-foreground/60 text-center">
                                Una sola cuenta soberana para todo el ecosistema StarSeed.
                            </p>
                        </div>
                    );
                }

                // ── Con sesión: cartera completa ─────────────────
                if (micro) {
                    return (
                        <div className="h-full flex flex-col justify-center">
                            <div className="flex items-baseline gap-1.5">
                                <Sprout className="size-4 text-emerald-400 shrink-0" />
                                <span className="text-2xl font-black tracking-tighter tabular-nums text-emerald-400">
                                    {semillas.toLocaleString("es-ES")}
                                </span>
                                <span className="text-[10px] font-bold uppercase text-muted-foreground/50">Semillas</span>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2.5 pt-1">
                        {/* Semillas — contador grande verde */}
                        <div className="rounded-2xl border border-border/40 bg-white/[0.03] p-3">
                            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground/70">
                                Semillas
                            </span>
                            <div className="mt-1 flex items-baseline gap-2">
                                <span className="text-3xl font-black tracking-tighter tabular-nums text-emerald-400">
                                    {semillas.toLocaleString("es-ES")}
                                </span>
                                <Sprout className="size-4 text-emerald-400/70" />
                            </div>
                        </div>

                        {/* Granos por tipo — pills */}
                        {grains.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {grains.map(g => (
                                    <GrainPill key={g.id} grain={g} grams={gramsFor(wallet?.granos, g)} />
                                ))}
                            </div>
                        )}

                        {/* Bolsa de la semilla — sparkline */}
                        <MarketBlock market={market} />

                        {/* Últimos movimientos */}
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/70 px-0.5">
                                Últimos movimientos
                            </span>
                            {ledger.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground/50 italic px-0.5 py-1.5">
                                    Sin movimientos todavía.
                                </p>
                            ) : (
                                ledger.map((mov, i) => {
                                    const seeds = Number(mov.seeds ?? 0) || 0;
                                    const positive = seeds > 0;
                                    return (
                                        <div
                                            key={`${mov.ts ?? "mov"}-${i}`}
                                            className="flex items-center gap-2 rounded-xl border border-border/30 bg-white/[0.02] px-2.5 py-1.5"
                                        >
                                            <span className="shrink-0 rounded-md bg-muted/25 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-muted-foreground/70">
                                                {mov.kind ?? "mov"}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">
                                                {mov.name ?? "Movimiento"}
                                            </span>
                                            {mov.ts && (
                                                <span className="shrink-0 text-[9px] text-muted-foreground/40 tabular-nums">
                                                    {timeAgo(new Date(mov.ts).getTime())}
                                                </span>
                                            )}
                                            <span className={cn(
                                                "shrink-0 text-[11px] font-black tabular-nums",
                                                seeds === 0
                                                    ? "text-muted-foreground/50"
                                                    : positive ? "text-emerald-400" : "text-rose-400"
                                            )}>
                                                {seeds === 0 ? "·" : `${positive ? "+" : ""}${seeds.toLocaleString("es-ES")}`}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
