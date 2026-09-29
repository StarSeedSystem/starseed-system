"use client";
/**
 * Las otras dos lecturas del cielo del reloj celeste:
 * - `LineaDelDia` (panorámico): el día entero de 00:00 a 24:00 como una cinta con el color real
 *   del cielo a cada hora, la curva del Sol y la de la Luna sobre la línea del horizonte, las
 *   horas doradas y el ahora.
 * - `ColumnaCielo` (torre): una cápsula vertical del cénit al nadir con el Sol y la Luna a su
 *   altura real ahora mismo.
 * - `ArcoDelDia`: el arco del Sol entre el orto y el ocaso, con las horas doradas en los
 *   extremos (lo usan el panel de la carta y el diseño «m»).
 */
import * as React from "react";
import { ASTRO, LunaSVG, SolSVG, coloresCielo, muestrasDelDia, type CieloAqui } from "./celeste";
import { duracion, fraccionDelDia } from "./reloj-partes";
import { horaCorta } from "./inicio-piezas";

const DIA_MS = 86_400_000;

/** El arco del día entre el orto y el ocaso, con las horas doradas y el Sol en su sitio. */
export function ArcoDelDia({ cielo, ahora, ancho }: { cielo: CieloAqui; ahora: Date; ancho: number }) {
    const id = React.useId().replace(/:/g, "");
    if (!cielo.orto || !cielo.ocaso) return null;
    const W = Math.max(120, ancho), H = Math.round(W * 0.26), cx = W / 2, base = H, rx = W / 2 - 10, ry = H - 8;
    const largo = cielo.ocaso.getTime() - cielo.orto.getTime();
    const fr = (d: Date | null | undefined, def: number) => (d ? Math.max(0, Math.min(1, (d.getTime() - cielo.orto!.getTime()) / largo)) : def);
    const fDorM = fr(cielo.doradas?.manana?.fin, 0.08), fDorT = fr(cielo.doradas?.tarde?.inicio, 0.92);
    const p = (f: number): [number, number] => [cx - rx * Math.cos(Math.PI * f), base - ry * Math.sin(Math.PI * f)];
    const tramo = (a: number, b: number) => {
        const n = Math.max(2, Math.ceil((b - a) * 40));
        return Array.from({ length: n + 1 }, (_, i) => p(a + ((b - a) * i) / n)).map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
    };
    const f = fraccionDelDia(ahora, cielo.orto, cielo.ocaso);
    const [sx, sy] = f !== null ? p(f) : [0, 0];
    const deNoche = f === null;
    const etiqueta = `Día de ${duracion(largo)}: sale a las ${horaCorta(cielo.orto)} y se pone a las ${horaCorta(cielo.ocaso)}`
        + (cielo.doradas?.tarde ? `; hora dorada desde las ${horaCorta(cielo.doradas.tarde.inicio)}` : "");
    return (
        <div className="flex flex-col gap-0.5" style={{ width: W }} role="img" aria-label={etiqueta}>
            <svg width={W} height={H + 4} viewBox={`0 -4 ${W} ${H + 4}`} className="overflow-visible" aria-hidden>
                <defs>
                    <linearGradient id={`arco-${id}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#ff7a59" />
                        <stop offset={`${fDorM * 100}%`} stopColor="#ffb347" />
                        <stop offset="50%" stopColor="#ffe7a3" />
                        <stop offset={`${fDorT * 100}%`} stopColor="#ffb347" />
                        <stop offset="100%" stopColor="#ff7a59" />
                    </linearGradient>
                </defs>
                <line x1={4} y1={base} x2={W - 4} y2={base} stroke="#fff" strokeOpacity={0.25} strokeDasharray="2 4" />
                <path d={tramo(0, 1)} fill="none" stroke="#fff" strokeOpacity={0.14} strokeWidth={3} strokeLinecap="round" />
                <path d={tramo(0, 1)} fill="none" stroke={`url(#arco-${id})`} strokeOpacity={deNoche ? 0.35 : 0.55} strokeWidth={2} strokeLinecap="round" />
                <path d={tramo(0, fDorM)} fill="none" stroke="#ff9d5c" strokeWidth={3.5} strokeLinecap="round" opacity={0.9} />
                <path d={tramo(fDorT, 1)} fill="none" stroke="#ff9d5c" strokeWidth={3.5} strokeLinecap="round" opacity={0.9} />
                {f !== null && <path d={tramo(0, f)} fill="none" stroke="#ffe7a3" strokeWidth={2.5} strokeLinecap="round" />}
                {f !== null && <SolSVG x={sx} y={sy} r={Math.max(3.5, W * 0.022)} id={`a${id}`} />}
            </svg>
            <div className="flex items-center justify-between text-[11px] tabular-nums text-white/65">
                <span title="Orto">↑ {horaCorta(cielo.orto)}</span>
                <span className="text-white/45">{deNoche ? `noche · ${duracion(largo)} de luz` : `${duracion(largo)} de luz`}</span>
                <span title="Ocaso">↓ {horaCorta(cielo.ocaso)}</span>
            </div>
        </div>
    );
}

/** La cinta del día (panorámico). */
export function LineaDelDia({ cielo, ahora, ancho, alto, vivo }: { cielo: CieloAqui; ahora: Date; ancho: number; alto: number; vivo: boolean }) {
    const id = React.useId().replace(/:/g, "");
    const ub = cielo.ubicacion;
    const decena = Math.floor(ahora.getTime() / 600_000);
    const muestras = React.useMemo(() => (ub ? muestrasDelDia(new Date(decena * 600_000), ub.lat, ub.lon, 20) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [decena, ub?.lat, ub?.lon]);
    if (!ub || muestras.length < 2) return null;
    const W = Math.max(160, ancho), H = Math.max(60, alto);
    const arriba = 16, abajo = 16, y0 = arriba, y1 = H - abajo;
    const maxAlt = Math.max(35, ...muestras.map((m) => m.sol + 8), ...muestras.map((m) => m.luna + 8));
    const minAlt = Math.min(-25, ...muestras.map((m) => m.sol - 4), ...muestras.map((m) => m.luna - 4));
    const inicio = muestras[0].t.getTime();
    const x = (t: number) => ((t - inicio) / DIA_MS) * W;
    const y = (alt: number) => y0 + ((maxAlt - Math.max(minAlt, Math.min(maxAlt, alt))) / (maxAlt - minAlt)) * (y1 - y0);
    const yH = y(0);
    const curva = (k: "sol" | "luna") => muestras.map((m, i) => `${i ? "L" : "M"}${x(m.t.getTime()).toFixed(1)} ${y(m[k]).toFixed(1)}`).join("");
    const xAhora = x(ahora.getTime());
    const bandas = [cielo.doradas?.manana, cielo.doradas?.tarde].filter(Boolean) as { inicio: Date; fin: Date }[];
    const hp = cielo.horaPlanetaria;
    return (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" role="img"
            aria-label={`El día de hoy: el Sol sale a las ${horaCorta(cielo.orto)} y se pone a las ${horaCorta(cielo.ocaso)}; ahora está a ${Math.round(cielo.altura ?? 0)}° y la Luna a ${Math.round(cielo.alturaLuna ?? 0)}°.`}>
            <defs>
                <linearGradient id={`cinta-${id}`} x1="0" y1="0" x2="1" y2="0">
                    {muestras.filter((_, i) => i % 2 === 0).map((m, i, arr) => (
                        <stop key={i} offset={`${(i / (arr.length - 1)) * 100}%`} stopColor={coloresCielo(m.sol).alto} />
                    ))}
                </linearGradient>
                <linearGradient id={`fundido-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0.35} />
                </linearGradient>
                <mask id={`mascara-${id}`}><rect x={0} y={y0} width={W} height={y1 - y0} rx={14} fill={`url(#fundido-${id})`} /></mask>
                <clipPath id={`sobre-${id}`}><rect x={0} y={0} width={W} height={yH} /></clipPath>
            </defs>
            <g mask={`url(#mascara-${id})`}>
                <rect x={0} y={y0} width={W} height={y1 - y0} fill={`url(#cinta-${id})`} />
                <rect x={0} y={yH} width={W} height={y1 - yH} fill="#05041a" opacity={0.45} />
                {bandas.map((b, i) => <rect key={i} x={x(b.inicio.getTime())} y={y0} width={Math.max(2, x(b.fin.getTime()) - x(b.inicio.getTime()))} height={y1 - y0} fill="#ffb347" opacity={0.2} />)}
            </g>
            <line x1={0} y1={yH} x2={W} y2={yH} stroke="#fff" strokeOpacity={0.35} strokeDasharray="3 5" />
            <path d={curva("luna")} fill="none" stroke="#e9e4d4" strokeOpacity={0.45} strokeWidth={1.2} strokeDasharray="2 4" />
            <path d={curva("sol")} fill="none" stroke="#FFBF00" strokeOpacity={0.3} strokeWidth={1.5} />
            <path d={curva("sol")} fill="none" stroke="#ffd27a" strokeWidth={2.2} clipPath={`url(#sobre-${id})`} strokeLinecap="round" />
            {[0, 6, 12, 18, 24].map((h) => (
                <text key={h} x={Math.min(W - 8, Math.max(8, (h / 24) * W))} y={H - 3} textAnchor="middle" fontSize={10} fill="#fff" opacity={0.5}>{String(h % 24).padStart(2, "0")}</text>
            ))}
            {cielo.orto && <text x={x(cielo.orto.getTime())} y={yH - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#ffd27a">{horaCorta(cielo.orto)}</text>}
            {cielo.ocaso && <text x={x(cielo.ocaso.getTime())} y={yH - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#ffd27a">{horaCorta(cielo.ocaso)}</text>}
            <line x1={xAhora} y1={y0 - 2} x2={xAhora} y2={y1} stroke="#fff" strokeOpacity={0.55} />
            {cielo.alturaLuna !== null && <LunaSVG x={xAhora} y={y(cielo.alturaLuna)} r={6} fase={cielo.luna} id={`l${id}`} halo={false} />}
            {cielo.altura !== null && <SolSVG x={xAhora} y={y(cielo.altura)} r={4.5} id={`s${id}`} bajo={cielo.altura < 0} vivo={vivo} />}
            {hp && (
                <text x={Math.min(W - 4, Math.max(4, xAhora))} y={10} textAnchor={xAhora > W * 0.7 ? "end" : xAhora < W * 0.3 ? "start" : "middle"} fontSize={10.5} fill="#fff" opacity={0.75}>
                    Hora de {ASTRO[hp.planeta].nombre} · hasta {horaCorta(hp.fin)}
                </text>
            )}
        </svg>
    );
}

/** La columna del cielo (torre): del cénit al nadir, con el Sol y la Luna a su altura. */
export function ColumnaCielo({ cielo, ancho, alto, vivo }: { cielo: CieloAqui; ancho: number; alto: number; vivo: boolean }) {
    const id = React.useId().replace(/:/g, "");
    if (cielo.altura === null) return null;
    const W = Math.max(44, Math.min(ancho, 96)), H = Math.max(120, alto), r = W / 2;
    const y = (alt: number) => H / 2 - (Math.max(-90, Math.min(90, alt)) / 90) * (H / 2 - r * 0.55);
    const col = coloresCielo(cielo.altura);
    const noche = Math.max(0, Math.min(1, (-cielo.altura - 4) / 10));
    const ySol = y(cielo.altura), yLuna = cielo.alturaLuna !== null ? y(cielo.alturaLuna) : null;
    const choque = yLuna !== null && Math.abs(yLuna - ySol) < W * 0.35;
    return (
        <div className="relative flex items-stretch gap-2" style={{ height: H }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0 overflow-visible">
                <defs>
                    <linearGradient id={`col-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={col.alto} />
                        <stop offset="48%" stopColor={col.horizonte} stopOpacity={0.85} />
                        <stop offset="50%" stopColor="#1a1440" />
                        <stop offset="100%" stopColor="#05041a" />
                    </linearGradient>
                </defs>
                <rect x={0} y={0} width={W} height={H} rx={r} fill={`url(#col-${id})`} opacity={0.92} />
                <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={r} fill="none" stroke="#fff" strokeOpacity={0.16} />
                {noche > 0 && Array.from({ length: 7 }, (_, i) => (
                    <circle key={i} cx={W * (0.2 + ((i * 37) % 60) / 100)} cy={r * 0.6 + ((i * 53) % 100) / 100 * (H / 2 - r)} r={i % 3 ? 0.8 : 1.2} fill="#fff" opacity={noche * 0.7} />
                ))}
                <line x1={4} y1={H / 2} x2={W - 4} y2={H / 2} stroke="#fff" strokeOpacity={0.4} strokeDasharray="3 4" />
                {yLuna !== null && <LunaSVG x={choque ? W * 0.3 : W / 2} y={yLuna} r={W * 0.13} fase={cielo.luna} id={`t${id}`} halo={false} />}
                <SolSVG x={choque ? W * 0.68 : W / 2} y={ySol} r={W * 0.1} id={`t${id}`} bajo={cielo.altura < 0} vivo={vivo} />
            </svg>
            <div className="relative min-w-0 flex-1 text-[11.5px] leading-tight text-white/75">
                <span className="absolute left-0 whitespace-nowrap tabular-nums" style={{ top: Math.max(0, Math.min(H - 14, ySol - 7)) }}>
                    Sol {Math.round(cielo.altura)}°
                </span>
                {yLuna !== null && Math.abs(yLuna - ySol) > 14 && (
                    <span className="absolute left-0 whitespace-nowrap tabular-nums text-white/60" style={{ top: Math.max(0, Math.min(H - 14, yLuna - 7)) }}>
                        Luna {Math.round(cielo.alturaLuna!)}°
                    </span>
                )}
                {Math.abs(ySol - H / 2) > 22 && (yLuna === null || Math.abs(yLuna - H / 2) > 22) && (
                    <span className="absolute left-0 whitespace-nowrap text-[10px] uppercase tracking-[0.14em] text-white/40" style={{ top: H / 2 + 3 }}>horizonte</span>
                )}
            </div>
        </div>
    );
}
