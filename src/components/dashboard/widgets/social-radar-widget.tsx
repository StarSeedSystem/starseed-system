'use client';

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, MapPin, Users, ChevronRight, type LucideIcon, Landmark, Hammer, Sparkles, Palette, Store } from "lucide-react";
import { WidgetShell, MiniList, Chip, timeUntil } from "../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { SocialEvent } from "@/lib/widget-data";
import { createClient } from "@/utils/supabase/client";
import { eventHref, slugify } from "@/lib/entity-links";
import { useOsEvents } from "@/hooks/use-os-entities";
import type { OsEvent } from "@/lib/os-social";

// Conteos localizados con separador de millares (es-ES).
const NUM_ES = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

// ════════════════════════════════════════════════════════════════
// SocialRadarWidget — eventos próximos de la red (asambleas, talleres,
// rituales, obras, mercados). Sobre el andamiaje de "social.events"
// simulado, intenta anclar los eventos a LUGARES reales (locations /
// cafe_locals del proyecto unificado) y a la actividad real por sede
// (conteo de cafe_posts por sucursal). Si no hay datos o falla, se
// muestran los lugares simulados originales. Adaptativo.
// ════════════════════════════════════════════════════════════════
const KIND_META: Record<SocialEvent["kind"], { icon: LucideIcon; color: string; label: string }> = {
    asamblea: { icon: Landmark, color: "#f59e0b", label: "Asamblea" },
    taller: { icon: Hammer, color: "#10b981", label: "Taller" },
    ritual: { icon: Sparkles, color: "#a855f7", label: "Ritual" },
    obra: { icon: Palette, color: "#ec4899", label: "Obra" },
    mercado: { icon: Store, color: "#38bdf8", label: "Mercado" },
};
const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

interface LocationRow { id: string; name: string | null; city: string | null }

/** Evento del radar que arrastra su slug real para enlazar a /evento/<slug>. */
type RadarEvent = SocialEvent & { slug?: string };

/** Mapea el kind de OsEvent al conjunto soportado por el widget. */
function radarKind(kind: string): SocialEvent["kind"] {
    const k = kind.toLowerCase();
    if (k.includes("asamblea")) return "asamblea";
    if (k.includes("taller") || k.includes("curso")) return "taller";
    if (k.includes("ritual")) return "ritual";
    if (k.includes("mercado")) return "mercado";
    return "obra"; // exposicion / concierto / obra / encuentro → obra
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

export function SocialRadarWidget() {
    const { data: mockData, loading: mockLoading } = useWidgetData("social.events", { refreshMs: 20000 });
    const { data: osEvents, loading: osLoading } = useOsEvents();
    const supabase = useMemo(() => createClient(), []);
    // Lugares reales (sedes) + actividad real por sucursal.
    const [realPlaces, setRealPlaces] = useState<string[] | null>(null);
    const [branchActivity, setBranchActivity] = useState<Record<string, number> | null>(null);

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
                if (active) { setRealPlaces(null); setBranchActivity(null); } // fallback simulado
            }
        })();
        return () => { active = false; };
    }, [supabase]);

    const loading = osLoading && (mockLoading && !mockData);

    // Eventos reales de Supabase (o de ejemplo vía el hook). Si no hubiera ninguno,
    // cae a los eventos simulados anclados a lugares reales (lógica original).
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
                { label: "Cultura", href: "/network/culture", color: "#ec4899", icon: Palette },
                { label: "Asambleas", href: "/network/politics", color: "#f59e0b", icon: Landmark },
                { label: "Hub", href: "/hub", color: "#10b981", icon: Users },
            ]}
            footer={
                !loading && data && data.length ? (() => {
                    const next = [...data].sort((a, b) => a.startTs - b.startTs)[0];
                    const totalAttendees = data.reduce((s, e) => s + e.attendees, 0);
                    return (
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground/70 min-w-0">
                            <span className="inline-flex items-center gap-1.5 min-w-0">
                                <span className="size-1.5 rounded-full shrink-0" style={{ background: "#ec4899" }} />
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
                const sorted = [...data].sort((a, b) => a.startTs - b.startTs);
                const max = micro ? 3 : size.vTier === "expanded" ? 5 : 3;

                return (
                    <div className="pt-1 h-full">
                        <MiniList
                            items={sorted}
                            max={max}
                            empty="Sin eventos próximos"
                            render={(e) => {
                                const meta = KIND_META[e.kind];
                                const Icon = meta.icon;
                                const d = new Date(e.startTs);
                                const hh = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
                                return (
                                    <Link
                                        href={e.slug ? eventHref(e.slug) : eventHref(slugify(e.title) || "evento")}
                                        className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-white/[0.02] px-2.5 py-2 hover:border-primary/30 transition-colors cursor-pointer"
                                    >
                                        <div className="shrink-0 grid place-items-center size-10 rounded-xl border text-center leading-none"
                                            style={{ color: meta.color, borderColor: `${meta.color}40`, background: `${meta.color}1a` }}>
                                            <span className="text-[8px] font-black uppercase">{MONTHS[d.getMonth()]}</span>
                                            <span className="text-base font-black tabular-nums">{d.getDate()}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[11px] @sm:text-xs font-bold truncate">{e.title}</span>
                                                {!micro && <Chip color={meta.color}>{meta.label}</Chip>}
                                            </div>
                                            {!micro && (
                                                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/70 min-w-0">
                                                    <span className="inline-flex items-center gap-1 truncate min-w-0"><MapPin className="size-3 shrink-0" /> {hh} · {e.place}</span>
                                                    <span className="inline-flex items-center gap-1 ml-auto shrink-0 tabular-nums" title={`${NUM_ES.format(e.attendees)} asistentes confirmados`}><Users className="size-3" /> {NUM_ES.format(e.attendees)}</span>
                                                </div>
                                            )}
                                        </div>
                                        {micro && <Icon className="size-4 shrink-0" style={{ color: meta.color }} />}
                                    </Link>
                                );
                            }}
                        />
                    </div>
                );
            }}
        </WidgetShell>
    );
}
