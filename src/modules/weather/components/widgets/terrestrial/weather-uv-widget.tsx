'use client';
/**
 * Índice UV (WEATHER_UV) — Ola 0929 · paquete A.
 * Real (Open-Meteo). Foco: el arco de la OMS (bajo → extremo) con la aguja en el UV de ahora,
 * el consejo que toca y, sobre todo, la VENTANA de protección de hoy («protégete de 11:00 a
 * 17:00»), que es lo que uno quiere saber al abrirlo. De noche lo dice y enseña el pico de mañana.
 *   micro → cifra coloreada · s → arco · m → + consejo y ventana · l → + curva de hoy y máximos
 *   de los días · xl → + aviso a partir de 8 · panorámico/torre → composiciones propias.
 */
import * as React from 'react';
import { Sun } from 'lucide-react';
import { nivelUv, ventanaProteccion } from '@/modules/weather/datos/interpretar';
import { ArcoUV, BarrasHoras } from '../_clima/graficas';
import { WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { estilosClima as s } from '../_clima/piezas';

function colorUv(v: number) {
    return nivelUv(v)?.color ?? '#4ade80';
}

function Cuerpo({ info, a, c, d, hoy, ahora, cabecera, sello }: CtxMagnitud) {
    const { base, clase } = info;
    const n = nivelUv(a.uv);
    const lado = Math.max(96, Math.min(info.ancho || 200, (info.alto || 200) * 1.4) * (base === 's' ? 0.82 : 0.6));
    const inicioHoy = hoy?.t ?? ahora - 12 * 3_600_000;
    const ventana = ventanaProteccion(c.horas, inicioHoy, inicioHoy + 86_400_000);
    const manana = c.dias.find((dd) => dd.t > inicioHoy);
    const deNoche = !a.esDia || (a.uv ?? 0) < 0.5;
    const textoVentana = ventana
        ? ventana.fin < ahora
            ? `Hoy ya pasó el sol fuerte (pico ${Math.round(ventana.pico)} a las ${d.fmt.hora(ventana.picoT)})`
            : `Protégete de ${d.fmt.hora(Math.max(ventana.inicio, ahora))} a ${d.fmt.hora(ventana.fin)} · pico ${Math.round(ventana.pico)} a las ${d.fmt.hora(ventana.picoT)}`
        : 'Hoy no hace falta protección especial';
    const textoNoche = manana?.uvMax != null ? `Sin sol ahora · mañana hasta ${Math.round(manana.uvMax)} (${nivelUv(manana.uvMax)?.texto.toLowerCase()})` : 'Sin sol ahora';
    const horasDia = c.horas.filter((h) => h.t >= inicioHoy && h.t < inicioHoy + 86_400_000 && h.esDia);
    const alerta = (a.uv ?? 0) >= 8 || (ventana?.pico ?? 0) >= 8;

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center" role="img" aria-label={`Índice UV ${a.uv === null ? 'sin dato' : Math.round(a.uv)}${n ? `: ${n.texto}` : ''}`}>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">UV</span>
                <span className={`${s.cifra} text-[30px] font-light leading-none`} style={{ color: n?.color }}>{a.uv === null ? '—' : Math.round(a.uv)}</span>
            </div>
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
                <ArcoUV uv={a.uv} lado={lado} />
                <span className="text-[12px] font-medium" style={{ color: n?.color }}>{n?.texto ?? 'Sin dato'}</span>
            </div>
        );
    }
    const bloque = (
        <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[15px] font-semibold" style={{ color: n?.color }}>{n?.texto ?? 'Sin dato'}</p>
            <p className="text-[12px] text-white/75">{deNoche ? textoNoche : n?.consejo}</p>
            {!deNoche && <p className="text-[12px] text-white/65">{textoVentana}</p>}
            {alerta && <p role="note" className="inline-flex rounded-full bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-medium text-rose-100 ring-1 ring-rose-400/40">UV muy alto: evita el sol del mediodía</p>}
        </div>
    );
    const curva = (
        <BarrasHoras horas={horasDia} valor={(h) => h.uv} color={colorUv} hora={d.fmt.hora} formato={(v) => `UV ${Math.round(v)}`} maximo={Math.max(8, ...horasDia.map((h) => h.uv ?? 0))} etiqueta="UV de hoy hora a hora" />
    );
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(10rem,auto) minmax(0,1fr)' }}>
                <ArcoUV uv={a.uv} lado={Math.min(150, ((info.alto || 130) - 10) * 1.5)} />
                <div className="min-w-0 space-y-1">{cabecera('Índice UV')}{bloque}</div>
                {curva}
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera('Índice UV')}
                <div className="flex justify-center"><ArcoUV uv={a.uv} lado={Math.min(170, (info.ancho || 170) - 20)} /></div>
                {bloque}
                <div className="mt-auto">{curva}</div>
                {sello}
            </div>
        );
    }
    if (base === 'm') {
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera('Índice UV')}
                <div className="flex min-h-0 flex-1 items-center gap-3">
                    <ArcoUV uv={a.uv} lado={Math.min(130, lado)} />
                    {bloque}
                </div>
            </div>
        );
    }
    const dias = c.dias.slice(0, base === 'xl' ? 5 : 3);
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {cabecera('Índice UV')}
            <div className="flex items-center gap-4">
                <ArcoUV uv={a.uv} lado={base === 'xl' ? 190 : 150} />
                {bloque}
            </div>
            {curva}
            <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0,1fr))` }} aria-label="UV máximo por día">
                {dias.map((dd, i) => {
                    const nd = nivelUv(dd.uvMax);
                    return (
                        <li key={dd.t} className="min-w-0 rounded-xl bg-white/[0.05] px-2 py-1.5 text-center" title={nd ? `${nd.texto}: ${nd.consejo}` : undefined}>
                            <span className="block truncate text-[11px] capitalize text-white/65">{i === 0 ? 'Hoy' : d.fmt.dia(dd.t)}</span>
                            <span className={`${s.cifra} block text-[16px] font-semibold`} style={{ color: nd?.color }}>{dd.uvMax === null ? '—' : Math.round(dd.uvMax)}</span>
                            <span className="block truncate text-[10px] text-white/50">{nd?.texto ?? ''}</span>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-auto">{sello}</div>
        </div>
    );
}

export function WeatherUvWidget() {
    return <WidgetMagnitud etiqueta="Índice UV" acento="#facc15" acento2="#fb923c" icono={Sun} render={Cuerpo} />;
}

export default WeatherUvWidget;
