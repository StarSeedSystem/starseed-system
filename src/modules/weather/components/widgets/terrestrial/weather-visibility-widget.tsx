'use client';
/**
 * Visibilidad — Ola 0929 · paquete A.
 *
 * Datos REALES de Open-Meteo (visibilidad actual y por horas, humedad, punto de rocío, viento y
 * estado del cielo), compartidos y cacheados con el resto del clima.
 * El foco es TU horizonte dibujado con física: seis crestas a 0,4 · 1,5 · 4 · 10 · 22 y 45 km
 * que se funden con el cielo según la ley de Koschmieder (contraste e^(−3,912·d/V)); el cielo
 * sale de la altura real del Sol. Con 40 km se ven todas; con niebla, solo la primera. La cresta
 * más lejana que aún se distingue lleva el acento: «ves hasta aquí».
 *   micro → distancia · s → horizonte + cifra · m → + causa y el próximo cambio
 *   l → + riesgo de niebla y 24 h por horas · xl → + datos del aire y peores horas de mañana
 *   panorámico → horizonte ancho con la cifra y las horas · torre → horizonte alto y la lista.
 */
import * as React from 'react';
import { Eye } from 'lucide-react';
import {
    cambioVisibilidad, causaVisibilidad, contrasteA, extremos, nivelVisibilidad, riesgoNiebla, textoDistancia,
} from '@/modules/weather/datos/barometro';
import { familiaCielo, mezclaHex } from '@/modules/weather/datos/interpretar';
import { paletaCielo } from '../_clima/cielo';
import { BarrasHoras, grados } from '../_clima/graficas';
import { Datos, WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { MicroDato, RotuloClima, estilosClima as s } from '../_clima/piezas';

const COLOR = '#67e8f9';
const DISTANCIAS = [0.4, 1.5, 4, 10, 22, 45];
const BASE_Y = [90, 81, 73, 66, 60, 56];
const AMPLITUD = [8, 7, 6, 5, 3.5, 2.4];
const SILUETA = ['#0b1624', '#11233a', '#173049', '#1d3a55', '#244560', '#2b4f6b'];

/** Cresta determinista (suma de senos con semilla por capa). */
function cresta(k: number): string {
    const pts: string[] = [];
    for (let x = 0; x <= 200; x += 8) {
        const y = BASE_Y[k] - AMPLITUD[k] * (0.55 + 0.45 * Math.sin(x * (0.031 + k * 0.007) + k * 1.9)) - AMPLITUD[k] * 0.35 * Math.sin(x * 0.083 + k * 3.1);
        pts.push(`${x} ${y.toFixed(1)}`);
    }
    return `M0 100 L${pts.join(' L')} L200 100 Z`;
}
const CRESTAS = DISTANCIAS.map((_, k) => cresta(k));

/** Índice de la cresta más lejana que aún se distingue (contraste ≥ 5 %). */
export function hastaDondeSeVe(m: number | null): number {
    let k = -1;
    DISTANCIAS.forEach((d, i) => { if (contrasteA(d, m) >= 0.05) k = i; });
    return k;
}

export function Horizonte({ m, alturaSol, codigo, id, etiquetas, acento, className = '' }: {
    m: number | null; alturaSol: number | null; codigo: number | null; id: string; etiquetas: boolean; acento: string; className?: string;
}) {
    const p = paletaCielo(alturaSol, familiaCielo(codigo));
    const velo = mezclaHex(p.horizonte, '#cbd5e1', 0.35);
    const hasta = hastaDondeSeVe(m);
    const niebla = m !== null && m < 5000 ? Math.min(0.75, (1 - m / 5000) * 0.8) : 0;
    const texto = m === null ? 'Horizonte sin lectura de visibilidad' : hasta >= 0 ? `Horizonte: se distingue hasta la cresta a ${DISTANCIAS[hasta].toString().replace('.', ',')} km` : 'Horizonte: la niebla lo tapa todo';
    return (
        <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMax slice" className={`h-full w-full ${className}`} role="img" aria-label={texto}>
            <defs>
                <linearGradient id={`vc-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.alto} />
                    <stop offset="62%" stopColor={p.horizonte} />
                    <stop offset="100%" stopColor={velo} />
                </linearGradient>
                <linearGradient id={`vn-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={velo} stopOpacity={0} />
                    <stop offset="50%" stopColor={velo} stopOpacity={1} />
                    <stop offset="100%" stopColor={velo} stopOpacity={0} />
                </linearGradient>
            </defs>
            <rect width={200} height={100} fill={`url(#vc-${id})`} />
            {DISTANCIAS.map((_, k) => 5 - k).map((k) => {
                const c = contrasteA(DISTANCIAS[k], m);
                const color = mezclaHex(velo, SILUETA[k], c);
                const marca = k === hasta;
                return (
                    <g key={k}>
                        <path d={CRESTAS[k]} fill={color} stroke={marca ? acento : 'none'} strokeOpacity={0.9} strokeWidth={marca ? 0.7 : 0} />
                        {etiquetas && c >= 0.05 && (
                            <text x={186 - k * 4} y={BASE_Y[k] - AMPLITUD[k] - 2.5} textAnchor="end" fontSize={4.2} fill="#fff" fillOpacity={Math.max(0.35, Math.min(0.85, c + 0.2))} className={s.cifra}>
                                {DISTANCIAS[k].toString().replace('.', ',')} km
                            </text>
                        )}
                    </g>
                );
            })}
            {niebla > 0 && (
                <g opacity={niebla} aria-hidden>
                    <rect className={s.nube} style={{ ['--dur' as string]: '18s' }} x={-20} y={54} width={240} height={26} fill={`url(#vn-${id})`} />
                    <rect className={s.nube} style={{ ['--dur' as string]: '26s', ['--retraso' as string]: '-7s' }} x={-20} y={70} width={240} height={30} fill={`url(#vn-${id})`} />
                </g>
            )}
        </svg>
    );
}

function Cuerpo({ info, a, c, d, prox, id, cabecera, sello, ahora }: CtxMagnitud) {
    const { base, clase } = info;
    const tv = info.dispositivo === 'tv';
    const m = a.visibilidad;
    const nv = nivelVisibilidad(m);
    const causa = causaVisibilidad(m, a.humedad, a.codigo);
    const cambio = cambioVisibilidad(prox, d.fmt.hora);
    const riesgo = riesgoNiebla(a.temp, a.rocio, a.viento);
    const altura = d.astro.altura;
    const horizonte = (etiquetas: boolean, className = '') => <Horizonte m={m} alturaSol={altura} codigo={a.codigo} id={id} etiquetas={etiquetas} acento={info.acento} className={className} />;
    const cifra = (tam: number) => (
        <span className={`${s.cifra} font-extralight leading-[0.9]`} style={{ fontSize: tam }}>{textoDistancia(m)}</span>
    );
    const nivelEl = nv && <span className="text-[13px] font-semibold" style={{ color: nv.color }}>{nv.texto}</span>;
    const barras = (n: number) => (
        <BarrasHoras horas={prox.slice(0, n)} valor={(h) => (h.visibilidad === null ? null : Math.min(40, h.visibilidad / 1000))}
            color={(v) => nivelVisibilidad(v * 1000)?.color ?? COLOR} hora={d.fmt.hora} formato={(v) => textoDistancia(v * 1000)} maximo={40}
            etiqueta={`Visibilidad de las próximas ${n} horas`} />
    );
    const frase = (lineas: number) => {
        const t = [causa, cambio].filter(Boolean).join(' · ');
        return t ? <p className={`${tv ? 'text-[15px]' : 'text-[12px]'} leading-snug text-white/75`} style={{ display: '-webkit-box', WebkitLineClamp: lineas, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={t}>{t}</p> : null;
    };
    const riesgoEl = riesgo && (
        <p className="flex items-start gap-2 text-[12px] leading-snug text-white/80">
            <span aria-hidden className="mt-[0.4em] size-2 shrink-0 rounded-full" style={{ background: riesgo.color, boxShadow: `0 0 8px ${riesgo.color}` }} />
            <span>{riesgo.texto}</span>
        </p>
    );
    const filas = [
        { t: 'Humedad', v: a.humedad === null ? '—' : `${Math.round(a.humedad)} %` },
        { t: 'Rocío', v: grados(a.rocio, d.u), n: riesgo ? `a ${riesgo.margen.toFixed(1).replace('.', ',')}°` : undefined },
        { t: 'Nubes', v: a.nubes === null ? '—' : `${Math.round(a.nubes)} %` },
    ];

    if (base === 'micro') {
        return (
            <MicroDato info={info} etiqueta={`Visibilidad ${textoDistancia(m)}${nv ? `, ${nv.texto.toLowerCase()}` : ''}`}
                glifo={<Eye style={{ color: nv?.color ?? COLOR }} />} cifra={textoDistancia(m)} maximo={22} />
        );
    }
    if (base === 's') {
        return (
            <div className="relative h-full w-full">
                <div className="absolute inset-0">{horizonte(false)}</div>
                <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0a0d22]/55 via-transparent to-transparent" />
                <div className={`${s.sombraTexto} relative flex h-full flex-col p-3`}>
                    <RotuloClima>Visibilidad</RotuloClima>
                    {cifra(30)}
                    {nivelEl}
                </div>
            </div>
        );
    }
    if (clase === 'panoramico') {
        return (
            <div className="relative h-full w-full">
                <div className="absolute inset-0">{horizonte(true)}</div>
                <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0a0d22]/85 via-[#0a0d22]/35 to-[#0a0d22]/70" />
                <div className={`${s.sombraTexto} relative grid h-full items-center gap-4 px-4 py-2`} style={{ gridTemplateColumns: 'minmax(11rem,0.9fr) minmax(0,1.2fr)' }}>
                    <div className="min-w-0 space-y-1">{cabecera('Visibilidad')}<div className="flex items-baseline gap-2">{cifra(38)}{nivelEl}</div>{frase(2)}</div>
                    {barras(12)}
                </div>
            </div>
        );
    }
    if (clase === 'torre') {
        const alto = info.alto || 640;
        return (
            <div className="flex h-full flex-col">
                <div className="relative h-[36%] min-h-[120px] w-full shrink-0">
                    <div className="absolute inset-0">{horizonte(true)}</div>
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0a0d22]/60 via-transparent to-[#0a0d22]" />
                    <div className={`${s.sombraTexto} relative p-3.5`}>{cabecera('Visibilidad')}</div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-3.5 pb-3.5">
                    <div className="flex items-baseline gap-2">{cifra(40)}{nivelEl}</div>
                    {frase(alto >= 560 ? 3 : 2)}
                    {(alto >= 470 || riesgo?.nivel !== 'bajo') && riesgoEl}
                    {alto >= 640 && <Datos columnas={1} filas={filas} />}
                    <div className="mt-auto">{barras(10)}</div>
                    {sello}
                </div>
            </div>
        );
    }
    if (base === 'm') {
        return (
            <div className="relative h-full w-full">
                <div className="absolute inset-x-0 bottom-0 top-[34%]">{horizonte(false)}</div>
                <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0a0d22] via-[#0a0d22]/40 to-transparent" />
                <div className={`${s.sombraTexto} relative flex h-full flex-col gap-1.5 p-3.5`}>
                    {cabecera('Visibilidad')}
                    <div className="flex items-baseline gap-2">{cifra(40)}{nivelEl}</div>
                    {frase(2)}
                </div>
            </div>
        );
    }
    const manana = c.horas.filter((h) => h.t > ahora && h.t <= ahora + 30 * 3_600_000);
    const peor = extremos(manana, (h) => h.visibilidad)?.min ?? null;
    if (base === 'l') {
        return (
            <div className="flex h-full flex-col">
                <div className="relative h-[40%] min-h-[110px] w-full shrink-0">
                    <div className="absolute inset-0">{horizonte(true)}</div>
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0a0d22]/70 via-transparent to-[#0a0d22]" />
                    <div className={`${s.sombraTexto} relative space-y-1 p-4`}>
                        {cabecera('Visibilidad')}
                        <div className="flex items-baseline gap-2">{cifra(44)}{nivelEl}</div>
                    </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4 pb-4">
                    {frase(2)}
                    {(info.alto === 0 || info.alto >= 340 || riesgo?.nivel !== 'bajo') && riesgoEl}
                    <div className="mt-auto">{barras(24)}</div>
                    {sello}
                </div>
            </div>
        );
    }
    return (
        <div className="grid h-full gap-4 p-5" style={{ gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gridTemplateRows: 'auto minmax(0,1fr) auto' }}>
            <div className="col-span-2">{cabecera('Visibilidad')}</div>
            <div className="relative min-h-0 overflow-hidden rounded-2xl ring-1 ring-white/10">
                <div className="absolute inset-0">{horizonte(true)}</div>
                <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#0a0d22]/65 via-transparent to-transparent" />
                <div className={`${s.sombraTexto} relative p-4`}>
                    {cifra(56)}
                    <div className="mt-1">{nivelEl}</div>
                </div>
            </div>
            <div className="flex min-h-0 flex-col gap-3">
                {frase(3)}
                {riesgoEl}
                <Datos columnas={3} filas={filas} />
                {peor && (
                    <p className="text-[12px] text-white/70">
                        Peor momento hasta mañana: <b className={s.cifra} style={{ color: nivelVisibilidad(peor.v)?.color }}>{textoDistancia(peor.v)}</b> a las {d.fmt.hora(peor.t)} ({d.fmt.dia(peor.t)})
                    </p>
                )}
                <div className="mt-auto">{barras(24)}</div>
            </div>
            <div className="col-span-2">{sello}</div>
        </div>
    );
}

export function WeatherVisibilityWidget() {
    return <WidgetMagnitud etiqueta="Visibilidad" acento={COLOR} acento2="#a5b4fc" icono={Eye} render={Cuerpo} />;
}

export default WeatherVisibilityWidget;
