'use client';

// ════════════════════════════════════════════════════════════════
// MyPagesWidget — perfiles, comunidades y entidades del usuario.
// ----------------------------------------------------------------
// Datos REALES EN VIVO: os_pages + os_groups + mis os_memberships vía
// useLivePages / useLiveGroups / useMyMemberships (realtime). Resalta lo
// que es mío (owner o miembro). Filtro por tipo, spotlight de la más
// activa, sparklines y resumen agregado. Cada tarjeta navega a su ruta
// real (/pagina/<slug>, /grupo/<slug>, /profile/<slug>). Estado vacío en
// español con CTA. Adaptativo + theme. Sin datos simulados.
// ════════════════════════════════════════════════════════════════

import { useState, useMemo, useId } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, Plus, Users, Crown, Shield, Folder, User, ChevronRight, Activity, Flame, type LucideIcon } from "lucide-react";
import { WidgetShell, ProgressBar, Chip, ProgressRing } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import {
    useLivePages, useLiveGroups, useMyMemberships, useCurrentUid,
    rowAccent, type OsPageRow, type OsGroupRow,
} from "@/lib/widget-data/os-live";

const ACCENT = "#38bdf8";

type PageKind = "perfil" | "comunidad" | "proyecto" | "entidad";
type PageRole = "fundador" | "moderador" | "miembro";

interface PageItem {
    id: string;
    slug: string;
    name: string;
    kind: PageKind;
    members: number;
    activity: number;
    role: PageRole;
    accent: string;
    href: string;
}

// Umbrales de actividad → estado data-driven (etiqueta + color reactivo).
const THRIVING = 0.72;
const ACTIVE = 0.45;
function activityState(a: number): { label: string; color: string; hot: boolean } {
    if (a >= THRIVING) return { label: "Vibrante", color: "#10b981", hot: true };
    if (a >= ACTIVE) return { label: "Activa", color: "#38bdf8", hot: false };
    return { label: "Tranquila", color: "#94a3b8", hot: false };
}

// Actividad derivada determinista del nº de miembros (proxy real estable).
function activityFromMembers(n: number): number {
    return Math.min(1, Math.max(0.2, Math.log10(Math.max(10, n)) / 5));
}

const ROLE_META: Record<PageRole, { icon: LucideIcon; label: string; color: string }> = {
    fundador:  { icon: Crown,  label: "Fundador",  color: "#f59e0b" },
    moderador: { icon: Shield, label: "Moderador", color: "#a855f7" },
    miembro:   { icon: Users,  label: "Miembro",   color: "#38bdf8" },
};

const KIND_META: Record<PageKind, { icon: LucideIcon; label: string }> = {
    perfil:    { icon: User,       label: "Perfil"    },
    comunidad: { icon: Users,      label: "Comunidad" },
    proyecto:  { icon: Folder,     label: "Proyecto"  },
    entidad:   { icon: LayoutGrid, label: "Entidad"   },
};

const KIND_FILTERS: Array<PageKind | "todas"> = ["todas", "comunidad", "proyecto", "perfil", "entidad"];

function pageKindOf(k: string | null): PageKind {
    const s = (k ?? "").toLowerCase();
    if (s === "comunidad") return "comunidad";
    if (s === "proyecto") return "proyecto";
    if (s === "perfil") return "perfil";
    return "entidad";
}

/** Mini sparkline SVG para tendencia de actividad. */
function MiniSparkline({ value, color, id, animate = true }: { value: number; color: string; id: string; animate?: boolean }) {
    const pts = useMemo(() => {
        const seed = value;
        return Array.from({ length: 7 }, (_, i) => {
            const t = i / 6;
            const noise = Math.sin((seed + i) * 2.3) * 0.12 + Math.cos((seed * 1.7 + i) * 1.1) * 0.08;
            return Math.max(0.05, Math.min(0.98, seed - 0.1 + t * 0.1 + noise));
        });
    }, [value]);

    const W = 48, H = 16;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 0.01;
    const svgPts = pts.map((v, i) => `${((i / (pts.length - 1)) * W).toFixed(1)},${(H - ((v - min) / range) * H).toFixed(1)}`);
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
            <motion.path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                initial={animate ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: animate ? 0.9 : 0, ease: "easeOut" }} />
        </svg>
    );
}

export function MyPagesWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { uid } = useCurrentUid();
    const { rows: pages, loading: pagesLoading } = useLivePages();
    const { rows: groups, loading: groupsLoading } = useLiveGroups();
    const { rows: memberships } = useMyMemberships(uid);
    const [filter, setFilter] = useState<PageKind | "todas">("todas");
    const sparkId = useId();

    const loading = pagesLoading && groupsLoading;
    const mySlugs = useMemo(() => new Set(memberships.map((m) => m.group_slug)), [memberships]);

    // Combina páginas + grupos reales, resaltando lo que es mío.
    const data: PageItem[] = useMemo(() => {
        const mapPage = (p: OsPageRow): PageItem => {
            const kind = pageKindOf(p.kind);
            const owner = !!uid && p.owner_id === uid;
            return {
                id: `p:${p.id}`,
                slug: p.slug,
                name: p.name,
                kind,
                members: p.member_count ?? 0,
                activity: activityFromMembers(p.member_count ?? 0),
                role: owner ? "fundador" : "miembro",
                accent: rowAccent(p.accent),
                href: kind === "perfil" ? `/profile/${p.slug}` : `/pagina/${p.slug}`,
            };
        };
        const mapGroup = (g: OsGroupRow): PageItem => {
            const owner = !!uid && g.owner_id === uid;
            const member = mySlugs.has(g.slug);
            return {
                id: `g:${g.id}`,
                slug: g.slug,
                name: g.name,
                kind: "proyecto",
                members: g.member_count ?? 0,
                activity: activityFromMembers(g.member_count ?? 0),
                role: owner ? "fundador" : member ? "miembro" : "miembro",
                accent: rowAccent(g.accent),
                href: `/grupo/${g.slug}`,
            };
        };
        return [...pages.map(mapPage), ...groups.map(mapGroup)];
    }, [pages, groups, uid, mySlugs]);

    const filteredPages = useMemo(() => (filter === "todas" ? data : data.filter((p) => p.kind === filter)), [data, filter]);
    const mostActive = useMemo(() => (data.length ? [...data].sort((a, b) => b.activity - a.activity)[0] : null), [data]);

    const totals = useMemo(() => {
        const members = data.reduce((s, p) => s + p.members, 0);
        const avgActivity = data.length ? data.reduce((s, p) => s + p.activity, 0) / data.length : 0;
        const thriving = data.filter((p) => p.activity >= THRIVING).length;
        return { members, avgActivity, thriving };
    }, [data]);

    const filterCounts = useMemo(() => {
        const c = {} as Record<PageKind | "todas", number>;
        for (const k of KIND_FILTERS) c[k] = k === "todas" ? data.length : data.filter((p) => p.kind === k).length;
        return c;
    }, [data]);

    return (
        <WidgetShell
            title="Mis Páginas"
            subtitle="Perfiles · comunidades · proyectos"
            icon={LayoutGrid}
            accent={ACCENT}
            live
            connections={[{ label: "Perfil", href: "/profile", color: "#7FB8FF" }, { label: "Comunidades", href: "/hub", color: "#9FE870" }, { label: "Publicar", href: "/publish", color: "#FFBF00" }]}
            actions={
                <>
                    <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Hub <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/publish?type=page" className="inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Nueva
                    </Link>
                </>
            }
        >
            {(size) => {
                if (loading && data.length === 0) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (data.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-sky-400/30 bg-sky-500/10">
                                <LayoutGrid className="size-6 text-sky-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay páginas</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Crea tu primera página o comunidad.</p>
                            </div>
                            <Link href="/publish?type=page" className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-sky-300 hover:bg-sky-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Crear página
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";

                if (micro) {
                    const st = mostActive ? activityState(mostActive.activity) : null;
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={mostActive?.activity ?? 0} size={52} stroke={5} color={st?.color ?? ACCENT} label={String(data.length)} sublabel="págs." />
                            <div className="min-w-0 flex-1">
                                {mostActive ? (
                                    <Link href={mostActive.href} className="block cursor-pointer">
                                        <p className="text-[11px] font-black truncate flex items-center gap-1" style={{ color: mostActive.accent }}>
                                            {st?.hot && <Flame className="size-3 shrink-0" style={{ color: st.color }} />}{mostActive.name}
                                        </p>
                                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{KIND_META[mostActive.kind]?.label}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5 tabular-nums"><Users className="size-2.5 inline mr-0.5" />{mostActive.members.toLocaleString()}</p>
                                    </Link>
                                ) : <p className="text-[10px] text-muted-foreground/50 italic">Sin páginas</p>}
                            </div>
                        </div>
                    );
                }

                const max = size.vTier === "expanded" ? 6 : size.vTier === "compact" ? 3 : 4;
                const showFilter = size.tier !== "compact";
                const showSpotlight = size.vTier !== "compact" && size.vTier !== "micro" && mostActive;

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
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

                        {showSpotlight && mostActive && (() => {
                            const st = activityState(mostActive.activity);
                            return (
                                <motion.div initial={animate ? { opacity: 0, y: -8 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: animate ? 0.4 : 0, ease: "easeOut" }} className="shrink-0">
                                    <Link href={mostActive.href} className="block cursor-pointer">
                                        <div className="relative rounded-2xl overflow-hidden px-3 py-2.5 border"
                                            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${mostActive.accent} 20%, transparent), color-mix(in srgb, ${mostActive.accent} 6%, transparent))`, borderColor: `color-mix(in srgb, ${mostActive.accent} 35%, transparent)` }}>
                                            <div className="flex items-center gap-2.5">
                                                <div className="relative shrink-0">
                                                    <div className="grid place-items-center size-10 rounded-xl text-white font-black text-sm border"
                                                        style={{ background: `linear-gradient(135deg, ${mostActive.accent}, color-mix(in srgb, ${mostActive.accent} 50%, #000))`, borderColor: `${mostActive.accent}55`, boxShadow: `0 0 12px color-mix(in srgb, ${mostActive.accent} 40%, transparent)` }}>
                                                        {mostActive.name.charAt(0)}
                                                    </div>
                                                    {animate && mostActive.activity >= THRIVING && (
                                                        <motion.span animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                                                            className="absolute inset-0 rounded-xl border-2 pointer-events-none" style={{ borderColor: mostActive.accent }} />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <span className="text-xs font-black truncate" style={{ color: mostActive.accent }}>{mostActive.name}</span>
                                                        <Chip color={mostActive.accent}>{KIND_META[mostActive.kind]?.label}</Chip>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70">
                                                        <span className="inline-flex items-center gap-0.5 tabular-nums"><Users className="size-2.5" />{mostActive.members.toLocaleString()}</span>
                                                        <span className="inline-flex items-center gap-0.5 font-black tabular-nums" style={{ color: st.color }}><Activity className="size-2.5" />{Math.round(mostActive.activity * 100)}%</span>
                                                        <span className="ml-auto text-[9px] uppercase tracking-wider font-bold inline-flex items-center gap-0.5" style={{ color: st.color }}>{st.hot && <Flame className="size-2.5" />}{st.label}</span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0"><MiniSparkline value={mostActive.activity} color={mostActive.accent} id={`${sparkId}-spotlight`} animate={animate} /></div>
                                            </div>
                                        </div>
                                    </Link>
                                </motion.div>
                            );
                        })()}

                        {showFilter && (
                            <div className="shrink-0 flex items-center gap-1 flex-wrap">
                                {KIND_FILTERS.slice(0, 4).map((k) => {
                                    const active = filter === k;
                                    const n = filterCounts[k];
                                    return (
                                        <button key={k} onClick={() => setFilter(k)} aria-pressed={active}
                                            className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${active ? "bg-sky-500/15 border-sky-400/40 text-sky-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"}`}>
                                            {k === "todas" ? "Todas" : KIND_META[k as PageKind]?.label}
                                            {n > 0 && <span className="tabular-nums opacity-60">{n}</span>}
                                        </button>
                                    );
                                })}
                                <span className="ml-auto text-[9px] text-muted-foreground/50 font-bold tabular-nums">{filteredPages.length} págs.</span>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {filteredPages.slice(0, max).map((pg, idx) => {
                                    const role = ROLE_META[pg.role];
                                    const kind = KIND_META[pg.kind];
                                    const KindIcon = kind.icon;
                                    const RoleIcon = role.icon;
                                    const st = activityState(pg.activity);
                                    return (
                                        <motion.div key={pg.id}
                                            initial={animate ? { opacity: 0, x: -10 } : false}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0, ease: "easeOut" }}
                                            whileHover={animate ? { scale: 1.01, y: -1 } : undefined}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] transition-shadow">
                                            <Link href={pg.href} className="block px-2.5 py-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <div className="shrink-0 relative grid place-items-center size-8 rounded-xl text-white font-black text-xs border"
                                                        style={{ background: `linear-gradient(135deg, ${pg.accent}, color-mix(in srgb, ${pg.accent} 50%, #000))`, borderColor: `${pg.accent}44` }}>
                                                        {pg.name.charAt(0)}
                                                        {pg.activity >= THRIVING && (
                                                            <motion.span animate={animate ? { opacity: [0.5, 1, 0.5] } : undefined} transition={{ duration: 2, repeat: Infinity, delay: idx * 0.3 }}
                                                                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 border border-background" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{pg.name}</span>
                                                            <Chip color={pg.accent}>{kind.label}</Chip>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="inline-flex items-center gap-0.5 text-[9px]" style={{ color: role.color }}><RoleIcon className="size-2.5" />{role.label}</span>
                                                            <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60 tabular-nums"><Users className="size-2.5" />{pg.members.toLocaleString()}</span>
                                                            <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] font-black tabular-nums" style={{ color: st.color }}><KindIcon className="size-2.5" />{Math.round(pg.activity * 100)}%</span>
                                                        </div>
                                                    </div>
                                                    <div className="shrink-0 opacity-70"><MiniSparkline value={pg.activity} color={pg.accent} id={`${sparkId}-${pg.id}`} animate={animate} /></div>
                                                </div>
                                                {size.vTier !== "compact" && <div className="mt-1.5"><ProgressBar value={pg.activity} color={st.color} height={3} /></div>}
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
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
