'use client';
/**
 * Calidad del aire (WEATHER_AIR_QUALITY) — Ola 0929 · paquete A.
 * Real (Open-Meteo Air Quality, modelo CAMS de Copernicus). Índice europeo (o el de EE. UU.
 * donde no hay europeo), cada contaminante contra la guía de la OMS 2021, la previsión de 24 h
 * y los pólenes cuando el modelo los da (solo Europa). Nada de cifras de relleno: lo que falta,
 * falta.
 *   micro → índice coloreado · s → medidor · m → + consejo y contaminantes · l → + previsión y
 *   pólenes · xl → todo · panorámico → medidor | contaminantes | previsión · torre → en columna.
 */
import * as React from 'react';
import { Leaf } from 'lucide-react';
import { GUIA_OMS, nivelAire } from '@/modules/weather/datos/interpretar';
import type { AireReal } from '@/modules/weather/datos/open-meteo';
import { MedidorAire } from '../_clima/graficas';
import { WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { estilosClima as s } from '../_clima/piezas';

const CONTAMINANTES: { clave: 'pm25' | 'pm10' | 'no2' | 'o3' | 'so2'; nombre: string; guia: number }[] = [
    { clave: 'pm25', nombre: 'PM2,5', guia: GUIA_OMS.pm25 },
    { clave: 'pm10', nombre: 'PM10', guia: GUIA_OMS.pm10 },
    { clave: 'no2', nombre: 'NO₂', guia: GUIA_OMS.no2 },
    { clave: 'o3', nombre: 'Ozono', guia: GUIA_OMS.o3 },
    { clave: 'so2', nombre: 'SO₂', guia: GUIA_OMS.so2 },
];

function Contaminantes({ aire, n }: { aire: AireReal; n: number }) {
    const filas = CONTAMINANTES.map((c) => ({ ...c, v: aire[c.clave] })).filter((c) => c.v !== null).slice(0, n);
    if (!filas.length) return <p className="text-[11px] text-white/55">El modelo no trae contaminantes aquí.</p>;
    return (
        <ul className="flex flex-col gap-1.5" aria-label="Contaminantes frente a la guía de la OMS">
            {filas.map((c) => {
                const r = (c.v as number) / c.guia;
                const color = r <= 0.5 ? '#50f0e6' : r <= 1 ? '#50ccaa' : r <= 2 ? '#f0e641' : '#ff5050';
                return (
                    <li key={c.clave} className="grid items-center gap-2 text-[12px]" style={{ gridTemplateColumns: '3.4rem minmax(0,1fr) 4.4rem' }}
                        aria-label={`${c.nombre}: ${Math.round(c.v as number)} µg/m³, ${r <= 1 ? 'dentro' : 'por encima'} de la guía de la OMS (${c.guia})`}>
                        <span className="text-white/75">{c.nombre}</span>
                        <span className="relative h-1.5 rounded-full bg-white/10" aria-hidden>
                            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, r * 50)}%`, background: color }} />
                            <span className="absolute inset-y-[-3px] left-1/2 w-px bg-white/50" title="Guía OMS" />
                        </span>
                        <span className={`${s.cifra} text-right`}>{Math.round(c.v as number)} <span className="text-[10px] text-white/45">µg/m³</span></span>
                    </li>
                );
            })}
        </ul>
    );
}

function Prevision({ aire, hora }: { aire: AireReal; hora: (t: number) => string }) {
    const horas = aire.horas.slice(0, 24);
    const usarEu = horas.some((h) => h.europeo !== null);
    const vals = horas.map((h) => (usarEu ? h.europeo : h.eeuu));
    if (!vals.some((v) => v !== null)) return null;
    const tope = usarEu ? 100 : 200;
    return (
        <figure className="flex flex-col gap-1" role="img" aria-label="Previsión del índice de calidad del aire para 24 horas">
            <div className="flex h-12 items-end gap-[2px]" aria-hidden>
                {vals.map((v, i) => {
                    const n = v === null ? null : nivelAire(usarEu ? { europeo: v, eeuu: null } : { europeo: null, eeuu: v });
                    return <span key={horas[i].t} className="flex-1 rounded-t-[3px]" style={{ height: `${v === null ? 0 : Math.max(6, (Math.min(tope, v) / tope) * 100)}%`, background: n?.color ?? 'transparent' }} title={v === null ? undefined : `${hora(horas[i].t)}: ${v} (${n?.texto})`} />;
                })}
            </div>
            <div className="flex justify-between text-[10px] text-white/50" aria-hidden><span>Ahora</span><span>{hora(horas[Math.floor(horas.length / 2)].t)}</span><span>{hora(horas[horas.length - 1].t)}</span></div>
        </figure>
    );
}

function Polen({ aire }: { aire: AireReal }) {
    const altos = aire.polen.filter((p) => p.valor >= 1).sort((a, b) => b.valor - a.valor).slice(0, 4);
    if (!aire.polen.length) return null;
    return (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Pólenes">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">Polen</span>
            {altos.length ? altos.map((p) => (
                <span key={p.nombre} className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px]" title={`${p.nombre}: ${p.valor} granos/m³`}>{p.nombre} <span className={`${s.cifra} text-white/60`}>{Math.round(p.valor)}</span></span>
            )) : <span className="text-[11px] text-white/60">bajo</span>}
        </div>
    );
}

function Cuerpo({ info, aire, d, cabecera, sello }: CtxMagnitud) {
    const { base, clase } = info;
    if (!aire) return null;
    const n = nivelAire(aire);
    const lado = Math.max(90, Math.min(info.ancho || 200, info.alto || 200) * (base === 's' ? 0.8 : 0.56));
    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center" role="img" aria-label={n ? `Calidad del aire ${n.texto.toLowerCase()}, índice ${n.indice}` : 'Sin dato de calidad del aire'}>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Aire</span>
                <span className={`${s.cifra} text-[28px] font-light leading-none`} style={{ color: n?.color }}>{n?.indice ?? '—'}</span>
            </div>
        );
    }
    if (base === 's') {
        return <div className="flex h-full items-center justify-center p-2"><MedidorAire nivel={n} lado={lado} /></div>;
    }
    const consejo = n && <p className="text-[12px] text-white/75">{n.consejo}</p>;
    const escala = n && <p className="text-[10px] text-white/45">{n.escala === 'europeo' ? 'Índice europeo (0-100+)' : 'Índice de EE. UU. (0-500)'}</p>;
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(12rem,1fr) minmax(0,1fr)' }}>
                <MedidorAire nivel={n} lado={Math.min(120, (info.alto || 130) - 12)} />
                <div className="min-w-0 space-y-1.5">{cabecera('Calidad del aire')}<Contaminantes aire={aire} n={3} /></div>
                <Prevision aire={aire} hora={d.fmt.hora} />
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera('Calidad del aire')}
                <div className="flex justify-center"><MedidorAire nivel={n} lado={Math.min(160, (info.ancho || 160) - 20)} /></div>
                {consejo}
                <Contaminantes aire={aire} n={5} />
                <div className="mt-auto space-y-2"><Polen aire={aire} />{sello}</div>
            </div>
        );
    }
    if (base === 'm') {
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera('Calidad del aire')}
                <div className="flex min-h-0 flex-1 items-center gap-3">
                    <MedidorAire nivel={n} lado={Math.min(118, lado)} />
                    <div className="min-w-0 flex-1 space-y-1.5">{consejo}{escala}</div>
                </div>
                <Contaminantes aire={aire} n={2} />
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {cabecera('Calidad del aire')}
            <div className="flex items-center gap-4">
                <MedidorAire nivel={n} lado={base === 'xl' ? 170 : 132} />
                <div className="min-w-0 flex-1 space-y-2">{consejo}{escala}<Contaminantes aire={aire} n={base === 'xl' ? 5 : 3} /></div>
            </div>
            <Prevision aire={aire} hora={d.fmt.hora} />
            <Polen aire={aire} />
            <div className="mt-auto">{sello}</div>
        </div>
    );
}

export function WeatherAirQualityWidget() {
    return <WidgetMagnitud etiqueta="Calidad del aire" acento="#50ccaa" acento2="#f0e641" icono={Leaf} principal="aire" render={Cuerpo} />;
}

export default WeatherAirQualityWidget;
