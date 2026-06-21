'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Paneles de CLIMA ESPACIAL (Espacial / Solar)
// ----------------------------------------------------------------
// Presentación pura del snapshot REAL de NOAA SWPC (`SpaceWeatherSnapshot`).
// Estética cristal StarSeed coherente; números en tabular-nums; severidad
// → color por los helpers oficiales del módulo de fuentes. Loading / error /
// atribución NOAA siempre visibles. Micro-interacciones respetan
// `prefers-reduced-motion` y el flag global de animaciones.
// ════════════════════════════════════════════════════════════════

import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Activity,
    AlertTriangle,
    Gauge,
    Magnet,
    Radio,
    RefreshCw,
    Rocket,
    Satellite,
    ShieldCheck,
    Sparkles,
    Sun,
    Waves,
    Wind,
    Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    SPACE_WEATHER_ATTRIBUTION,
    severityColor,
    type SpaceMetric,
    type SpaceWeatherSnapshot,
    type Severity,
} from '@/components/dashboard/apps/data-sources/space-weather-sources';

// ── Acentos por pestaña (coherentes con la Trinity de StarSeed) ──
const ACCENT = {
    espacial: '#007FFF', // Electric Azure (Zenith)
    solar: '#FFBF00', // Solar Amber (Logic)
} as const;

type Accent = (typeof ACCENT)[keyof typeof ACCENT];

// ── Glass card base — superficie cristal StarSeed ────────────────
function GlassPanel({
    accent,
    className,
    children,
}: {
    accent: Accent;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                'relative rounded-3xl border bg-[#001428]/45 backdrop-blur-2xl',
                'shadow-[0_8px_32px_rgba(0,0,0,0.45)] overflow-hidden',
                className,
            )}
            style={{ borderColor: `${accent}22` }}
        >
            {/* Halo de acento sutil en la esquina superior */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                    background: `radial-gradient(120% 90% at 0% 0%, ${accent}14, transparent 55%)`,
                }}
            />
            <div className="relative z-10 h-full">{children}</div>
        </div>
    );
}

// ── Encabezado de panel ──────────────────────────────────────────
function PanelHeader({
    icon: Icon,
    title,
    subtitle,
    accent,
}: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    accent: Accent;
}) {
    return (
        <div className="flex items-center gap-3 mb-4">
            <div
                className="flex size-9 items-center justify-center rounded-xl border bg-white/[0.04]"
                style={{ borderColor: `${accent}33`, color: accent }}
            >
                <Icon className="size-4" />
            </div>
            <div className="min-w-0">
                <h3 className="truncate text-sm font-bold tracking-tight text-white">{title}</h3>
                <p
                    className="truncate text-[0.6rem] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: accent }}
                >
                    {subtitle}
                </p>
            </div>
        </div>
    );
}

// ── Métrica grande (valor + unidad + nivel) ──────────────────────
function MetricStat({
    metric,
    size = 'md',
    align = 'left',
}: {
    metric: SpaceMetric;
    size?: 'sm' | 'md' | 'lg';
    align?: 'left' | 'right';
}) {
    const color = severityColor(metric.severity ?? 'calm');
    const valueSize =
        size === 'lg' ? 'text-4xl sm:text-5xl' : size === 'md' ? 'text-2xl sm:text-3xl' : 'text-xl';
    return (
        <div className={cn('flex flex-col', align === 'right' && 'items-end text-right')}>
            <span className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-white/45">
                {metric.label}
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
                <span
                    className={cn('font-light leading-none tracking-tight tabular-nums', valueSize)}
                    style={{ color }}
                >
                    {metric.value}
                </span>
                {metric.unit ? (
                    <span className="text-[0.65rem] font-medium text-white/40">{metric.unit}</span>
                ) : null}
            </div>
            {metric.level ? (
                <span
                    className="mt-1 inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[0.6rem] font-bold tracking-wide"
                    style={{ backgroundColor: `${color}1f`, color }}
                >
                    {metric.level}
                </span>
            ) : null}
            {metric.detail ? (
                <span className="mt-1 text-[0.6rem] text-white/40 tabular-nums">{metric.detail}</span>
            ) : null}
        </div>
    );
}

// ── Celda compacta de métrica (rejilla de telemetría) ────────────
function MetricCell({ metric, icon: Icon }: { metric: SpaceMetric; icon?: React.ElementType }) {
    const color = severityColor(metric.severity ?? 'calm');
    return (
        <div className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]">
            <div className="flex items-center gap-1.5">
                {Icon ? <Icon className="size-3 opacity-50" style={{ color }} /> : null}
                <span className="truncate text-[0.55rem] font-bold uppercase tracking-[0.14em] text-white/40">
                    {metric.label}
                </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1">
                <span className="text-lg font-light tabular-nums text-white">{metric.value}</span>
                {metric.unit ? (
                    <span className="text-[0.55rem] font-medium text-white/30">{metric.unit}</span>
                ) : null}
            </div>
            {metric.level ? (
                <span className="mt-0.5 truncate text-[0.55rem] font-semibold" style={{ color }}>
                    {metric.level}
                </span>
            ) : null}
        </div>
    );
}

// ── Sparkline SVG (serie temporal) ───────────────────────────────
function Sparkline({
    series,
    color,
    height = 48,
    reducedMotion,
}: {
    series: number[];
    color: string;
    height?: number;
    reducedMotion: boolean;
}) {
    const gradId = useMemo(() => `spark-${Math.random().toString(36).slice(2, 9)}`, []);

    const path = useMemo(() => {
        if (series.length < 2) return null;
        const min = Math.min(...series);
        const max = Math.max(...series);
        const span = max - min || 1;
        const w = 100;
        const pts = series.map((v, i) => {
            const x = (i / (series.length - 1)) * w;
            const y = height - ((v - min) / span) * height;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });
        return {
            line: `M ${pts.join(' L ')}`,
            area: `M 0,${height} L ${pts.join(' L ')} L ${w},${height} Z`,
        };
    }, [series, height]);

    if (!path) {
        return <div className="h-12 w-full rounded-lg bg-white/[0.02]" aria-hidden />;
    }

    return (
        <svg
            viewBox={`0 0 100 ${height}`}
            preserveAspectRatio="none"
            className="h-12 w-full"
            role="img"
            aria-label="Serie temporal"
        >
            <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={path.area} fill={`url(#${gradId})`} />
            <motion.path
                d={path.line}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.9, ease: 'easeOut' }}
            />
        </svg>
    );
}

// ── Estados de carga / error reutilizables ───────────────────────
export function SpacePanelSkeleton({ accent }: { accent: Accent }) {
    return (
        <GlassPanel accent={accent} className="min-h-[260px] p-5">
            <div className="flex h-full flex-col gap-4">
                <div className="h-4 w-1/3 animate-pulse rounded-full bg-white/10" />
                <div className="h-16 w-2/3 animate-pulse rounded-2xl bg-white/[0.06]" />
                <div className="mt-auto grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />
                    ))}
                </div>
            </div>
        </GlassPanel>
    );
}

export function SpaceErrorPanel({
    accent,
    error,
    onRetry,
}: {
    accent: Accent;
    error: string;
    onRetry: () => void;
}) {
    return (
        <GlassPanel accent={accent} className="min-h-[260px] p-6">
            <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-3 flex size-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
                    <AlertTriangle className="size-5" />
                </div>
                <p className="text-sm font-semibold text-white">Fuente no disponible</p>
                <p className="mt-1 max-w-xs text-xs text-white/50">{error}</p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white/80 transition-colors hover:bg-white/10 cursor-pointer"
                >
                    <RefreshCw className="size-3.5" />
                    Reintentar
                </button>
                <p className="mt-3 text-[0.55rem] font-semibold uppercase tracking-[0.2em] text-white/30">
                    Fuente · {SPACE_WEATHER_ATTRIBUTION}
                </p>
            </div>
        </GlassPanel>
    );
}

// ── Pie con atribución NOAA + estado de actualización ────────────
export function NoaaAttribution({
    accent,
    lastUpdated,
    refreshing,
    timeTag,
}: {
    accent: Accent;
    lastUpdated: number | null;
    refreshing: boolean;
    timeTag?: string;
}) {
    const stamp = lastUpdated
        ? new Date(lastUpdated).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
          })
        : '—';
    return (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 px-1 text-[0.6rem] text-white/40">
            <span className="inline-flex items-center gap-1.5">
                <Satellite className="size-3" style={{ color: accent }} />
                Datos en vivo ·{' '}
                <span className="font-bold tracking-wide text-white/60">
                    {SPACE_WEATHER_ATTRIBUTION}
                </span>
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
                {refreshing ? <RefreshCw className="size-3 animate-spin" /> : null}
                {timeTag ? <span className="text-white/30">{timeTag}</span> : null}
                <span>Act. {stamp}</span>
            </span>
        </div>
    );
}

// ── Escalas NOAA R / S / G (fila de chips) ───────────────────────
function ScaleChips({ snapshot }: { snapshot: SpaceWeatherSnapshot }) {
    const items: Array<{ icon: React.ElementType; metric: SpaceMetric }> = [
        { icon: Radio, metric: snapshot.radiation.rScale },
        { icon: Zap, metric: snapshot.radiation.sScale },
        { icon: Magnet, metric: snapshot.geomagnetic.gScale },
    ];
    return (
        <div className="grid grid-cols-3 gap-2">
            {items.map(({ icon: Icon, metric }, i) => {
                const color = severityColor(metric.severity ?? 'calm');
                return (
                    <div
                        key={i}
                        className="flex flex-col items-center justify-center rounded-2xl border p-3 text-center"
                        style={{ borderColor: `${color}33`, backgroundColor: `${color}12` }}
                    >
                        <Icon className="mb-1.5 size-4" style={{ color }} />
                        <span className="text-base font-bold tabular-nums" style={{ color }}>
                            {metric.value}
                        </span>
                        <span className="mt-0.5 truncate text-[0.5rem] font-semibold uppercase tracking-wide text-white/45">
                            {metric.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ── Anillo de gauge (Kp 0-9) ─────────────────────────────────────
function KpGauge({
    metric,
    reducedMotion,
}: {
    metric: SpaceMetric;
    reducedMotion: boolean;
}) {
    const kp = metric.raw ?? 0;
    const color = severityColor(metric.severity ?? 'calm');
    const pct = Math.max(0, Math.min(1, kp / 9));
    const r = 52;
    const circ = 2 * Math.PI * r;
    // Arco de 270° (deja un hueco abajo).
    const arc = 0.75;
    const dash = circ * arc;
    return (
        <div className="relative flex items-center justify-center">
            <svg viewBox="0 0 140 140" className="size-40 -rotate-[135deg]">
                <circle
                    cx="70"
                    cy="70"
                    r={r}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circ}`}
                />
                <motion.circle
                    cx="70"
                    cy="70"
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${dash} ${circ}`}
                    initial={reducedMotion ? false : { strokeDashoffset: dash }}
                    animate={{ strokeDashoffset: dash * (1 - pct) }}
                    transition={{ duration: reducedMotion ? 0 : 1.1, ease: 'easeOut' }}
                    style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-light tabular-nums text-white">{metric.value}</span>
                <span className="text-[0.55rem] font-bold uppercase tracking-[0.2em] text-white/40">
                    Kp
                </span>
            </div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// PANEL ESPACIAL — Magnetosfera / Geomagnético / Aurora
// ════════════════════════════════════════════════════════════════
export function SpaceTabPanel({
    snapshot,
    reducedMotion,
}: {
    snapshot: SpaceWeatherSnapshot;
    reducedMotion: boolean;
}) {
    const accent = ACCENT.espacial;
    const { geomagnetic, solarWind, aurora } = snapshot;

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Geomagnético (Kp) — protagonista */}
            <GlassPanel accent={accent} className="p-5 lg:col-span-5">
                <PanelHeader
                    icon={Magnet}
                    title="Índice K Planetario"
                    subtitle="Magnetosfera · Geomagnético"
                    accent={accent}
                />
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                    <KpGauge metric={geomagnetic.kp} reducedMotion={reducedMotion} />
                    <div className="flex flex-col gap-3">
                        <MetricStat metric={geomagnetic.gScale} size="sm" />
                        <MetricStat metric={aurora} size="sm" />
                    </div>
                </div>
                {geomagnetic.kpSeries.length > 1 ? (
                    <div className="mt-4">
                        <span className="text-[0.55rem] font-bold uppercase tracking-[0.16em] text-white/40">
                            Kp · histórico reciente
                        </span>
                        <Sparkline
                            series={geomagnetic.kpSeries}
                            color={severityColor(geomagnetic.kp.severity ?? 'calm')}
                            reducedMotion={reducedMotion}
                        />
                    </div>
                ) : null}
            </GlassPanel>

            {/* Campo magnético interplanetario + viento (acoplamiento) */}
            <GlassPanel accent={accent} className="p-5 lg:col-span-4">
                <PanelHeader
                    icon={Wind}
                    title="Campo y Plasma"
                    subtitle="Viento solar en L1"
                    accent={accent}
                />
                <div className="grid grid-cols-2 gap-2">
                    <MetricCell metric={solarWind.speed} icon={Wind} />
                    <MetricCell metric={solarWind.density} icon={Gauge} />
                    <MetricCell metric={solarWind.bz} icon={Activity} />
                    <MetricCell metric={solarWind.bt} icon={Magnet} />
                </div>
                {solarWind.bzSeries.length > 1 ? (
                    <div className="mt-3">
                        <span className="text-[0.55rem] font-bold uppercase tracking-[0.16em] text-white/40">
                            Bz (IMF) · nT
                        </span>
                        <Sparkline
                            series={solarWind.bzSeries}
                            color={severityColor(solarWind.bz.severity ?? 'calm')}
                            reducedMotion={reducedMotion}
                        />
                    </div>
                ) : null}
            </GlassPanel>

            {/* Escalas NOAA + estado del escudo */}
            <GlassPanel accent={accent} className="p-5 lg:col-span-3">
                <PanelHeader
                    icon={ShieldCheck}
                    title="Escalas NOAA"
                    subtitle="R · S · G (24h)"
                    accent={accent}
                />
                <ScaleChips snapshot={snapshot} />
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                    <Waves className="size-4 shrink-0 text-[#007FFF]" />
                    <div className="min-w-0">
                        <p className="text-[0.55rem] font-bold uppercase tracking-wide text-white/40">
                            Aurora · potencia hemisférica
                        </p>
                        <p className="truncate text-xs font-semibold text-white tabular-nums">
                            {aurora.value} {aurora.unit ?? ''}
                            {aurora.level ? (
                                <span className="ml-1 font-normal text-white/45">· {aurora.level}</span>
                            ) : null}
                        </p>
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// PANEL SOLAR — Sol / Rayos X / Protones / Índices + imágenes SDO
// ════════════════════════════════════════════════════════════════
export function SolarTabPanel({
    snapshot,
    reducedMotion,
}: {
    snapshot: SpaceWeatherSnapshot;
    reducedMotion: boolean;
}) {
    const accent = ACCENT.solar;
    const { radiation, indices } = snapshot;

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Rayos X / Llamarada — protagonista */}
            <GlassPanel accent={accent} className="p-5 lg:col-span-5">
                <PanelHeader
                    icon={Sun}
                    title="Llamarada Solar"
                    subtitle="Rayos X GOES · Clasificación"
                    accent={accent}
                />
                <div className="flex items-center justify-between gap-4">
                    <MetricStat metric={radiation.flare} size="lg" />
                    <MetricStat metric={radiation.rScale} size="sm" align="right" />
                </div>
                {radiation.xraySeries.length > 1 ? (
                    <div className="mt-4">
                        <span className="text-[0.55rem] font-bold uppercase tracking-[0.16em] text-white/40">
                            Flujo rayos X · log₁₀(W/m²) · 6h
                        </span>
                        <Sparkline
                            series={radiation.xraySeries}
                            color={severityColor(radiation.flare.severity ?? 'calm')}
                            height={56}
                            reducedMotion={reducedMotion}
                        />
                    </div>
                ) : null}
            </GlassPanel>

            {/* Radiación / Protones + Índices solares */}
            <GlassPanel accent={accent} className="p-5 lg:col-span-4">
                <PanelHeader
                    icon={Rocket}
                    title="Radiación e Índices"
                    subtitle="Protones · F10.7 · Manchas"
                    accent={accent}
                />
                <div className="grid grid-cols-2 gap-2">
                    <MetricCell metric={radiation.protonFlux} icon={Zap} />
                    <MetricCell metric={radiation.sScale} icon={Activity} />
                    <MetricCell metric={indices.f107} icon={Gauge} />
                    <MetricCell metric={indices.sunspots} icon={Sparkles} />
                </div>
            </GlassPanel>

            {/* Imagen coronal real SDO/AIA 171 Å */}
            <GlassPanel accent={accent} className="p-2 lg:col-span-3">
                <div className="relative aspect-square w-full overflow-hidden rounded-[1.4rem] bg-black/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg"
                        alt="Imagen coronal solar AIA 171 Å (SDO/NASA)"
                        loading="lazy"
                        className="h-full w-full object-cover opacity-90 mix-blend-screen"
                    />
                    <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 backdrop-blur-md">
                        <span
                            className="text-[0.55rem] font-bold uppercase tracking-[0.2em]"
                            style={{ color: accent }}
                        >
                            SDO · AIA 171 Å
                        </span>
                    </div>
                    <div className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 backdrop-blur-md">
                        <span className="text-[0.5rem] font-semibold uppercase tracking-wide text-white/60">
                            NASA SDO
                        </span>
                    </div>
                </div>
            </GlassPanel>
        </div>
    );
}

// ── Re-export del tipo de severidad por conveniencia de consumidores ──
export type { Severity, Accent };
