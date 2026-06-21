'use client';

import { useState, useMemo, useId } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, Plus, Users, Crown, Shield, Folder, User, ChevronRight, Activity, Flame, type LucideIcon } from "lucide-react";
import { WidgetShell, ProgressBar, Chip, ProgressRing } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useWidgetData } from "@/lib/widget-data";
import type { PageRef } from "@/lib/widget-data";
import { widgetEntityHref, slugify } from "@/lib/entity-links";
import { useOsPages, useOsGroups } from "@/hooks/use-os-entities";
import type { OsPage, OsGroup } from "@/lib/os-social";
import { EntityEditorDialog } from "@/components/social/entity-editor-dialog";

/** Ruta de detalle para una página del usuario según su tipo. */
function pageRefHref(pg: PageRef): string {
    if (pg.kind === "perfil") return `/profile/${slugify(pg.name) || "perfil"}`;
    return widgetEntityHref(pg.name, pg.kind);
}

// Umbrales de actividad → estado data-driven (etiqueta + color reactivo).
const THRIVING = 0.72;
const ACTIVE = 0.45;
function activityState(a: number): { label: string; color: string; hot: boolean } {
    if (a >= THRIVING) return { label: "Vibrante", color: "#10b981", hot: true };
    if (a >= ACTIVE) return { label: "Activa", color: "#38bdf8", hot: false };
    return { label: "Tranquila", color: "#94a3b8", hot: false };
}

/** Mini sparkline SVG para tendencia de actividad (path simple, sin recharts). */
function MiniSparkline({ value, color, id, animate = true }: { value: number; color: string; id: string; animate?: boolean }) {
    // Genera puntos sintéticos deterministas desde el valor de actividad actual.
    const pts = useMemo(() => {
        const seed = value;
        const points = Array.from({ length: 7 }, (_, i) => {
            const t = i / 6;
            // Oscilación determinista alrededor del valor actual.
            const noise = Math.sin((seed + i) * 2.3) * 0.12 + Math.cos((seed * 1.7 + i) * 1.1) * 0.08;
            return Math.max(0.05, Math.min(0.98, seed - 0.1 + t * 0.1 + noise));
        });
        return points;
    }, [value]);

    const W = 48, H = 16;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 0.01;
    const svgPts = pts.map((v, i) => {
        const x = (i / (pts.length - 1)) * W;
        const y = H - ((v - min) / range) * H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const d = `M${svgPts.join(" L")}`;
    const fillD = `M${svgPts[0]} L${svgPts.join(" L")} L${W},${H} L0,${H} Z`;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="overflow-visible" aria-hidden>
            <defs>
                <linearGradient id={`spark-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={fillD} fill={`url(#spark-fill-${id})`} />
            <motion.path
                d={d} fill="none" stroke={color} strokeWidth={1.5}
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={animate ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={{ duration: animate ? 0.9 : 0, ease: "easeOut" }}
            />
        </svg>
    );
}

// ════════════════════════════════════════════════════════════════
// MyPagesWidget — perfiles, comunidades y entidades del usuario.
// Datos en vivo "social.pages". Filtro local por kind, actividad
// visual data-driven (estado vibrante/activa/tranquila → color),
// spotlight de la más activa y resumen agregado. Adaptativo + theme.
// ════════════════════════════════════════════════════════════════

const ACCENT = "#38bdf8";

const ROLE_META: Record<PageRef["role"], { icon: LucideIcon; label: string; color: string }> = {
    fundador:  { icon: Crown,  label: "Fundador",  color: "#f59e0b" },
    moderador: { icon: Shield, label: "Moderador", color: "#a855f7" },
    miembro:   { icon: Users,  label: "Miembro",   color: "#38bdf8" },
};

const KIND_META: Record<PageRef["kind"], { icon: LucideIcon; label: string }> = {
    perfil:    { icon: User,       label: "Perfil"    },
    comunidad: { icon: Users,      label: "Comunidad" },
    proyecto:  { icon: Folder,     label: "Proyecto"  },
    entidad:   { icon: LayoutGrid, label: "Entidad"   },
};

const KIND_FILTERS: Array<PageRef["kind"] | "todas"> = ["todas", "comunidad", "proyecto", "perfil", "entidad"];

/** Mapea una página OS al shape PageRef del widget. */
function osPageToRef(p: OsPage): PageRef {
    const kind: PageRef["kind"] =
        p.kind === "comunidad" ? "comunidad"
        : p.kind === "proyecto" ? "proyecto"
        : p.kind === "perfil" ? "perfil"
        : "entidad";
    return {
        id: `p:${p.slug}`,
        name: p.name,
        kind,
        members: p.memberCount,
        activity: Math.min(1, Math.max(0.2, Math.log10(Math.max(10, p.memberCount)) / 5)),
        role: p.kind === "perfil" ? "fundador" : "miembro",
        accent: p.accent,
    };
}

function osGroupToRef(g: OsGroup): PageRef {
    return {
        id: `g:${g.slug}`,
        name: g.name,
        kind: "proyecto",
        members: g.memberCount,
        activity: Math.min(1, Math.max(0.2, Math.log10(Math.max(10, g.memberCount)) / 5)),
        role: "miembro",
        accent: g.accent,
    };
}

export function MyPagesWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { data: mockData, loading: mockLoading } = useWidgetData("social.pages", { refreshMs: 12000 });
    const { data: pages, loading: pagesLoading, refetch: refetchPages } = useOsPages();
    const { data: groups, loading: groupsLoading, refetch: refetchGroups } = useOsGroups();
    const [filter, setFilter] = useState<PageRef["kind"] | "todas">("todas");
    const [createOpen, setCreateOpen] = useState(false);
    const sparkId = useId();

    const loading = (pagesLoading || groupsLoading) && (mockLoading && !mockData);

    // Páginas reales (o de ejemplo) del usuario; cae a los datos simulados si vacío.
    const data: PageRef[] = useMemo(() => {
        const combined = [
            ...(pages ?? []).map(osPageToRef),
            ...(groups ?? []).map(osGroupToRef),
        ];
        if (combined.length > 0) return combined;
        return mockData ?? [];
    }, [pages, groups, mockData]);

    const filteredPages = useMemo(() => {
        const list = data ?? [];
        return filter === "todas" ? list : list.filter(p => p.kind === filter);
    }, [data, filter]);

    const mostActive = useMemo(() => {
        if (!data?.length) return null;
        return [...data].sort((a, b) => b.activity - a.activity)[0];
    }, [data]);

    // Métricas agregadas data-driven (resumen + badge por filtro).
    const totals = useMemo(() => {
        const members = data.reduce((s, p) => s + p.members, 0);
        const avgActivity = data.length ? data.reduce((s, p) => s + p.activity, 0) / data.length : 0;
        const thriving = data.filter(p => p.activity >= THRIVING).length;
        return { members, avgActivity, thriving };
    }, [data]);

    const filterCounts = useMemo(() => {
        const c = {} as Record<PageRef["kind"] | "todas", number>;
        for (const k of KIND_FILTERS) c[k] = k === "todas" ? data.length : data.filter(p => p.kind === k).length;
        return c;
    }, [data]);

    return (
        <>
        <EntityEditorDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            mode="create"
            defaultType="page"
            navigateOnCreate={false}
            onSaved={() => {
                refetchPages();
                refetchGroups();
            }}
        />
        <WidgetShell
            title="Mis Páginas"
            subtitle="Perfiles · comunidades · proyectos"
            icon={LayoutGrid}
            accent={ACCENT}
            connections={[{ label: "Perfil", href: "/profile", color: "#7FB8FF" }, { label: "Comunidades", href: "/hub", color: "#9FE870" }, { label: "Publicar", href: "/publish", color: "#FFBF00" }]}
            actions={
                <>
                    <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Hub <ChevronRight className="size-3" />
                    </Link>
                    <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Nueva
                    </button>
                </>
            }
        >
            {(size) => {
                if (loading && data.length === 0) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: conteo + página más activa ──────────────
                if (micro) {
                    const st = mostActive ? activityState(mostActive.activity) : null;
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={mostActive?.activity ?? 0} size={52} stroke={5} color={st?.color ?? ACCENT}
                                label={String(data?.length ?? 0)} sublabel="págs." />
                            <div className="min-w-0 flex-1">
                                {mostActive ? (
                                    <>
                                        <p className="text-[11px] font-black truncate flex items-center gap-1" style={{ color: mostActive.accent ?? ACCENT }}>
                                            {st?.hot && <Flame className="size-3 shrink-0" style={{ color: st.color }} />}{mostActive.name}
                                        </p>
                                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{KIND_META[mostActive.kind]?.label}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5 tabular-nums">
                                            <Users className="size-2.5 inline mr-0.5" />{mostActive.members.toLocaleString()}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-[10px] text-muted-foreground/50 italic">Sin páginas</p>
                                )}
                            </div>
                        </div>
                    );
                }

                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 3 : 4;
                const showFilter = size.tier !== "compact";
                const showSpotlight = size.vTier !== "compact" && size.vTier !== "micro" && mostActive;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">

                        {/* Resumen agregado — miembros totales + actividad media + vibrantes */}
                        {size.tier !== "compact" && data.length > 0 && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
                                    <Users className="size-3 text-sky-400" />{totals.members.toLocaleString()}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums" style={{ color: activityState(totals.avgActivity).color }}>
                                    <Activity className="size-3" />{Math.round(totals.avgActivity * 100)}% media
                                </span>
                                {totals.thriving > 0 && (
                                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-300 tabular-nums">
                                        <Flame className="size-2.5" />{totals.thriving} vibrantes
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Spotlight — página más activa */}
                        {showSpotlight && mostActive && (() => {
                            const st = activityState(mostActive.activity);
                            return (
                            <motion.div
                                initial={animate ? { opacity: 0, y: -8 } : false}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: animate ? 0.4 : 0, ease: "easeOut" }}
                                className="shrink-0"
                            >
                                <Link href={pageRefHref(mostActive)} className="block cursor-pointer">
                                    <div
                                        className="relative rounded-2xl overflow-hidden px-3 py-2.5 border"
                                        style={{
                                            background: `linear-gradient(135deg, color-mix(in srgb, ${mostActive.accent ?? ACCENT} 20%, transparent), color-mix(in srgb, ${mostActive.accent ?? ACCENT} 6%, transparent))`,
                                            borderColor: `color-mix(in srgb, ${mostActive.accent ?? ACCENT} 35%, transparent)`,
                                        }}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            {/* Avatar grande con pulse ring si actividad vibrante */}
                                            <div className="relative shrink-0">
                                                <div
                                                    className="grid place-items-center size-10 rounded-xl text-white font-black text-sm border"
                                                    style={{
                                                        background: `linear-gradient(135deg, ${mostActive.accent ?? ACCENT}, color-mix(in srgb, ${mostActive.accent ?? ACCENT} 50%, #000))`,
                                                        borderColor: `${mostActive.accent ?? ACCENT}55`,
                                                        boxShadow: `0 0 12px color-mix(in srgb, ${mostActive.accent ?? ACCENT} 40%, transparent)`,
                                                    }}
                                                >
                                                    {mostActive.name.charAt(0)}
                                                </div>
                                                {animate && mostActive.activity >= THRIVING && (
                                                    <motion.span
                                                        animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                                                        transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                                                        className="absolute inset-0 rounded-xl border-2 pointer-events-none"
                                                        style={{ borderColor: mostActive.accent ?? ACCENT }}
                                                    />
                                                )}
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="text-xs font-black truncate" style={{ color: mostActive.accent ?? ACCENT }}>
                                                        {mostActive.name}
                                                    </span>
                                                    <Chip color={mostActive.accent ?? ACCENT}>{KIND_META[mostActive.kind]?.label}</Chip>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                                                        <Users className="size-2.5" />{mostActive.members.toLocaleString()}
                                                    </span>
                                                    <span className="inline-flex items-center gap-0.5 font-black tabular-nums" style={{ color: st.color }}>
                                                        <Activity className="size-2.5" />{Math.round(mostActive.activity * 100)}%
                                                    </span>
                                                    <span className="ml-auto text-[9px] uppercase tracking-wider font-bold inline-flex items-center gap-0.5" style={{ color: st.color }}>
                                                        {st.hot && <Flame className="size-2.5" />}{st.label}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="shrink-0">
                                                <MiniSparkline value={mostActive.activity} color={mostActive.accent ?? ACCENT} id={`${sparkId}-spotlight`} animate={animate} />
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                            );
                        })()}

                        {/* Filtro por kind con badge de conteo */}
                        {showFilter && (
                            <div className="shrink-0 flex items-center gap-1 flex-wrap">
                                {KIND_FILTERS.slice(0, 4).map(k => {
                                    const active = filter === k;
                                    const n = filterCounts[k];
                                    return (
                                        <button key={k} onClick={() => setFilter(k)} aria-pressed={active}
                                            className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${active ? "bg-sky-500/15 border-sky-400/40 text-sky-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"}`}>
                                            {k === "todas" ? "Todas" : KIND_META[k as PageRef["kind"]]?.label}
                                            {n > 0 && <span className="tabular-nums opacity-60">{n}</span>}
                                        </button>
                                    );
                                })}
                                <span className="ml-auto text-[9px] text-muted-foreground/50 font-bold tabular-nums">{filteredPages.length} págs.</span>
                            </div>
                        )}

                        {/* Lista de páginas con entrada escalonada */}
                        <div className="flex-1 min-h-0">
                            <div className="flex flex-col gap-1.5">
                                {filteredPages.slice(0, max).map((pg, idx) => {
                                    const role = ROLE_META[pg.role];
                                    const kind = KIND_META[pg.kind];
                                    const KindIcon = kind.icon;
                                    const RoleIcon = role.icon;
                                    const activityPct = Math.round(pg.activity * 100);
                                    const accentVal = pg.accent ?? ACCENT;
                                    const st = activityState(pg.activity);
                                    return (
                                        <motion.div
                                            key={pg.id}
                                            initial={animate ? { opacity: 0, x: -10 } : false}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0, ease: "easeOut" }}
                                            whileHover={animate ? { scale: 1.01, y: -1 } : undefined}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] transition-shadow"
                                            style={{ ["--hover-glow" as string]: accentVal }}
                                        >
                                            <Link href={pageRefHref(pg)} className="block px-2.5 py-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    {/* Avatar */}
                                                    <div className="shrink-0 relative grid place-items-center size-8 rounded-xl text-white font-black text-xs border"
                                                        style={{ background: `linear-gradient(135deg, ${accentVal}, color-mix(in srgb, ${accentVal} 50%, #000))`, borderColor: `${accentVal}44` }}>
                                                        {pg.name.charAt(0)}
                                                        {/* actividad pulsante si vibrante */}
                                                        {pg.activity >= THRIVING && (
                                                            <motion.span
                                                                animate={animate ? { opacity: [0.5, 1, 0.5] } : undefined}
                                                                transition={{ duration: 2, repeat: Infinity, delay: idx * 0.3 }}
                                                                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 border border-background"
                                                            />
                                                        )}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{pg.name}</span>
                                                            <Chip color={accentVal}>{kind.label}</Chip>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="inline-flex items-center gap-0.5 text-[9px]" style={{ color: role.color }}>
                                                                <RoleIcon className="size-2.5" />{role.label}
                                                            </span>
                                                            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60 tabular-nums">
                                                                <Users className="size-2.5" />{pg.members.toLocaleString()}
                                                            </span>
                                                            <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] font-black tabular-nums" style={{ color: st.color }}>
                                                                <KindIcon className="size-2.5" />{activityPct}%
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Mini sparkline por ítem */}
                                                    <div className="shrink-0 opacity-70">
                                                        <MiniSparkline value={pg.activity} color={accentVal} id={`${sparkId}-${pg.id}`} animate={animate} />
                                                    </div>
                                                </div>

                                                {size.vTier !== "compact" && (
                                                    <div className="mt-1.5">
                                                        <ProgressBar value={pg.activity} color={st.color} height={3} />
                                                    </div>
                                                )}
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                                {filteredPages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
                                        <span className="grid place-items-center size-9 rounded-2xl border border-border/40 bg-muted/20">
                                            <LayoutGrid className="size-4 text-muted-foreground/50" strokeWidth={1.5} />
                                        </span>
                                        <span className="text-xs text-muted-foreground/60">Sin páginas en esta categoría</span>
                                        <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer">
                                            <Plus className="size-3" /> Crear página
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
        </>
    );
}
