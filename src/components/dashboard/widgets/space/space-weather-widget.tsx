'use client';

// ════════════════════════════════════════════════════════════════
// SpaceWeatherWidget — CLIMA ESPACIAL en tiempo real (NOAA SWPC)
// ----------------------------------------------------------------
// Widget RICO que reacciona a los datos: el acento, los halos y los
// gauges cambian de verde → ámbar → rojo según la severidad real
// (escalas R/S/G de NOAA, Kp, clase de llamarada, Bz). Destaca un
// banner de "TORMENTA GEOMAGNÉTICA" cuando G ≥ 1.
//
// Paneles (selector segmentado / ciclo en tamaños pequeños):
//   • Resumen   → gauge Kp + tarjetas de las escalas clave.
//   • Viento    → velocidad/densidad/temperatura/Bz/Bt + sparkline.
//   • Radiación → llamarada (rayos X), escala R, protones (S), F10.7, manchas.
//   • Aurora    → potencia hemisférica + nota de visibilidad.
//
// Adaptabilidad (render-prop `size` de WidgetShell):
//   • micro/compact → vista compacta: gauge + 2 indicadores, sin selector
//                     segmentado (chip que cicla).
//   • regular       → selector completo + panel íntegro.
//   • expanded      → añade más métricas y sparklines.
//
// Datos REALES vía fetchSpaceWeather() (sin mocks). Estados claros de
// loading / error / reintento. Atribución "NOAA SWPC" SIEMPRE visible.
// Accesible: aria-live en estados, aria-pressed en chips, tabular-nums.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
    Sun, Satellite, Zap, Wind, Radio, Magnet, Activity, Sparkles,
    AlertTriangle, RotateCw, ZapOff, ChevronRight, ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WidgetShell, Sparkline, timeAgo } from "../../kit";
import type { ElementSize } from "../../kit";
import {
    fetchSpaceWeather,
    snapshotSeverity,
    isGeomagneticStorm,
    severityColor,
    SPACE_WEATHER_ATTRIBUTION,
    type SpaceWeatherSnapshot,
    type SpaceMetric,
    type Severity,
} from "../../apps/data-sources/space-weather-sources";

const REFRESH_MS = 300_000; // 5 min (cadencia típica de SWPC)

// Acento base del widget (ámbar solar) — se mezcla con la severidad real.
const BASE_ACCENT = "#F5A623";
const VIOLET = "#8b5cf6";

type PanelId = "resumen" | "viento" | "radiacion" | "aurora";

interface PanelDef { id: PanelId; label: string; icon: LucideIcon; }
const PANELS: PanelDef[] = [
    { id: "resumen", label: "Resumen", icon: Activity },
    { id: "viento", label: "Viento", icon: Wind },
    { id: "radiacion", label: "Radiación", icon: Zap },
    { id: "aurora", label: "Aurora", icon: Sparkles },
];

const FOCUS_RING =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-background";

// ── Hook de datos autónomo (loading/error/retry/auto) ────────────
function useSpaceWeather() {
    const [data, setData] = useState<SpaceWeatherSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [auto, setAuto] = useState(true);
    const alive = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const snap = await fetchSpaceWeather();
            if (!alive.current) return;
            setData(snap);
        } catch {
            if (!alive.current) return;
            setError("Fuente no disponible");
        } finally {
            if (alive.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        alive.current = true;
        void load();
        return () => { alive.current = false; };
    }, [load]);

    useEffect(() => {
        if (!auto) return;
        const id = setInterval(() => void load(), REFRESH_MS);
        return () => clearInterval(id);
    }, [auto, load]);

    return { data, loading, error, auto, setAuto, refresh: load };
}

// ── Sub-componentes de presentación ──────────────────────────────

/** Tarjeta de una métrica con halo teñido por severidad. */
function MetricCard({ m, compact }: { m: SpaceMetric; compact?: boolean }) {
    const color = severityColor(m.severity ?? "calm");
    return (
        <div
            className="relative rounded-2xl border bg-white/[0.03] px-3 py-2.5 overflow-hidden transition-colors"
            style={{
                borderColor: `color-mix(in srgb, ${color} 28%, hsl(var(--border)))`,
                boxShadow: `0 0 16px -10px ${color}`,
            }}
        >
            <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{ background: `radial-gradient(ellipse at 50% 130%, ${color}1f 0%, transparent 70%)` }}
            />
            <div className="relative">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60 truncate">
                    {m.label}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                    <span className={`font-black tabular-nums tracking-tighter ${compact ? "text-lg" : "text-xl @sm:text-2xl"}`} style={{ color }}>
                        {m.value}
                    </span>
                    {m.unit && <span className="text-[9px] font-bold uppercase text-muted-foreground/45">{m.unit}</span>}
                </div>
                {(m.level || m.detail) && (
                    <div className="mt-1 flex flex-col gap-0.5">
                        {m.level && (
                            <span
                                className="inline-flex w-fit items-center rounded-full border px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider"
                                style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
                            >
                                {m.level}
                            </span>
                        )}
                        {m.detail && !compact && (
                            <span className="text-[9px] text-muted-foreground/50 truncate">{m.detail}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Gauge semicircular del índice Kp (0–9) teñido por severidad. */
function KpGauge({ kp, gLabel, color, size = 150 }: { kp: number; gLabel: string; color: string; size?: number }) {
    const clamped = Math.max(0, Math.min(9, kp));
    const r = size * 0.4;
    const cx = size / 2;
    const cy = size / 2;
    const stroke = Math.max(8, size * 0.06);
    const c = 2 * Math.PI * r;
    // Usamos 75% del círculo como arco (de -135° a +135°).
    const arc = 0.75;
    const dash = c * arc;
    const offset = dash * (1 - clamped / 9);

    return (
        <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="overflow-visible" style={{ transform: "rotate(135deg)" }}>
                <circle
                    cx={cx} cy={cy} r={r} fill="none"
                    stroke="hsl(var(--border))" strokeOpacity={0.22}
                    strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={`${dash} ${c}`}
                />
                <motion.circle
                    cx={cx} cy={cy} r={r} fill="none"
                    stroke={color} strokeWidth={stroke} strokeLinecap="round"
                    strokeDasharray={`${dash} ${c}`}
                    initial={{ strokeDashoffset: dash }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center leading-none">
                <div>
                    <div className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground/50 mb-1">Kp</div>
                    <motion.div
                        key={clamped}
                        initial={{ scale: 0.92, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="font-black tabular-nums tracking-tighter"
                        style={{ color, fontSize: size * 0.3 }}
                    >
                        {clamped.toFixed(1)}
                    </motion.div>
                    <div className="mt-1 text-[9px] font-black uppercase tracking-wider" style={{ color }}>
                        {gLabel}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Banner destacado de tormenta (solo cuando G ≥ 1). */
function StormBanner({ snap }: { snap: SpaceWeatherSnapshot }) {
    const color = severityColor(snap.geomagnetic.gScale.severity ?? "moderate");
    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="shrink-0 flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
            style={{
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                background: `color-mix(in srgb, ${color} 14%, transparent)`,
            }}
            role="alert"
        >
            <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity }}
            >
                <ShieldAlert className="size-4 shrink-0" style={{ color }} />
            </motion.span>
            <span className="text-[10px] @sm:text-[11px] font-black uppercase tracking-wider truncate" style={{ color }}>
                Tormenta geomagnética · {snap.geomagnetic.gScale.level}
            </span>
        </motion.div>
    );
}

// ── Paneles ──────────────────────────────────────────────────────

function ResumenPanel({ snap, size, gColor }: { snap: SpaceWeatherSnapshot; size: ElementSize; gColor: string }) {
    const compact = size.tier === "compact" || size.tier === "micro";
    const expanded = size.tier === "expanded";
    const gaugeSize = expanded ? 168 : compact ? 124 : 148;

    const cards: SpaceMetric[] = [
        snap.radiation.flare,
        snap.radiation.rScale,
        snap.radiation.sScale,
        snap.solarWind.bz,
        snap.solarWind.speed,
        snap.aurora,
    ];
    const shown = compact ? 2 : expanded ? 6 : 4;

    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center justify-center gap-4 pt-1">
                <KpGauge
                    kp={snap.geomagnetic.kp.raw ?? 0}
                    gLabel={snap.geomagnetic.gScale.value}
                    color={gColor}
                    size={gaugeSize}
                />
                {!compact && snap.geomagnetic.kpSeries.length >= 2 && (
                    <div className="flex-1 min-w-0 max-w-[55%]">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">Kp · histórico</div>
                        <Sparkline
                            data={snap.geomagnetic.kpSeries.map((v, i) => ({ t: i, v }))}
                            color={gColor}
                            height={expanded ? 70 : 52}
                        />
                    </div>
                )}
            </div>
            <div className={`grid gap-2 ${compact ? "grid-cols-2" : expanded ? "grid-cols-3" : "grid-cols-2"}`}>
                {cards.slice(0, shown).map((m) => (
                    <MetricCard key={m.label} m={m} compact={compact} />
                ))}
            </div>
        </div>
    );
}

function VientoPanel({ snap, size }: { snap: SpaceWeatherSnapshot; size: ElementSize }) {
    const compact = size.tier === "compact" || size.tier === "micro";
    const expanded = size.tier === "expanded";
    const speedColor = severityColor(snap.solarWind.speed.severity ?? "calm");
    const bzColor = severityColor(snap.solarWind.bz.severity ?? "calm");

    const cards: SpaceMetric[] = [
        snap.solarWind.speed,
        snap.solarWind.density,
        snap.solarWind.bz,
        snap.solarWind.bt,
        snap.solarWind.temperature,
    ];
    const shown = compact ? 2 : expanded ? 5 : 4;

    return (
        <div className="flex flex-col gap-2.5 h-full">
            <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2"}`}>
                {cards.slice(0, shown).map((m) => (
                    <MetricCard key={m.label} m={m} compact={compact} />
                ))}
            </div>
            {!compact && snap.solarWind.speedSeries.length >= 2 && (
                <div className="flex-1 min-h-0 grid gap-2" style={{ gridTemplateRows: expanded && snap.solarWind.bzSeries.length >= 2 ? "1fr 1fr" : "1fr" }}>
                    <SeriesPanel title="Velocidad (km/s)" icon={Wind} color={speedColor} data={snap.solarWind.speedSeries} expanded={expanded} />
                    {expanded && snap.solarWind.bzSeries.length >= 2 && (
                        <SeriesPanel title="Bz IMF (nT)" icon={Magnet} color={bzColor} data={snap.solarWind.bzSeries} expanded={expanded} />
                    )}
                </div>
            )}
        </div>
    );
}

function RadiacionPanel({ snap, size }: { snap: SpaceWeatherSnapshot; size: ElementSize }) {
    const compact = size.tier === "compact" || size.tier === "micro";
    const expanded = size.tier === "expanded";
    const flareColor = severityColor(snap.radiation.flare.severity ?? "calm");

    const cards: SpaceMetric[] = [
        snap.radiation.flare,
        snap.radiation.rScale,
        snap.radiation.protonFlux,
        snap.radiation.sScale,
        snap.indices.f107,
        snap.indices.sunspots,
    ];
    const shown = compact ? 2 : expanded ? 6 : 4;

    return (
        <div className="flex flex-col gap-2.5 h-full">
            <div className={`grid gap-2 ${compact ? "grid-cols-2" : expanded ? "grid-cols-3" : "grid-cols-2"}`}>
                {cards.slice(0, shown).map((m) => (
                    <MetricCard key={m.label} m={m} compact={compact} />
                ))}
            </div>
            {!compact && snap.radiation.xraySeries.length >= 2 && (
                <div className="flex-1 min-h-0">
                    <SeriesPanel title="Rayos X · log₁₀ flujo" icon={Radio} color={flareColor} data={snap.radiation.xraySeries} expanded={expanded} />
                </div>
            )}
        </div>
    );
}

function AuroraPanel({ snap, size }: { snap: SpaceWeatherSnapshot; size: ElementSize }) {
    const a = snap.aurora;
    const color = severityColor(a.severity ?? "calm");
    const compact = size.tier === "compact" || size.tier === "micro";
    const gw = a.raw ?? 0;
    const pct = Math.max(0, Math.min(1, gw / 150)); // 150 GW ≈ tope visual

    return (
        <div className="flex flex-col items-center justify-center gap-3 h-full text-center">
            <motion.div
                className="relative grid place-items-center rounded-full"
                style={{ width: compact ? 92 : 124, height: compact ? 92 : 124 }}
                animate={{ boxShadow: [`0 0 18px -6px ${color}`, `0 0 34px -4px ${color}`, `0 0 18px -6px ${color}`] }}
                transition={{ duration: 3.2, repeat: Infinity }}
            >
                <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90 w-full h-full">
                    <circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--border))" strokeOpacity={0.2} strokeWidth="7" />
                    <motion.circle
                        cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 44}
                        initial={{ strokeDashoffset: 2 * Math.PI * 44 }}
                        animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - pct) }}
                        transition={{ duration: 1.1, ease: "easeOut" }}
                        style={{ filter: `drop-shadow(0 0 5px ${color})` }}
                    />
                </svg>
                <Sparkles className="absolute size-5 opacity-60" style={{ color }} />
                <div className="relative mt-7 text-center leading-none">
                    <div className="font-black tabular-nums" style={{ color, fontSize: compact ? 22 : 28 }}>{a.value}</div>
                    <div className="text-[9px] font-bold uppercase text-muted-foreground/45">{a.unit}</div>
                </div>
            </motion.div>
            {a.level && (
                <span
                    className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
                    style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
                >
                    {a.level}
                </span>
            )}
            {a.detail && <div className="text-[10px] text-muted-foreground/55 tabular-nums">{a.detail}</div>}
            <div className="text-[9px] text-muted-foreground/40 max-w-[16rem]">Potencia hemisférica del modelo OVATION (NOAA).</div>
        </div>
    );
}

/** Tarjeta con título + sparkline (reutilizada en viento/radiación). */
function SeriesPanel({ title, icon: Icon, color, data, expanded }: { title: string; icon: LucideIcon; color: string; data: number[]; expanded: boolean }) {
    return (
        <div
            className="rounded-xl border bg-white/[0.02] p-2.5 flex flex-col min-h-0"
            style={{ borderColor: `color-mix(in srgb, ${color} 22%, hsl(var(--border)))`, boxShadow: `0 0 14px -10px ${color}` }}
        >
            <div className="flex items-center gap-1.5 mb-1.5 shrink-0">
                <Icon className="size-3 shrink-0" style={{ color }} />
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60 truncate">{title}</span>
            </div>
            <div className="flex-1 min-h-0 grid place-items-stretch">
                <Sparkline data={data.map((v, i) => ({ t: i, v }))} color={color} height={expanded ? 64 : 48} />
            </div>
        </div>
    );
}

// ── Estados loading / error ──────────────────────────────────────
function LoadingState() {
    return (
        <div className="h-full min-h-[8rem] flex flex-col gap-2.5 pt-1" aria-hidden>
            <div className="h-28 rounded-2xl bg-muted/15 animate-pulse" />
            <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-2xl bg-muted/15 animate-pulse" />
                ))}
            </div>
        </div>
    );
}

function ErrorState({ onRetry, loading }: { onRetry: () => void; loading: boolean }) {
    return (
        <div className="h-full min-h-[8rem] grid place-items-center text-center px-3">
            <div>
                <AlertTriangle className="mx-auto size-7 text-amber-400/80" />
                <p className="mt-2 text-sm font-bold">Fuente no disponible</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/60">No se pudo conectar con NOAA SWPC.</p>
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={loading}
                    aria-label="Reintentar conexión con NOAA SWPC"
                    className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default ${FOCUS_RING}`}
                    style={{ color: BASE_ACCENT, borderColor: `color-mix(in srgb, ${BASE_ACCENT} 40%, transparent)`, background: `color-mix(in srgb, ${BASE_ACCENT} 12%, transparent)` }}
                >
                    <RotateCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Reintentar
                </button>
            </div>
        </div>
    );
}

// ── Widget principal ─────────────────────────────────────────────
export function SpaceWeatherWidget() {
    const { data, loading, error, auto, setAuto, refresh } = useSpaceWeather();
    const [panel, setPanel] = useState<PanelId>("resumen");
    const [updatedTs, setUpdatedTs] = useState<number | null>(null);
    useEffect(() => { if (data) setUpdatedTs(data.fetchedAt); }, [data]);

    // Severidad global → tiñe el acento del shell y el icono cabecera.
    const sev: Severity = data ? snapshotSeverity(data) : "calm";
    const accent = data ? severityColor(sev) : BASE_ACCENT;
    const storm = data ? isGeomagneticStorm(data) : false;
    const HeaderIcon: LucideIcon = storm ? ShieldAlert : sev === "calm" ? Sun : Satellite;
    const gColor = data ? severityColor(data.geomagnetic.gScale.severity ?? "calm") : BASE_ACCENT;

    const cyclePanel = () => {
        const idx = PANELS.findIndex((p) => p.id === panel);
        const next = PANELS[(idx + 1) % PANELS.length];
        setPanel(next.id);
    };

    return (
        <WidgetShell
            title="Clima Espacial"
            subtitle="Telemetría solar · NOAA SWPC"
            icon={HeaderIcon}
            accent={accent}
            live={auto}
            connections={[
                { label: "Astronomía", href: "/network/education", color: VIOLET },
                { label: "Datos", href: "/explorer", color: accent },
            ]}
            actions={
                <button
                    type="button"
                    onClick={() => setAuto(!auto)}
                    title={auto ? "Auto-refresco activo · clic para pausar" : "Auto-refresco en pausa · clic para activar"}
                    aria-label={auto ? "Pausar auto-refresco" : "Activar auto-refresco"}
                    aria-pressed={auto}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${FOCUS_RING}`}
                    style={{
                        color: auto ? accent : "hsl(var(--muted-foreground))",
                        borderColor: auto ? `color-mix(in srgb, ${accent} 40%, transparent)` : "hsl(var(--border))",
                        background: auto ? `color-mix(in srgb, ${accent} 12%, transparent)` : "transparent",
                    }}
                >
                    {auto ? <Zap className="size-3" /> : <ZapOff className="size-3" />}
                    {auto ? "Auto" : "Manual"}
                </button>
            }
            footer={
                <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/70 min-w-0">
                    <span className="truncate">
                        Fuente: <span className="font-bold text-foreground/80">{SPACE_WEATHER_ATTRIBUTION}</span>
                        {updatedTs !== null && (
                            <span className="text-muted-foreground/50"> · hace <span className="tabular-nums">{timeAgo(updatedTs)}</span></span>
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        title="Refrescar ahora"
                        aria-label="Refrescar ahora"
                        className={`shrink-0 inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${FOCUS_RING}`}
                    >
                        <RotateCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                        Refrescar
                    </button>
                </div>
            }
        >
            {(size) => {
                if (error && !data) return <ErrorState onRetry={refresh} loading={loading} />;
                if (!data) return <LoadingState />;

                const micro = size.tier === "micro" || size.vTier === "micro";

                // Vista MICRO: solo el dato dominante (Kp + escala G).
                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <KpGauge
                                kp={data.geomagnetic.kp.raw ?? 0}
                                gLabel={data.geomagnetic.gScale.value}
                                color={gColor}
                                size={Math.min(size.width, size.height) - 24}
                            />
                            <span role="status" aria-live="polite" className="sr-only">
                                Kp {data.geomagnetic.kp.value}, {data.geomagnetic.gScale.value}.
                            </span>
                        </div>
                    );
                }

                const compact = size.tier === "compact";

                return (
                    <div className="flex flex-col gap-2.5 pt-1 h-full">
                        {storm && <StormBanner snap={data} />}

                        {/* Selector de panel: segmentado en regular/expanded, ciclo en compact. */}
                        {compact ? (
                            <button
                                type="button"
                                onClick={cyclePanel}
                                title="Cambiar panel"
                                aria-label={`Panel actual: ${PANELS.find((p) => p.id === panel)?.label}. Clic para cambiar.`}
                                className={`shrink-0 inline-flex items-center justify-between gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer hover:-translate-y-px ${FOCUS_RING}`}
                                style={{ color: "#1a1206", background: accent, borderColor: accent }}
                            >
                                <span className="truncate">{PANELS.find((p) => p.id === panel)?.label}</span>
                                <ChevronRight className="size-3 shrink-0 opacity-80" />
                            </button>
                        ) : (
                            <div className="shrink-0 flex flex-wrap gap-1.5" role="tablist" aria-label="Paneles de clima espacial">
                                {PANELS.map((p) => {
                                    const activeChip = p.id === panel;
                                    const Ic = p.icon;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={activeChip}
                                            onClick={() => setPanel(p.id)}
                                            title={p.label}
                                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer hover:-translate-y-px ${FOCUS_RING}`}
                                            style={
                                                activeChip
                                                    ? { color: "#1a1206", background: accent, borderColor: accent }
                                                    : { color: "hsl(var(--muted-foreground))", borderColor: "hsl(var(--border))", background: "transparent" }
                                            }
                                        >
                                            <Ic className="size-3" />
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Panel activo */}
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            {panel === "resumen" && <ResumenPanel snap={data} size={size} gColor={gColor} />}
                            {panel === "viento" && <VientoPanel snap={data} size={size} />}
                            {panel === "radiacion" && <RadiacionPanel snap={data} size={size} />}
                            {panel === "aurora" && <AuroraPanel snap={data} size={size} />}
                        </div>

                        <span role="status" aria-live="polite" className="sr-only">
                            {loading
                                ? "Actualizando clima espacial…"
                                : `Clima espacial cargado. Kp ${data.geomagnetic.kp.value}, ${data.geomagnetic.gScale.value}. Llamarada ${data.radiation.flare.value}.`}
                        </span>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
