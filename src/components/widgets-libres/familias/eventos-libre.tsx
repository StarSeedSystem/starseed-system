"use client";
/**
 * Eventos libres (Ola 383 · WL6, rediseño 2026-09-28) — cápsula-billete en azur. El próximo
 * evento es una cápsula con su cuenta atrás viva; los siguientes, cápsulas pequeñas. Sin eventos,
 * nunca queda vacía: una cápsula compacta con la semana (hoy encendido) y la agenda del cielo real
 * (próxima luna llena y nueva, y cuándo cambia de signo el Sol). Datos de `os_events` en vivo;
 * crear un evento abre el mismo creador (`?createEntity=event`).
 */
import * as React from "react";
import Link from "next/link";
import { MapPin, Plus } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { useLiveEvents, tsOf, isUpcoming, type OsEventRow } from "@/lib/widget-data/os-live";
import { Rotulo, SinDato, disenoDe, useAhora } from "./comun";
import { useCieloAqui } from "./celeste";

const ACENTO = "#007FFF";
const fechaCorta = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");

/** Cuenta atrás legible: «2 d 4 h», «3 h 12 min», «12:03» en la última hora. */
export function cuentaAtras(ms: number): string {
    if (ms <= 0) return "ahora";
    const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return `${d} d ${h % 24} h`;
    if (h > 0) return `${h} h ${m % 60} min`;
    return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Capsula({ ev, grande, ahora }: { ev: OsEventRow; grande?: boolean; ahora: number }) {
    return (
        <Link href={`/evento/${ev.slug}`} className="ss-redondo group flex min-w-0 cursor-pointer flex-col items-center rounded-full px-4 py-2 text-center transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
            style={{ background: `${ACENTO}${grande ? "26" : "18"}`, boxShadow: `inset 0 0 0 1px ${ACENTO}55` }}>
            <span className={`${grande ? "text-sm" : "text-[11px]"} max-w-[14rem] truncate font-semibold text-white`}>{ev.title}</span>
            <span className={`${grande ? "text-lg" : "text-[11px]"} font-light tabular-nums text-sky-200`}>{cuentaAtras(tsOf(ev.starts_at) - ahora)}</span>
            {grande && ev.location && <span className="flex max-w-[12rem] items-center gap-1 truncate text-[11px] text-white/55"><MapPin className="size-3 shrink-0" />{ev.location}</span>}
        </Link>
    );
}

export function EventosLibre() {
    const { rows, loading } = useLiveEvents();
    const ahoraD = useAhora(1000);
    const cielo = useCieloAqui(ahoraD);
    const ahora = ahoraD?.getTime() ?? 0;
    const proximos = rows.filter((r) => isUpcoming(r.starts_at)).sort((a, b) => tsOf(a.starts_at) - tsOf(b.starts_at));
    const sig = proximos[0];
    const crear = (
        <Link href="?createEntity=event" className="ss-redondo flex cursor-pointer items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold text-sky-100 hover:text-white"
            style={{ background: `${ACENTO}1f`, boxShadow: `inset 0 0 0 1px ${ACENTO}66` }}>
            <Plus className="size-3.5" />Evento
        </Link>
    );
    const agenda = cielo ? [
        { t: cielo.proximaLlena, texto: "Luna llena" },
        { t: cielo.proximaNueva, texto: "Luna nueva" },
        { t: cielo.proximoSigno.fecha, texto: `Sol → ${cielo.proximoSigno.signo.glifo} ${cielo.proximoSigno.signo.nombre}` },
    ].sort((a, b) => a.t.getTime() - b.t.getTime()) : [];

    return (
        <WidgetLibre forma="capsula" acento={ACENTO} acento2="#23d5ab" etiqueta={sig ? `Próximo evento: ${sig.title}` : "Eventos: semana libre"} intensidad={0.45}
            caja={sig ? undefined : [0.94, 0.72]}>
            {({ clase }) => {
                const { base: b, horizontal } = disenoDe(clase);
                if (!ahoraD || (loading && rows.length === 0)) return <SinDato texto="buscando eventos…" />;
                if (!sig) {
                    if (b === "micro") return <SinDato texto="Sin eventos" />;
                    const dias = Array.from({ length: 7 }, (_, i) => new Date(ahora + i * 86_400_000));
                    return (
                        <div className="mx-auto flex h-full w-[70%] flex-col items-center justify-center gap-2 text-center">
                            <div className="flex w-full items-end justify-between" aria-hidden>
                                {dias.map((d, i) => (
                                    <div key={i} className="flex flex-col items-center gap-1">
                                        <span className="ss-redondo block rounded-full" style={{ width: i === 0 ? 14 : 10, height: i === 0 ? 14 : 10, background: i === 0 ? ACENTO : "transparent", boxShadow: i === 0 ? `0 0 12px ${ACENTO}99` : "inset 0 0 0 1px rgba(255,255,255,.35)" }} />
                                        <span className="text-[10px] font-semibold uppercase text-white/55">{d.toLocaleDateString("es-ES", { weekday: "narrow" })}</span>
                                    </div>
                                ))}
                            </div>
                            <span className="text-[13px] font-medium text-white/80">Semana libre</span>
                            {b !== "s" && agenda.slice(0, b === "m" ? 2 : 3).map((a) => (
                                <span key={a.texto} className="text-[12px] text-white/60">{a.texto} · {fechaCorta(a.t)}</span>
                            ))}
                            {crear}
                        </div>
                    );
                }
                if (b === "micro") return <div className="flex h-full items-center justify-center text-center text-sm font-semibold tabular-nums text-sky-100">{cuentaAtras(tsOf(sig.starts_at) - ahora)}</div>;
                if (b === "s") return <div className="flex h-full items-center justify-center"><Capsula ev={sig} grande ahora={ahora} /></div>;
                return (
                    <div className={`flex h-full w-full items-center justify-center gap-3 p-3 ${horizontal ? "flex-row" : "flex-col"}`}>
                        <Rotulo>Próximo</Rotulo>
                        <Capsula ev={sig} grande ahora={ahora} />
                        <div className={`flex flex-wrap justify-center gap-1.5 ${horizontal ? "max-w-[50%]" : ""}`}>
                            {proximos.slice(1, b === "m" ? 3 : 6).map((e) => <Capsula key={e.id} ev={e} ahora={ahora} />)}
                        </div>
                        {b !== "m" && crear}
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default EventosLibre;
