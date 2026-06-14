'use client';

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import {
    Boxes, Printer, Car, FlaskRound, Server, Tractor, CalendarClock,
    ChevronRight, Check, Wheat, type LucideIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { CommonsResource } from "@/lib/widget-data";
import { cn } from "@/lib/utils";

// ════════════════════════════════════════════════════════════════
// CommonsMatrixWidget — Matriz de Patrimonio Común.
// Disponibilidad en tiempo real de los medios de producción compartidos.
// "Reserva por Propósito" (no se paga; se explica el propósito).
// ----------------------------------------------------------------
// Datos REALES (cuando hay): lee el catálogo de granos del procomún
// (`grain_types`) del proyecto Supabase compartido — los granos son
// recursos productivos comunes — junto con `seed_market` para valorar
// cada grano en Semillas/€. Realtime: suscripción a `grain_types` y
// `seed_market` (postgres_changes). Sin red/datos → degrada con
// elegancia a "oikos.commons" simulado.
// Invariante: medios de producción como procomún, acceso libre.
// ════════════════════════════════════════════════════════════════
const KIND_ICON: Record<CommonsResource["kind"], LucideIcon> = {
    impresora3d: Printer, vehiculo: Car, laboratorio: FlaskRound, servidores: Server, maquinaria: Tractor,
};
const STATUS_META: Record<CommonsResource["status"], { label: string; color: string }> = {
    libre: { label: "Libre", color: "#10b981" },
    reservado: { label: "Reservado", color: "#f59e0b" },
    mantenimiento: { label: "Mantenimiento", color: "#94a3b8" },
};
function eta(min: number): string {
    if (min <= 0) return "ahora";
    if (min < 60) return `${min} min`;
    return `${Math.round(min / 60)} h`;
}

const INT_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const EUR_4 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const DEFAULT_GRAIN = "#9FE870";

// ── Recurso común real derivado de un grano del procomún ──
interface GrainCommons {
    id: string;
    label: string;        // nombre del grano
    emoji: string | null;
    color: string;        // color del grano
    seedsPer100g: number; // densidad en Semillas / 100 g
    eurPer100g: number | null; // valor en € (si hay precio de mercado)
}

interface GrainTypeRow {
    id: string;
    name: string | null;
    color: string | null;
    emoji: string | null;
    seeds_per_100g: number | null;
}
interface SeedMarketRow { day: string; seed_eur: number }

export function CommonsMatrixWidget() {
    const supabase = useMemo(() => createClient(), []);
    const { data: sim, loading: simLoading } = useWidgetData("oikos.commons", { refreshMs: 10000 });

    const [reserved, setReserved] = useState<Record<string, boolean>>({});
    const toggle = useCallback((id: string) => setReserved((p) => ({ ...p, [id]: !p[id] })), []);

    // Datos reales (opcional): granos del procomún + precio de la Semilla.
    const [grains, setGrains] = useState<GrainCommons[] | null>(null);
    const [seedEur, setSeedEur] = useState<number | null>(null);

    const reload = useCallback(async () => {
        try {
            const [grainsRes, marketRes] = await Promise.all([
                supabase.from("grain_types").select("id, name, color, emoji, seeds_per_100g").order("name"),
                supabase.from("seed_market").select("day, seed_eur").order("day", { ascending: false }).limit(1),
            ]);
            const price = (!marketRes.error && marketRes.data && marketRes.data.length)
                ? Number((marketRes.data[0] as SeedMarketRow).seed_eur)
                : null;
            setSeedEur(Number.isFinite(price as number) ? price : null);

            if (!grainsRes.error && grainsRes.data && grainsRes.data.length > 0) {
                const rows = grainsRes.data as GrainTypeRow[];
                setGrains(rows.map((g) => {
                    const seeds = Number(g.seeds_per_100g) || 0;
                    return {
                        id: g.id,
                        label: g.name?.trim() || "Grano común",
                        emoji: g.emoji,
                        color: g.color?.trim() || DEFAULT_GRAIN,
                        seedsPer100g: seeds,
                        eurPer100g: price !== null ? seeds * price : null,
                    };
                }));
            } else {
                setGrains([]);
            }
        } catch {
            setGrains([]); // fallback silencioso a modo simulado
        }
    }, [supabase]);

    useEffect(() => {
        let alive = true;
        void (async () => { if (alive) await reload(); })();
        // Realtime: catálogo de granos y precio de la Semilla en vivo.
        const ch = supabase
            .channel("w-commons-matrix")
            .on("postgres_changes", { event: "*", schema: "public", table: "grain_types" }, () => { void reload(); })
            .on("postgres_changes", { event: "*", schema: "public", table: "seed_market" }, () => { void reload(); })
            .subscribe();
        return () => { alive = false; supabase.removeChannel(ch); };
    }, [supabase, reload]);

    const hasReal = grains !== null && grains.length > 0;
    const loading = hasReal ? false : (simLoading || !sim);

    return (
        <WidgetShell
            title="Patrimonio Común"
            subtitle={hasReal ? "Granos del procomún · en vivo" : "Medios de producción compartidos"}
            icon={Boxes}
            accent="#38bdf8"
            live
            connections={[
                { label: "Economía", href: "https://starseed-nexus.vercel.app/#fundacion", color: "#9FE870" },
                { label: "Comunidades", href: "/hub", color: "#38bdf8" },
            ]}
            actions={
                <Link href="/hub" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Reservas <ChevronRight className="size-3" />
                </Link>
            }
            footer={
                <p className="text-[9px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50 text-center">
                    {hasReal
                        ? `Procomún del Café · ${INT_ES.format(grains!.length)} granos`
                        : "Medios de producción · modo simulado"}
                </p>
            }
        >
            {(size) => {
                if (loading) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const maxList = size.vTier === "expanded" ? 5 : size.vTier === "compact" ? 2 : 4;

                // ── Micro ────────────────────────────────────────────────────
                if (micro) {
                    if (hasReal) {
                        return (
                            <div className="h-full grid place-items-center text-center">
                                <div>
                                    <div className="text-2xl font-black tabular-nums" style={{ color: DEFAULT_GRAIN }}>
                                        {INT_ES.format(grains!.length)}
                                    </div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">granos comunes</div>
                                </div>
                            </div>
                        );
                    }
                    const free = sim!.filter((r) => r.status === "libre").length;
                    return (
                        <div className="h-full grid place-items-center text-center">
                            <div>
                                <div className="text-2xl font-black tabular-nums text-sky-400">{free}/{sim!.length}</div>
                                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">recursos libres</div>
                            </div>
                        </div>
                    );
                }

                // ── Datos REALES: granos del procomún ─────────────────────────
                if (hasReal) {
                    return (
                        <div className="pt-1 h-full">
                            <MiniList
                                items={grains!}
                                max={maxList}
                                empty="Sin granos registrados"
                                render={(g: GrainCommons) => {
                                    const isReserved = reserved[g.id];
                                    return (
                                        <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-sky-500/30 transition-colors">
                                            <span className="grid place-items-center size-9 rounded-xl border shrink-0 text-base"
                                                style={{ color: g.color, borderColor: `${g.color}40`, background: `${g.color}14` }}>
                                                {g.emoji ? <span aria-hidden>{g.emoji}</span> : <Wheat className="size-4" />}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] @sm:text-xs font-bold truncate">{g.label}</span>
                                                    <Chip color={g.color}>procomún</Chip>
                                                </div>
                                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60 tabular-nums">
                                                    <span>{INT_ES.format(g.seedsPer100g)} semillas / 100 g</span>
                                                    {g.eurPer100g !== null && (
                                                        <span className="shrink-0">· {EUR_4.format(g.eurPer100g)} €</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => toggle(g.id)}
                                                title="Reserva por propósito"
                                                className={cn(
                                                    "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer shrink-0",
                                                    isReserved ? "bg-sky-500/15 border-sky-500/40 text-sky-300" : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-sky-500/40"
                                                )}
                                            >
                                                {isReserved ? <><Check className="size-2.5" /> Solicitado</> : "Reservar"}
                                            </button>
                                        </div>
                                    );
                                }}
                            />
                        </div>
                    );
                }

                // ── Fallback simulado (medios de producción) ──────────────────
                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sim!}
                            max={maxList}
                            empty="Sin recursos registrados"
                            render={(r) => {
                                const Icon = KIND_ICON[r.kind];
                                const sm = STATUS_META[r.status];
                                const isReserved = reserved[r.id];
                                const canReserve = r.status !== "mantenimiento";
                                return (
                                    <div className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-sky-500/30 transition-colors">
                                        <span className="grid place-items-center size-9 rounded-xl border shrink-0"
                                            style={{ color: sm.color, borderColor: `${sm.color}40`, background: `${sm.color}14` }}>
                                            <Icon className="size-4" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate">{r.label}</span>
                                                <Chip color={sm.color}>{sm.label}</Chip>
                                            </div>
                                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                                <span className="inline-flex items-center gap-0.5"><CalendarClock className="size-3" /> {eta(r.availableInMin)}</span>
                                                {r.queue > 0 && <span>· {r.queue} en cola</span>}
                                                {r.priorityPurpose && size.vTier === "expanded" && <span className="truncate">· {r.priorityPurpose}</span>}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => toggle(r.id)}
                                            disabled={!canReserve}
                                            title="Reserva por propósito"
                                            className={cn(
                                                "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-black uppercase tracking-wide transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
                                                isReserved ? "bg-sky-500/15 border-sky-500/40 text-sky-300" : "border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-sky-500/40"
                                            )}
                                        >
                                            {isReserved ? <><Check className="size-2.5" /> Solicitado</> : "Reservar"}
                                        </button>
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
