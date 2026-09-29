'use client';
/**
 * Presión (barómetro) — Ola 0929 · paquete A.
 *
 * Datos REALES de Open-Meteo (presión reducida al nivel del mar, serie de 24 h pasadas y 48 h
 * previstas), compartidos y cacheados con el resto del clima: sin peticiones propias.
 * El foco es un barómetro aneroide dibujado con datos: esfera de 950 a 1050 hPa con sus palabras
 * clásicas (Tempestad · Lluvia · Variable · Buen tiempo · Muy seco), la aguja en la presión de
 * ahora y la aguja de referencia dorada en la de hace 3 h, como la que se ajusta a mano en un
 * barómetro de pared: la distancia entre las dos ES la tendencia.
 *   micro → cifra y flecha · s → esfera · m → esfera + zona, tendencia y lectura
 *   l → + curva de 72 h (ayer, ahora y lo previsto) · xl → + cambios de 3 y 24 h y extremos
 *   panorámico → esfera | lectura | curva · torre → esfera arriba y la historia debajo.
 * Acciones: unidad (hPa, mmHg o inHg), ubicación, actualizar y abrir /clima.
 */
import * as React from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Gauge } from 'lucide-react';
import {
    ETIQUETA_PRESION, extremos, lecturaBarometro, tendenciaPresion, textoCambio, textoPresion, UNIDADES_PRESION, ZONAS_BAROMETRO,
    zonaBarometro, type Tendencia, type UnidadPresion,
} from '@/modules/weather/datos/barometro';
import { indiceAhora, type HoraClima } from '@/modules/weather/datos/open-meteo';
import { trazoSuave } from '../_clima/graficas';
import { Datos, WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { RotuloClima, estilosClima as s } from '../_clima/piezas';
import { useUnidadPresion } from '../_clima/use-presion';

const COLOR = '#a5b4fc';
const MIN = 950, MAX = 1050;
const angulo = (p: number) => 135 + ((Math.min(MAX, Math.max(MIN, p)) - MIN) / (MAX - MIN)) * 270;
const rad = (g: number) => (g * Math.PI) / 180;
const punto = (r: number, g: number) => [Math.cos(rad(g)) * r, Math.sin(rad(g)) * r] as const;

function arco(r: number, g0: number, g1: number): string {
    const [x0, y0] = punto(r, g0), [x1, y1] = punto(r, g1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${g1 - g0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function Flecha({ t, className }: { t: Tendencia | null; className?: string }) {
    const Icono = !t || t.sentido === 0 ? ArrowRight : t.sentido > 0 ? ArrowUpRight : ArrowDownRight;
    return <Icono aria-hidden className={className} style={{ color: t?.color ?? '#94a3b8' }} />;
}

// ── La esfera ─────────────────────────────────────────────────────────

export function EsferaBarometro({ hpa, antes, u, lado, id, conPalabras, acento }: {
    hpa: number | null; antes: number | null; u: UnidadPresion; lado: number; id: string; conPalabras: boolean; acento: string;
}) {
    const zona = zonaBarometro(hpa);
    const etiqueta = hpa === null
        ? 'Barómetro sin lectura'
        : `Barómetro: ${textoPresion(hpa, u)} ${ETIQUETA_PRESION[u]}, zona «${zona?.nombre}»${antes !== null ? `; hace 3 h marcaba ${textoPresion(antes, u)}` : ''}`;
    const marcas: React.ReactNode[] = [];
    for (let p = MIN; p <= MAX; p += 2) {
        const mayor = p % 10 === 0;
        const [x0, y0] = punto(mayor ? 40 : 42.5, angulo(p)), [x1, y1] = punto(46, angulo(p));
        marcas.push(<line key={p} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#fff" strokeOpacity={mayor ? 0.7 : 0.28} strokeWidth={mayor ? 1 : 0.5} />);
    }
    const numeros = [960, 980, 1000, 1020, 1040].map((p) => {
        const [x, y] = punto(33.5, angulo(p));
        return <text key={p} x={x} y={y + 2.2} textAnchor="middle" fontSize={6} fill="#fff" fillOpacity={0.62} className={s.cifra}>{u === 'hpa' ? p : textoPresion(p, u)}</text>;
    });
    return (
        <div className="relative shrink-0" style={{ width: lado, height: lado }} role="img" aria-label={etiqueta}>
            <svg viewBox="-60 -60 120 120" className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                    <radialGradient id={`bf-${id}`} cx="50%" cy="38%" r="70%">
                        <stop offset="0%" stopColor="#1e2448" />
                        <stop offset="100%" stopColor="#0a0d22" />
                    </radialGradient>
                    <linearGradient id={`bb-${id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
                        <stop offset="45%" stopColor={acento} stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#fff" stopOpacity={0.08} />
                    </linearGradient>
                    {conPalabras && <path id={`bp-${id}`} d={arco(24, 135, 405)} />}
                </defs>
                <circle r={57} fill={`url(#bf-${id})`} stroke={`url(#bb-${id})`} strokeWidth={2.4} />
                <circle r={52.5} fill="none" stroke="#fff" strokeOpacity={0.06} />
                {ZONAS_BAROMETRO.map((z) => {
                    const activa = zona?.nombre === z.nombre;
                    return <path key={z.nombre} d={arco(50, angulo(z.desde) + 0.8, angulo(z.hasta) - 0.8)} stroke={z.color} strokeWidth={activa ? 5 : 3.2} strokeLinecap="round" fill="none" opacity={activa ? 1 : 0.34} />;
                })}
                {marcas}
                {numeros}
                {conPalabras && (
                    <text fontSize={5.4} fill="#fff" fillOpacity={0.6} letterSpacing={0.4}>
                        {ZONAS_BAROMETRO.map((z) => (
                            <textPath key={z.nombre} href={`#bp-${id}`} startOffset={`${(((z.desde + z.hasta) / 2 - MIN) / (MAX - MIN)) * 100}%`} textAnchor="middle"
                                fill={zona?.nombre === z.nombre ? z.color : '#fff'} fillOpacity={zona?.nombre === z.nombre ? 1 : 0.5}>
                                {z.nombre.toUpperCase()}
                            </textPath>
                        ))}
                    </text>
                )}
                {antes !== null && (
                    <g style={{ transform: `rotate(${angulo(antes)}deg)`, transformBox: 'view-box', transformOrigin: '0 0' }} className="motion-safe:transition-transform motion-safe:duration-700">
                        <line x1={-6} y1={0} x2={44} y2={0} stroke="#fcd34d" strokeWidth={1} strokeOpacity={0.85} strokeLinecap="round" />
                        <circle cx={44} cy={0} r={1.4} fill="#fcd34d" />
                    </g>
                )}
                {hpa !== null && (
                    <g style={{ transform: `rotate(${angulo(hpa)}deg)`, transformBox: 'view-box', transformOrigin: '0 0' }} className="motion-safe:transition-transform motion-safe:duration-700">
                        <path d="M-9 0 L0 -2.1 L46 0 L0 2.1 Z" fill="#fff" />
                        <circle cx={-9} cy={0} r={2.6} fill="none" stroke="#fff" strokeWidth={1.2} />
                    </g>
                )}
                <circle r={4.2} fill="#0a0d22" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.2} />
                <circle r={1.3} fill={acento} />
            </svg>
            <div className="absolute inset-x-0 flex flex-col items-center" style={{ bottom: lado * 0.06 }}>
                <span className={`${s.cifra} font-light leading-none text-white`} style={{ fontSize: Math.max(13, lado * 0.15) }}>{textoPresion(hpa, u)}</span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/55">{ETIQUETA_PRESION[u]}</span>
            </div>
        </div>
    );
}

// ── La curva de 72 h ──────────────────────────────────────────────────

export function CurvaPresion({ horas, ahora, u, hora, alto = 90, id }: {
    horas: HoraClima[]; ahora: number; u: UnidadPresion; hora: (t: number) => string;
    /** Alto en px, o «lleno» para ocupar el hueco que le deje su contenedor. */
    alto?: number | 'lleno'; id: string;
}) {
    const validas = horas.filter((h) => h.presion !== null);
    if (validas.length < 4) return null;
    const vals = validas.map((h) => h.presion as number);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 8) { const c = (hi + lo) / 2; lo = c - 4; hi = c + 4; }
    const W = 100, H = 40, pad = 4;
    const t0 = validas[0].t, t1 = validas[validas.length - 1].t;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
    const y = (v: number) => H - pad - ((v - lo) / (hi - lo)) * (H - pad * 2);
    const d = trazoSuave(validas.map((h) => [x(h.t), y(h.presion as number)] as [number, number]));
    const xAhora = Math.min(W, Math.max(0, x(ahora)));
    const ex = extremos(validas.filter((h) => h.t >= ahora - 3_600_000), (h) => h.presion);
    const media = 1013.25 >= lo && 1013.25 <= hi ? y(1013.25) : null;
    const resumen = ex
        ? `Presión de ${hora(t0)} de ayer a ${hora(t1)} de pasado mañana: ahora ${textoPresion(vals[indiceAhora(validas, ahora)] ?? null, u)} ${ETIQUETA_PRESION[u]}; mínima prevista ${textoPresion(ex.min.v, u)} a las ${hora(ex.min.t)} y máxima ${textoPresion(ex.max.v, u)} a las ${hora(ex.max.t)}`
        : 'Curva de presión';
    const eje = [
        { t: ahora - 86_400_000, texto: 'Ayer' },
        { t: ahora, texto: 'Ahora' },
        { t: ahora + 86_400_000, texto: 'Mañana' },
        { t: ahora + 2 * 86_400_000 - 3_600_000, texto: 'Pasado' },
    ].filter((e) => e.t >= t0 && e.t <= t1 + 1);
    return (
        <figure className="relative w-full" style={{ height: alto === 'lleno' ? '100%' : alto, minHeight: 48 }} role="img" aria-label={resumen}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[80%] w-full overflow-visible" aria-hidden>
                <defs>
                    <linearGradient id={`pc-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOR} stopOpacity={0.32} />
                        <stop offset="100%" stopColor={COLOR} stopOpacity={0} />
                    </linearGradient>
                    <clipPath id={`pp-${id}`}><rect x={0} y={-5} width={xAhora} height={H + 10} /></clipPath>
                    <clipPath id={`pf-${id}`}><rect x={xAhora} y={-5} width={W - xAhora} height={H + 10} /></clipPath>
                </defs>
                {media !== null && <line x1={0} x2={W} y1={media} y2={media} stroke="#fff" strokeOpacity={0.18} strokeDasharray="1 1.5" vectorEffect="non-scaling-stroke" />}
                <path d={`${d} L${W} ${H} L0 ${H} Z`} fill={`url(#pc-${id})`} clipPath={`url(#pp-${id})`} />
                <path d={d} fill="none" stroke={COLOR} strokeWidth={2} strokeLinecap="round" vectorEffect="non-scaling-stroke" clipPath={`url(#pp-${id})`} />
                <path d={d} fill="none" stroke={COLOR} strokeOpacity={0.7} strokeWidth={1.6} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" clipPath={`url(#pf-${id})`} />
                <line x1={xAhora} x2={xAhora} y1={0} y2={H} stroke="#fff" strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
            {media !== null && <span className="absolute right-0 text-[9px] text-white/40" style={{ top: `calc(${(media / H) * 80}% - 11px)` }}>media 1013</span>}
            {ex && [ex.max, ex.min].map((p, i) => (
                <span key={i} className={`${s.cifra} absolute -translate-x-1/2 text-[10px] font-semibold text-white/85`}
                    style={{ left: `${Math.min(92, Math.max(8, x(p.t)))}%`, top: `calc(${(y(p.v) / H) * 80}% ${i === 0 ? '- 15px' : '+ 3px'})` }}>
                    {textoPresion(p.v, u)}
                </span>
            ))}
            <div className="absolute inset-x-0 bottom-0 h-[18%]" aria-hidden>
                {eje.map((e) => (
                    <span key={e.texto} className={`${s.cifra} absolute -translate-x-1/2 whitespace-nowrap text-[10px] ${e.texto === 'Ahora' ? 'font-semibold text-white/85' : 'text-white/50'}`}
                        style={{ left: `${Math.min(94, Math.max(6, x(e.t)))}%` }}>{e.texto}</span>
                ))}
            </div>
        </figure>
    );
}

// ── Composición por tamaño ────────────────────────────────────────────

function Cuerpo({ info, a, c, d, ahora, id, cabecera, sello }: CtxMagnitud) {
    const [u] = useUnidadPresion();
    const { base, clase } = info;
    const tv = info.dispositivo === 'tv';
    const hpa = a.presion;
    const t = tendenciaPresion(c.horas, ahora);
    const zona = zonaBarometro(hpa);
    const lectura = lecturaBarometro(hpa, t);
    const i = indiceAhora(c.horas, ahora);
    const hace24 = c.horas[i - 24]?.presion ?? null;
    const futuras = c.horas.slice(i + 1, i + 49);
    const ex = extremos(futuras, (h) => h.presion);
    const tendenciaTexto = t ? `${t.texto} · ${textoCambio(t.cambio, u)} ${ETIQUETA_PRESION[u]} en 3 h` : 'Sin tendencia (faltan horas)';
    const esfera = (lado: number, palabras = lado >= 168) => (
        <EsferaBarometro hpa={hpa} antes={t?.antes ?? null} u={u} lado={lado} id={id} conPalabras={palabras} acento={info.acento} />
    );
    const curva = (alto: number | 'lleno') => <CurvaPresion horas={c.horas} ahora={ahora} u={u} hora={d.fmt.hora} alto={alto} id={`${id}c`} />;
    const zonaEl = (tam: number) => zona && (
        <p className="font-semibold leading-tight" style={{ color: zona.color, fontSize: tam }}>{zona.nombre}</p>
    );
    const tendenciaEl = (
        <div className="flex min-w-0 items-start gap-1.5" title={tendenciaTexto}>
            <Flecha t={t} className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-semibold" style={{ color: t?.color }}>{t?.texto ?? 'Sin tendencia'}</span>
                <span className={`${s.cifra} block truncate text-[11px] text-white/60`}>{t ? `${textoCambio(t.cambio, u)} ${ETIQUETA_PRESION[u]} en 3 h` : 'faltan horas de historia'}</span>
            </p>
        </div>
    );
    const lecturaEl = (lineas: number) => (
        <p className={`${tv ? 'text-[15px]' : 'text-[12px]'} leading-snug text-white/70`} style={{ display: '-webkit-box', WebkitLineClamp: lineas, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={lectura}>{lectura}</p>
    );
    const filas = [
        { t: 'En 3 h', v: t ? textoCambio(t.cambio, u) : '—', n: ETIQUETA_PRESION[u], color: t?.color },
        { t: 'En 24 h', v: hace24 !== null && hpa !== null ? textoCambio(Math.round((hpa - hace24) * 10) / 10, u) : '—', n: ETIQUETA_PRESION[u] },
        { t: 'Mínima prevista', v: ex ? textoPresion(ex.min.v, u) : '—', n: ex ? `${d.fmt.dia(ex.min.t)} ${d.fmt.hora(ex.min.t)}` : undefined },
        { t: 'Máxima prevista', v: ex ? textoPresion(ex.max.v, u) : '—', n: ex ? `${d.fmt.dia(ex.max.t)} ${d.fmt.hora(ex.max.t)}` : undefined },
    ];

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-0.5" role="img" aria-label={`Presión ${textoPresion(hpa, u)} ${ETIQUETA_PRESION[u]}${t ? `, ${t.texto.toLowerCase()}` : ''}`}>
                <Flecha t={t} className="size-5" />
                <span className={`${s.cifra} text-[22px] font-light leading-none`}>{textoPresion(hpa, u)}</span>
                <span className="text-[9px] uppercase tracking-[0.14em] text-white/55">{ETIQUETA_PRESION[u]}</span>
            </div>
        );
    }
    if (base === 's') {
        const lado = Math.max(96, Math.min(info.ancho || 170, (info.alto || 170) - 24) - 8);
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
                {esfera(lado, false)}
                <p className="flex max-w-full items-center gap-1 text-[11px] text-white/75" title={tendenciaTexto}>
                    <Flecha t={t} className="size-3.5 shrink-0" /><span className="truncate">{zona?.nombre ?? '—'} · {t?.texto.toLowerCase() ?? 'sin tendencia'}</span>
                </p>
            </div>
        );
    }
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(10rem,0.9fr) minmax(0,1.3fr)' }}>
                {esfera(Math.min(128, (info.alto || 140) - 12), false)}
                <div className="min-w-0 space-y-1">{cabecera('Presión')}{zonaEl(16)}{tendenciaEl}{lecturaEl(2)}</div>
                <div className="h-full min-h-0 py-2">{curva('lleno')}</div>
            </div>
        );
    }
    if (clase === 'torre') {
        const alto = info.alto || 640;
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera('Presión')}
                <div className="flex justify-center">{esfera(Math.min(210, (info.ancho || 180) - 16, alto * 0.38))}</div>
                <div className="space-y-1">{zonaEl(18)}{tendenciaEl}{alto >= 460 && lecturaEl(alto >= 560 ? 4 : 2)}</div>
                {alto >= 640 && <Datos columnas={1} filas={filas.slice(0, 3)} />}
                <div className="min-h-0 flex-1">{curva('lleno')}</div>
                {sello}
            </div>
        );
    }
    if (base === 'm') {
        const lado = Math.max(100, Math.min((info.alto || 200) - 70, (info.ancho || 300) * 0.48));
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera('Presión')}
                <div className="flex min-h-0 flex-1 items-center gap-3">
                    {esfera(lado, lado >= 168)}
                    <div className="min-w-0 flex-1 space-y-1.5">{zonaEl(17)}{tendenciaEl}{lecturaEl(3)}</div>
                </div>
            </div>
        );
    }
    if (base === 'l') {
        return (
            <div className="flex h-full flex-col gap-3 p-4">
                {cabecera('Presión')}
                <div className="flex items-center gap-4">
                    {esfera(Math.max(120, Math.min(176, (info.alto || 360) - 200)))}
                    <div className="min-w-0 flex-1 space-y-1.5">{zonaEl(19)}{tendenciaEl}{lecturaEl(3)}</div>
                </div>
                <div className="min-h-0 flex-1">{curva('lleno')}</div>
                {sello}
            </div>
        );
    }
    return (
        <div className="grid h-full gap-4 p-5" style={{ gridTemplateColumns: 'auto minmax(0,1fr)', gridTemplateRows: 'auto auto minmax(0,1fr) auto' }}>
            <div className="col-span-2">{cabecera('Presión')}</div>
            {esfera(Math.max(150, Math.min(230, ((info.alto || 520) - 150) * 0.6)))}
            <div className="min-w-0 space-y-2">
                {zonaEl(22)}{tendenciaEl}{lecturaEl(2)}
                <Datos columnas={2} filas={filas} />
            </div>
            <div className="col-span-2 flex min-h-0 flex-col gap-1">
                <RotuloClima>Ayer, ahora y lo previsto</RotuloClima>
                <div className="min-h-0 flex-1">{curva('lleno')}</div>
            </div>
            <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-2">
                {sello}
                <span className="text-[10px] text-white/45">Presión reducida al nivel del mar{c.elevacion !== null ? ` · tu sitio está a ${Math.round(c.elevacion)} m` : ''}</span>
            </div>
        </div>
    );
}

export function WeatherPressureWidget() {
    const [u, fijar] = useUnidadPresion();
    const siguiente = UNIDADES_PRESION[(UNIDADES_PRESION.indexOf(u) + 1) % UNIDADES_PRESION.length];
    const extra = React.useMemo(() => [
        { id: 'unidad-presion', etiqueta: `Presión en ${ETIQUETA_PRESION[siguiente]}`, icono: Gauge, alPulsar: () => fijar(siguiente) },
    ], [siguiente, fijar]);
    return <WidgetMagnitud etiqueta="Presión" acento={COLOR} acento2="#fcd34d" icono={Gauge} render={Cuerpo} extra={extra} />;
}

export default WeatherPressureWidget;
