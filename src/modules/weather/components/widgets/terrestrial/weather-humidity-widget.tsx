'use client';
/**
 * Humedad (WEATHER_HUMIDITY) — Ola 0929 · paquete A.
 * Real (Open-Meteo). Foco: una gota que se llena hasta la humedad relativa, con la superficie
 * ondeando. El punto de rocío dice cómo se SIENTE el aire (seco, cómodo, bochornoso…), que es lo
 * que la humedad sola no cuenta.
 *   micro → % · s → gota + rocío · m → + confort y próximas horas · l → + barras de 24 h,
 *   visibilidad y lluvia · xl → + lluvia por días · panorámico/torre → composiciones propias.
 */
import * as React from 'react';
import { Droplets } from 'lucide-react';
import { confortRocio } from '@/modules/weather/datos/interpretar';
import { BarrasHoras, grados } from '../_clima/graficas';
import { Datos, WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { estilosClima as s } from '../_clima/piezas';

const COLOR = '#60a5fa';

function Gota({ humedad, lado, id }: { humedad: number | null; lado: number; id: string }) {
    const nivel = humedad === null ? 0 : Math.max(0, Math.min(100, humedad));
    const y = 92 - (nivel / 100) * 70;
    return (
        <div className="relative shrink-0" style={{ width: lado * 0.8, height: lado }} role="img" aria-label={humedad === null ? 'Sin dato de humedad' : `Humedad ${Math.round(nivel)} %`}>
            <svg viewBox="0 0 80 100" className="absolute inset-0 h-full w-full" aria-hidden>
                <defs>
                    <clipPath id={`gc-${id}`}><path d="M40 4 C 40 4, 72 44, 72 64 A 32 32 0 0 1 8 64 C 8 44, 40 4, 40 4 Z" /></clipPath>
                    <linearGradient id={`gg-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7dd3fc" /><stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                </defs>
                <path d="M40 4 C 40 4, 72 44, 72 64 A 32 32 0 0 1 8 64 C 8 44, 40 4, 40 4 Z" fill="#ffffff" fillOpacity={0.05} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1.2} />
                <g clipPath={`url(#gc-${id})`}>
                    <g className={s.ola} style={{ ['--dur' as string]: '6s' }}>
                        <path d={`M0 ${y} Q10 ${y - 3} 20 ${y} T40 ${y} T60 ${y} T80 ${y} T100 ${y} T120 ${y} T140 ${y} T160 ${y} V100 H0 Z`} fill={`url(#gg-${id})`} opacity={0.9} />
                    </g>
                </g>
                <ellipse cx={28} cy={46} rx={4} ry={9} fill="#fff" opacity={0.18} transform="rotate(20 28 46)" />
            </svg>
            <div className="absolute inset-x-0 bottom-[16%] flex justify-center">
                <span className={`${s.cifra} font-light leading-none text-white`} style={{ fontSize: lado * 0.22 }}>{humedad === null ? '—' : `${Math.round(nivel)}%`}</span>
            </div>
        </div>
    );
}

function Cuerpo({ info, a, c, d, prox, id, cabecera, sello }: CtxMagnitud) {
    const { base, clase } = info;
    const u = d.u;
    const conf = confortRocio(a.rocio);
    const lado = Math.max(84, Math.min(info.ancho || 200, info.alto || 200) * (base === 's' ? 0.74 : 0.55));
    const vis = a.visibilidad === null ? '—' : a.visibilidad >= 10_000 ? `${Math.round(a.visibilidad / 1000)} km` : `${(a.visibilidad / 1000).toFixed(1).replace('.', ',')} km`;
    const lluviaProx = prox.slice(1, 13).find((h) => (h.probLluvia ?? 0) >= 50);
    const filas = [
        { t: 'Punto de rocío', v: grados(a.rocio, u), n: conf?.texto, color: conf?.color },
        { t: 'Visibilidad', v: vis },
        { t: 'Lluvia', v: lluviaProx ? `${Math.round(lluviaProx.probLluvia as number)} %` : 'no prevista', n: lluviaProx ? `a las ${d.fmt.hora(lluviaProx.t)}` : 'en 12 h' },
    ];
    const barras = (n: number) => (
        <BarrasHoras horas={prox.slice(0, n)} valor={(h) => h.humedad} color={() => COLOR} hora={d.fmt.hora} formato={(v) => `${Math.round(v)} %`} maximo={100} etiqueta={`Humedad de las próximas ${n} horas`} />
    );

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-0.5" role="img" aria-label={`Humedad ${a.humedad === null ? 'sin dato' : `${Math.round(a.humedad)} %`}`}>
                <Droplets aria-hidden className="size-5" style={{ color: COLOR }} />
                <span className={`${s.cifra} text-[24px] font-light leading-none`}>{a.humedad === null ? '—' : `${Math.round(a.humedad)}%`}</span>
            </div>
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
                <Gota humedad={a.humedad} lado={lado} id={id} />
                <span className="truncate text-[11px] text-white/75" title={conf?.texto}>Rocío {grados(a.rocio, u)}{conf ? ` · ${conf.texto}` : ''}</span>
            </div>
        );
    }
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(9rem,auto) minmax(0,1fr)' }}>
                <Gota humedad={a.humedad} lado={Math.min(118, (info.alto || 130) - 16)} id={id} />
                <div className="min-w-0 space-y-1">{cabecera('Humedad')}<Datos columnas={1} filas={filas.slice(0, 2)} /></div>
                {barras(12)}
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera('Humedad')}
                <div className="flex justify-center"><Gota humedad={a.humedad} lado={Math.min(160, (info.ancho || 160) - 20)} id={id} /></div>
                <Datos columnas={1} filas={filas} />
                <div className="mt-auto">{barras(8)}</div>
                {sello}
            </div>
        );
    }
    if (base === 'm') {
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera('Humedad')}
                <div className="flex min-h-0 flex-1 items-center gap-3">
                    <Gota humedad={a.humedad} lado={Math.min(118, lado)} id={id} />
                    <div className="min-w-0 flex-1"><Datos columnas={1} filas={filas.slice(0, 2)} /></div>
                </div>
                {barras(8)}
            </div>
        );
    }
    const dias = c.dias.slice(0, base === 'xl' ? 5 : 3);
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {cabecera('Humedad')}
            <div className="flex items-center gap-4">
                <Gota humedad={a.humedad} lado={base === 'xl' ? 170 : 130} id={id} />
                <div className="min-w-0 flex-1 space-y-2">
                    <Datos columnas={1} filas={filas} />
                </div>
            </div>
            {barras(24)}
            <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0,1fr))` }} aria-label="Lluvia por día">
                {dias.map((dd, i) => (
                    <li key={dd.t} className="min-w-0 rounded-xl bg-white/[0.05] px-2 py-1.5 text-center">
                        <span className="block truncate text-[11px] capitalize text-white/65">{i === 0 ? 'Hoy' : d.fmt.dia(dd.t)}</span>
                        <span className={`${s.cifra} block text-[15px] font-semibold text-sky-300`}>{dd.probLluvia === null ? '—' : `${Math.round(dd.probLluvia)}%`}</span>
                        <span className="block truncate text-[10px] text-white/50">{dd.lluviaMm === null ? '' : `${dd.lluviaMm.toFixed(1).replace('.', ',')} mm`}</span>
                    </li>
                ))}
            </ul>
            <div className="mt-auto">{sello}</div>
        </div>
    );
}

export function WeatherHumidityWidget() {
    return <WidgetMagnitud etiqueta="Humedad" acento={COLOR} acento2="#22d3ee" icono={Droplets} render={Cuerpo} />;
}

export default WeatherHumidityWidget;
