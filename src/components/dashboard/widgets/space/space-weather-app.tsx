'use client';

// ════════════════════════════════════════════════════════════════
// SpaceWeatherApp — vista "app" ampliada del CLIMA ESPACIAL
// ----------------------------------------------------------------
// Pensada para una ruta o ventana del OS (más ancha que el widget):
// muestra TODO el panorama a la vez — escalas R/S/G, índice Kp con
// histórico, viento solar (velocidad/densidad/temp/Bz/Bt) con
// sparklines, rayos X (log₁₀), protones, F10.7, manchas y aurora.
//
// Comparte fetchers, severidad y colores con el widget (sin duplicar
// la lógica de datos). El diseño REACCIONA a la severidad real: cada
// sección se tiñe verde → ámbar → rojo según su estado; un banner
// destaca la tormenta geomagnética cuando G ≥ 1.
//
// Datos REALES (NOAA SWPC, sin mocks). Tres casos DISTINTOS y pintados
// distinto (Ola 305) sobre el marco común `MarcoWidget`: cargando
// (esperando a la fuente), error (no respondió, con reintento) y vacío
// (respondió sin lectura para este momento → `mensajeVacio("astronomia")`).
// Ninguna cifra de relleno: sin lectura no se pinta número, y cada
// magnitud lleva su unidad y su hora de lectura (antigua si supera la
// hora). Atribución "NOAA SWPC" siempre visible. Accesible.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
    Sun, Satellite, Zap, Wind, Radio, Magnet, Sparkles, Activity, Gauge,
    RotateCw, ZapOff, ShieldAlert, type LucideIcon,
} from "lucide-react";
import { Sparkline } from "../../kit";
import { MarcoWidget } from "../../kit/marco-widget";
import { estadoDe } from "../../calidad-widget";
// Mismo contrato de honestidad que el widget (una sola fuente de verdad
// para «hay lectura», «hora de lectura» y el sello visible).
import { hayLectura, numeroDe, lecturaDe, lecturasDisponibles, SelloHora, type Lectura } from "./space-weather-widget";
import { cn } from "@/lib/utils";
import {
    fetchSpaceWeather,
    snapshotSeverity,
    isGeomagneticStorm,
    severityColor,
    SPACE_WEATHER_ATTRIBUTION,
    SCHUMANN_REFERENCE_HZ,
    type SpaceWeatherSnapshot,
    type SpaceMetric,
    type Severity,
} from "../../apps/data-sources/space-weather-sources";

const REFRESH_MS = 300_000;
const BASE_ACCENT = "#F5A623";

// ── Hook de datos (autónomo, igual contrato que el widget) ───────
function useSpaceWeatherApp() {
    const [data, setData] = useState<SpaceWeatherSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    // El error se guarda tal cual: `mensajeError` (dentro de `MarcoWidget`)
    // lo traduce a un mensaje honesto en vez de un texto fijo.
    const [error, setError] = useState<unknown>(null);
    const [auto, setAuto] = useState(true);
    const alive = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const snap = await fetchSpaceWeather();
            if (alive.current) setData(snap);
        } catch (e) {
            if (alive.current) setError(e);
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

// ── Bloques de presentación ──────────────────────────────────────
function SectionCard({
    title, icon: Icon, color, children, className,
}: { title: string; icon: LucideIcon; color: string; children: React.ReactNode; className?: string }) {
    return (
        <section
            className={cn("relative rounded-3xl border bg-white/[0.03] p-4 overflow-hidden", className)}
            style={{ borderColor: `color-mix(in srgb, ${color} 26%, hsl(var(--border)))`, boxShadow: `0 0 28px -18px ${color}` }}
        >
            <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 80% 0%, ${color}14 0%, transparent 60%)` }} />
            <header className="relative flex items-center gap-2 mb-3">
                <span className="grid place-items-center size-7 rounded-xl border" style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                    <Icon className="size-3.5" style={{ color }} />
                </span>
                <h3 className="text-sm font-black tracking-tight">{title}</h3>
            </header>
            <div className="relative">{children}</div>
        </section>
    );
}

/**
 * Fila de una magnitud. Si la fuente NO dio lectura se dice, sin pintar
 * un número plausible en su lugar.
 */
function MetricRow({ m, lectura }: { m: SpaceMetric; lectura: Lectura }) {
    const color = severityColor(m.severity ?? "calm");
    if (!hayLectura(m)) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border/50 px-3 py-2 min-w-0">
                <div className="min-w-0">
                    <div className="text-[11px] font-bold truncate text-muted-foreground/70">{m.label}</div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/45 truncate">Sin lectura ahora mismo</div>
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl border bg-white/[0.02] px-3 py-2 min-w-0" style={{ borderColor: `color-mix(in srgb, ${color} 22%, hsl(var(--border)))` }}>
            <div className="min-w-0">
                <div className="text-[11px] font-bold truncate">{m.label}</div>
                {(m.level || m.detail) && (
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/50 truncate">{m.level ?? m.detail}</div>
                )}
                <SelloHora lectura={lectura} />
            </div>
            <div className="shrink-0 text-right">
                <span className="font-black tabular-nums text-lg" style={{ color }}>{m.value}</span>
                {m.unit && <span className="ml-0.5 text-[9px] font-bold uppercase text-muted-foreground/45">{m.unit}</span>}
            </div>
        </div>
    );
}

function ScaleBadge({ m, lectura }: { m: SpaceMetric; lectura: Lectura }) {
    const color = severityColor(m.severity ?? "calm");
    if (!hayLectura(m)) {
        return (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border/50 px-3 py-3 text-center">
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/55 leading-tight">{m.label}</span>
                <span className="text-[9px] text-muted-foreground/45">Sin lectura</span>
            </div>
        );
    }
    return (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border bg-white/[0.02] px-3 py-3" style={{ borderColor: `color-mix(in srgb, ${color} 30%, hsl(var(--border)))`, boxShadow: `0 0 18px -12px ${color}` }}>
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/55 text-center leading-tight">{m.label}</span>
            <span className="grid place-items-center size-12 rounded-full font-black tabular-nums text-xl border" style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                {m.value}
            </span>
            {m.level && <span className="text-[9px] font-black uppercase tracking-wider text-center" style={{ color }}>{m.level}</span>}
            <SelloHora lectura={lectura} />
        </div>
    );
}

function BigSeries({ title, icon, color, data, unit, lectura }: { title: string; icon: LucideIcon; color: string; data: number[]; unit?: string; lectura: Lectura }) {
    const Icon = icon;
    const last = data.length ? data[data.length - 1] : null;
    return (
        <div className="rounded-2xl border bg-white/[0.02] p-3 flex flex-col" style={{ borderColor: `color-mix(in srgb, ${color} 22%, hsl(var(--border)))` }}>
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className="size-3.5 shrink-0" style={{ color }} />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 truncate">{title}</span>
                </div>
                {last !== null && (
                    <span className="text-[11px] font-black tabular-nums shrink-0" style={{ color }}>
                        {last.toLocaleString("es-ES", { maximumFractionDigits: 1 })}{unit ? ` ${unit}` : ""}
                    </span>
                )}
            </div>
            <Sparkline data={data.map((v, i) => ({ t: i, v }))} color={color} height={90} />
            <SelloHora lectura={lectura} className="mt-1.5" />
        </div>
    );
}

// ── App principal ────────────────────────────────────────────────
export function SpaceWeatherApp() {
    const { data, loading, error, auto, setAuto, refresh } = useSpaceWeatherApp();
    const [updatedTs, setUpdatedTs] = useState<number | null>(null);
    useEffect(() => { if (data) setUpdatedTs(data.fetchedAt); }, [data]);

    const sev: Severity = data ? snapshotSeverity(data) : "calm";
    const accent = data ? severityColor(sev) : BASE_ACCENT;
    const storm = data ? isGeomagneticStorm(data) : false;
    const gColor = data ? severityColor(data.geomagnetic.gScale.severity ?? "calm") : BASE_ACCENT;
    const hayError = error !== null && error !== undefined;

    // Los tres casos, distinguidos de verdad (precedencia del contrato:
    // error > cargando > vacío > listo). Un fallo al refrescar NO borra la
    // última lectura: se avisa en la cabecera con «sin refrescar».
    const estado = estadoDe({
        cargando: loading && !data,
        error: data ? undefined : error,
        datos: data ? lecturasDisponibles(data) : undefined,
    });

    // Marcas temporales por bloque: viento y Kp las declara NOAA; el resto
    // se fecha con el momento de la consulta y así se dice.
    const lecturaViento = data ? lecturaDe(data.solarWind.timeTag, data.fetchedAt) : null;
    const lecturaKp = data ? lecturaDe(data.geomagnetic.timeTag, data.fetchedAt) : null;
    const lecturaConsulta = data ? lecturaDe(undefined, data.fetchedAt) : null;

    return (
        <div className="w-full h-full overflow-auto custom-scrollbar p-4 @container">
            {/* Cabecera */}
            <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                    <span
                        className="grid place-items-center size-11 rounded-2xl border border-white/15 shadow-lg shrink-0"
                        style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 40%, transparent))` }}
                    >
                        {storm ? <ShieldAlert className="size-5 text-white" /> : sev === "calm" ? <Sun className="size-5 text-white" /> : <Satellite className="size-5 text-white" />}
                    </span>
                    <div className="min-w-0">
                        <h1 className="text-lg @lg:text-xl font-black tracking-tight truncate">Clima Espacial</h1>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">
                            Telemetría solar · {SPACE_WEATHER_ATTRIBUTION}
                            {updatedTs !== null && <span className="text-muted-foreground/40"> · consultado hace {timeAgoShort(updatedTs)}</span>}
                            {hayError && data !== null && <span className="text-amber-400/85"> · sin refrescar</span>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setAuto(!auto)}
                        aria-pressed={auto}
                        aria-label={auto ? "Pausar auto-refresco" : "Activar auto-refresco"}
                        className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                        style={{
                            color: auto ? accent : "hsl(var(--muted-foreground))",
                            borderColor: auto ? `color-mix(in srgb, ${accent} 40%, transparent)` : "hsl(var(--border))",
                            background: auto ? `color-mix(in srgb, ${accent} 12%, transparent)` : "transparent",
                        }}
                    >
                        {auto ? <Zap className="size-3.5" /> : <ZapOff className="size-3.5" />}
                        {auto ? "Auto" : "Manual"}
                    </button>
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        aria-label="Refrescar ahora"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/50 px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
                    >
                        <RotateCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refrescar
                    </button>
                </div>
            </header>

            {/* Los tres casos sobre el marco común: cargando ≠ error ≠ vacío. */}
            {estado !== "listo" || !data || !lecturaViento || !lecturaKp || !lecturaConsulta ? (
                <div className="min-h-[18rem]">
                    <MarcoWidget
                        titulo="Clima espacial"
                        categoria="astronomia"
                        icono={<Satellite />}
                        cargando={estado === "cargando"}
                        error={estado === "error" ? error : undefined}
                        vacio={estado === "vacio"}
                        onReintentar={refresh}
                    >
                        {null}
                    </MarcoWidget>
                </div>
            ) : (
                <div className="space-y-3">
                    {storm && (
                        <motion.div
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            role="alert"
                            className="flex items-center gap-2.5 rounded-2xl border px-4 py-2.5"
                            style={{ borderColor: `color-mix(in srgb, ${gColor} 45%, transparent)`, background: `color-mix(in srgb, ${gColor} 12%, transparent)` }}
                        >
                            <motion.span animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.8, repeat: Infinity }}>
                                <ShieldAlert className="size-5" style={{ color: gColor }} />
                            </motion.span>
                            <span className="text-sm font-black uppercase tracking-wider" style={{ color: gColor }}>
                                Tormenta geomagnética activa · {data.geomagnetic.gScale.level}
                            </span>
                        </motion.div>
                    )}

                    {/* Escalas NOAA + Kp */}
                    <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3">
                        <SectionCard title="Escalas NOAA (ahora)" icon={Gauge} color={accent}>
                            <div className="grid grid-cols-3 gap-2">
                                <ScaleBadge m={data.radiation.rScale} lectura={lecturaConsulta} />
                                <ScaleBadge m={data.radiation.sScale} lectura={lecturaConsulta} />
                                <ScaleBadge m={data.geomagnetic.gScale} lectura={lecturaKp} />
                            </div>
                        </SectionCard>
                        <SectionCard title="Índice Kp planetario" icon={Activity} color={gColor}>
                            <div className="flex items-center gap-4">
                                {/* Sin número real de Kp no se escribe «0.0»: se dice que no hay lectura. */}
                                <div className="text-center shrink-0">
                                    {numeroDe(data.geomagnetic.kp) === null ? (
                                        <div className="text-xs font-bold text-muted-foreground/60 max-w-[9rem]">
                                            Sin índice Kp para este momento
                                        </div>
                                    ) : (
                                        <>
                                            <div className="font-black tabular-nums leading-none" style={{ color: gColor, fontSize: 44 }}>
                                                {data.geomagnetic.kp.value}
                                            </div>
                                            <div className="text-[9px] font-black uppercase tracking-wider mt-1" style={{ color: gColor }}>
                                                {hayLectura(data.geomagnetic.gScale) ? data.geomagnetic.gScale.value : "Escala sin lectura"}
                                            </div>
                                            <SelloHora lectura={lecturaKp} className="mt-1" />
                                        </>
                                    )}
                                </div>
                                {numeroDe(data.geomagnetic.kp) !== null && data.geomagnetic.kpSeries.length >= 2 && (
                                    <div className="flex-1 min-w-0">
                                        <Sparkline data={data.geomagnetic.kpSeries.map((v, i) => ({ t: i, v }))} color={gColor} height={72} />
                                    </div>
                                )}
                            </div>
                        </SectionCard>
                    </div>

                    {/* Viento solar */}
                    <SectionCard title="Viento solar" icon={Wind} color={severityColor(data.solarWind.speed.severity ?? "calm")}>
                        <div className="grid grid-cols-2 @lg:grid-cols-5 gap-2 mb-3">
                            <MetricRow m={data.solarWind.speed} lectura={lecturaViento} />
                            <MetricRow m={data.solarWind.density} lectura={lecturaViento} />
                            <MetricRow m={data.solarWind.bz} lectura={lecturaViento} />
                            <MetricRow m={data.solarWind.bt} lectura={lecturaViento} />
                            <MetricRow m={data.solarWind.temperature} lectura={lecturaViento} />
                        </div>
                        <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2">
                            {data.solarWind.speedSeries.length >= 2 && (
                                <BigSeries title="Velocidad" icon={Wind} color={severityColor(data.solarWind.speed.severity ?? "calm")} data={data.solarWind.speedSeries} unit="km/s" lectura={lecturaViento} />
                            )}
                            {data.solarWind.bzSeries.length >= 2 && (
                                <BigSeries title="Bz (IMF)" icon={Magnet} color={severityColor(data.solarWind.bz.severity ?? "calm")} data={data.solarWind.bzSeries} unit="nT" lectura={lecturaViento} />
                            )}
                        </div>
                    </SectionCard>

                    {/* Radiación + índices */}
                    <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-3">
                        <SectionCard title="Radiación solar" icon={Zap} color={severityColor(data.radiation.flare.severity ?? "calm")}>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <MetricRow m={data.radiation.flare} lectura={lecturaConsulta} />
                                <MetricRow m={data.radiation.protonFlux} lectura={lecturaConsulta} />
                                <MetricRow m={data.radiation.rScale} lectura={lecturaConsulta} />
                                <MetricRow m={data.radiation.sScale} lectura={lecturaConsulta} />
                            </div>
                            {data.radiation.xraySeries.length >= 2 && (
                                <BigSeries title="Rayos X · log₁₀ flujo" icon={Radio} color={severityColor(data.radiation.flare.severity ?? "calm")} data={data.radiation.xraySeries} lectura={lecturaConsulta} />
                            )}
                        </SectionCard>
                        <SectionCard title="Índices solares" icon={Sun} color={severityColor(data.indices.f107.severity ?? "calm")}>
                            <div className="grid grid-cols-1 gap-2">
                                <MetricRow m={data.indices.f107} lectura={lecturaConsulta} />
                                <MetricRow m={data.indices.sunspots} lectura={lecturaConsulta} />
                                <MetricRow m={data.aurora} lectura={lecturaConsulta} />
                                {/*
                                  Resonancia Schumann: NO hay lectura (no existe fuente
                                  oficial con CORS). Se enseña como lo que es —la constante
                                  teórica de referencia, sin hora— y NUNCA como una medida
                                  del momento junto al resto de la telemetría.
                                */}
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-border/50 px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-bold truncate text-muted-foreground/70">Resonancia Schumann</div>
                                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground/45 truncate">
                                            Sin lectura: {SCHUMANN_REFERENCE_HZ} Hz es la constante teórica, no una medida de ahora
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </SectionCard>
                    </div>

                    {/* Aurora */}
                    <SectionCard title="Aurora — potencia hemisférica (OVATION)" icon={Sparkles} color={severityColor(data.aurora.severity ?? "calm")}>
                        <div className="flex flex-wrap items-center gap-4">
                            {/* OVATION no siempre publica potencia: sin ella, se dice. */}
                            {!hayLectura(data.aurora) ? (
                                <div className="text-xs font-bold text-muted-foreground/60">
                                    Sin potencia hemisférica publicada para este momento.
                                </div>
                            ) : (
                                <div className="text-center">
                                    <span className="font-black tabular-nums leading-none" style={{ color: severityColor(data.aurora.severity ?? "calm"), fontSize: 40 }}>
                                        {data.aurora.value}
                                    </span>
                                    <span className="ml-1 text-xs font-bold uppercase text-muted-foreground/45">{data.aurora.unit}</span>
                                    {data.aurora.level && (
                                        <div className="text-[10px] font-black uppercase tracking-wider mt-1" style={{ color: severityColor(data.aurora.severity ?? "calm") }}>
                                            {data.aurora.level}
                                        </div>
                                    )}
                                    <SelloHora lectura={lecturaConsulta} className="mt-1" />
                                </div>
                            )}
                            {hayLectura(data.aurora) && data.aurora.detail && (
                                <div className="text-xs text-muted-foreground/60 tabular-nums">{data.aurora.detail}</div>
                            )}
                        </div>
                    </SectionCard>

                    <p className="text-center text-[10px] text-muted-foreground/40 pt-1">
                        Lecturas de NOAA Space Weather Prediction Center (SWPC), cada una con su hora.
                        Donde la fuente no publica lectura no se muestra ningún valor. Sin garantía operativa.
                    </p>
                </div>
            )}

            <span role="status" aria-live="polite" className="sr-only">
                {loading && !data
                    ? "Esperando la lectura del clima espacial…"
                    : estado === "error"
                        ? "La fuente no respondió: no hay lectura que mostrar."
                        : estado === "vacio"
                            ? "La fuente respondió sin lectura para este momento."
                            : data && lecturaKp
                                ? `Clima espacial leído. Kp ${data.geomagnetic.kp.value}. ${lecturaKp.etiqueta}${lecturaKp.antigua ? ", lectura antigua." : "."}`
                                : ""}
            </span>
        </div>
    );
}

// Tiempo relativo compacto (local, evita acoplar al kit por una sola línea).
function timeAgoShort(ts: number): string {
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "un momento";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return `${h} h`;
}
