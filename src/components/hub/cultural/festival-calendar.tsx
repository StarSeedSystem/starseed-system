"use client";

/*
 * FestivalCalendar — Calendario festivo intercultural (Adenda 77 · PACK 2).
 * Dataset curado real (~50 festividades) + eventos os_events de la red
 * etiquetados culturales. Vista mes compacta + próximas 5 + «Crear evento en la
 * red» prellenado (createEvent real).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
    ChevronLeft, ChevronRight, CalendarPlus, Loader2, ExternalLink, MapPin, Info,
    Sparkles, Sun, Moon, Star, Flame, Flower2, PartyPopper, Gift, Leaf, Snowflake,
    Music, Wheat, Sprout, Mountain, Waves, Skull, Ghost, Drum, BookOpen, Utensils,
    type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    FESTIVALS, festivalsInMonth, upcomingFestivals, festivalColor, festivalDateInYear,
    type Festival,
} from "@/lib/cultural/festivos";
import { systemById } from "@/lib/cultural/systems";
import { useOsEvents } from "@/hooks/use-os-entities";
import { createEvent } from "@/lib/os-social";
import { TranslateButton } from "./translate-button";

const ICONS: Record<string, LucideIcon> = {
    Sparkles, Sun, Moon, Star, Flame, Flower2, PartyPopper, Gift, Leaf, Snowflake,
    Music, Wheat, Sprout, Mountain, Waves, Skull, Ghost, Drum, BookOpen, Utensils,
};

function FestIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
    const Icon = ICONS[name] ?? Sparkles;
    return <Icon className={className} style={style} />;
}

const MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

/** ¿Un evento de la red parece cultural? (por etiquetas). */
function isCulturalEvent(tags: string[]): boolean {
    return tags.some((t) => /cultur|fiesta|festiv|arte|música|musica|danza|ritual|tradici/i.test(t));
}

export function FestivalCalendar() {
    const today = useMemo(() => new Date(), []);
    const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
    const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
    const [createFor, setCreateFor] = useState<Festival | null>(null);

    const { data: events } = useOsEvents();

    const monthFestivals = useMemo(() => festivalsInMonth(cursor.month), [cursor.month]);
    const upcoming = useMemo(() => upcomingFestivals(today, 5), [today]);

    const culturalEventsThisMonth = useMemo(() => {
        return (events ?? []).filter((e) => {
            if (!e.startsAt) return false;
            const d = new Date(e.startsAt);
            return d.getFullYear() === cursor.year && d.getMonth() + 1 === cursor.month && isCulturalEvent(e.tags);
        });
    }, [events, cursor]);

    // Días del mes con festividades / eventos (para los puntos del grid).
    const festByDay = useMemo(() => {
        const map: Record<number, Festival[]> = {};
        for (const f of monthFestivals) {
            (map[f.day] ??= []).push(f);
        }
        return map;
    }, [monthFestivals]);

    const eventsByDay = useMemo(() => {
        const map: Record<number, number> = {};
        for (const e of culturalEventsThisMonth) {
            if (!e.startsAt) continue;
            const day = new Date(e.startsAt).getDate();
            map[day] = (map[day] ?? 0) + 1;
        }
        return map;
    }, [culturalEventsThisMonth]);

    const firstWeekday = (() => {
        const d = new Date(cursor.year, cursor.month - 1, 1).getDay(); // 0=Dom
        return (d + 6) % 7; // 0=Lun
    })();
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();

    const prevMonth = () => {
        setSelectedDay(null);
        setCursor((c) => (c.month === 1 ? { year: c.year - 1, month: 12 } : { year: c.year, month: c.month - 1 }));
    };
    const nextMonth = () => {
        setSelectedDay(null);
        setCursor((c) => (c.month === 12 ? { year: c.year + 1, month: 1 } : { year: c.year, month: c.month + 1 }));
    };

    const selectedFestivals = selectedDay ? festByDay[selectedDay] ?? [] : [];
    const selectedEvents = selectedDay
        ? culturalEventsThisMonth.filter((e) => e.startsAt && new Date(e.startsAt).getDate() === selectedDay)
        : [];

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-1">
                <h3 className="flex items-center gap-2 text-lg font-black tracking-tight text-foreground/90">
                    <CalendarPlus className="size-5 text-primary" /> Calendario festivo intercultural
                </h3>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Festividades del mundo entero + los eventos culturales de la red. Descubre, aprende y crea tu propio
                    evento inspirado en cualquier tradición.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Vista mes compacta */}
                <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
                    <div className="mb-3 flex items-center justify-between">
                        <button type="button" onClick={prevMonth} className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-white" aria-label="Mes anterior">
                            <ChevronLeft className="size-4" />
                        </button>
                        <p className="text-sm font-black uppercase tracking-widest text-foreground/90">
                            {MONTHS[cursor.month - 1]} {cursor.year}
                        </p>
                        <button type="button" onClick={nextMonth} className="cursor-pointer rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-white" aria-label="Mes siguiente">
                            <ChevronRight className="size-4" />
                        </button>
                    </div>

                    <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        {WEEKDAYS.map((w) => (
                            <div key={w}>{w}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {Array.from({ length: firstWeekday }).map((_, i) => (
                            <div key={`pad-${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const fests = festByDay[day] ?? [];
                            const evCount = eventsByDay[day] ?? 0;
                            const isToday = cursor.year === today.getFullYear() && cursor.month === today.getMonth() + 1 && day === today.getDate();
                            const isSel = selectedDay === day;
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => setSelectedDay(isSel ? null : day)}
                                    className={cn(
                                        "relative flex aspect-square min-h-[40px] cursor-pointer flex-col items-center justify-center rounded-lg border text-xs transition-colors",
                                        isSel ? "border-primary/50 bg-primary/15 text-foreground" : "border-white/5 text-foreground/80 hover:border-white/20",
                                        isToday && !isSel && "border-primary/30",
                                    )}
                                >
                                    <span className={cn("font-semibold", isToday && "text-primary")}>{day}</span>
                                    {(fests.length > 0 || evCount > 0) && (
                                        <span className="absolute bottom-1 flex items-center gap-0.5">
                                            {fests.slice(0, 3).map((f) => (
                                                <span key={f.id} className="size-1.5 rounded-full" style={{ background: festivalColor(f) }} />
                                            ))}
                                            {evCount > 0 && <span className="size-1.5 rounded-full bg-white/70" />}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Detalle del día seleccionado */}
                    {selectedDay && (selectedFestivals.length > 0 || selectedEvents.length > 0) && (
                        <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
                            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                                {selectedDay} de {MONTHS[cursor.month - 1]}
                            </p>
                            {selectedFestivals.map((f) => {
                                const sys = systemById(f.systemId);
                                return (
                                    <div key={f.id} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${sys.color}20` }}>
                                            <FestIcon name={f.icon} className="size-4" style={{ color: sys.color }} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-sm font-bold text-foreground">{f.name}</p>
                                                {f.approx && (
                                                    <span title="La fecha varía cada año" className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[8px] font-black uppercase text-amber-300">
                                                        <Info className="size-2" /> aprox.
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">{f.region} · {sys.label}</p>
                                            <p className="mt-0.5 text-[11px] text-foreground/70">{f.description}</p>
                                            <button
                                                type="button"
                                                onClick={() => setCreateFor(f)}
                                                className="mt-1.5 inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/20"
                                            >
                                                <CalendarPlus className="size-3" /> Crear evento en la red
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {selectedEvents.map((e) => (
                                <Link
                                    key={e.slug}
                                    href={`/evento/${e.slug}`}
                                    className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 transition-colors hover:border-primary/25"
                                >
                                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                                        <MapPin className="size-4 text-white/70" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-foreground">{e.title}</p>
                                        <p className="text-[11px] text-muted-foreground">Evento de la red · {e.location || "sin ubicación"}</p>
                                    </div>
                                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Próximas 5 */}
                <div className="space-y-3">
                    <p className="flex items-center gap-1.5 text-sm font-black uppercase tracking-widest text-muted-foreground">
                        <Sparkles className="size-3.5 text-primary" /> Próximas festividades
                    </p>
                    {upcoming.map((u) => {
                        const sys = systemById(u.festival.systemId);
                        return (
                            <div key={u.festival.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 backdrop-blur">
                                <div className="flex items-start gap-2.5">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `${sys.color}20` }}>
                                        <FestIcon name={u.festival.icon} className="size-5" style={{ color: sys.color }} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-foreground">{u.festival.name}</p>
                                        <p className="text-[11px]" style={{ color: sys.color }}>
                                            {u.date.getDate()} {MONTHS[u.date.getMonth()].slice(0, 3)} · {u.daysUntil === 0 ? "hoy" : `en ${u.daysUntil} día${u.daysUntil === 1 ? "" : "s"}`}
                                        </p>
                                    </div>
                                </div>
                                <p className="mt-1.5 text-[11px] text-muted-foreground">{u.festival.description}</p>
                                <TranslateButton text={u.festival.description} className="mt-1.5" />
                                <button
                                    type="button"
                                    onClick={() => setCreateFor(u.festival)}
                                    className="mt-2 inline-flex min-h-[34px] w-full cursor-pointer items-center justify-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/20"
                                >
                                    <CalendarPlus className="size-3" /> Crear evento en la red
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>

            {createFor && (
                <CreateEventForm festival={createFor} year={cursor.year} onClose={() => setCreateFor(null)} />
            )}
        </div>
    );
}

function CreateEventForm({ festival, year, onClose }: { festival: Festival; year: number; onClose: () => void }) {
    const sys = systemById(festival.systemId);
    const defaultDate = festivalDateInYear(festival, year >= new Date().getFullYear() ? year : new Date().getFullYear());
    const [title, setTitle] = useState(`${festival.name} · celebración StarSeed`);
    const [date, setDate] = useState(defaultDate.toISOString().slice(0, 10));
    const [location, setLocation] = useState("");
    const [description, setDescription] = useState(
        `Celebración intercultural inspirada en ${festival.name} (${festival.region}). ${festival.description}`,
    );
    const [saving, setSaving] = useState(false);
    const [createdSlug, setCreatedSlug] = useState<string | null>(null);

    const publish = async () => {
        setSaving(true);
        try {
            const res = await createEvent({
                title: title.trim() || festival.name,
                kind: "encuentro",
                description: description.trim(),
                startsAt: date ? new Date(`${date}T18:00:00`).toISOString() : null,
                location: location.trim(),
                tags: ["cultura", "festivo", festival.systemId, festival.id],
            });
            if (!res.ok || !res.slug) {
                toast.error(res.error || "Inicia sesión para crear eventos en la red.");
                return;
            }
            setCreatedSlug(res.slug);
            toast.success("Evento publicado en la red.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg space-y-4 rounded-3xl border border-white/12 bg-background/95 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-2.5">
                    <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${sys.color}20` }}>
                        <FestIcon name={festival.icon} className="size-5" style={{ color: sys.color }} />
                    </span>
                    <div>
                        <h4 className="text-base font-black text-foreground">Crear evento en la red</h4>
                        <p className="text-[11px]" style={{ color: sys.color }}>Inspirado en {festival.name}</p>
                    </div>
                </div>

                {createdSlug ? (
                    <div className="space-y-3 text-center">
                        <p className="text-sm text-muted-foreground">Tu evento está publicado en la red.</p>
                        <Link href={`/evento/${createdSlug}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary">
                            Ver evento <ExternalLink className="size-4" />
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del evento" className="min-h-[42px] w-full rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                            <div className="flex gap-2">
                                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-[42px] flex-1 rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                                <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Lugar (opcional)" className="min-h-[42px] flex-1 rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                            </div>
                            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-xl border border-white/12 bg-background/50 px-3 py-2 text-sm text-foreground/90 focus:outline-none focus:ring-1 focus:ring-primary/40" />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            <button type="button" onClick={onClose} className="min-h-[44px] cursor-pointer rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-white">
                                Cancelar
                            </button>
                            <button type="button" onClick={publish} disabled={saving} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full bg-primary/90 px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary disabled:opacity-60">
                                {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />} Publicar en la red
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default FestivalCalendar;
