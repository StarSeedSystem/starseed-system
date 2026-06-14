'use client';

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LayoutGrid, Plus, Users, Crown, Shield, Folder, User, ChevronRight, type LucideIcon } from "lucide-react";
import { WidgetShell, MiniList, ProgressBar, Chip, ProgressRing } from "../kit";
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

// ════════════════════════════════════════════════════════════════
// MyPagesWidget — perfiles, comunidades y entidades del usuario.
// Datos en vivo "social.pages". Filtro local por kind, actividad
// visual, microinteracciones. Adaptativo + theme-aware.
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
    const { data: mockData, loading: mockLoading } = useWidgetData("social.pages", { refreshMs: 12000 });
    const { data: pages, loading: pagesLoading, refetch: refetchPages } = useOsPages();
    const { data: groups, loading: groupsLoading, refetch: refetchGroups } = useOsGroups();
    const [filter, setFilter] = useState<PageRef["kind"] | "todas">("todas");
    const [createOpen, setCreateOpen] = useState(false);

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
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <ProgressRing value={mostActive?.activity ?? 0} size={52} stroke={5} color={ACCENT}
                                label={String(data?.length ?? 0)} sublabel="págs." />
                            <div className="min-w-0 flex-1">
                                {mostActive ? (
                                    <>
                                        <p className="text-[11px] font-black truncate" style={{ color: mostActive.accent ?? ACCENT }}>{mostActive.name}</p>
                                        <p className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{KIND_META[mostActive.kind]?.label}</p>
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

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">

                        {/* Filtro por kind */}
                        {showFilter && (
                            <div className="shrink-0 flex items-center gap-1 flex-wrap">
                                {KIND_FILTERS.slice(0, 4).map(k => (
                                    <button key={k} onClick={() => setFilter(k)}
                                        className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer ${filter === k ? "bg-sky-500/15 border-sky-400/40 text-sky-300" : "border-border/40 text-muted-foreground/60 hover:text-foreground"}`}>
                                        {k === "todas" ? "Todas" : KIND_META[k as PageRef["kind"]]?.label}
                                    </button>
                                ))}
                                <span className="ml-auto text-[9px] text-muted-foreground/50 font-bold tabular-nums">{filteredPages.length} págs.</span>
                            </div>
                        )}

                        {/* Lista de páginas */}
                        <div className="flex-1 min-h-0">
                            <MiniList
                                items={filteredPages}
                                max={max}
                                empty="Sin páginas en esta categoría"
                                render={(pg) => {
                                    const role = ROLE_META[pg.role];
                                    const kind = KIND_META[pg.kind];
                                    const KindIcon = kind.icon;
                                    const RoleIcon = role.icon;
                                    const activityPct = Math.round(pg.activity * 100);
                                    return (
                                        <motion.div
                                            whileHover={{ scale: 1.01 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02] hover:border-sky-400/25 transition-colors"
                                        >
                                          <Link href={pageRefHref(pg)} className="block px-2.5 py-2 cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                {/* Avatar */}
                                                <div className="shrink-0 relative grid place-items-center size-8 rounded-xl text-white font-black text-xs border"
                                                    style={{ background: `linear-gradient(135deg, ${pg.accent}, color-mix(in srgb, ${pg.accent} 50%, #000))`, borderColor: `${pg.accent}44` }}>
                                                    {pg.name.charAt(0)}
                                                    {/* actividad pulsante si > 70% */}
                                                    {pg.activity > 0.7 && (
                                                        <motion.span
                                                            animate={{ opacity: [0.5, 1, 0.5] }}
                                                            transition={{ duration: 2, repeat: Infinity }}
                                                            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 border border-background"
                                                        />
                                                    )}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] @sm:text-xs font-bold truncate">{pg.name}</span>
                                                        <Chip color={pg.accent ?? ACCENT}>{kind.label}</Chip>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="inline-flex items-center gap-0.5 text-[9px]" style={{ color: role.color }}>
                                                            <RoleIcon className="size-2.5" />{role.label}
                                                        </span>
                                                        <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground/60">
                                                            <Users className="size-2.5" />{pg.members.toLocaleString()}
                                                        </span>
                                                        <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] font-black" style={{ color: pg.accent ?? ACCENT }}>
                                                            <KindIcon className="size-2.5" />{activityPct}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {size.vTier !== "compact" && (
                                                <div className="mt-1.5">
                                                    <ProgressBar value={pg.activity} color={pg.accent ?? ACCENT} height={3} />
                                                </div>
                                            )}
                                          </Link>
                                        </motion.div>
                                    );
                                }}
                            />
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
        </>
    );
}
