"use client";

// ════════════════════════════════════════════════════════════════
// FederatedEntitiesWidget — entidades federativas REALES (os_pages).
// ----------------------------------------------------------------
// Datos reales EN VIVO: filtra os_pages por kind ∈ {entidad, pagina,
// proyecto} (las facetas federativas / institucionales de la red) vía
// useLivePages (realtime). Cada tarjeta navega a /pagina/<slug>. Cabecera
// con acción al directorio. Estado vacío en español con CTA para registrar
// la primera entidad federativa. Adaptativo + theme.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Network, Plus, Users, ChevronRight, Landmark, FolderKanban, Building2, type LucideIcon } from "lucide-react";
import { WidgetShell, Chip } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import { useLivePages, rowAccent } from "@/lib/widget-data/os-live";

const ACCENT = "#a855f7";

const KIND_META: Record<string, { icon: LucideIcon; label: string }> = {
    entidad:  { icon: Building2,    label: "Entidad" },
    pagina:   { icon: Landmark,     label: "Federativa" },
    proyecto: { icon: FolderKanban, label: "Proyecto" },
};
function kindMeta(kind: string | null) {
    return KIND_META[(kind ?? "").toLowerCase()] ?? { icon: Network, label: kind || "Entidad" };
}

export function FederatedEntitiesWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { rows, loading } = useLivePages();

    // Entidades federativas = páginas institucionales (no comunidades ni perfiles).
    const entities = useMemo(
        () => rows.filter((p) => {
            const k = (p.kind ?? "").toLowerCase();
            return k === "entidad" || k === "pagina" || k === "proyecto";
        }).sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0)),
        [rows],
    );

    const totalMembers = useMemo(() => entities.reduce((s, e) => s + (e.member_count ?? 0), 0), [entities]);

    return (
        <WidgetShell
            title="Entidades Federativas"
            subtitle="Instituciones · proyectos de la red"
            icon={Network}
            accent={ACCENT}
            live
            connections={[
                { label: "Red", href: "/network", color: "#38bdf8" },
                { label: "Explorar", href: "/explorer", color: "#f59e0b" },
            ]}
            actions={
                <>
                    <Link href="/network" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Red <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/publish?type=page" className="inline-flex items-center gap-1 rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-purple-300 hover:bg-purple-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Registrar
                    </Link>
                </>
            }
        >
            {(size) => {
                if (loading && rows.length === 0) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (entities.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-purple-400/30 bg-purple-500/10">
                                <Building2 className="size-6 text-purple-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay entidades</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Registra la primera entidad federativa.</p>
                            </div>
                            <Link href="/publish?type=page" className="inline-flex items-center gap-1.5 rounded-full border border-purple-400/40 bg-purple-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-purple-300 hover:bg-purple-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Registrar entidad
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                if (micro) {
                    const top = entities[0];
                    const meta = kindMeta(top?.kind ?? null);
                    const Icon = meta.icon;
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <span className="shrink-0 grid place-items-center size-11 rounded-2xl border text-white"
                                style={{ background: `linear-gradient(135deg, ${rowAccent(top?.accent)}, ${rowAccent(top?.accent)}66)`, borderColor: `${rowAccent(top?.accent)}55` }}>
                                <Icon className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                {top && (
                                    <Link href={`/pagina/${top.slug}`} className="block cursor-pointer">
                                        <p className="text-[11px] font-black truncate" style={{ color: rowAccent(top.accent) }}>{top.name}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground/70 tabular-nums">{entities.length} entidades</p>
                                    </Link>
                                )}
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-300 tabular-nums">
                                    <Network className="size-3" />{entities.length} entidades
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
                                    <Users className="size-3" />{totalMembers.toLocaleString()} miembros
                                </span>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {entities.slice(0, max).map((e, idx) => {
                                    const meta = kindMeta(e.kind);
                                    const Icon = meta.icon;
                                    const accent = rowAccent(e.accent);
                                    return (
                                        <motion.div key={e.id}
                                            initial={animate ? { opacity: 0, x: -10 } : false}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0 }}
                                            className="rounded-xl border border-border/40 bg-white/[0.02]">
                                            <Link href={`/pagina/${e.slug}`} className="block px-2.5 py-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <span className="shrink-0 grid place-items-center size-8 rounded-xl border text-white"
                                                        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}55)`, borderColor: `${accent}44` }}>
                                                        <Icon className="size-4" />
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{e.name}</span>
                                                            <Chip color={accent}>{meta.label}</Chip>
                                                        </div>
                                                        {e.description && <p className="text-[9px] text-muted-foreground/60 truncate mt-0.5">{e.description}</p>}
                                                    </div>
                                                    <span className="shrink-0 text-[9px] font-black tabular-nums inline-flex items-center gap-0.5" style={{ color: accent }}>
                                                        <Users className="size-2.5" />{(e.member_count ?? 0).toLocaleString()}
                                                    </span>
                                                </div>
                                            </Link>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
