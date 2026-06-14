'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, FileEdit, Vote, Users, CheckCircle2, GitBranch, Boxes, type LucideIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, MiniList, timeAgo } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { ActivityEvent } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// RecentActivityWidget — registro acásico reciente de la comunidad.
// ----------------------------------------------------------------
// Datos REALES (cuando hay): construye los eventos a partir de las
// últimas creaciones de la comunidad (`cafe_posts`) y la apertura de
// locales (`cafe_locals`) del proyecto Supabase compartido, mapeando
// cada fila a un evento del registro acásico. Realtime: suscripción a
// `cafe_posts` y `cafe_locals` (postgres_changes). Sin red/datos →
// degrada con elegancia a "common.activity" simulado.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<ActivityEvent["kind"], { icon: LucideIcon; color: string }> = {
    vote: { icon: Vote, color: "#f59e0b" },
    post: { icon: FileEdit, color: "#38bdf8" },
    join: { icon: Users, color: "#10b981" },
    mission: { icon: CheckCircle2, color: "#a855f7" },
    delegation: { icon: GitBranch, color: "#ec4899" },
    resource: { icon: Boxes, color: "#22d3ee" },
};

interface CafePostRow {
    id: string;
    kind: string | null;
    branch: string | null;
    title: string | null;
    author_name: string | null;
    created_at: string | null;
}
interface CafeLocalRow {
    zone: string;
    name: string | null;
    created_at: string | null;
}

// Mapea el tipo de creación a un kind del registro acásico.
function kindForPost(k: string | null): ActivityEvent["kind"] {
    const s = (k ?? "").toLowerCase();
    if (s.includes("propuesta") || s.includes("proposal") || s.includes("voto") || s.includes("vote")) return "vote";
    if (s.includes("mision") || s.includes("misión") || s.includes("mission") || s.includes("reto")) return "mission";
    return "post";
}
function actionForKind(k: string | null): string {
    const s = (k ?? "").toLowerCase();
    if (s.includes("elixir")) return "destiló el elixir";
    if (s.includes("recipe") || s.includes("receta")) return "compartió la receta";
    if (s.includes("propuesta") || s.includes("proposal")) return "propuso";
    if (s.includes("review") || s.includes("reseña")) return "reseñó";
    return "publicó";
}

// Construye eventos reales a partir de posts + aperturas de locales.
function buildEvents(posts: CafePostRow[], locals: CafeLocalRow[]): ActivityEvent[] {
    const events: ActivityEvent[] = [];

    for (const p of posts) {
        events.push({
            id: `post-${p.id}`,
            actor: p.author_name?.trim() || "Comunidad",
            action: actionForKind(p.kind),
            target: p.title?.trim() || (p.branch?.trim() ? `en ${p.branch.trim()}` : "una creación"),
            kind: kindForPost(p.kind),
            ts: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
        });
    }
    for (const l of locals) {
        if (!l.created_at) continue;
        events.push({
            id: `local-${l.zone}`,
            actor: l.name?.trim() || "Nuevo local",
            action: "abrió en",
            target: l.zone,
            kind: "join",
            ts: new Date(l.created_at).getTime(),
        });
    }
    return events.sort((a, b) => b.ts - a.ts);
}

export function RecentActivityWidget() {
    const supabase = useMemo(() => createClient(), []);
    const { data: sim, loading: simLoading } = useWidgetData("common.activity", { refreshMs: 9000 });

    const [real, setReal] = useState<ActivityEvent[] | null>(null);

    const reload = useCallback(async () => {
        try {
            const [postsRes, localsRes] = await Promise.all([
                supabase.from("cafe_posts")
                    .select("id, kind, branch, title, author_name, created_at")
                    .order("created_at", { ascending: false }).limit(20),
                supabase.from("cafe_locals")
                    .select("zone, name, created_at")
                    .order("created_at", { ascending: false }).limit(6),
            ]);
            const posts = (!postsRes.error && postsRes.data ? postsRes.data : []) as CafePostRow[];
            const locals = (!localsRes.error && localsRes.data ? localsRes.data : []) as CafeLocalRow[];
            const events = buildEvents(posts, locals);
            setReal(events.length ? events : []);
        } catch {
            setReal([]); // fallback silencioso a modo simulado
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        void (async () => { if (alive) await reload(); })();
        // Realtime: nuevas creaciones / locales refrescan el registro.
        const ch = supabase
            .channel("w-recent-activity")
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_posts" }, () => { void reload(); })
            .on("postgres_changes", { event: "*", schema: "public", table: "cafe_locals" }, () => { void reload(); })
            .subscribe();
        return () => { alive = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    const hasReal = real !== null && real.length > 0;
    const data = hasReal ? real! : sim;
    const loading = hasReal ? false : (simLoading || !sim);

    return (
        <WidgetShell
            title="Actividad Reciente"
            subtitle={hasReal ? "Registro acásico · en vivo" : "Tu registro acásico"}
            icon={History}
            accent="#38bdf8"
            live
            expandHref="/profile"
            connections={[
                { label: "Perfil", href: "/profile", color: "#38bdf8", icon: History },
                { label: "Red", href: "/network", color: "#10b981", icon: Users },
                { label: "Gobernanza", href: "/network/politics", color: "#f59e0b", icon: Vote },
            ]}
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {hasReal ? "Pulso del Café · datos en vivo" : "Registro acásico · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading || !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const max = micro ? 3 : size.vTier === "expanded" ? 6 : 4;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={data}
                            max={max}
                            empty="Sin actividad reciente"
                            render={(a) => {
                                const meta = KIND_META[a.kind];
                                const Icon = meta.icon;
                                return (
                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2">
                                        <span className="shrink-0 grid place-items-center size-7 rounded-lg border"
                                            style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                                            <Icon className="size-3.5" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[11px] @sm:text-xs leading-snug truncate">
                                                <span className="font-bold">{a.actor}</span>{" "}
                                                <span className="text-muted-foreground/80">{a.action}</span>{" "}
                                                <span className="font-semibold">{a.target}</span>
                                            </p>
                                        </div>
                                        {!micro && <span className="shrink-0 text-[10px] font-bold text-muted-foreground/60 tabular-nums">{timeAgo(a.ts)}</span>}
                                    </div>
                                );
                            }}
                        />
                    </div>
                );
            }}
        </WidgetShell>
    );
}
