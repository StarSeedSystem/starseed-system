"use client";
/**
 * Piezas del clima espacial (NOAA SWPC), dibujadas con datos: medidor de Kp con la escala de
 * tormentas G1-G5, barras de Kp observado y previsto, curva de rayos X en escala logarítmica
 * con las clases A-X, línea de llamaradas de 7 días, el viento solar viajando del Sol a la
 * magnetosfera (con la «puerta» Bz), el óvalo auroral OVATION sobre tu hemisferio, la traza del
 * magnetómetro y el espectro de referencia de Schumann.
 */
import * as React from "react";
import type { Llamarada, PuntoKp, PuntoCampo, PuntoRayos, DatosAurora } from "@/modules/weather/datos/noaa";
import { COLOR_SEVERIDAD, escalaG, MODOS_SCHUMANN, nombreG, severidadKp, type Severidad } from "@/modules/weather/datos/interpretar";
import { trazoSuave } from "../_clima/graficas";
import s from "../_clima/clima.module.css";

export const COLOR_G = ["#34d399", "#facc15", "#fb923c", "#f43f5e", "#e11d48", "#d946ef"];
export function colorKp(kp: number): string {
    return kp < 4 ? "#34d399" : kp < 5 ? "#a3e635" : COLOR_G[escalaG(kp)];
}
export const COLOR_CLASE: Record<string, string> = { A: "#64748b", B: "#34d399", C: "#facc15", M: "#fb923c", X: "#f43f5e" };

function arcoCirc(r: number, a0: number, a1: number): string {
    const p = (a: number) => [Math.cos(a) * r, Math.sin(a) * r];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ── Medidor de Kp ─────────────────────────────────────────────────────

export function MedidorKp({ kp, lado, conTexto = true }: { kp: number | null; lado: number; conTexto?: boolean }) {
    const ang = (v: number) => (-210 + (Math.min(9, Math.max(0, v)) / 9) * 240) * (Math.PI / 180);
    const g = escalaG(kp);
    const etiqueta = kp === null ? "Sin lectura del índice Kp" : `Índice Kp ${kp.toFixed(1).replace(".", ",")}: ${nombreG(g)}`;
    return (
        <div className="relative shrink-0" style={{ width: lado, height: lado }} role="img" aria-label={etiqueta}>
            <svg viewBox="-50 -50 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                {Array.from({ length: 9 }, (_, i) => (
                    <path key={i} d={arcoCirc(41, ang(i) + 0.025, ang(i + 1) - 0.025)} stroke={colorKp(i + 0.5)} strokeWidth={7} fill="none" opacity={kp !== null && kp >= i ? 1 : 0.22} />
                ))}
                {[5, 6, 7, 8, 9].map((v, i) => {
                    const a = ang(v - 0.5), x = Math.cos(a) * 30, y = Math.sin(a) * 30;
                    return <text key={v} x={x} y={y + 2} textAnchor="middle" fontSize={5.2} fill={COLOR_G[i + 1]} fillOpacity={0.8}>G{i + 1}</text>;
                })}
                {kp !== null && (() => {
                    const a = ang(kp);
                    return <circle cx={Math.cos(a) * 41} cy={Math.sin(a) * 41} r={5} fill="#0c0f24" stroke="#fff" strokeWidth={2} />;
                })()}
            </svg>
            {conTexto && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`${s.cifra} font-light leading-none`} style={{ fontSize: lado * 0.26, color: kp === null ? undefined : colorKp(kp) }}>{kp === null ? "—" : kp.toFixed(1).replace(".", ",")}</span>
                    <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/60">Kp</span>
                </div>
            )}
        </div>
    );
}

// ── Barras de Kp ──────────────────────────────────────────────────────

export function BarrasKp({ pasadas, previstas, hora, alto = 70 }: { pasadas: PuntoKp[]; previstas: PuntoKp[]; hora: (t: number) => string; alto?: number }) {
    const todas = [...pasadas, ...previstas];
    if (!todas.length) return null;
    const paso = Math.max(1, Math.round(todas.length / 6));
    return (
        <figure className="flex w-full flex-col gap-1" role="img" aria-label={`Kp de las últimas ${pasadas.length * 3} horas y previsión de ${previstas.length * 3} horas; máximo previsto ${previstas.length ? Math.max(...previstas.map((p) => p.kp)).toFixed(1) : "—"}`}>
            <div className="relative flex w-full items-end gap-[3px]" style={{ height: alto }} aria-hidden>
                <span className="absolute inset-x-0 border-t border-dashed border-amber-300/40" style={{ bottom: `${(5 / 9) * 100}%` }} title="Umbral de tormenta G1" />
                {todas.map((p, i) => (
                    <span key={`${p.t}-${i}`} className="relative flex-1 rounded-t-[3px]" title={`${hora(p.t)}: Kp ${p.kp.toFixed(2)} (${p.tipo})`}
                        style={{
                            height: `${Math.max(4, (p.kp / 9) * 100)}%`,
                            background: p.tipo === "previsto" ? `${colorKp(p.kp)}55` : colorKp(p.kp),
                            boxShadow: p.tipo === "previsto" ? `inset 0 0 0 1px ${colorKp(p.kp)}` : undefined,
                            marginLeft: i === pasadas.length && pasadas.length ? 6 : undefined,
                        }} />
                ))}
            </div>
            <div className="relative h-3.5 w-full" aria-hidden>
                {todas.map((p, i) => i % paso === 0 && (
                    <span key={`e${p.t}`} className={`${s.cifra} absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-white/50`} style={{ left: `${Math.min(94, Math.max(6, ((i + 0.5) / todas.length) * 100))}%` }}>{hora(p.t)}</span>
                ))}
            </div>
            <figcaption className="flex items-center gap-3 text-[10px] text-white/55">
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-400" aria-hidden />medido</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-sm ring-1 ring-emerald-400" aria-hidden />previsto</span>
                <span className="inline-flex items-center gap-1"><span className="h-0 w-3 border-t border-dashed border-amber-300/70" aria-hidden />tormenta</span>
            </figcaption>
        </figure>
    );
}

// ── Rayos X ───────────────────────────────────────────────────────────

const LOG_MIN = -8.5, LOG_MAX = -3.5;
const yLog = (f: number, H: number) => H - ((Math.log10(Math.max(1e-9, f)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * H;

export function GraficaRayos({ serie, llamaradas = [], hora, alto = 90, id }: { serie: PuntoRayos[]; llamaradas?: Llamarada[]; hora: (t: number) => string; alto?: number; id: string }) {
    if (serie.length < 2) return null;
    const W = 100, H = 50, t0 = serie[0].t, t1 = serie[serie.length - 1].t;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const d = serie.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)} ${yLog(p.flujo, H).toFixed(2)}`).join("");
    const visibles = llamaradas.filter((l) => (l.maximo ?? l.inicio) >= t0 && (l.maximo ?? l.inicio) <= t1);
    const max = serie.reduce((m, p) => (p.flujo > m.flujo ? p : m), serie[0]);
    return (
        <figure className="relative w-full" style={{ height: alto }} role="img" aria-label={`Rayos X de las últimas ${Math.round((t1 - t0) / 3_600_000)} horas; pico a las ${hora(max.t)}`}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-y-0 left-0 h-[84%] w-[90%] overflow-visible" aria-hidden>
                <defs>
                    <linearGradient id={`rx-${id}`} x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor={COLOR_CLASE.A} /><stop offset="30%" stopColor={COLOR_CLASE.B} /><stop offset="50%" stopColor={COLOR_CLASE.C} />
                        <stop offset="70%" stopColor={COLOR_CLASE.M} /><stop offset="90%" stopColor={COLOR_CLASE.X} />
                    </linearGradient>
                </defs>
                {[-7, -6, -5, -4].map((e) => <line key={e} x1={0} x2={W} y1={yLog(10 ** e, H)} y2={yLog(10 ** e, H)} stroke="#fff" strokeOpacity={0.12} strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke" />)}
                <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#rx-${id})`} opacity={0.18} />
                <path d={d} fill="none" stroke={`url(#rx-${id})`} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            {visibles.map((l) => {
                const t = l.maximo ?? l.inicio;
                const letra = l.clase[0];
                return <span key={`${l.inicio}`} className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#0c0f24]" style={{ left: `${x(t) * 0.9}%`, top: `${(yLog(l.flujo ?? 1e-6, H) / H) * 84}%`, background: COLOR_CLASE[letra] }} title={`Llamarada ${l.clase} a las ${hora(t)}`} />;
            })}
            <div className="absolute inset-y-0 right-0 h-[84%] w-[9%]" aria-hidden>
                {(["X", "M", "C", "B", "A"] as const).map((c, i) => (
                    <span key={c} className="absolute right-0 -translate-y-1/2 text-[10px] font-semibold" style={{ top: `${(yLog(10 ** (-4 - i) * 3, H) / H) * 100}%`, color: COLOR_CLASE[c] }}>{c}</span>
                ))}
            </div>
            <div className="absolute inset-x-0 bottom-0 flex h-[14%] w-[90%] justify-between text-[10px] text-white/50" aria-hidden>
                <span className={s.cifra}>{hora(t0)}</span><span className={s.cifra}>{hora(t0 + (t1 - t0) / 2)}</span><span>ahora</span>
            </div>
        </figure>
    );
}

export function LineaLlamaradas({ llamaradas, ahora, dia, dias = 7 }: { llamaradas: Llamarada[]; ahora: number; dia: (t: number) => string; dias?: number }) {
    const t0 = ahora - dias * 86_400_000;
    const lista = llamaradas.filter((l) => l.inicio >= t0 && /^[CMX]/.test(l.clase));
    const x = (t: number) => ((t - t0) / (ahora - t0)) * 100;
    const cuenta = { C: lista.filter((l) => l.clase[0] === "C").length, M: lista.filter((l) => l.clase[0] === "M").length, X: lista.filter((l) => l.clase[0] === "X").length };
    return (
        <figure className="flex w-full flex-col gap-1" role="img" aria-label={`Llamaradas de los últimos ${dias} días: ${cuenta.X} de clase X, ${cuenta.M} M y ${cuenta.C} C`}>
            <div className="relative h-9 w-full" aria-hidden>
                <span className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
                {Array.from({ length: dias + 1 }, (_, i) => <span key={i} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-white/25" style={{ left: `${(i / dias) * 100}%` }} />)}
                {lista.map((l) => {
                    const letra = l.clase[0], tam = letra === "X" ? 14 : letra === "M" ? 10 : 6;
                    return <span key={`${l.inicio}${l.clase}`} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" title={`${l.clase} · ${dia(l.inicio)}`}
                        style={{ left: `${x(l.maximo ?? l.inicio)}%`, width: tam, height: tam, background: COLOR_CLASE[letra], boxShadow: `0 0 ${tam}px ${COLOR_CLASE[letra]}88`, opacity: letra === "C" ? 0.7 : 1 }} />;
                })}
            </div>
            <div className="flex justify-between text-[10px] capitalize text-white/50" aria-hidden>
                {Array.from({ length: dias }, (_, i) => <span key={i}>{dia(t0 + (i + 0.5) * 86_400_000)}</span>)}
            </div>
            <figcaption className="flex gap-3 text-[11px] text-white/70">
                {(["X", "M", "C"] as const).map((c) => <span key={c} className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: COLOR_CLASE[c] }} aria-hidden />{cuenta[c]} {c}</span>)}
            </figcaption>
        </figure>
    );
}

// ── Viento solar ──────────────────────────────────────────────────────

/** Partículas del Sol a la Tierra: más rápidas con más velocidad, más numerosas con más densidad. */
export function FlujoViento({ velocidad, densidad, bz, animar, alto = 90 }: { velocidad: number | null; densidad: number | null; bz: number | null; animar: boolean; alto?: number }) {
    const n = Math.round(Math.max(5, Math.min(18, (densidad ?? 4) * 2)));
    const dur = velocidad === null ? 4 : Math.max(1.4, Math.min(6, 1200 / velocidad));
    const abierta = bz !== null && bz < -2;
    const colorBz = bz === null ? "#94a3b8" : bz <= -10 ? "#f43f5e" : bz <= -5 ? "#fb923c" : bz < 0 ? "#facc15" : "#34d399";
    const etiqueta = `Viento solar ${velocidad === null ? "sin lectura" : `a ${Math.round(velocidad)} km/s`}${densidad === null ? "" : `, ${densidad.toFixed(1)} protones por cm³`}${bz === null ? "" : `; Bz ${bz.toFixed(1)} nT ${abierta ? "(puerta abierta)" : "(puerta cerrada)"}`}`;
    return (
        <figure className="relative w-full" style={{ height: alto }} role="img" aria-label={etiqueta}>
            <svg viewBox="0 0 200 80" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                    <radialGradient id="fv-sol"><stop offset="0%" stopColor="#fffbe8" /><stop offset="35%" stopColor="#ffd27a" /><stop offset="70%" stopColor="#ff8a3d" stopOpacity={0.5} /><stop offset="100%" stopColor="#ff8a3d" stopOpacity={0} /></radialGradient>
                    <radialGradient id="fv-tierra" cx="40%" cy="35%"><stop offset="0%" stopColor="#7dd3fc" /><stop offset="100%" stopColor="#1d4ed8" /></radialGradient>
                </defs>
                <circle cx={4} cy={40} r={34} fill="url(#fv-sol)" className={s.respira} style={{ ["--dur" as string]: "8s" }} />
                {Array.from({ length: n }, (_, i) => {
                    const y = 18 + ((i * 37) % 44);
                    return <circle key={i} className={s.particula} cx={34} cy={y} r={1.1} fill="#ffe7a8"
                        style={{ ["--d" as string]: "120px", ["--dur" as string]: `${dur}s`, ["--retraso" as string]: `${-((i * 0.37) % dur)}s`, opacity: animar ? undefined : 0.5 }}
                        transform={animar ? undefined : `translate(${(i * 41) % 110} 0)`} />;
                })}
                <path d="M168 8 Q146 40 168 72" fill="none" stroke={colorBz} strokeWidth={2} strokeDasharray={abierta ? "6 5" : undefined} opacity={0.9} />
                <path d="M172 14 Q156 40 172 66" fill="none" stroke={colorBz} strokeWidth={1} opacity={0.4} />
                <circle cx={184} cy={40} r={9} fill="url(#fv-tierra)" />
            </svg>
            <span className="absolute bottom-0 left-1 text-[10px] text-white/55">Sol</span>
            <span className="absolute bottom-0 right-1 text-[10px] text-white/55">Tierra</span>
        </figure>
    );
}

// ── Óvalo auroral ─────────────────────────────────────────────────────

export function OvaloAurora({ aurora, lat, lon, lado }: { aurora: DatosAurora; lat: number; lon: number; lado: number }) {
    const norte = aurora.hemisferio === "norte";
    const R = 45, borde = 40;
    const rad = (la: number) => ((90 - Math.abs(la)) / (90 - borde)) * R;
    // Visto desde encima del polo: al norte el este gira en sentido antihorario; al sur, horario.
    const giro = (lo: number) => ((lo - lon) * Math.PI) / 180 * (norte ? -1 : 1) + Math.PI / 2;
    const pt = (lo: number, la: number) => [Math.cos(giro(lo)) * rad(la), Math.sin(giro(lo)) * rad(la)];
    const puntos = aurora.ovalo.filter((o) => o.lat !== null).map((o) => pt(o.lon, o.lat as number));
    const tu = pt(lon, lat);
    const fuera = Math.abs(lat) < borde;
    return (
        <div className="relative shrink-0" style={{ width: lado, height: lado }} role="img"
            aria-label={`Óvalo auroral del hemisferio ${aurora.hemisferio}${puntos.length ? "" : " (sin aurora apreciable)"}; tú en ${Math.round(Math.abs(lat))}° ${norte ? "N" : "S"}`}>
            <svg viewBox="-50 -50 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                    <radialGradient id="ov-f"><stop offset="0%" stopColor="#0b1640" /><stop offset="100%" stopColor="#050a1f" /></radialGradient>
                </defs>
                <circle r={R} fill="url(#ov-f)" stroke="#fff" strokeOpacity={0.15} />
                {[50, 60, 70, 80].map((la) => <circle key={la} r={rad(la)} fill="none" stroke="#fff" strokeOpacity={0.07} />)}
                {puntos.length > 2 && (
                    <polygon points={puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="#34d399" fillOpacity={0.22} stroke="#34d399" strokeWidth={1.4} strokeOpacity={0.9} className={s.destella} style={{ ["--dur" as string]: "5s" }} />
                )}
                <circle r={1.6} fill="#fff" opacity={0.7} />
                {!fuera && <circle cx={tu[0]} cy={tu[1]} r={3} fill="#fbbf24" stroke="#0c0f24" strokeWidth={1.2} />}
            </svg>
            <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] uppercase tracking-widest text-white/45">{norte ? "Polo norte" : "Polo sur"}</span>
            {fuera && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-amber-200/80">tú, más al {norte ? "sur" : "norte"}</span>}
        </div>
    );
}

// ── Magnetómetro ──────────────────────────────────────────────────────

export function TrazaCampo({ serie, hora, alto = 80, color = "#a78bfa", id }: { serie: PuntoCampo[]; hora: (t: number) => string; alto?: number; color?: string; id: string }) {
    const pts = serie.filter((p) => p.hp !== null);
    if (pts.length < 2) return null;
    const vals = pts.map((p) => p.hp as number);
    const min = Math.min(...vals), max = Math.max(...vals);
    const W = 100, H = 40, t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const xy = pts.map((p) => [((p.t - t0) / Math.max(1, t1 - t0)) * W, H - 3 - (((p.hp as number) - min) / Math.max(1, max - min)) * (H - 6)] as [number, number]);
    const d = trazoSuave(xy);
    return (
        <figure className="relative w-full" style={{ height: alto }} role="img" aria-label={`Componente Hp del campo magnético de ${hora(t0)} a ${hora(t1)}: entre ${Math.round(min)} y ${Math.round(max)} nT`}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[82%] w-full" aria-hidden>
                <defs><linearGradient id={`tc-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.3} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#tc-${id})`} />
                <path d={d} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className={`${s.cifra} absolute right-0 top-0 text-[10px] text-white/55`}>{Math.round(max)} nT</span>
            <span className={`${s.cifra} absolute bottom-[18%] right-0 text-[10px] text-white/55`}>{Math.round(min)} nT</span>
            <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-white/50" aria-hidden><span className={s.cifra}>{hora(t0)}</span><span>ahora</span></div>
        </figure>
    );
}

// ── Schumann (referencia) ─────────────────────────────────────────────

export function EspectroSchumann({ alto = 90, agitacion = 0 }: { alto?: number; agitacion?: number }) {
    const W = 100, H = 40, fMax = 40;
    const amp = [1, 0.62, 0.45, 0.33, 0.25];
    const ancho = 1.6 + agitacion * 1.4;
    const y = (f: number) => MODOS_SCHUMANN.reduce((acc, m, i) => acc + amp[i] / (1 + ((f - m) / ancho) ** 2), 0);
    const pts = Array.from({ length: 121 }, (_, i) => { const f = (i / 120) * fMax; return [(f / fMax) * W, H - 2 - (y(f) / 1.15) * (H - 8)] as [number, number]; });
    const d = trazoSuave(pts);
    return (
        <figure className="relative w-full" style={{ height: alto }} role="img" aria-label={`Espectro de referencia de la resonancia Schumann: picos en ${MODOS_SCHUMANN.map((m) => String(m).replace(".", ",")).join(", ")} Hz`}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[80%] w-full" aria-hidden>
                <defs><linearGradient id="sch-g" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f472b6" /><stop offset="50%" stopColor="#a78bfa" /><stop offset="100%" stopColor="#38bdf8" /></linearGradient></defs>
                <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#sch-g)" opacity={0.15} />
                <path d={d} fill="none" stroke="url(#sch-g)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
            </svg>
            {MODOS_SCHUMANN.map((m) => (
                <span key={m} className={`${s.cifra} absolute top-0 -translate-x-1/2 text-[10px] text-white/70`} style={{ left: `${(m / fMax) * 100}%` }}>{String(m).replace(".", ",")}</span>
            ))}
            <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-white/45" aria-hidden><span>0 Hz</span><span>20 Hz</span><span>40 Hz</span></div>
        </figure>
    );
}

/** Pastilla de severidad (color + texto). */
export function PildoraSeveridad({ severidad, children }: { severidad: Severidad; children: React.ReactNode }) {
    const c = COLOR_SEVERIDAD[severidad];
    return (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: `${c}22`, boxShadow: `inset 0 0 0 1px ${c}66` }}>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: c }} />
            <span className="truncate">{children}</span>
        </span>
    );
}

export { severidadKp };

// ── Serie del viento solar (24 h) ─────────────────────────────────────

export function GraficaPlasma({ serie, hora, alto = 90, id }: { serie: { t: number; velocidad: number | null; densidad: number | null }[]; hora: (t: number) => string; alto?: number; id: string }) {
    const pts = serie.filter((p) => p.velocidad !== null);
    if (pts.length < 2) return null;
    const vs = pts.map((p) => p.velocidad as number);
    const vMin = Math.min(250, ...vs), vMax = Math.max(700, ...vs);
    const nMax = Math.max(10, ...serie.map((p) => p.densidad ?? 0));
    const W = 100, H = 40, t0 = serie[0].t, t1 = serie[serie.length - 1].t;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const d = trazoSuave(pts.map((p) => [x(p.t), H - 2 - (((p.velocidad as number) - vMin) / (vMax - vMin)) * (H - 6)] as [number, number]));
    return (
        <figure className="relative w-full" style={{ height: alto }} role="img"
            aria-label={`Viento solar de las últimas 24 horas: de ${Math.round(Math.min(...vs))} a ${Math.round(Math.max(...vs))} km/s`}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[82%] w-full" aria-hidden>
                <defs><linearGradient id={`gp-${id}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stopColor="#34d399" /><stop offset="45%" stopColor="#facc15" /><stop offset="100%" stopColor="#f43f5e" /></linearGradient></defs>
                {serie.map((p) => p.densidad !== null && (
                    <rect key={p.t} x={x(p.t) - 0.6} width={1.2} y={H - (p.densidad / nMax) * H * 0.5} height={(p.densidad / nMax) * H * 0.5} fill="#7dd3fc" opacity={0.3} />
                ))}
                <line x1={0} x2={W} y1={H - 2 - ((500 - vMin) / (vMax - vMin)) * (H - 6)} y2={H - 2 - ((500 - vMin) / (vMax - vMin)) * (H - 6)} stroke="#fff" strokeOpacity={0.15} strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke" />
                <path d={d} fill="none" stroke={`url(#gp-${id})`} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="absolute right-0 top-0 text-[10px] text-white/50">km/s</span>
            <div className="absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-white/50" aria-hidden><span className={s.cifra}>{hora(t0)}</span><span className="text-sky-300/70">densidad</span><span>ahora</span></div>
        </figure>
    );
}
