'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
    CalendarDays, MapPin, Users, ChevronRight, type LucideIcon,
    Landmark, Hammer, Sparkles, Palette, Store, LayoutGrid,
} from "lucide-react";
import {
    RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
} from "recharts";
import { WidgetShell, MiniList, Chip, timeUntil } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useWidgetData } from "@/lib/widget-data";
import type { SocialEvent } from "@/lib/widget-data";
import { createClient } from "@/utils/supabase/client";
import { eventHref, slugify } from "@/lib/entity-links";
import { useOsEvents } from "@/hooks/use-os-entities";
import type { OsEvent } from "@/lib/os-social";
import { listFederativeEntities } from "@/data/sample-governance";

// Conteos localizados con separador de millares (es-ES).
const NUM_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

// ════════════════════════════════════════════════════════════════
// SocialRadarWidget — eventos próximos de la red (asambleas, talleres,
// rituales, obras, mercados). Radar visual con recharts, segmentos por
// tipo, urgencia data-driven (eventos inminentes → pulso ámbar/verde),
// countdown pill, entidades activas y live-pulse. Adaptativo + theme.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<SocialEvent["kind"], { icon: LucideIcon; color: string; label: string }> = {
    asamblea: { icon: Landmark, color: "#f59e0b", label: "Asamblea" },
    taller:   { icon: Hammer,   color: "#10b981", label: "Taller"   },
    ritual:   { icon: Sparkles, color: "#a855f7", label: "Ritual"   },
    obra:     { icon: Palette,  color: "#ec4899", label: "Obra"     },
    mercado:  { icon: Store,    color: "#38bdf8", label: "Mercado"  },
};
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const KIND_ORDER: SocialEvent["kind"][] = ["asamblea", "taller", "ritual", "obra", "mercado"];

type RadarFilter = "todos" | SocialEvent["kind"];

interface LocationRow { id: string; name: string | null; city: string | null }
type RadarEvent = SocialEvent & { slug?: string };

function radarKind(kind: string): SocialEvent["kind"] {
    const k = kind.toLowerCase();
    if (k.includes("asamblea")) return "asamblea";
    if (k.includes("taller") || k.includes("curso")) return "taller";
    if (k.includes("ritual")) return "ritual";
    if (k.includes("mercado")) return "mercado";
    return "obra";
}

function osEventToRadar(e: OsEvent): RadarEvent {
    return {
        id: e.id,
        title: e.title,
        place: e.location || "Red StarSeed",
        startTs: e.startsAt ? new Date(e.startsAt).getTime() : Date.now(),
        attendees: e.attendeeCount,
        kind: radarKind(e.kind),
        slug: e.slug,
    };
}

/** Formato de cuenta regresiva legible: "en 2h 15m" / "en 3 días" / "iniciado" */
function timeCountdown(ts: number): string {
    const diff = ts - Date.now();
    if (diff < 0) return "iniciado";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 48) return `en ${Math.floor(h / 24)} días`;
    if (h > 0) return `en ${h}h ${m}m`;
    return `en ${m}m`;
}

/** Urgencia data-driven: "live" (<1h), "soon" (<24h) o "scheduled". */
function eventUrgency(ts: number): "live" | "soon" | "scheduled" {
    const diff = ts - Date.now();
    if (diff > 0 && diff < 3_600_000) return "live";
    if (diff > 0 && diff < 86_400_000) return "soon";
    return "scheduled";
}

/** ¿El evento empieza dentro de 1 hora? */
function startsWithinHour(ts: number): boolean {
    return eventUrgency(ts) === "live";
}

// ── Mini radar SVG para modo micro ──────────────────────────────
function MicroRadarRings({ counts }: { counts: Record<string, number> }) {
    const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
    const cx = 24, cy = 24, r = 18;
    let startAngle = -Math.PI / 2;
    const arcs = KIND_ORDER.map((k) => {
        const frac = (counts[k] ?? 0) / total;
        const angle = frac * Math.PI * 2;
        const end = startAngle + angle;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const large = angle > Math.PI ? 1 : 0;
        const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
        const result = { path, color: KIND_META[k].color, key: k };
        startAngle = end;
        return result;
    });
    return (
        <svg width={48} height={48} viewBox="0 0 48 48" aria-hidden>
            {arcs.map((a) => (
                <path key={a.key} d={a.path} fill={a.color} fillOpacity={0.75} />
            ))}
            <circle cx={cx} cy={cy} r={10} fill="hsl(var(--card))" />
        </svg>
    );
}

export function SocialRadarWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { data: mockData, loading: mockLoading } = useWidgetData("social.events", { refreshMs: 20000 });
    const { data: osEvents, loading: osLoading } = useOsEvents();
    const supabase = useMemo(() => createClient(), []);
    const [realPlaces, setRealPlaces] = useState<string[] | null>(null);
    const [branchActivity, setBranchActivity] = useState<Record<string, number> | null>(null);
    const [filter, setFilter] = useState<RadarFilter>("todos");

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const [locRes, postsRes] = await Promise.all([
                    supabase.from("locations").select("id, name, city"),
                    supabase.from("cafe_posts").select("branch"),
                ]);
                if (locRes.error) throw locRes.error;
                if (!active) return;
                const places = ((locRes.data ?? []) as LocationRow[])
                    .map(l => l.name || l.city)
                    .filter((p): p is string => !!p);
                setRealPlaces(places.length ? places : null);
                if (!postsRes.error && postsRes.data) {
                    const counts: Record<string, number> = {};
                    for (const row of postsRes.data as { branch: string | null }[]) {
                        if (row.branch) counts[row.branch] = (counts[row.branch] ?? 0) + 1;
                    }
                    setBranchActivity(Object.keys(counts).length ? counts : null);
                }
            } catch {
                if (active) { setRealPlaces(null); setBranchActivity(null); }
            }
        })();
        return () => { active = false; };
    }, [supabase]);

    const loading = osLoading && (mockLoading && !mockData);

    const data: RadarEvent[] | null = useMemo(() => {
        if (osEvents && osEvents.length > 0) {
            return osEvents.map(osEventToRadar);
        }
        if (!mockData) return mockData;
        if (!realPlaces && !branchActivity) return mockData;
        return mockData.map((e, i) => {
            const place = realPlaces && realPlaces.length
                ? realPlaces[i % realPlaces.length]
                : e.place;
            const realPosts = branchActivity?.[place] ?? 0;
            return { ...e, place, attendees: e.attendees + realPosts * 12 };
        });
    }, [osEvents, mockData, realPlaces, branchActivity]);

    // Conteos por tipo para el radar y los segmentos.
    const kindCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        if (data) for (const e of data) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
        return counts;
    }, [data]);

    // Datos formateados para recharts RadarChart
    const radarData = useMemo(() =>
        KIND_ORDER.map((k) => ({ kind: KIND_META[k].label, value: kindCounts[k] ?? 0 })),
        [kindCounts]
    );

    // Lista filtrada por segmento de tipo.
    const filtered = useMemo(() => {
        if (!data) return [];
        const base = filter === "todos" ? data : data.filter(e => e.kind === filter);
        return [...base].sort((a, b) => a.startTs - b.startTs);
    }, [data, filter]);

    // Evento más próximo (para countdown pill y live pulse)
    const nearestEvent = useMemo(() => filtered[0] ?? null, [filtered]);
    const liveNow = nearestEvent ? startsWithinHour(nearestEvent.startTs) : false;
    // Cuántos eventos son inminentes (<24h): señal de urgencia data-driven.
    const soonCount = useMemo(() => (data ?? []).filter(e => eventUrgency(e.startTs) !== "scheduled").length, [data]);

    // E.F. activas (top 3 para mostrar chips)
    const activeEFs = useMemo(() => listFederativeEntities().slice(0, 3), []);

    // Segmentos de tipo presentes (solo los que tienen eventos).
    const segments = useMemo<RadarFilter[]>(() => {
        const present = KIND_ORDER.filter(k => (kindCounts[k] ?? 0) > 0);
        return ["todos", ...present];
    }, [kindCounts]);

    return (
        <WidgetShell
            title="Radar Social"
            subtitle="Eventos próximos"
            icon={CalendarDays}
            accent="#ec4899"
            expandHref="/network/culture"
            actions={
                <Link href="/network/culture" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors inline-flex items-center gap-0.5 cursor-pointer">
                    Calendario <ChevronRight className="size-3" />
                </Link>
            }
            connections={[
                { label: "Cultura",    href: "/network/culture",  color: "#ec4899", icon: Palette   },
                { label: "Asambleas",  href: "/network/politics", color: "#f59e0b", icon: Landmark  },
                { label: "Hub",        href: "/hub",              color: "#10b981", icon: Users     },
            ]}
            footer={
                !loading && data && data.length ? (() => {
                    const next = [...data].sort((a, b) => a.startTs - b.startTs)[0];
                    const totalAttendees = data.reduce((s, e) => s + e.attendees, 0);
                    return (
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/70 min-w-0">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                                {/* Live pulse indicator */}
                                {liveNow ? (
                                    <span className={`size-1.5 rounded-full shrink-0 bg-emerald-400 ${animate ? "animate-pulse" : ""}`} />
                                ) : (
                                    <span className="size-1.5 rounded-full shrink-0" style={{ background: "#ec4899" }} />
                                )}
                                <span className="truncate tabular-nums">{data.length} eventos · {NUM_ES.format(totalAttendees)} asistentes</span>
                            </span>
                            <span className="shrink-0 tabular-nums">próximo {timeUntil(next.startTs)}</span>
                        </div>
                    );
                })() : undefined
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const sorted = filtered;
                const max = micro ? 3 : size.vTier === "expanded" ? 5 : 3;

                // Micro: miniatura de radar + lista compacta
                if (micro) {
                    return (
                        <div className="pt-1 h-full flex items-center gap-2.5">
                            <MicroRadarRings counts={kindCounts} />
                            <div className="flex-1 min-h-0 overflow-hidden">
                                <MiniList
                                    items={sorted}
                                    max={3}
                                    empty="Sin eventos"
                                    render={(e) => {
                                        const meta = KIND_META[e.kind];
                                        const Icon = meta.icon;
                                        const soon = startsWithinHour(e.startTs);
                                        return (
                                            <Link href={e.slug ? eventHref(e.slug) : eventHref(slugify(e.title) || "evento")}
                                                className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-white/[0.04] transition-colors cursor-pointer">
                                                <Icon className="size-3 shrink-0" style={{ color: meta.color }} />
                                                <span className="text-[10px] font-bold truncate flex-1">{e.title}</span>
                                                {soon && <span className={`size-1.5 rounded-full shrink-0 bg-emerald-400 ${animate ? "animate-pulse" : ""}`} />}
                                            </Link>
                                        );
                                    }}
                                />
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="pt-1 h-full flex flex-col gap-2.5">
                        {/* ── Segmentos por tipo + señal de urgencia ── */}
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-1 overflow-x-auto no-scrollbar -mx-0.5 px-0.5">
                                {segments.map((s) => {
                                    const active = filter === s;
                                    const meta = s === "todos" ? null : KIND_META[s];
                                    const SIcon = s === "todos" ? CalendarDays : meta!.icon;
                                    const n = s === "todos" ? data.length : (kindCounts[s] ?? 0);
                                    const col = s === "todos" ? "#ec4899" : meta!.color;
                                    return (
                                        <button key={s} type="button" onClick={() => setFilter(s)} aria-pressed={active}
                                            className="shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer tabular-nums"
                                            style={active
                                                ? { color: col, borderColor: `${col}66`, background: `${col}1f` }
                                                : { color: "hsl(var(--muted-foreground)/0.7)", borderColor: "hsl(var(--border)/0.4)" }}>
                                            <SIcon className="size-2.5" />{s === "todos" ? "Todos" : meta!.label}<span className="opacity-60">{n}</span>
                                        </button>
                                    );
                                })}
                                {soonCount > 0 && (
                                    <span className="shrink-0 ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-300 tabular-nums">
                                        <span className={`size-1.5 rounded-full bg-emerald-400 ${animate ? "animate-pulse" : ""}`} />{soonCount} pronto
                                    </span>
                                )}
                            </div>
                        )}

                        {/* ── Radar visual (expanded) ── */}
                        {size.vTier === "expanded" && (
                            <div className="shrink-0 rounded-2xl border border-border/40 bg-white/[0.02] p-2.5">
                                <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-1">Actividad por tipo</p>
                                <div style={{ height: 100 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart data={radarData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                                            <PolarGrid stroke="rgba(255,255,255,0.08)" />
                                            <PolarAngleAxis dataKey="kind"
                                                tick={{ fontSize: 8, fill: "currentColor", opacity: 0.55 }} />
                                            <Radar name="Eventos" dataKey="value" stroke="#ec4899"
                                                strokeWidth={1.5} fill="#ec4899" fillOpacity={0.25}
                                                isAnimationActive={animate} />
                                        </RadarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* ── Lista de eventos (stagger) ── */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={sorted}
                                max={max}
                                empty={filter === "todos" ? "Sin eventos próximos" : `Sin ${KIND_META[filter as SocialEvent["kind"]]?.label.toLowerCase()}s próximos`}
                                emptyIcon={LayoutGrid}
                                render={(e, idx) => {
                                    const meta = KIND_META[e.kind];
                                    const d = new Date(e.startTs);
                                    const hh = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
                                    const isNearest = e.id === nearestEvent?.id;
                                    const urgency = eventUrgency(e.startTs);
                                    const startingSoon = urgency === "live";
                                    // Urgencia ⇒ el badge de fecha se intensifica.
                                    const badgeColor = startingSoon ? "#10b981" : meta.color;
                                    return (
                                        <motion.div
                                            key={e.id}
                                            initial={animate ? { opacity: 0, y: 10 } : false}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: animate ? idx * 0.07 : 0, duration: animate ? 0.22 : 0, ease: [0.16, 1, 0.3, 1] }}
                                        >
                                            <Link
                                                href={e.slug ? eventHref(e.slug) : eventHref(slugify(e.title) || "evento")}
                                                className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 transition-all cursor-pointer block"
                                                onMouseEnter={(ev) => {
                                                    (ev.currentTarget as HTMLElement).style.boxShadow = `0 0 12px ${meta.color}33`;
                                                    (ev.currentTarget as HTMLElement).style.borderColor = `${meta.color}40`;
                                                }}
                                                onMouseLeave={(ev) => {
                                                    (ev.currentTarget as HTMLElement).style.boxShadow = "";
                                                    (ev.currentTarget as HTMLElement).style.borderColor = "";
                                                }}
                                            >
                                                {/* Badge de fecha con glow sutil; pulso si inminente */}
                                                <div className="shrink-0 relative grid place-items-center size-10 rounded-xl border text-center leading-none"
                                                    style={{
                                                        color: badgeColor,
                                                        borderColor: `${badgeColor}40`,
                                                        background: `${badgeColor}1a`,
                                                        boxShadow: `0 0 8px ${badgeColor}66`,
                                                    }}>
                                                    <span className="text-[8px] font-black uppercase">{MONTHS[d.getMonth()]}</span>
                                                    <span className="text-base font-black tabular-nums">{d.getDate()}</span>
                                                    {startingSoon && animate && (
                                                        <motion.span
                                                            animate={{ scale: [1, 1.35, 1], opacity: [0.55, 0, 0.55] }}
                                                            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                                                            className="absolute inset-0 rounded-xl border-2 pointer-events-none"
                                                            style={{ borderColor: badgeColor }}
                                                        />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[11px] @sm:text-xs font-bold truncate">{e.title}</span>
                                                        <Chip color={meta.color}>{meta.label}</Chip>
                                                    </div>
                                                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70 min-w-0">
                                                        <span className="inline-flex items-center gap-1 truncate min-w-0">
                                                            <MapPin className="size-3 shrink-0" /> {hh} · {e.place}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 ml-auto shrink-0 tabular-nums" title={`${NUM_ES.format(e.attendees)} asistentes`}>
                                                            <Users className="size-3" /> {NUM_ES.format(e.attendees)}
                                                        </span>
                                                    </div>
                                                    {/* Countdown pill: para el más próximo o cualquier evento inminente */}
                                                    {(isNearest || urgency !== "scheduled") && (
                                                        <div className="mt-1 flex items-center gap-1.5">
                                                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-px text-[8px] font-black uppercase tracking-wider ${startingSoon ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : urgency === "soon" ? "bg-amber-500/15 border-amber-500/30 text-amber-300" : "bg-white/[0.06] border-border/40 text-muted-foreground/60"}`}>
                                                                {startingSoon && <span className={`size-1.5 rounded-full bg-emerald-400 ${animate ? "animate-pulse" : ""}`} />}
                                                                {timeCountdown(e.startTs)}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </Link>
                                        </motion.div>
                                    );
                                }}
                            />
                        </div>

                        {/* ── Entidades activas (chips, no micro) ── */}
                        {size.vTier !== "micro" && activeEFs.length > 0 && (
                            <div className="shrink-0">
                                <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1">Entidades activas</p>
                                <div className="flex flex-wrap gap-1">
                                    {activeEFs.map((ef) => (
                                        <Link key={ef.slug} href={`/entidad/${ef.slug}`}
                                            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold transition-colors cursor-pointer hover:bg-white/[0.06]"
                                            style={{ borderColor: `${ef.accent}40`, color: ef.accent }}>
                                            <span className="size-1.5 rounded-full shrink-0" style={{ background: ef.accent }} />
                                            {ef.name}
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
