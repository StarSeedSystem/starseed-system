'use client';

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Sun, Moon, Compass, Sprout, Flower2, Leaf, Snowflake } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { WidgetShell, ProgressRing, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import { useAppearance } from "@/context/appearance-context";
import { useWeatherLocation } from "@/modules/weather/context/weather-location-context";
import type { AstroTransit } from "@/lib/widget-data/types";
import {
    SYNODIC_MONTH,
    KNOWN_NEW_MOON_UTC,
    moonPhase as astroMoonPhase,
    lunarDay as astroLunarDay,
    sunSign,
    planetPositions,
    type MoonPhaseResult,
} from "@/lib/astro";

// ════════════════════════════════════════════════════════════════
// Natal Chart Widget — astrología que se ADAPTA al momento real.
// El diseño (paleta, glifo, disco lunar, estación) y la información
// se calculan EN VIVO desde `new Date()` y la ubicación del usuario
// usando la biblioteca pura `@/lib/astro` (aproximación, sin libs ext.).
//  • Fase lunar real (% de iluminación) + día lunar 1..30.
//  • Signo solar tropical vigente (longitud eclíptica del Sol).
//  • Posiciones planetarias geocéntricas aproximadas y su signo.
//  • Día planetario de la semana (Sol/Luna/Marte/…).
//  • Estación (hemisferio norte) → acento cromático.
// ════════════════════════════════════════════════════════════════

// Tipo de fase lunar usado por el disco SVG (compatibilidad de campos).
interface MoonPhase {
    /** 0..1 fracción del ciclo (0 = nueva, 0.5 = llena) */
    cycle: number;
    /** 0..1 iluminación visible */
    illum: number;
    name: string;
    glyph: string;
    waxing: boolean;
}

/** Adapta el resultado de la biblioteca astro al shape local del disco. */
function toLocalPhase(p: MoonPhaseResult): MoonPhase {
    return {
        cycle: p.fraction,
        illum: p.illumination,
        name: p.name,
        glyph: p.emoji,
        waxing: p.waxing,
    };
}

/** Próximo evento (luna nueva o llena) más cercano y su fecha aprox. */
function nextLunarEvent(now: Date): { label: string; date: Date } {
    const days = (now.getTime() - KNOWN_NEW_MOON_UTC) / 86400000;
    const pos = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
    const toNew = SYNODIC_MONTH - pos;                 // días hasta próxima nueva
    const toFull = (SYNODIC_MONTH / 2 - pos + SYNODIC_MONTH) % SYNODIC_MONTH; // hasta próxima llena
    const newDate = new Date(now.getTime() + toNew * 86400000);
    const fullDate = new Date(now.getTime() + toFull * 86400000);
    return toFull < toNew
        ? { label: "Luna llena", date: fullDate }
        : { label: "Luna nueva", date: newDate };
}

// ── Día planetario ──────────────────────────────────────────────
interface PlanetDay {
    name: string;
    body: string;
    glyph: string;
    color: string;
    meaning: string;
}
const PLANET_DAYS: PlanetDay[] = [
    { name: "Domingo", body: "Sol", glyph: "☉", color: "#fbbf24", meaning: "Vitalidad, voluntad y propósito" },
    { name: "Lunes", body: "Luna", glyph: "☽", color: "#a5b4fc", meaning: "Emoción, intuición y ciclos internos" },
    { name: "Martes", body: "Marte", glyph: "♂", color: "#f87171", meaning: "Acción, coraje e impulso" },
    { name: "Miércoles", body: "Mercurio", glyph: "☿", color: "#34d399", meaning: "Mente, comunicación y enlaces" },
    { name: "Jueves", body: "Júpiter", glyph: "♃", color: "#c084fc", meaning: "Expansión, sentido y abundancia" },
    { name: "Viernes", body: "Venus", glyph: "♀", color: "#f9a8d4", meaning: "Amor, vínculo y belleza" },
    { name: "Sábado", body: "Saturno", glyph: "♄", color: "#94a3b8", meaning: "Estructura, límite y maestría" },
];

// ── Color por elemento (para teñir el signo solar) ──────────────
const ELEMENT_COLOR: Record<string, string> = {
    Fuego: "#f87171",
    Tierra: "#86efac",
    Aire: "#fcd34d",
    Agua: "#93c5fd",
};

// ── Estación (hemisferio norte) ─────────────────────────────────
interface Season {
    name: string;
    icon: LucideIcon;
    color: string;
    accentBg: string;
}
function season(now: Date): Season {
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const after = (sm: number, sd: number) => m > sm || (m === sm && d >= sd);
    if (after(3, 20) && !after(6, 21)) return { name: "Primavera", icon: Sprout, color: "#86efac", accentBg: "radial-gradient(circle at 30% 20%, #86efac22, transparent 60%)" };
    if (after(6, 21) && !after(9, 23)) return { name: "Verano", icon: Flower2, color: "#fbbf24", accentBg: "radial-gradient(circle at 30% 20%, #fbbf2422, transparent 60%)" };
    if (after(9, 23) && !after(12, 21)) return { name: "Otoño", icon: Leaf, color: "#fb923c", accentBg: "radial-gradient(circle at 30% 20%, #fb923c22, transparent 60%)" };
    return { name: "Invierno", icon: Snowflake, color: "#93c5fd", accentBg: "radial-gradient(circle at 30% 20%, #93c5fd22, transparent 60%)" };
}

// ── Disco lunar SVG (fase real con máscara) ─────────────────────
function MoonDisc({ phase, size, glow, animate }: { phase: MoonPhase; size: number; glow: string; animate: boolean }) {
    const r = size / 2;
    // Terminador: desplazamos un círculo de sombra. illum 0 → totalmente cubierto;
    // illum 1 → descubierto. waxing ilumina la derecha, menguante la izquierda.
    const k = phase.cycle * 2 * Math.PI;
    // offset horizontal del óvalo de sombra (-r..r) según el coseno de la fase.
    const shadowShift = Math.cos(k) * r;
    const dir = phase.waxing ? 1 : -1;
    const idShadow = `moon-sh-${Math.round(phase.cycle * 1000)}`;
    const idGlow = `moon-gl-${Math.round(phase.cycle * 1000)}`;
    return (
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0">
            <defs>
                <radialGradient id={idGlow} cx="38%" cy="34%" r="75%">
                    <stop offset="0%" stopColor="#fefce8" />
                    <stop offset="62%" stopColor="#e2e8f0" />
                    <stop offset="100%" stopColor="#94a3b8" />
                </radialGradient>
                <clipPath id={idShadow}>
                    <circle cx={r} cy={r} r={r - 1} />
                </clipPath>
            </defs>
            {/* halo según acento estacional */}
            <circle cx={r} cy={r} r={r} fill="none" stroke={glow} strokeOpacity={0.5} strokeWidth={1.5}
                style={animate ? { filter: `drop-shadow(0 0 6px ${glow})` } : undefined} />
            {/* cara iluminada */}
            <circle cx={r} cy={r} r={r - 1} fill={`url(#${idGlow})`} />
            {/* sombra: óvalo desplazado dentro del clip del disco */}
            <g clipPath={`url(#${idShadow})`}>
                <ellipse
                    cx={r + dir * shadowShift}
                    cy={r}
                    rx={r}
                    ry={r - 1}
                    fill="#0b1020"
                    fillOpacity={0.92}
                />
                {/* media-sombra base para fases nueva/llena correctas */}
                {phase.illum < 0.5 && (
                    <rect
                        x={phase.waxing ? 0 : r}
                        y={0}
                        width={r}
                        height={size}
                        fill="#0b1020"
                        fillOpacity={0.92}
                    />
                )}
                {phase.illum >= 0.5 && (
                    <rect
                        x={phase.waxing ? 0 : r}
                        y={0}
                        width={0}
                        height={size}
                        fill="transparent"
                    />
                )}
            </g>
            {/* reflejo de cristal líquido */}
            <ellipse cx={r * 0.7} cy={r * 0.6} rx={r * 0.34} ry={r * 0.2} fill="#ffffff" fillOpacity={0.14} />
        </svg>
    );
}

export function NatalChartWidget() {
    const { data, loading } = useWidgetData("astro.natal", { refreshMs: 12000 });
    const { config } = useAppearance();
    const animate = !!config.animations.enabled;
    const { location } = useWeatherLocation();

    // Reloj vivo: se recalcula cada minuto (limpia el intervalo al desmontar).
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setTick(Date.now()), 60000);
        return () => clearInterval(id);
    }, []);

    // Cielo real recalculado por minuto desde la fecha/hora actual.
    const sky = useMemo(() => {
        const now = new Date();
        const planet = PLANET_DAYS[now.getDay()];
        const phaseRaw = astroMoonPhase(now);
        const phase = toLocalPhase(phaseRaw);
        const solar = sunSign(now);                 // signo solar tropical real
        const sign = {
            name: solar.sign.name,
            glyph: solar.sign.symbol,
            element: solar.sign.element,
            color: ELEMENT_COLOR[solar.sign.element] ?? "#a5b4fc",
            degree: solar.degreeInSign,
        };
        const seas = season(now);
        const evt = nextLunarEvent(now);
        const lunDay = astroLunarDay(now);          // día lunar 1..30
        const planets = planetPositions(now);       // posiciones geocéntricas aprox.
        return { now, planet, phase, sign, seas, evt, lunDay, planets };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick]);

    const accent = sky.planet.color;
    const eventDays = Math.max(0, Math.round((sky.evt.date.getTime() - sky.now.getTime()) / 86400000));

    // Tránsitos REALES derivados de las posiciones planetarias calculadas
    // (excluimos el Sol, ya destacado como signo solar). Reemplaza el mock.
    const liveTransits: AstroTransit[] = sky.planets
        .filter((p) => p.body !== "Sol")
        .map((p) => ({
            body: p.body,
            sign: p.sign.name,
            degree: Math.round(p.degreeInSign),
            intensity: (1 - Math.cos((p.degreeInSign / 30) * 2 * Math.PI)) / 2,
            note: `${p.sign.element} · ${p.symbol}`,
        }));

    const calcTime = sky.now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    return (
        <WidgetShell
            title="Sincronía Vital"
            subtitle={`${sky.planet.name} · ${sky.seas.name}`}
            icon={Sparkles}
            accent={accent}
            designMode="original"
            live
            expandHref="/network/culture"
            connections={[
                { label: "Cultura", href: "/network/culture", icon: Sparkles, color: sky.sign.color },
                { label: "Exocórtex", href: "/agent", icon: Sun, color: accent },
                { label: "Biblioteca", href: "/library", icon: Moon, color: sky.seas.color },
            ]}
        >
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const discSize = micro ? 52 : 64;

                return (
                    <div className="relative flex flex-col h-full pt-1 gap-3 min-w-0">
                        {/* Lavado cromático estacional de fondo (cristal teñido). */}
                        <div
                            aria-hidden
                            className="pointer-events-none absolute -inset-3 -z-[1] rounded-3xl"
                            style={{ background: sky.seas.accentBg }}
                        />

                        {/* Cabecera viva: disco lunar real + signo solar vigente. */}
                        <div className="flex items-center gap-3 min-w-0">
                            <motion.div
                                animate={animate ? { y: [0, -2.5, 0] } : undefined}
                                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                className="motion-reduce:!translate-y-0 shrink-0"
                            >
                                <MoonDisc phase={sky.phase} size={discSize} glow={sky.seas.color} animate={animate} />
                            </motion.div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-lg leading-none shrink-0" style={{ color: sky.sign.color }}>{sky.sign.glyph}</span>
                                    <span className="text-sm font-black truncate">{sky.sign.name}</span>
                                    <Chip color={sky.sign.color}>{sky.sign.element}</Chip>
                                </div>
                                <div className="mt-1 text-[11px] font-bold truncate" style={{ color: sky.seas.color }}>
                                    {sky.phase.glyph} {sky.phase.name} · día lunar {sky.lunDay}
                                </div>
                                <div className="mt-1 flex items-center gap-1.5">
                                    <div className="flex-1 h-1.5 rounded-full bg-muted/25 overflow-hidden">
                                        <motion.div
                                            className="h-full motion-reduce:!transition-none"
                                            style={{ background: `linear-gradient(90deg, ${sky.seas.color}, #fefce8)` }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.round(sky.phase.illum * 100)}%` }}
                                            transition={{ duration: animate ? 0.8 : 0 }}
                                        />
                                    </div>
                                    <span className="text-[10px] tabular-nums text-muted-foreground/70 shrink-0">
                                        {Math.round(sky.phase.illum * 100)}%
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Banda del día planetario: glifo dominante + significado. */}
                        <div
                            className="flex items-center gap-2.5 rounded-2xl border p-2.5 min-w-0"
                            style={{
                                borderColor: `color-mix(in srgb, ${accent} 38%, transparent)`,
                                background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 16%, transparent), transparent)`,
                            }}
                        >
                            <span
                                className="grid place-items-center rounded-xl size-9 shrink-0 text-lg font-black text-white shadow-lg"
                                style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent} 45%, transparent))` }}
                            >
                                {sky.planet.glyph}
                            </span>
                            <div className="min-w-0">
                                <div className="text-[9px] uppercase tracking-[0.18em] font-bold text-muted-foreground/60">
                                    Día de {sky.planet.body}
                                </div>
                                <div className="text-[11px] font-semibold leading-snug truncate" title={sky.planet.meaning}>
                                    {sky.planet.meaning}
                                </div>
                            </div>
                        </div>

                        {/* Coherencia + triada natal (datos de la cuenta). */}
                        {!micro && (
                            <div className="flex items-center gap-3 min-w-0">
                                <ProgressRing
                                    value={data.coherence}
                                    size={micro ? 52 : 60}
                                    color={accent}
                                    label={`${Math.round(data.coherence * 100)}%`}
                                    sublabel="coher."
                                />
                                <div className="flex-1 grid grid-cols-3 gap-1.5 text-center min-w-0">
                                    <Triad icon={Sun} label="Sol" value={sky.sign.name} accent={accent} />
                                    <Triad icon={Moon} label="Luna" value={sky.planets[1].sign.name} accent={accent} />
                                    <Triad icon={Compass} label="Asc" value={data.ascendant} accent={accent} />
                                </div>
                            </div>
                        )}

                        {/* Próximo evento lunar (calculado). */}
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/40 bg-white/[0.03] px-2.5 py-1.5 min-w-0">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60 shrink-0">Próximo</span>
                            <span className="text-[11px] font-black truncate" style={{ color: sky.seas.color }}>
                                {sky.evt.label}
                            </span>
                            <span className="text-[10px] tabular-nums text-muted-foreground/70 shrink-0">
                                {eventDays === 0 ? "hoy" : `en ${eventDays} d`}
                            </span>
                        </div>

                        {/* Sello de cálculo en vivo: hora local + ubicación del usuario. */}
                        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/55 min-w-0">
                            <span className="inline-block size-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" aria-hidden />
                            <span className="truncate">calculado en vivo · {calcTime} · {location.name}</span>
                        </div>

                        {/* Tránsitos REALES (posiciones planetarias calculadas en vivo). */}
                        {!micro && size.vTier === "expanded" && (
                            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                                <MiniList
                                    items={liveTransits}
                                    max={6}
                                    render={(t: AstroTransit) => (
                                        <div className="rounded-xl border border-border/40 bg-white/[0.03] p-2 min-w-0">
                                            <div className="flex items-center justify-between gap-2 min-w-0">
                                                <span className="text-xs font-black truncate">{t.body} en {t.sign} {t.degree}°</span>
                                                {t.aspect && <Chip color={accent}>{t.aspect}</Chip>}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 min-w-0">
                                                <div className="flex-1 h-1.5 rounded-full bg-muted/25 overflow-hidden">
                                                    <motion.div
                                                        className="h-full motion-reduce:!transition-none"
                                                        style={{ background: accent }}
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${t.intensity * 100}%` }}
                                                        transition={{ duration: animate ? 0.6 : 0 }}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground/60 line-clamp-1 max-w-[55%]">{t.note}</span>
                                            </div>
                                        </div>
                                    )}
                                />
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

function Triad({ icon: Icon, label, value, accent }: { icon: typeof Sun; label: string; value: string; accent: string }) {
    return (
        <div className="rounded-xl border border-border/40 bg-white/[0.03] py-1.5 min-w-0">
            <Icon className="size-3.5 mx-auto" style={{ color: accent }} />
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60 font-bold mt-0.5">{label}</div>
            <div className="text-[11px] font-black truncate px-1">{value}</div>
        </div>
    );
}
