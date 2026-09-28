"use client";
/**
 * Reloj celeste (Ola 383 · WL1, rediseño 2026-09-28) — el reloj es el cielo de AHORA aquí:
 * una esfera de 24 h (mediodía arriba, medianoche abajo) con el arco del día entre el orto y el
 * ocaso reales, el Sol en su hora y la Luna con su fase real, separada del Sol por su elongación
 * (llena = enfrente). El fondo toma el color del cielo según la altura del Sol, con estrellas de
 * noche, y abajo el signo del Sol y el de la Luna (con el color de su elemento).
 * micro = la hora y la Luna · s = la esfera · m = + fecha y signos · l/xl = + fase, orto/ocaso y
 * zonas. Mismos ajustes que el reloj clásico: `clockMode` y `clockZones`.
 */
import * as React from "react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { zoneLabel } from "@/components/dashboard/widgets/clock-date-widget";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import { COLOR_ELEMENTO } from "@/lib/astro/cielo";
import { Pildora, disenoDe, useAhora } from "./comun";
import { LunaSVG, coloresCielo, useCieloAqui } from "./celeste";

type Ajustes = (patch: Record<string, unknown>) => void;

export function partesHora(fecha: Date, zona?: string) {
    const opciones: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "long", day: "numeric", month: "long" };
    let f: Intl.DateTimeFormat;
    try { f = new Intl.DateTimeFormat("es-ES", { ...opciones, timeZone: zona && zona !== "local" ? zona : undefined }); }
    catch { f = new Intl.DateTimeFormat("es-ES", opciones); }
    const p = Object.fromEntries(f.formatToParts(fecha).map((x) => [x.type, x.value]));
    const h = Number(p.hour) % 24, m = Number(p.minute), s = Number(p.second);
    return { h, m, s, hhmm: `${String(h).padStart(2, "0")}:${p.minute}`, fecha: `${p.weekday} ${p.day} de ${p.month}` };
}

const horaDecimal = (d: Date) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
/** Punto de la esfera de 24 h: mediodía arriba, medianoche abajo. */
const enEsfera = (hora: number, r: number): [number, number] => {
    const a = ((hora / 24) * 360 + 180) * (Math.PI / 180);
    return [Math.sin(a) * r, -Math.cos(a) * r];
};
const hhmm = (d: Date | null) => (d ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "—");

/** Estrellas deterministas (no bailan entre renders). */
const ESTRELLAS = Array.from({ length: 14 }, (_, i) => {
    const a = (i * 137.508 * Math.PI) / 180, r = 0.25 + 0.75 * Math.sqrt((i + 0.5) / 14);
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    // Donde va el texto, las estrellas se apagan (≤ .15) para no ensuciar la hora.
    const tapa = Math.abs(x) < 0.62 && Math.abs(y) < 0.38;
    return { x, y, r: [0.5, 0.9, 1.4][i % 3], o: tapa ? 0.12 : 0.25 + ((i * 7) % 10) / 18, d: (i % 5) * 0.7 };
});

export function RelojLibre({ widget, onUpdateSettings }: { widget?: DashboardWidget; onUpdateSettings?: Ajustes }) {
    const ahora = useAhora(1000);
    const cielo = useCieloAqui(ahora);
    const modo: "analog" | "digital" = widget?.settings?.clockMode === "analog" ? "analog" : "digital";
    const zonas: string[] = Array.isArray(widget?.settings?.clockZones) ? widget!.settings!.clockZones : [];
    const id = React.useId().replace(/:/g, "");
    const t = ahora ? partesHora(ahora) : null;
    const col = coloresCielo(cielo?.altura ?? null);

    const etiqueta = t && cielo ? `Son las ${t.hhmm}, ${t.fecha}. ${cielo.luna.nombre} al ${Math.round(cielo.luna.iluminada * 100)} %. Sol en ${cielo.signos.sol.nombre}, Luna en ${cielo.signos.luna.nombre}.` : "Reloj celeste";

    return (
        <WidgetLibre forma="ninguna" acento={col.horizonte} acento2={col.alto} etiqueta={etiqueta}>
            {({ clase, ancho, alto }) => {
                if (!t || !cielo || !ahora) return null;
                const { base: b } = disenoDe(clase);
                const lado = Math.max(60, Math.min(ancho, alto));
                const sol = cielo.signos.sol, luna = cielo.signos.luna;

                if (b === "micro") {
                    return (
                        <div className="flex h-full flex-col items-center justify-center gap-1">
                            <span className="font-extralight tabular-nums tracking-tight text-white" style={{ fontSize: lado * 0.3, lineHeight: 1 }}>{t.hhmm}</span>
                            <svg width={lado * 0.22} height={lado * 0.22} viewBox="-12 -12 24 24" aria-hidden><LunaSVG r={10} fase={cielo.luna} id={`m${id}`} /></svg>
                        </div>
                    );
                }

                const R = lado * 0.44, h = horaDecimal(ahora);
                const [sx, sy] = enEsfera(h, R);
                const [lx, ly] = enEsfera(h - cielo.luna.fase * 24, R * 0.74);
                const hOrto = cielo.orto ? horaDecimal(cielo.orto) : null, hOcaso = cielo.ocaso ? horaDecimal(cielo.ocaso) : null;
                const arcoDia = hOrto !== null && hOcaso !== null ? (() => {
                    const [ax, ay] = enEsfera(hOrto, R), [bx, by] = enEsfera(hOcaso, R);
                    const grande = hOcaso - hOrto > 12 ? 1 : 0;
                    return `M${ax.toFixed(1)} ${ay.toFixed(1)}A${R.toFixed(1)} ${R.toFixed(1)} 0 ${grande} 1 ${bx.toFixed(1)} ${by.toFixed(1)}`;
                })() : null;
                const noche = cielo.altura === null ? 0.6 : Math.max(0, Math.min(1, (-cielo.altura - 2) / 10));
                const cuna = hOrto !== null && hOcaso !== null ? (() => {
                    const [ax, ay] = enEsfera(hOrto, R * 0.97), [bx, by] = enEsfera(hOcaso, R * 0.97);
                    return `M0 0L${ax.toFixed(1)} ${ay.toFixed(1)}A${(R * 0.97).toFixed(1)} ${(R * 0.97).toFixed(1)} 0 ${hOcaso - hOrto > 12 ? 1 : 0} 1 ${bx.toFixed(1)} ${by.toFixed(1)}Z`;
                })() : null;
                const bajoHorizonte = cielo.altura !== null && cielo.altura < 0;
                const grande = b === "l" || b === "xl";

                return (
                    <div className="relative flex h-full w-full items-center justify-center">
                        <svg width={lado} height={lado} viewBox={`${-lado / 2} ${-lado / 2} ${lado} ${lado}`} className="absolute overflow-visible" aria-hidden>
                            <defs>
                                <radialGradient id={`cielo-${id}`} cx="50%" cy="30%" r="75%">
                                    <stop offset="0%" stopColor={col.alto} />
                                    <stop offset="100%" stopColor={col.bajo} />
                                </radialGradient>
                                <radialGradient id={`horiz-${id}`} cx="50%" cy="100%" r="60%">
                                    <stop offset="0%" stopColor={col.horizonte} stopOpacity={0.55} />
                                    <stop offset="100%" stopColor={col.horizonte} stopOpacity={0} />
                                </radialGradient>
                                <radialGradient id={`sol-${id}`}>
                                    <stop offset="0%" stopColor="#ffffff" />
                                    <stop offset="35%" stopColor="#ffe7a3" />
                                    <stop offset="60%" stopColor="#FFBF00" stopOpacity={0.9} />
                                    <stop offset="100%" stopColor="#FFBF00" stopOpacity={0} />
                                </radialGradient>
                                <radialGradient id={`cuna-${id}`} gradientUnits="userSpaceOnUse" cx="0" cy="0" r={R}>
                                    <stop offset="0%" stopColor="#FFBF00" stopOpacity={0} />
                                    <stop offset="100%" stopColor="#FFBF00" stopOpacity={0.12} />
                                </radialGradient>
                                <linearGradient id={`dia-${id}`} x1="0" y1="1" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#ff7a59" />
                                    <stop offset="50%" stopColor="#FFBF00" />
                                    <stop offset="100%" stopColor="#ff7a59" />
                                </linearGradient>
                            </defs>
                            {/* el cielo de ahora */}
                            <circle r={R * 0.97} fill={`url(#cielo-${id})`} />
                            <circle r={R * 0.97} fill={`url(#horiz-${id})`} />
                            {noche > 0 && ESTRELLAS.map((e, i) => (
                                <circle key={i} cx={e.x * R * 0.85} cy={e.y * R * 0.85} r={e.r * Math.max(1, lado / 320)} fill="#fff"
                                    opacity={noche * e.o} className={i % 3 === 0 ? "ss-respirar" : undefined}
                                    style={{ ["--ss-dur" as string]: `${3 + e.d}s`, animationDelay: `${e.d}s`, transformBox: "fill-box", transformOrigin: "center" }} />
                            ))}
                            <circle r={R * 0.97} fill="none" stroke="#ffffff" strokeOpacity={0.1} strokeWidth={1} />
                            {/* la esfera de 24 h: la noche en violeta, el día entre el orto y el ocaso */}
                            {/* la cuña del día dentro del cielo, que se apaga hacia el centro */}
                            {cuna && <path d={cuna} fill={`url(#cuna-${id})`} />}
                            <circle r={R} fill="none" stroke="#7c5cff" strokeOpacity={0.35} strokeWidth={1} />
                            {arcoDia && <path d={arcoDia} fill="none" stroke={`url(#dia-${id})`} strokeWidth={Math.max(2, lado * 0.008)} strokeLinecap="round" />}
                            {Array.from({ length: 24 }, (_, i) => {
                                const mayor = i % 6 === 0, [x1, y1] = enEsfera(i, R * 0.93), [x2, y2] = enEsfera(i, R * (mayor ? 0.93 - 8 / R : 0.93 - 4 / R));
                                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={mayor ? 1.5 : 1} strokeOpacity={mayor ? 0.55 : 0.25} strokeLinecap="round" />;
                            })}
                            {/* la luz de los segundos */}
                            <g style={{ transform: `rotate(${(t.h * 3600 + t.m * 60 + t.s) * 6}deg)`, transition: "transform 1s linear" }}>
                                <circle cy={-R * 0.9} r={lado * 0.006} fill="#fff" opacity={0.85} />
                            </g>
                            {/* la Luna en su fase real, separada del Sol por su elongación */}
                            <g style={{ transform: `translate(${lx}px, ${ly}px)`, transition: "transform 1s ease" }}>
                                <LunaSVG r={lado * 0.048} fase={cielo.luna} id={id} />
                            </g>
                            {/* el Sol en su hora (más tenue bajo el horizonte) */}
                            <g style={{ transform: `translate(${sx}px, ${sy}px)`, transition: "transform 1s ease", filter: bajoHorizonte ? "saturate(.6)" : undefined }} opacity={bajoHorizonte ? 0.35 : 1}>
                                <circle r={lado * (bajoHorizonte ? 0.05 : 0.085)} fill={`url(#sol-${id})`} className="ss-respirar" style={{ ["--ss-dur" as string]: "6s", transformBox: "fill-box", transformOrigin: "center" }} />
                                <circle r={lado * 0.024} fill="#fff8e1" />
                            </g>
                            {grande && hOrto !== null && (() => { const [x, y] = enEsfera(hOrto, R * 1.13); return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(10, lado * 0.027)} fontWeight={600} fill="#FFBF00" opacity={0.7}>☀↑ {hhmm(cielo.orto)}</text>; })()}
                            {grande && hOcaso !== null && (() => { const [x, y] = enEsfera(hOcaso, R * 1.13); return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={Math.max(10, lado * 0.027)} fontWeight={600} fill="#FFBF00" opacity={0.7}>☀↓ {hhmm(cielo.ocaso)}</text>; })()}
                            {modo === "analog" && (
                                <g stroke="#fff" strokeLinecap="round">
                                    <line y2={-R * 0.4} strokeWidth={lado * 0.012} transform={`rotate(${(t.h % 12 + t.m / 60) * 30})`} />
                                    <line y2={-R * 0.6} strokeWidth={lado * 0.007} transform={`rotate(${t.m * 6 + t.s / 10})`} />
                                    <circle r={lado * 0.012} fill="#fff" />
                                </g>
                            )}
                        </svg>

                        <div className="relative z-10 flex flex-col items-center text-center" style={{ gap: lado * 0.012, marginTop: modo === "analog" ? R * 0.62 : 0 }}>
                            {modo === "digital" && (
                                <span className="tabular-nums text-white" style={{ fontSize: lado * 0.19, lineHeight: 1, fontWeight: 250, letterSpacing: "-0.02em" }}>{t.hhmm}</span>
                            )}
                            {b !== "s" && <span className="font-medium text-white/80 first-letter:uppercase" style={{ fontSize: Math.max(12, lado * 0.036) }}>{t.fecha}</span>}
                            {b !== "s" && (
                                <span className="font-medium text-white/65" style={{ fontSize: Math.max(11, lado * 0.032) }}>
                                    <span title={`Sol en ${sol.nombre}`}><b className="font-medium" style={{ color: COLOR_ELEMENTO[sol.elemento] }}>{sol.glifo}</b> Sol en {sol.nombre}</span>
                                    {" · "}
                                    <span title={`Luna en ${luna.nombre}`}><b className="font-medium" style={{ color: COLOR_ELEMENTO[luna.elemento] }}>{luna.glifo}</b> Luna en {luna.nombre}</span>
                                    {grande && <> · {Math.round(cielo.luna.iluminada * 100)} %</>}
                                </span>
                            )}
                            {grande && cielo.altura === null && <span className="text-[10px] text-white/50">sin ubicación: orto y ocaso sin dato</span>}
                            {b === "xl" && zonas.length > 0 && (
                                <span className="text-white/70" style={{ fontSize: Math.max(10, lado * 0.028) }}>
                                    {zonas.slice(0, 3).map((z) => `${zoneLabel(z)} ${partesHora(ahora, z).hhmm}`).join("  ·  ")}
                                </span>
                            )}
                        </div>

                        {grande && onUpdateSettings && (
                            <div className="absolute bottom-0 right-0">
                                <Pildora color={col.horizonte} onClick={() => onUpdateSettings({ clockMode: modo === "analog" ? "digital" : "analog" })}>
                                    {modo === "analog" ? "Digital" : "Agujas"}
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
