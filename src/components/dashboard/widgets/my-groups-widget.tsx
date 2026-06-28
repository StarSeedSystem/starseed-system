"use client";

// ════════════════════════════════════════════════════════════════
// MyGroupsWidget — grupos REALES (os_groups) y mis membresías.
// ----------------------------------------------------------------
// Datos reales EN VIVO: os_groups (catálogo) + os_memberships (mis
// grupos) vía useLiveGroups / useMyMemberships (realtime). Resalta los
// grupos a los que pertenezco; cada tarjeta navega a /grupo/<slug>.
// Cabecera con acción para abrir el Hub. Estado vacío en español con
// CTA para crear el primer grupo. Adaptativo + theme.
// ════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
    Users, Plus, ChevronRight, Landmark, CircleDot, Boxes, Crown, Check, type LucideIcon,
} from "lucide-react";
import { WidgetShell, Chip } from "../kit";
import { useAppearance } from "@/context/appearance-context";
import {
    useLiveGroups, useMyMemberships, useCurrentUid, rowAccent, type OsGroupRow,
} from "@/lib/widget-data/os-live";

const ACCENT = "#10b981";

const KIND_META: Record<string, { icon: LucideIcon; label: string }> = {
    asamblea:  { icon: Landmark,  label: "Asamblea" },
    circulo:   { icon: CircleDot, label: "Círculo" },
    colectivo: { icon: Boxes,     label: "Colectivo" },
};
function kindMeta(kind: string | null) {
    return KIND_META[(kind ?? "").toLowerCase()] ?? { icon: Users, label: kind || "Grupo" };
}

export function MyGroupsWidget() {
    const { config } = useAppearance();
    const prefersReduced = useReducedMotion();
    const animate = config.animations.enabled && !prefersReduced;

    const { uid } = useCurrentUid();
    const { rows: groups, loading } = useLiveGroups();
    const { rows: memberships } = useMyMemberships(uid);

    const mySlugs = useMemo(() => new Set(memberships.map((m) => m.group_slug)), [memberships]);
    const myRoleBySlug = useMemo(() => {
        const m = new Map<string, string>();
        for (const r of memberships) m.set(r.group_slug, r.role ?? "miembro");
        return m;
    }, [memberships]);

    // Mis grupos primero (pertenezco / soy dueño), luego el resto por tamaño.
    const sorted = useMemo(() => {
        const mine: OsGroupRow[] = [];
        const rest: OsGroupRow[] = [];
        for (const g of groups) {
            if (mySlugs.has(g.slug) || (uid && g.owner_id === uid)) mine.push(g);
            else rest.push(g);
        }
        const byMembers = (a: OsGroupRow, b: OsGroupRow) => (b.member_count ?? 0) - (a.member_count ?? 0);
        return [...mine.sort(byMembers), ...rest.sort(byMembers)];
    }, [groups, mySlugs, uid]);

    const myCount = useMemo(
        () => groups.filter((g) => mySlugs.has(g.slug) || (uid && g.owner_id === uid)).length,
        [groups, mySlugs, uid],
    );

    return (
        <WidgetShell
            title="Mis Grupos"
            subtitle="Asambleas · círculos · colectivos"
            icon={Users}
            accent={ACCENT}
            live
            connections={[
                { label: "Hub", href: "/hub", color: "#9FE870" },
                { label: "Conexiones", href: "/conexiones", color: "#38bdf8" },
            ]}
            actions={
                <>
                    <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                        Hub <ChevronRight className="size-3" />
                    </Link>
                    <Link href="/publish?type=group" className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer">
                        <Plus className="size-3" /> Nuevo
                    </Link>
                </>
            }
        >
            {(size) => {
                if (loading && groups.length === 0) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;

                if (groups.length === 0) {
                    return (
                        <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-3">
                            <span className="grid place-items-center size-12 rounded-2xl border border-emerald-400/30 bg-emerald-500/10">
                                <Users className="size-6 text-emerald-300/70" strokeWidth={1.5} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-foreground/90">Aún no hay grupos</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-0.5">Crea el primer colectivo o únete a uno.</p>
                            </div>
                            <Link href="/publish?type=group" className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer">
                                <Plus className="size-3.5" /> Crear grupo
                            </Link>
                        </div>
                    );
                }

                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                if (micro) {
                    const top = sorted[0];
                    const meta = top ? kindMeta(top.kind) : null;
                    const Icon = meta?.icon ?? Users;
                    return (
                        <div className="h-full flex items-center gap-3 px-1">
                            <span className="shrink-0 grid place-items-center size-11 rounded-2xl border text-white font-black"
                                style={{ background: `linear-gradient(135deg, ${rowAccent(top?.accent)}, ${rowAccent(top?.accent)}66)`, borderColor: `${rowAccent(top?.accent)}55` }}>
                                <Icon className="size-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-black truncate" style={{ color: rowAccent(top?.accent) }}>{top?.name ?? "—"}</p>
                                <p className="text-[10px] font-bold text-muted-foreground/70 tabular-nums">{myCount} míos · {groups.length} en red</p>
                            </div>
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        {size.tier !== "compact" && (
                            <div className="shrink-0 flex items-center gap-3 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 tabular-nums">
                                    <Check className="size-3" />{myCount} míos
                                </span>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/70 tabular-nums">
                                    <Users className="size-3" />{groups.length} en la red
                                </span>
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
                            <div className="flex flex-col gap-1.5">
                                {sorted.slice(0, max).map((g, idx) => {
                                    const meta = kindMeta(g.kind);
                                    const Icon = meta.icon;
                                    const accent = rowAccent(g.accent);
                                    const mine = mySlugs.has(g.slug) || (uid && g.owner_id === uid);
                                    const owner = uid && g.owner_id === uid;
                                    return (
                                        <motion.div key={g.id}
                                            initial={animate ? { opacity: 0, x: -10 } : false}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ duration: animate ? 0.3 : 0, delay: animate ? idx * 0.05 : 0 }}
                                            className="rounded-xl border bg-white/[0.02]"
                                            style={{ borderColor: mine ? `${accent}55` : "hsl(var(--border)/0.4)" }}>
                                            <Link href={`/grupo/${g.slug}`} className="block px-2.5 py-2 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <span className="shrink-0 grid place-items-center size-8 rounded-xl border text-white font-black text-xs"
                                                        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}55)`, borderColor: `${accent}44` }}>
                                                        {g.name.charAt(0)}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[11px] @sm:text-xs font-bold truncate">{g.name}</span>
                                                            <Chip color={accent}>{meta.label}</Chip>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-muted-foreground/60">
                                                            <span className="inline-flex items-center gap-0.5 tabular-nums"><Users className="size-2.5" />{(g.member_count ?? 0).toLocaleString()}</span>
                                                            {owner ? (
                                                                <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: "#f59e0b" }}><Crown className="size-2.5" />Fundador</span>
                                                            ) : mine ? (
                                                                <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: accent }}><Check className="size-2.5" />{myRoleBySlug.get(g.slug) ?? "Miembro"}</span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    <Icon className="size-3.5 shrink-0 opacity-50" style={{ color: accent }} />
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
