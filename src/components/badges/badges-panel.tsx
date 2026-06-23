"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge as UiBadge } from "@/components/ui/badge";
import * as Icons from "lucide-react";
import { Award, Lock, Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/lib/realtime/realtime";
import {
    listBadges,
    badgesForProfile,
    myProfileId,
    type Badge,
    type ProfileBadge,
} from "@/lib/badges/badges";

// Orden y etiquetas de las áreas del catálogo.
const AREA_ORDER: Array<{ key: string; label: string; hint: string }> = [
    { key: "general", label: "General", hint: "Reputación y participación transversal." },
    { key: "politica", label: "Política", hint: "Gobernanza, propuestas y mediación." },
    { key: "educacion", label: "Educación", hint: "Conocimiento, cursos y mentoría." },
    { key: "cultura", label: "Cultura", hint: "Creación, comunidad y expresión." },
];

function normArea(area: string | null | undefined): string {
    const a = (area ?? "general").toLowerCase();
    return AREA_ORDER.some((x) => x.key === a) ? a : "general";
}

// Icono de la insignia (lucide por nombre, fallback Award).
function BadgeIcon({ icon, className }: { icon: string | null; className?: string }) {
    if (icon) {
        const key = icon.charAt(0).toUpperCase() + icon.slice(1);
        const Cmp = (Icons as any)[key] ?? (Icons as any)[icon];
        if (Cmp) return <Cmp className={className} />;
    }
    return <Award className={className} />;
}

export default function BadgesPanel() {
    const [profileId, setProfileId] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<Badge[]>([]);
    const [owned, setOwned] = useState<ProfileBadge[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        try {
            const [pid, all] = await Promise.all([myProfileId(), listBadges()]);
            setProfileId(pid);
            setCatalog(Array.isArray(all) ? all : []);
            const mine = await badgesForProfile(pid);
            setOwned(Array.isArray(mine) ? mine : []);
        } catch {
            /* tolerante a fallos */
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    // Tiempo real: si cambian mis insignias, refrescamos catálogo+ganadas.
    useRealtime(
        "profile_badges",
        { filter: profileId ? `profile_id=eq.${profileId}` : undefined },
        () => {
            void reload();
        },
    );

    const ownedIds = useMemo(
        () => new Set(owned.map((b) => b.id)),
        [owned],
    );

    // Agrupa el catálogo por área respetando el orden definido.
    const grouped = useMemo(() => {
        const map: Record<string, Badge[]> = {};
        for (const b of catalog) {
            const a = normArea(b.area);
            (map[a] ||= []).push(b);
        }
        return map;
    }, [catalog]);

    const total = catalog.length;
    const earned = catalog.filter((b) => ownedIds.has(b.id)).length;

    return (
        <div className="flex flex-col gap-6">
            {/* ── Cabecera: mérito ⇒ capacidades ── */}
            <GlassCard intensity="medium" className="rounded-2xl border p-6">
                <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                        <Trophy className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="font-headline text-2xl font-semibold">Insignias y Logros</h1>
                        <p className="max-w-2xl text-sm text-muted-foreground">
                            El mérito en StarSeed se reconoce con <strong>insignias</strong>. No son
                            solo estética: cada insignia acredita una forma de participación —crear,
                            construir, enseñar, gobernar, mediar, verificar— y va{" "}
                            <strong>desbloqueando capacidades y reputación</strong> dentro de la red.
                            Gánalas participando.
                        </p>
                        <div className="flex items-center gap-2 pt-2 text-sm">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <span className="text-muted-foreground">
                                Has obtenido{" "}
                                <strong className="text-foreground">{earned}</strong> de{" "}
                                <strong className="text-foreground">{total}</strong> insignias.
                            </span>
                        </div>
                    </div>
                </div>
            </GlassCard>

            {loading ? (
                <p className="text-sm text-muted-foreground">Cargando catálogo de insignias…</p>
            ) : total === 0 ? (
                <GlassCard intensity="low" className="rounded-2xl border p-6">
                    <p className="text-sm text-muted-foreground">
                        Aún no hay insignias en el catálogo.
                    </p>
                </GlassCard>
            ) : (
                AREA_ORDER.filter((area) => (grouped[area.key] ?? []).length > 0).map((area) => {
                    const items = grouped[area.key] ?? [];
                    return (
                        <section key={area.key} className="space-y-3">
                            <div>
                                <h2 className="font-headline text-lg font-semibold capitalize">
                                    {area.label}
                                </h2>
                                <p className="text-xs text-muted-foreground">{area.hint}</p>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {items.map((b) => {
                                    const unlocked = ownedIds.has(b.id);
                                    const criteriaText =
                                        b.criteria && typeof b.criteria === "object"
                                            ? (b.criteria.description ??
                                              b.criteria.how ??
                                              b.criteria.rule ??
                                              null)
                                            : null;
                                    return (
                                        <GlassCard
                                            key={b.id}
                                            variant={unlocked ? "active" : "default"}
                                            intensity={unlocked ? "high" : "low"}
                                            className={cn(
                                                "rounded-2xl border p-4 transition-all",
                                                !unlocked && "opacity-70",
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div
                                                    className={cn(
                                                        "rounded-xl p-2.5",
                                                        unlocked
                                                            ? "bg-primary/15 text-primary"
                                                            : "bg-white/5 text-muted-foreground",
                                                    )}
                                                >
                                                    <BadgeIcon icon={b.icon} className="h-6 w-6" />
                                                </div>
                                                {unlocked ? (
                                                    <UiBadge
                                                        variant="secondary"
                                                        className="flex items-center gap-1 text-[10px]"
                                                    >
                                                        <Sparkles className="h-3 w-3" /> Obtenida
                                                    </UiBadge>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                                        <Lock className="h-3 w-3" /> Bloqueada
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-3 font-medium leading-snug">{b.name}</p>
                                            {b.description ? (
                                                <p className="mt-1 text-sm text-muted-foreground">
                                                    {b.description}
                                                </p>
                                            ) : null}
                                            {criteriaText ? (
                                                <p className="mt-2 text-xs text-muted-foreground/80">
                                                    <span className="uppercase tracking-wide">Cómo obtenerla:</span>{" "}
                                                    {String(criteriaText)}
                                                </p>
                                            ) : null}
                                        </GlassCard>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })
            )}
        </div>
    );
}
