"use client";
/**
 * Reloj libre (Ola 383 · WL1) — un orbe que orbita. Cada tamaño es otro diseño:
 * micro la hora sola flotando · s un anillo con la luz de los segundos dando la vuelta ·
 * m el anillo lleno del color del cielo de esta hora con la fecha · l/xl tres anillos
 * (hora, minuto, segundo) y las otras zonas horarias como satélites.
 * Mismas opciones que el reloj clásico: `clockMode` (analógico/digital) y `clockZones`.
 */
import * as React from "react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { zoneLabel } from "@/components/dashboard/widgets/clock-date-widget";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import { Pildora, disenoDe, useAhora } from "./comun";

type Ajustes = (patch: Record<string, unknown>) => void;

export function partesHora(fecha: Date, zona?: string) {
    let f: Intl.DateTimeFormat;
    try {
        f = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "long", day: "numeric", month: "long", timeZone: zona && zona !== "local" ? zona : undefined });
    } catch {
        f = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "long", day: "numeric", month: "long" });
    }
    const p = Object.fromEntries(f.formatToParts(fecha).map((x) => [x.type, x.value]));
    const h = Number(p.hour) % 24, m = Number(p.minute), s = Number(p.second);
    return { h, m, s, hhmm: `${String(h).padStart(2, "0")}:${p.minute}`, fecha: `${p.weekday} ${p.day} de ${p.month}` };
}

/** El color del cielo según la hora: amanecer, día, atardecer o noche. */
export function cieloDe(h: number): { nombre: string; a: string; b: string } {
    if (h >= 5 && h < 8) return { nombre: "amanecer", a: "#ff8a5c", b: "#FFBF00" };
    if (h >= 8 && h < 17) return { nombre: "día", a: "#007FFF", b: "#23d5ab" };
    if (h >= 17 && h < 20) return { nombre: "atardecer", a: "#ff4f8b", b: "#FFBF00" };
    return { nombre: "noche", a: "#4b3bbf", b: "#7c5cff" };
}

function Anillo({ r, valor, color, grosor }: { r: number; valor: number; color: string; grosor: number }) {
    const c = 2 * Math.PI * r;
    return (
        <>
            <circle r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={grosor} />
            <circle r={r} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeDasharray={c}
                strokeDashoffset={c * (1 - valor)} transform="rotate(-90)" style={{ transition: "stroke-dashoffset .6s ease" }} />
        </>
    );
}

export function RelojLibre({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: Ajustes }) {
    const ahora = useAhora(1000);
    const modo: "analog" | "digital" = widget?.settings?.clockMode === "analog" ? "analog" : "digital";
    const zonas: string[] = Array.isArray(widget?.settings?.clockZones) ? widget!.settings!.clockZones : [];
    const base = React.useRef<number | null>(null);
    const per = personalidadDe("CLOCK_DATE");
    const idCielo = `cielo-${React.useId().replace(/:/g, "")}`;
    const t = ahora ? partesHora(ahora) : null;
    const cielo = cieloDe(t?.h ?? 12);
    if (ahora && base.current === null) base.current = Math.floor(ahora.getTime() / 1000) - (t?.s ?? 0);
    // Ángulo MONÓTONO de los segundos: nunca da la vuelta hacia atrás al pasar de 59 a 0.
    const angSeg = ahora && base.current !== null ? (Math.floor(ahora.getTime() / 1000) - base.current) * 6 : 0;

    return (
        <WidgetLibre forma={per.forma} acento={cielo.a} acento2={cielo.b} etiqueta={t ? `Reloj: ${t.hhmm}, ${t.fecha}` : "Reloj"} intensidad={0.55}>
            {({ clase, ancho, alto }) => {
                if (!t) return null;
                const { base: b } = disenoDe(clase);
                const lado = Math.max(40, Math.min(ancho, alto));
                const R = lado * 0.4;
                const digitos = (tam: number) => (
                    <span className="font-light tabular-nums tracking-tight text-white" style={{ fontSize: tam, lineHeight: 1 }}>{t.hhmm}</span>
                );
                if (b === "micro") return <div className="ss-flotar flex h-full items-center justify-center">{digitos(lado * 0.3)}</div>;

                const manecillas = (
                    <g stroke="white" strokeLinecap="round">
                        <line y2={-R * 0.5} strokeWidth={3} transform={`rotate(${(t.h % 12 + t.m / 60) * 30})`} style={{ transition: "transform .6s" }} />
                        <line y2={-R * 0.75} strokeWidth={2} transform={`rotate(${t.m * 6 + t.s / 10})`} style={{ transition: "transform .6s" }} />
                    </g>
                );
                const grande = b === "l" || b === "xl";
                return (
                    <div className="relative flex h-full w-full items-center justify-center">
                        <svg aria-hidden width={lado} height={lado} viewBox={`${-lado / 2} ${-lado / 2} ${lado} ${lado}`} className="absolute">
                            {b !== "s" && <circle r={R * 0.92} fill={`url(#${idCielo})`} opacity={0.55} />}
                            <defs>
                                <radialGradient id={idCielo} cx="40%" cy="30%"><stop offset="0%" stopColor={cielo.b} /><stop offset="100%" stopColor={cielo.a} stopOpacity={0.1} /></radialGradient>
                            </defs>
                            {grande ? (
                                <>
                                    <Anillo r={R} valor={(t.h % 12 + t.m / 60) / 12} color={cielo.b} grosor={lado * 0.03} />
                                    <Anillo r={R * 0.8} valor={t.m / 60} color="#ffffff" grosor={lado * 0.02} />
                                    <circle r={R * 0.62} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={1} />
                                </>
                            ) : (
                                <circle r={R} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth={1.5} />
                            )}
                            <g transform={`rotate(${angSeg})`} style={{ transition: "transform 1s linear" }}>
                                <circle cy={-(grande ? R * 0.62 : R)} r={lado * 0.022} fill={cielo.b} style={{ filter: `drop-shadow(0 0 6px ${cielo.b})` }} />
                            </g>
                            {modo === "analog" && manecillas}
                        </svg>
                        <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                            {modo === "digital" && digitos(lado * (grande ? 0.16 : 0.2))}
                            {b !== "s" && <span className="text-center text-[12px] font-medium first-letter:uppercase text-white/80" style={{ maxWidth: R * 1.5 }}>{t.fecha}</span>}
                            {b !== "s" && <span className="text-[10px] text-white/60">{cielo.nombre}</span>}
                        </div>
                        {grande && zonas.length > 0 && (
                            <div className="ss-pausable absolute inset-0">
                                <div className="ss-girar absolute inset-0" style={{ ["--ss-dur" as string]: "180s" }}>
                                    {zonas.slice(0, b === "xl" ? 3 : 1).map((z, i, arr) => {
                                        const a = (i / arr.length) * 2 * Math.PI - Math.PI / 2;
                                        const zt = partesHora(ahora!, z);
                                        return (
                                            <div key={z} className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%,-50%) translate(${Math.cos(a) * R * 1.12}px, ${Math.sin(a) * R * 1.12}px)` }}>
                                                <div className="ss-contragirar flex flex-col items-center" style={{ ["--ss-dur" as string]: "180s" }}>
                                                    <span className="text-xs font-semibold tabular-nums text-white">{zt.hhmm}</span>
                                                    <span className="text-[9px] text-white/60">{zoneLabel(z)}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {grande && onUpdateSettings && (
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                                <Pildora color={cielo.a} onClick={() => onUpdateSettings({ clockMode: modo === "analog" ? "digital" : "analog" })}>
                                    {modo === "analog" ? "Digital" : "Analógico"}
                                </Pildora>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default RelojLibre;
