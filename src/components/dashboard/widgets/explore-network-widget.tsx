'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp, ChevronRight, Users, Telescope, Globe, Landmark, Vote, BookOpen, Palette, Building2, Flame, Sparkles, Check, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressBar, ProgressRing } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useWidgetData } from "@/lib/widget-data";
import type { NetworkEntity } from "@/lib/widget-data";
import { widgetEntityHref } from "@/lib/entity-links";
import { useOsPages, useOsGroups } from "@/hooks/use-os-entities";
import { setFollow, setMembership } from "@/lib/os-social";
import type { OsPage, OsGroup } from "@/lib/os-social";
import { listPartidos, listFederativeEntities } from "@/data/sample-governance";
import { samplePages, sampleGroups } from "@/data/sample-entities";

// ════════════════════════════════════════════════════════════════
// ExploreNetworkWidget — comunidades y entidades en tendencia.
// Datos en vivo "social.entities". Lista de momentum + filtro kind.
// Diseño data-driven: el momentum tiñe acentos, marca "candentes" (🔥),
// y la cabecera muestra el pulso de tendencias (mini-distribución).
// Adaptativo + theme-aware. Accent "#f59e0b". Link a /explorer.
// ════════════════════════════════════════════════════════════════

const ACCENT = "#f59e0b";

// Umbrales de momentum → estado data-driven (color + etiqueta + icono).
const HOT = 0.78;     // candente
const RISING = 0.55;  // en ascenso

const KIND_META: Record<NetworkEntity["kind"], { label: string; icon: LucideIcon }> = {
    comunidad:  { label: "Comunidad",  icon: Users },
    sangha:     { label: "Sangha",     icon: Globe },
    colectivo:  { label: "Colectivo",  icon: Palette },
    biorregion: { label: "Biorregión", icon: Landmark },
};

// Extended filter tabs including governance types
type FilterKind = NetworkEntity["kind"] | "todas" | "partido" | "entidad";

const FILTER_KEYS: FilterKind[] = ["todas", "comunidad", "sangha", "colectivo", "biorregion", "partido", "entidad"];

const FILTER_META: Record<FilterKind, { label: string; icon: LucideIcon }> = {
    todas:     { label: "Todo",       icon: Globe },
    comunidad: { label: "Comunidad",  icon: Users },
    sangha:    { label: "Sangha",     icon: Globe },
    colectivo: { label: "Colectivo",  icon: Palette },
    biorregion:{ label: "Biorregión", icon: Landmark },
    partido:   { label: "Partido",    icon: Vote },
    entidad:   { label: "E.F.",       icon: Building2 },
};

interface RichEntity extends NetworkEntity {
    href: string;
    typeLabel: string;
    typeIcon: LucideIcon;
    filterKind: FilterKind;
}

/** Deriva el `kind` de widget a partir de una página/grupo OS. */
function entityKindFromOs(name: string, tags: string[], isGroup: boolean): NetworkEntity["kind"] {
    const hay = `${name} ${tags.join(" ")}`.toLowerCase();
    if (/biorregi/.test(hay)) return "biorregion";
    if (/sangha/.test(hay)) return "sangha";
    if (isGroup || /colectiv/.test(hay)) return "colectivo";
    return "comunidad";
}

/** Momentum sintético estable 0..1 a partir del nº de miembros (log-escala). */
function synthMomentum(members: number): number {
    const v = Math.log10(Math.max(10, members)) / 5; // ~0.2..1
    return Math.min(1, Math.max(0.15, v));
}

/** Estado de tendencia derivado del momentum (diseño reactivo a datos). */
function momentumState(m: number): { label: string; color: string; hot: boolean; rising: boolean } {
    if (m >= HOT) return { label: "Candente", color: "#fb7185", hot: true, rising: true };
    if (m >= RISING) return { label: "En ascenso", color: "#10b981", hot: false, rising: true };
    return { label: "Estable", color: "#94a3b8", hot: false, rising: false };
}

function osToEntity(p: OsPage | OsGroup, isGroup: boolean): NetworkEntity {
    return {
        id: `${isGroup ? "g" : "p"}:${p.slug}`,
        name: p.name,
        kind: entityKindFromOs(p.name, p.tags, isGroup),
        momentum: synthMomentum(p.memberCount),
        members: p.memberCount,
        focus: p.description?.slice(0, 80) || (isGroup ? "Colectivo de la Red" : "Entidad de la Red"),
        accent: p.accent,
    };
}

// Build rich entities from sample governance + sample entity data (always available)
function buildRichEntities(): RichEntity[] {
    const result: RichEntity[] = [];

    // From parties → /partido/<slug>
    for (const p of listPartidos()) {
        result.push({
            id: `partido:${p.slug}`,
            name: p.name,
            kind: "colectivo",
            filterKind: "partido",
            momentum: synthMomentum(p.members),
            members: p.members,
            focus: p.ideology,
            accent: p.accent,
            href: `/partido/${p.slug}`,
            typeLabel: "Partido",
            typeIcon: Vote,
        });
    }

    // From federative entities → /entidad/<slug>
    for (const ef of listFederativeEntities()) {
        result.push({
            id: `ef:${ef.slug}`,
            name: ef.name,
            kind: "biorregion",
            filterKind: "entidad",
            momentum: synthMomentum(ef.citizens),
            members: ef.citizens,
            focus: ef.blurb.slice(0, 80),
            accent: ef.accent,
            href: `/entidad/${ef.slug}`,
            typeLabel: "E.F.",
            typeIcon: Building2,
        });
    }

    // From samplePages (comunidades / sanghas)
    for (const p of samplePages) {
        const kf: FilterKind = p.kind === "comunidad" ? "comunidad" : "sangha";
        result.push({
            id: `page:${p.id}`,
            name: p.title,
            kind: p.kind === "comunidad" ? "comunidad" : "sangha",
            filterKind: kf,
            momentum: synthMomentum(p.members),
            members: p.members,
            focus: p.description.slice(0, 80),
            accent: p.accent,
            href: `/pagina/${p.id}`,
            typeLabel: p.kind === "comunidad" ? "Comunidad" : "Sangha",
            typeIcon: KIND_META[p.kind === "comunidad" ? "comunidad" : "sangha"].icon,
        });
    }

    // From sampleGroups (colectivos / círculos)
    for (const g of sampleGroups) {
        result.push({
            id: `group:${g.id}`,
            name: g.name,
            kind: "colectivo",
            filterKind: "colectivo",
            momentum: synthMomentum(g.members),
            members: g.members,
            focus: g.description.slice(0, 80),
            accent: g.accent,
            href: `/grupo/${g.id}`,
            typeLabel: g.kind === "asamblea" ? "Asamblea" : g.kind === "colectivo" ? "Colectivo" : "Círculo",
            typeIcon: g.kind === "asamblea" ? Landmark : g.kind === "colectivo" ? Palette : BookOpen,
        });
    }

    return result;
}

export function ExploreNetworkWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    // Datos simulados como último recurso; las entidades reales vienen de Supabase.
    const { data: mockData, loading: mockLoading } = useWidgetData("social.entities", { refreshMs: 6000 });
    const { data: pages, loading: pagesLoading } = useOsPages();
    const { data: groups, loading: groupsLoading } = useOsGroups();
    const [filter, setFilter] = useState<FilterKind>("todas");
    const [joined, setJoined] = useState<Set<string>>(new Set());

    const loading = (pagesLoading || groupsLoading) && (mockLoading && !mockData);

    // Rich entities from governance + sample data (SSR-safe, deterministic)
    const richEntities = useMemo(() => buildRichEntities(), []);

    // Combina páginas + grupos reales (o de ejemplo) en entidades de la red.
    const data: NetworkEntity[] = useMemo(() => {
        const fromPages = (pages ?? []).map((p) => osToEntity(p, false));
        const fromGroups = (groups ?? []).map((g) => osToEntity(g, true));
        const combined = [...fromPages, ...fromGroups];
        if (combined.length > 0) return combined;
        return mockData ?? [];
    }, [pages, groups, mockData]);

    // Resuelve el slug real de una entidad combinada para persistir la acción.
    const entitySlug = (id: string) => id.replace(/^[pg]:/, "");
    const entityIsGroup = (id: string) => id.startsWith("g:");

    // Use richEntities as primary; fall back to widget data entities if no OS data
    const displayEntities = richEntities.length > 0 ? richEntities : (data ?? []).map(e => ({
        ...e,
        filterKind: e.kind as FilterKind,
        href: widgetEntityHref(e.name, e.kind),
        typeLabel: KIND_META[e.kind]?.label ?? e.kind,
        typeIcon: KIND_META[e.kind]?.icon ?? Globe,
    })) as RichEntity[];

    const sorted = useMemo(() => {
        const filtered = filter === "todas"
            ? displayEntities
            : displayEntities.filter(e => e.filterKind === filter);
        return [...filtered].sort((a, b) => b.momentum - a.momentum);
    }, [displayEntities, filter]);

    const top = sorted[0];
    const totalMembers = displayEntities.reduce((acc, e) => acc + e.members, 0);
    // Métricas data-driven para la cabecera: cuántas candentes / en ascenso.
    const hotCount = useMemo(() => displayEntities.filter(e => e.momentum >= HOT).length, [displayEntities]);
    // Conteos por filtro (se muestran como badge en cada pestaña).
    const filterCounts = useMemo(() => {
        const c = {} as Record<FilterKind, number>;
        for (const k of FILTER_KEYS) c[k] = k === "todas" ? displayEntities.length : displayEntities.filter(e => e.filterKind === k).length;
        return c;
    }, [displayEntities]);

    return (
        <WidgetShell
            title="Explorar Red"
            subtitle="Entidades en tendencia"
            icon={Telescope}
            accent={ACCENT}
            connections={[{ label: "Gráfica Viva", href: "/network/graph", color: "#6366f1" }, { label: "Comunidades", href: "/hub", color: "#9FE870" }, { label: "Política", href: "/network/politics", color: "#DC143C" }, { label: "Explorer", href: "/explorer", color: "#22d3ee" }]}
            live
            actions={
                <Link href="/explorer" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Explorer <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && displayEntities.length === 0) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                const micro = size.tier === "micro" || size.vTier === "micro";

                // ── Micro: top entidad + ring de momentum ──────────
                if (micro) {
                    if (!top) return <div className="h-full grid place-items-center text-xs text-muted-foreground/50 italic">Sin entidades</div>;
                    const TopIcon = top.typeIcon ?? Globe;
                    const st = momentumState(top.momentum);
                    return (
                        <Link href={top.href} className="h-full flex items-center gap-3 px-1 cursor-pointer">
                            <ProgressRing value={top.momentum} size={52} stroke={5} color={st.color}
                                label={`${Math.round(top.momentum * 100)}%`} sublabel="mom." />
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate flex items-center gap-1" style={{ color: top.accent ?? ACCENT }}>
                                    {st.hot && <Flame className="size-3 shrink-0" style={{ color: st.color }} />}{top.name}
                                </p>
                                <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wide truncate inline-flex items-center gap-0.5">
                                    <TopIcon className="size-2.5" />{top.typeLabel}
                                </p>
                                <p className="text-[10px] font-bold text-muted-foreground/70 mt-0.5 tabular-nums">
                                    <Users className="size-2.5 inline mr-0.5" />{top.members.toLocaleString()}
                                </p>
                            </div>
                        </Link>
                    );
                }

                const maxItems = size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 3 : 4;
                const showFilter = size.tier !== "compact" && size.vTier !== "compact";
                // Show at most 4 filter tabs in compact layouts, all 7 in expanded
                const filterTabsVisible = size.vTier === "expanded" ? FILTER_KEYS : FILTER_KEYS.slice(0, 4);

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">

                        {/* Cabecera: conteo total + pulso de tendencias + filtro kind */}
                        <div className="shrink-0 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider tabular-nums" style={{ color: ACCENT }}>
                                    <Globe className="size-3" /> {displayEntities.length} entidades · {totalMembers.toLocaleString()} miembros
                                </span>
                                {hotCount > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-rose-300 tabular-nums">
                                        <Flame className="size-2.5" />{hotCount} candentes
                                    </span>
                                )}
                            </div>
                            {showFilter && (
                                <div className="flex items-center gap-1 flex-wrap">
                                    {filterTabsVisible.map(k => {
                                        const FIcon = FILTER_META[k].icon;
                                        const n = filterCounts[k];
                                        const active = filter === k;
                                        return (
                                            <button key={k} onClick={() => setFilter(k)} aria-pressed={active}
                                                className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${active ? "border-amber-500/40 bg-amber-500/15 text-amber-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground hover:border-border/70"}`}>
                                                <FIcon className="size-2.5" />{FILTER_META[k].label}
                                                {n > 0 && <span className="tabular-nums opacity-60">{n}</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Lista de entidades */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={sorted}
                                max={maxItems}
                                empty={filter === "todas" ? "Sin entidades en tendencia" : "Sin entidades de este tipo"}
                                render={(e) => {
                                    const isJoined = joined.has(e.id);
                                    const EIcon = (e as RichEntity).typeIcon ?? KIND_META[e.kind]?.icon ?? Globe;
                                    const eHref = (e as RichEntity).href ?? widgetEntityHref(e.name, e.kind);
                                    const eLabel = (e as RichEntity).typeLabel ?? KIND_META[e.kind]?.label ?? e.kind;
                                    const st = momentumState(e.momentum);
                                    return (
                                        <motion.div
                                            whileHover={animate ? { scale: 1.01 } : undefined}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] hover:border-amber-500/25 hover:bg-white/[0.04] transition-all"
                                            style={st.hot ? { boxShadow: `inset 2px 0 0 ${st.color}` } : undefined}
                                        >
                                          <Link href={eHref} className="block px-2.5 py-2 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                {/* Avatar inicial */}
                                                <div className="shrink-0 grid place-items-center size-7 rounded-lg text-[11px] font-black text-white"
                                                    style={{ background: `linear-gradient(135deg, ${e.accent}, color-mix(in srgb, ${e.accent} 50%, #000))` }}>
                                                    {e.name.charAt(0)}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] @sm:text-xs font-bold truncate">{e.name}</span>
                                                        {st.hot && <Flame className="size-3 shrink-0" style={{ color: st.color }} />}
                                                        <Chip color={e.accent ?? ACCENT}>
                                                            <EIcon className="size-2 inline mr-0.5" />{eLabel}
                                                        </Chip>
                                                    </div>
                                                    <p className="text-[9px] text-muted-foreground/60 truncate leading-tight">{e.focus}</p>
                                                </div>

                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-black tabular-nums" style={{ color: st.color }} title={st.label}>
                                                        <TrendingUp className="size-2.5" />{Math.round(e.momentum * 100)}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(ev) => {
                                                            ev.preventDefault();
                                                            ev.stopPropagation();
                                                            const willJoin = !isJoined;
                                                            setJoined(prev => {
                                                                const next = new Set(prev);
                                                                willJoin ? next.add(e.id) : next.delete(e.id);
                                                                return next;
                                                            });
                                                            const slug = entitySlug(e.id);
                                                            const persist = entityIsGroup(e.id)
                                                                ? setMembership(slug, willJoin)
                                                                : setFollow(slug, willJoin);
                                                            persist.then((res) => {
                                                                if (!res.ok) {
                                                                    setJoined(prev => {
                                                                        const next = new Set(prev);
                                                                        willJoin ? next.delete(e.id) : next.add(e.id);
                                                                        return next;
                                                                    });
                                                                }
                                                            });
                                                        }}
                                                        aria-pressed={isJoined}
                                                        className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide transition-colors cursor-pointer ${isJoined ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"}`}
                                                    >
                                                        {isJoined ? <><Check className="size-2.5" />Miembro</> : "Unirse"}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="mt-1.5 flex items-center gap-2">
                                                <div className="flex-1"><ProgressBar value={e.momentum} color={st.color} height={3} /></div>
                                                <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60 tabular-nums">
                                                    <Users className="size-2.5" />{e.members.toLocaleString()}
                                                </span>
                                            </div>
                                          </Link>
                                        </motion.div>
                                    );
                                }}
                            />
                        </div>

                        {/* Footer expandido: top entidad destacada con link real */}
                        {size.vTier === "expanded" && top && (() => {
                            const st = momentumState(top.momentum);
                            return (
                                <Link href={top.href} className="shrink-0 rounded-xl border px-2.5 py-1.5 cursor-pointer hover:opacity-80 transition-opacity" style={{ borderColor: `color-mix(in srgb, ${top.accent} 25%, transparent)`, background: `color-mix(in srgb, ${top.accent} 5%, transparent)` }}>
                                    <span className="text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1" style={{ color: top.accent }}>
                                        {st.hot ? <Flame className="size-2.5" /> : <Sparkles className="size-2.5" />} Top momentum · {st.label}
                                    </span>
                                    <p className="text-[11px] font-semibold leading-snug truncate">{top.name} — {top.focus}</p>
                                </Link>
                            );
                        })()}
                    </div>
                );
            }}
        </WidgetShell>
    );
}
