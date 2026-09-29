"use client";
/**
 * Gráficas del clima dibujadas con datos (SVG + etiquetas HTML para que el texto no se
 * deforme): curva de horas con lluvia, franja de próximas horas, filas de días con su
 * horquilla, línea vertical del día (torre), brújula del viento, arco UV, medidor del aire y
 * arco del Sol con la Luna.
 */
import * as React from "react";
import type { FaseLunar } from "@/lib/astro/cielo";
import type { DiaClima, HoraClima } from "@/modules/weather/datos/open-meteo";
import { colorTemperatura, nivelUv, rumbo, type NivelAire } from "@/modules/weather/datos/interpretar";
import { aTemp, aViento, ETIQUETA_VIENTO, type Unidades } from "@/modules/weather/datos/hooks";
import { colorIcono, iconoCielo, LunaFase } from "./cielo";
import s from "./clima.module.css";

const r0 = (v: number) => Math.round(v);

export function grados(c: number | null, u: Unidades): string {
    return c === null ? "—" : `${r0(aTemp(c, u.temp))}°`;
}

export function velocidad(kmh: number | null, u: Unidades, conUnidad = true): string {
    if (kmh === null) return "—";
    const v = aViento(kmh, u.viento);
    const txt = u.viento === "ms" ? v.toFixed(1).replace(".", ",") : String(r0(v));
    return conUnidad ? `${txt} ${ETIQUETA_VIENTO[u.viento]}` : txt;
}

/** Trazo suave (Catmull-Rom → Bézier) por los puntos dados. */
export function trazoSuave(pts: [number, number][]): string {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d;
}

// ── Curva de horas ────────────────────────────────────────────────────

export function GraficaHoras({ horas, hora, u, color = "#fde047", etiquetas = 6, alto = 88, mostrarSensacion = false, id }: {
    horas: HoraClima[]; hora: (t: number) => string; u: Unidades; color?: string; etiquetas?: number; alto?: number; mostrarSensacion?: boolean; id: string;
}) {
    const validas = horas.filter((h) => h.temp !== null);
    if (validas.length < 2) return null;
    const temps = validas.map((h) => h.temp as number);
    const sens = mostrarSensacion ? validas.map((h) => h.sensacion ?? (h.temp as number)) : [];
    const min = Math.min(...temps, ...(sens.length ? sens : temps)), max = Math.max(...temps, ...(sens.length ? sens : temps));
    const W = 100, H = 40, pad = 5;
    const y = (v: number) => H - pad - ((v - min) / Math.max(1, max - min)) * (H - pad * 2);
    const x = (i: number) => (i / (validas.length - 1)) * W;
    const pts = temps.map((v, i) => [x(i), y(v)] as [number, number]);
    const d = trazoSuave(pts);
    const iMax = temps.indexOf(max === Math.max(...temps) ? max : Math.max(...temps));
    const iMin = temps.indexOf(Math.min(...temps));
    const paso = Math.max(1, Math.round(validas.length / etiquetas));
    const resumen = `Temperatura de ${hora(validas[0].t)} a ${hora(validas[validas.length - 1].t)}: mínima ${grados(Math.min(...temps), u)} y máxima ${grados(Math.max(...temps), u)}`;
    return (
        <figure className="relative w-full" style={{ height: alto }} aria-label={resumen} role="img">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[78%] w-full overflow-visible" aria-hidden>
                <defs>
                    <linearGradient id={`gh-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={`gl-${id}`} x1="0" y1="0" x2="1" y2="0">
                        {validas.map((h, i) => <stop key={h.t} offset={`${(i / (validas.length - 1)) * 100}%`} stopColor={colorTemperatura(h.temp)} />)}
                    </linearGradient>
                </defs>
                {validas.map((h, i) => (h.probLluvia ?? 0) >= 10 && (
                    <rect key={`p${h.t}`} x={x(i) - 0.9} width={1.8} y={H - ((h.probLluvia as number) / 100) * (H * 0.45)} height={((h.probLluvia as number) / 100) * (H * 0.45)} fill="#7dd3fc" opacity={0.35} rx={0.6} />
                ))}
                <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#gh-${id})`} />
                {mostrarSensacion && sens.length > 1 && (
                    <path d={trazoSuave(sens.map((v, i) => [x(i), y(v)] as [number, number]))} fill="none" stroke="#ffffff" strokeOpacity={0.45} strokeWidth={0.5} strokeDasharray="1.4 1.4" vectorEffect="non-scaling-stroke" />
                )}
                <path d={d} fill="none" stroke={`url(#gl-${id})`} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            {[iMax, iMin].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
                <span key={`m${i}`} className={`${s.cifra} absolute -translate-x-1/2 text-[11px] font-semibold`} style={{ left: `${Math.min(94, Math.max(6, x(i)))}%`, top: `calc(${(y(temps[i]) / H) * 78}% - ${i === iMax ? 16 : -4}px)` }}>
                    {grados(temps[i], u)}
                </span>
            ))}
            <div className="absolute inset-x-0 bottom-0 flex h-[20%] items-end">
                {validas.map((h, i) => i % paso === 0 && (
                    <span key={`t${h.t}`} className={`${s.cifra} absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-white/55`} style={{ left: `${Math.min(96, Math.max(4, x(i)))}%` }}>
                        {i === 0 ? "Ahora" : hora(h.t)}
                    </span>
                ))}
            </div>
        </figure>
    );
}

// ── Franja de próximas horas ──────────────────────────────────────────

export function FranjaHoras({ horas, hora, u, compacta = false }: { horas: HoraClima[]; hora: (t: number) => string; u: Unidades; compacta?: boolean }) {
    return (
        <ol className="grid w-full" style={{ gridTemplateColumns: `repeat(${horas.length}, minmax(0, 1fr))` }} aria-label="Próximas horas">
            {horas.map((h, i) => {
                const Icono = iconoCielo(h.codigo, h.esDia);
                const lluvia = (h.probLluvia ?? 0) >= 20 ? `${r0(h.probLluvia as number)}%` : null;
                return (
                    <li key={h.t} className="flex min-w-0 flex-col items-center gap-0.5" aria-label={`${i === 0 ? "Ahora" : hora(h.t)}: ${grados(h.temp, u)}${lluvia ? `, lluvia ${lluvia}` : ""}`}>
                        <span className={`${s.cifra} text-[10px] text-white/55`}>{i === 0 ? "Ahora" : hora(h.t).slice(0, 2)}</span>
                        <Icono aria-hidden className={compacta ? "size-3.5" : "size-4"} style={{ color: colorIcono(h.codigo, h.esDia) }} />
                        <span className={`${s.cifra} text-[12px] font-semibold`}>{grados(h.temp, u)}</span>
                        {!compacta && <span className={`${s.cifra} h-3 text-[9px] text-sky-300/90`}>{lluvia ?? ""}</span>}
                    </li>
                );
            })}
        </ol>
    );
}

// ── Días ──────────────────────────────────────────────────────────────

export function FilaDias({ dias, dia, u, ahoraTemp, compacta = false }: { dias: DiaClima[]; dia: (t: number) => string; u: Unidades; ahoraTemp?: number | null; compacta?: boolean }) {
    const mins = dias.map((d) => d.min).filter((v): v is number => v !== null);
    const maxs = dias.map((d) => d.max).filter((v): v is number => v !== null);
    if (!mins.length || !maxs.length) return null;
    const lo = Math.min(...mins), hi = Math.max(...maxs), rango = Math.max(1, hi - lo);
    return (
        <ul className="flex w-full flex-col" aria-label="Próximos días">
            {dias.map((d, i) => {
                const Icono = iconoCielo(d.codigo, true);
                const a = d.min === null ? 0 : ((d.min - lo) / rango) * 100, b = d.max === null ? 100 : ((d.max - lo) / rango) * 100;
                const nombre = i === 0 ? "Hoy" : dia(d.t);
                return (
                    <li key={d.t} className={`grid items-center gap-2 ${compacta ? "py-0.5" : "py-1"}`} style={{ gridTemplateColumns: "2.6rem 1.2rem 2.1rem 2.1rem minmax(2rem,1fr) 2.1rem" }}
                        aria-label={`${nombre}: de ${grados(d.min, u)} a ${grados(d.max, u)}${(d.probLluvia ?? 0) >= 20 ? `, lluvia ${r0(d.probLluvia as number)} %` : ""}`}>
                        <span className="truncate text-[12px] capitalize text-white/80">{nombre}</span>
                        <Icono aria-hidden className="size-4" style={{ color: colorIcono(d.codigo) }} />
                        <span className={`${s.cifra} text-[10px] text-sky-300/90`}>{(d.probLluvia ?? 0) >= 20 ? `${r0(d.probLluvia as number)}%` : ""}</span>
                        <span className={`${s.cifra} text-right text-[12px] text-white/55`}>{grados(d.min, u)}</span>
                        <span className="relative h-1.5 rounded-full bg-white/10" aria-hidden>
                            <span className="absolute inset-y-0 rounded-full" style={{ left: `${a}%`, right: `${100 - b}%`, background: `linear-gradient(90deg, ${colorTemperatura(d.min)}, ${colorTemperatura(d.max)})` }} />
                            {i === 0 && ahoraTemp !== undefined && ahoraTemp !== null && (
                                <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0c0f24] bg-white" style={{ left: `${Math.min(100, Math.max(0, ((ahoraTemp - lo) / rango) * 100))}%` }} />
                            )}
                        </span>
                        <span className={`${s.cifra} text-[12px] font-semibold`}>{grados(d.max, u)}</span>
                    </li>
                );
            })}
        </ul>
    );
}

// ── Línea del día (torre) ─────────────────────────────────────────────

export function LineaDia({ horas, hora, u, orto, ocaso }: { horas: HoraClima[]; hora: (t: number) => string; u: Unidades; orto: number | null; ocaso: number | null }) {
    const temps = horas.map((h) => h.temp).filter((v): v is number => v !== null);
    if (!temps.length) return null;
    const lo = Math.min(...temps), hi = Math.max(...temps), rango = Math.max(1, hi - lo);
    type Fila = { tipo: "hora"; h: HoraClima } | { tipo: "sol"; t: number; sale: boolean };
    const filas: Fila[] = [];
    horas.forEach((h, i) => {
        filas.push({ tipo: "hora", h });
        const sig = horas[i + 1]?.t ?? h.t + 3_600_000;
        if (orto && orto > h.t && orto <= sig) filas.push({ tipo: "sol", t: orto, sale: true });
        if (ocaso && ocaso > h.t && ocaso <= sig) filas.push({ tipo: "sol", t: ocaso, sale: false });
    });
    return (
        <ol className="relative flex w-full flex-col" aria-label="El día hora a hora">
            <span aria-hidden className="absolute bottom-2 left-[3.1rem] top-2 w-px bg-gradient-to-b from-white/30 via-white/10 to-transparent" />
            {filas.map((f, i) => {
                if (f.tipo === "sol") {
                    return (
                        <li key={`s${f.t}`} className="flex items-center gap-2 py-0.5 text-[11px] text-amber-200/90">
                            <span className={`${s.cifra} w-10 text-right`}>{hora(f.t)}</span>
                            <span aria-hidden className="size-2 rounded-full" style={{ background: f.sale ? "#fbbf24" : "#fb7185", boxShadow: `0 0 8px ${f.sale ? "#fbbf24" : "#fb7185"}` }} />
                            <span>{f.sale ? "Sale el sol" : "Se pone el sol"}</span>
                        </li>
                    );
                }
                const h = f.h;
                const Icono = iconoCielo(h.codigo, h.esDia);
                const ancho = h.temp === null ? 0 : 18 + ((h.temp - lo) / rango) * 82;
                return (
                    <li key={h.t} className="flex items-center gap-2 py-[3px]" aria-label={`${i === 0 ? "Ahora" : hora(h.t)}: ${grados(h.temp, u)}`}>
                        <span className={`${s.cifra} w-10 text-right text-[11px] ${i === 0 ? "font-semibold text-white" : "text-white/55"}`}>{i === 0 ? "Ahora" : hora(h.t)}</span>
                        <Icono aria-hidden className="size-4 shrink-0" style={{ color: colorIcono(h.codigo, h.esDia) }} />
                        <span className="relative h-1.5 flex-1 rounded-full bg-white/[0.06]" aria-hidden>
                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${ancho}%`, background: `linear-gradient(90deg, ${colorTemperatura(lo)}, ${colorTemperatura(h.temp)})` }} />
                        </span>
                        <span className={`${s.cifra} w-9 text-right text-[12px] font-semibold`}>{grados(h.temp, u)}</span>
                        <span className={`${s.cifra} w-8 text-right text-[10px] text-sky-300/90`}>{(h.probLluvia ?? 0) >= 20 ? `${r0(h.probLluvia as number)}%` : ""}</span>
                    </li>
                );
            })}
        </ol>
    );
}

// ── Brújula del viento ────────────────────────────────────────────────

export function BrujulaViento({ dir, kmh, rachas, u, lado = 120, conCifra = true, color = "#5eead4" }: {
    dir: number | null; kmh: number | null; rachas?: number | null; u: Unidades; lado?: number; conCifra?: boolean; color?: string;
}) {
    const hacia = dir === null ? null : (dir + 180) % 360;
    const etiqueta = dir === null ? "Sin dirección del viento" : `Viento ${rumbo(dir)} a ${velocidad(kmh, u)}${rachas ? `, rachas de ${velocidad(rachas, u)}` : ""}`;
    return (
        <div className="relative shrink-0" style={{ width: lado, height: lado }} role="img" aria-label={etiqueta}>
            <svg viewBox="-50 -50 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                <circle r={46} fill="none" stroke="#ffffff" strokeOpacity={0.12} />
                <circle r={36} fill="#ffffff" fillOpacity={0.03} />
                {Array.from({ length: 36 }, (_, i) => {
                    const a = (i * 10 * Math.PI) / 180, largo = i % 9 === 0 ? 7 : i % 3 === 0 ? 4 : 2;
                    return <line key={i} x1={Math.sin(a) * 46} y1={-Math.cos(a) * 46} x2={Math.sin(a) * (46 - largo)} y2={-Math.cos(a) * (46 - largo)} stroke="#ffffff" strokeOpacity={i % 9 === 0 ? 0.6 : 0.22} strokeWidth={i % 9 === 0 ? 1.2 : 0.6} />;
                })}
                {(["N", "E", "S", "O"] as const).map((c, i) => {
                    const a = (i * 90 * Math.PI) / 180;
                    return <text key={c} x={Math.sin(a) * 30} y={-Math.cos(a) * 30 + 3.2} textAnchor="middle" fontSize={9} fontWeight={600} fill={c === "N" ? "#fda4af" : "#ffffff"} fillOpacity={0.75}>{c}</text>;
                })}
                {hacia !== null && (
                    <g transform={`rotate(${hacia})`} style={{ transition: "transform 300ms ease-out" }}>
                        <line x1={0} y1={34} x2={0} y2={-30} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
                        <path d="M0 -42 L7 -28 L0 -31 L-7 -28 Z" fill={color} />
                        <circle cy={34} r={3} fill="none" stroke={color} strokeWidth={1.6} />
                    </g>
                )}
            </svg>
            {conCifra && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`${s.cifra} font-light leading-none`} style={{ fontSize: lado * 0.2 }}>{velocidad(kmh, u, false)}</span>
                    <span className="text-[10px] text-white/60">{ETIQUETA_VIENTO[u.viento]}</span>
                </div>
            )}
        </div>
    );
}

// ── Arco UV ───────────────────────────────────────────────────────────

const SEGMENTOS_UV: [number, number, string][] = [[0, 3, "#4ade80"], [3, 6, "#facc15"], [6, 8, "#fb923c"], [8, 11, "#ef4444"], [11, 13, "#a855f7"]];

function arco(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const p = (a: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Semicírculo 0-12+ por tramos de la OMS con la aguja en el UV actual. */
export function ArcoUV({ uv, lado = 160, conCifra = true }: { uv: number | null; lado?: number; conCifra?: boolean }) {
    const n = nivelUv(uv);
    const ang = (v: number) => Math.PI + (Math.min(13, Math.max(0, v)) / 13) * Math.PI;
    return (
        <div className="relative" style={{ width: lado, height: lado * 0.62 }} role="img" aria-label={uv === null ? "Sin dato de UV" : `Índice UV ${r0(uv)}: ${n?.texto}`}>
            <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full" aria-hidden>
                {SEGMENTOS_UV.map(([a, b, c]) => (
                    <path key={a} d={arco(50, 52, 42, ang(a) + 0.02, ang(b) - 0.02)} stroke={c} strokeWidth={7} fill="none" strokeLinecap="butt" opacity={uv !== null && uv >= a ? 1 : 0.28} />
                ))}
                {uv !== null && (
                    <g transform={`rotate(${(ang(uv) * 180) / Math.PI - 180} 50 52)`}>
                        <line x1={50} y1={52} x2={14} y2={52} stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
                        <circle cx={50} cy={52} r={3} fill="#fff" />
                    </g>
                )}
            </svg>
            {conCifra && (
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
                    <span className={`${s.cifra} font-light leading-none`} style={{ fontSize: lado * 0.2, color: n?.color }}>{uv === null ? "—" : r0(uv)}</span>
                </div>
            )}
        </div>
    );
}

// ── Medidor de calidad del aire ───────────────────────────────────────

export function MedidorAire({ nivel, lado = 150 }: { nivel: NivelAire | null; lado?: number }) {
    const tramos = nivel?.escala === "eeuu"
        ? [[0, 50, "#4ade80"], [50, 100, "#facc15"], [100, 150, "#fb923c"], [150, 200, "#ef4444"], [200, 300, "#a855f7"]] as const
        : [[0, 20, "#50f0e6"], [20, 40, "#50ccaa"], [40, 60, "#f0e641"], [60, 80, "#ff5050"], [80, 100, "#c23461"]] as const;
    const techo = nivel?.escala === "eeuu" ? 300 : 100;
    const ang = (v: number) => (-220 + (Math.min(techo, Math.max(0, v)) / techo) * 260) * (Math.PI / 180);
    return (
        <div className="relative shrink-0" style={{ width: lado, height: lado }} role="img" aria-label={nivel ? `Calidad del aire ${nivel.texto.toLowerCase()}, índice ${nivel.indice}` : "Sin dato de calidad del aire"}>
            <svg viewBox="-50 -50 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                {tramos.map(([a, b, c]) => (
                    <path key={a} d={arco(0, 0, 40, ang(a) + 0.03, ang(b) - 0.03)} stroke={c} strokeWidth={8} fill="none" opacity={nivel && nivel.indice >= a ? 0.95 : 0.25} />
                ))}
                {nivel && (() => {
                    const a = ang(nivel.indice);
                    return <circle cx={Math.cos(a) * 40} cy={Math.sin(a) * 40} r={6} fill="#0c0f24" stroke="#fff" strokeWidth={2.2} />;
                })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`${s.cifra} font-light leading-none`} style={{ fontSize: lado * 0.24, color: nivel?.color }}>{nivel ? nivel.indice : "—"}</span>
                <span className="mt-1 max-w-[80%] truncate text-center text-[11px] text-white/75" title={nivel?.texto}>{nivel?.texto ?? "sin dato"}</span>
            </div>
        </div>
    );
}

// ── Arco del Sol (y la Luna) ──────────────────────────────────────────

export function ArcoSolar({ orto, ocaso, ahora, fase, hora, alto = 90, id, conLuna = true }: {
    orto: number | null; ocaso: number | null; ahora: number; fase: FaseLunar | null; hora: (t: number) => string; alto?: number; id: string; conLuna?: boolean;
}) {
    const W = 200, H = 90, base = 72, rx = 84, ry = 60;
    const dia = orto !== null && ocaso !== null && ocaso > orto;
    const f = dia ? (ahora - orto) / (ocaso - orto) : null;
    const deDia = f !== null && f >= 0 && f <= 1;
    const ang = f === null ? null : Math.PI - Math.max(0, Math.min(1, f)) * Math.PI;
    const sx = ang === null ? null : W / 2 + Math.cos(ang) * rx, sy = ang === null ? null : base - Math.sin(ang) * ry;
    const luz = dia ? Math.round((ocaso - orto) / 60_000) : null;
    const etiqueta = dia ? `Sale el sol a las ${hora(orto)} y se pone a las ${hora(ocaso)}; ${Math.floor((luz as number) / 60)} h ${(luz as number) % 60} min de luz` : "Sin horas de sol para hoy";
    return (
        <figure className="relative w-full" style={{ height: alto }} role="img" aria-label={etiqueta}>
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                    <linearGradient id={`as-${id}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#fb923c" /><stop offset="50%" stopColor="#fde047" /><stop offset="100%" stopColor="#fb7185" />
                    </linearGradient>
                    <radialGradient id={`ag-${id}`}>
                        <stop offset="0%" stopColor="#fffbe8" /><stop offset="40%" stopColor="#fde047" stopOpacity={0.7} /><stop offset="100%" stopColor="#fde047" stopOpacity={0} />
                    </radialGradient>
                </defs>
                <line x1={6} x2={W - 6} y1={base} y2={base} stroke="#ffffff" strokeOpacity={0.25} strokeDasharray="2 3" />
                <path d={`M${W / 2 - rx} ${base} A${rx} ${ry} 0 0 1 ${W / 2 + rx} ${base}`} fill="none" stroke={`url(#as-${id})`} strokeWidth={1.6} strokeOpacity={0.55} strokeDasharray="1 3" strokeLinecap="round" />
                {deDia && ang !== null && (
                    <path d={`M${W / 2 - rx} ${base} A${rx} ${ry} 0 0 1 ${sx!.toFixed(2)} ${sy!.toFixed(2)}`} fill="none" stroke={`url(#as-${id})`} strokeWidth={2.4} strokeLinecap="round" />
                )}
                {deDia && sx !== null && sy !== null && (
                    <g>
                        <circle cx={sx} cy={sy} r={12} fill={`url(#ag-${id})`} />
                        <circle cx={sx} cy={sy} r={4.4} fill="#fff8e1" />
                    </g>
                )}
                {conLuna && fase && !deDia && <LunaFase r={9} fase={fase} id={`${id}l`} x={W / 2} y={30} />}
            </svg>
            {dia && (
                <>
                    <span className={`${s.cifra} absolute bottom-0 left-[4%] text-[11px] text-amber-200/90`}>{hora(orto)}</span>
                    <span className={`${s.cifra} absolute bottom-0 right-[4%] text-[11px] text-rose-200/90`}>{hora(ocaso)}</span>
                </>
            )}
        </figure>
    );
}

/** Termómetro horizontal del día: dónde está ahora entre la mínima y la máxima. */
export function RangoHoy({ min, max, ahora, u }: { min: number | null; max: number | null; ahora: number | null; u: Unidades }) {
    if (min === null || max === null) return null;
    const pos = ahora === null ? null : Math.min(100, Math.max(0, ((ahora - min) / Math.max(1, max - min)) * 100));
    return (
        <div className="flex w-full items-center gap-2" aria-label={`Hoy de ${grados(min, u)} a ${grados(max, u)}`}>
            <span className={`${s.cifra} text-[12px] text-white/60`}>{grados(min, u)}</span>
            <span className="relative h-1.5 flex-1 rounded-full" style={{ background: `linear-gradient(90deg, ${colorTemperatura(min)}, ${colorTemperatura(max)})` }} aria-hidden>
                {pos !== null && <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0c0f24] bg-white shadow" style={{ left: `${pos}%` }} />}
            </span>
            <span className={`${s.cifra} text-[12px] font-semibold`}>{grados(max, u)}</span>
        </div>
    );
}

/** Barras de una serie horaria cualquiera (viento, humedad, UV…). */
export function BarrasHoras({ horas, valor, color, hora, formato, maximo, etiqueta }: {
    horas: HoraClima[]; valor: (h: HoraClima) => number | null; color: (v: number) => string; hora: (t: number) => string;
    formato: (v: number) => string; maximo?: number; etiqueta: string;
}) {
    const vals = horas.map(valor);
    const nums = vals.filter((v): v is number => v !== null);
    if (!nums.length) return null;
    const tope = maximo ?? Math.max(1, ...nums);
    const paso = Math.max(1, Math.round(horas.length / 6));
    return (
        <figure className="flex w-full flex-col gap-1" aria-label={etiqueta} role="img">
            <div className="flex h-14 w-full items-end gap-[2px]" aria-hidden>
                {vals.map((v, i) => (
                    <span key={horas[i].t} className="flex-1 rounded-t-[3px]" style={{ height: `${v === null ? 0 : Math.max(4, (v / tope) * 100)}%`, background: v === null ? "transparent" : color(v), opacity: i === 0 ? 1 : 0.8 }}
                        title={v === null ? undefined : `${i === 0 ? "Ahora" : hora(horas[i].t)}: ${formato(v)}`} />
                ))}
            </div>
            <div className="relative h-3.5 w-full" aria-hidden>
                {horas.map((h, i) => i % paso === 0 && (
                    <span key={h.t} className={`${s.cifra} absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-white/50`} style={{ left: `${Math.min(95, Math.max(5, ((i + 0.5) / horas.length) * 100))}%` }}>{i === 0 ? "Ahora" : hora(h.t).slice(0, 2)}</span>
                ))}
            </div>
        </figure>
    );
}
