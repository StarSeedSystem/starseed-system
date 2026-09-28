"use client";
/**
 * Eventos libres (Ola 383 · WL6) — cápsula-billete. El próximo evento es una cápsula con su
 * cuenta atrás viva; los siguientes, cápsulas más pequeñas en fila; en xl la semana entera es
 * una ola de cápsulas (una cresta por día). Datos reales de `os_events` en vivo, la misma
 * fuente que el widget clásico; crear un evento abre el mismo creador (`?createEntity=event`).
 */
import * as React from "react";
import Link from "next/link";
import { CalendarPlus, MapPin } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { useLiveEvents, tsOf, isUpcoming, type OsEventRow } from "@/lib/widget-data/os-live";
import { Rotulo, SinDato, disenoDe, useAhora } from "./comun";

const ACENTO = "#FFBF00";

/** Cuenta atrás legible: «2 d 4 h», «3 h 12 min», «12:03» en la última hora. */
export function cuentaAtras(ms: number): string {
    if (ms <= 0) return "ahora";
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d} d ${h % 24} h`;
    if (h > 0) return `${h} h ${m % 60} min`;
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Capsula({ ev, grande, ahora }: { ev: OsEventRow; grande?: boolean; ahora: number }) {
    const t = tsOf(ev.starts_at);
    return (
        <Link href={`/evento/${ev.slug}`} className="group flex min-w-0 cursor-pointer flex-col items-center rounded-full px-4 py-2 text-center transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            style={{ background: `radial-gradient(120% 160% at 30% 20%, ${ACENTO}${grande ? "40" : "26"}, ${ACENTO}08 70%, transparent)` }}>
            <span className={`${grande ? "text-sm" : "text-[11px]"} max-w-[14rem] truncate font-semibold text-white`}>{ev.title}</span>
            <span className={`${grande ? "text-lg" : "text-[10px]"} font-light tabular-nums text-amber-200`}>{cuentaAtras(t - ahora)}</span>
            {grande && ev.location && <span className="flex max-w-[12rem] items-center gap-1 truncate text-[10px] text-white/60"><MapPin className="size-3 shrink-0" />{ev.location}</span>}
        </Link>
    );
}

export function EventosLibre() {
    const { rows, loading } = useLiveEvents();
    const ahoraD = useAhora(1000);
    const ahora = ahoraD?.getTime() ?? 0;
    const proximos = rows.filter((r) => isUpcoming(r.starts_at)).sort((a, b) => tsOf(a.starts_at) - tsOf(b.starts_at));
    const sig = proximos[0];
    const per = personalidadDe("MY_EVENTS");
    const crear = <Link href="?createEntity=event" className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-amber-200 hover:text-white"><CalendarPlus className="size-3.5" />Crear evento</Link>;

    return (
        <WidgetLibre forma={per.forma} acento={ACENTO} acento2="#DC143C" etiqueta={sig ? `Próximo evento: ${sig.title}` : "Eventos"} intensidad={0.35}>
            {({ clase }) => {
                const { base: b, horizontal } = disenoDe(clase);
                if (!ahoraD || (loading && rows.length === 0)) return <SinDato texto="buscando eventos…" />;
                if (!sig) return <SinDato texto="Sin eventos próximos" accion={b !== "micro" ? crear : undefined} />;
                if (b === "micro") return <div className="ss-flotar flex h-full items-center justify-center text-center text-sm font-semibold tabular-nums text-amber-100">{cuentaAtras(tsOf(sig.starts_at) - ahora)}</div>;
                if (b === "s") return <div className="flex h-full items-center justify-center"><Capsula ev={sig} grande ahora={ahora} /></div>;
                if (b === "xl") {
                    const semana = proximos.filter((e) => tsOf(e.starts_at) - ahora < 7 * 86_400_000).slice(0, 10);
                    return (
                        <div className="relative flex h-full w-full flex-col gap-2 p-3">
                            <Rotulo color="#fde68a">Esta semana · {semana.length}</Rotulo>
                            <div className="relative flex-1">
                                {semana.map((e, i) => {
                                    const dia = (tsOf(e.starts_at) - ahora) / 86_400_000;
                                    const x = Math.min(92, 4 + (dia / 7) * 88), y = 50 + Math.sin(dia * 1.4 + i) * 28;
                                    return (
                                        <div key={e.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
                                            <Capsula ev={e} grande={i === 0} ahora={ahora} />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-end">{crear}</div>
                        </div>
                    );
                }
                return (
                    <div className={`flex h-full w-full items-center justify-center gap-3 p-2 ${horizontal ? "flex-row" : "flex-col"}`}>
                        <Capsula ev={sig} grande ahora={ahora} />
                        <div className={`flex flex-wrap justify-center gap-1.5 ${horizontal ? "max-w-[50%]" : ""}`}>
                            {proximos.slice(1, b === "l" ? 5 : 3).map((e) => <Capsula key={e.id} ev={e} ahora={ahora} />)}
                        </div>
                        {b === "l" && crear}
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default EventosLibre;
