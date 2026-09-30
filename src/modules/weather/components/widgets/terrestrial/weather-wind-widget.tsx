'use client';
/**
 * Viento (WEATHER_WIND) — Ola 0929 · paquete A.
 * Real (Open-Meteo). Foco: una brújula con la flecha hacia donde SOPLA y la cifra en su centro;
 * alrededor, rachas, fuerza de Beaufort con su nombre marinero y de dónde viene.
 *   micro → flecha + cifra · s → brújula · m → brújula + rachas/Beaufort + próximas horas
 *   l → + barras de 24 h (media y rachas) y máximas de los días · xl → + lo que se nota en la calle
 *   panorámico → brújula | barras · torre → brújula + horas con flechas.
 */
import * as React from 'react';
import { ArrowUp, Wind } from 'lucide-react';
import { beaufort, procedencia, rumbo } from '@/modules/weather/datos/interpretar';
import type { HoraClima } from '@/modules/weather/datos/open-meteo';
import { aViento, ETIQUETA_VIENTO, type Unidades } from '@/modules/weather/datos/hooks';
import { BarrasHoras, BrujulaViento, velocidad } from '../_clima/graficas';
import { Datos, WidgetMagnitud, type CtxMagnitud } from '../_clima/magnitud';
import { estilosClima as s } from '../_clima/piezas';
import { Encajar, PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';

const COLOR = '#5eead4';

/** Lo que se nota en la calle con cada fuerza (escala de Beaufort en tierra). */
const EN_LA_CALLE = [
    'El humo sube recto.', 'El humo se inclina; las veletas no se mueven.', 'Se nota en la cara; se mueven las hojas.',
    'Hojas y ramitas en movimiento; ondean las banderas.', 'Se levanta polvo y papeles; se mueven ramas pequeñas.',
    'Se mecen los arbustos; pequeñas olas en estanques.', 'Se mueven ramas grandes; cuesta usar el paraguas.',
    'Árboles enteros en movimiento; cuesta caminar contra el viento.', 'Se rompen ramas; muy difícil caminar.',
    'Daños leves en tejados y chimeneas.', 'Árboles arrancados; daños importantes.', 'Destrozos extensos.', 'Devastación.',
];

function colorViento(kmh: number): string {
    if (kmh < 20) return '#5eead4';
    if (kmh < 40) return '#38bdf8';
    if (kmh < 62) return '#fbbf24';
    if (kmh < 89) return '#fb923c';
    return '#f43f5e';
}

function Horas({ horas, hora, u }: { horas: HoraClima[]; hora: (t: number) => string; u: Unidades }) {
    return (
        <ol className="flex flex-col" aria-label="Viento hora a hora">
            {horas.map((h, i) => (
                <li key={h.t} className="flex items-center gap-2 py-[3px] text-[12px]" aria-label={`${i === 0 ? 'Ahora' : hora(h.t)}: ${velocidad(h.viento, u)} ${rumbo(h.dirViento)}`}>
                    <span className={`${s.cifra} w-11 text-right text-[11px] ${i === 0 ? 'font-semibold' : 'text-white/55'}`}>{i === 0 ? 'Ahora' : hora(h.t)}</span>
                    <ArrowUp aria-hidden className="size-3.5 shrink-0" style={{ transform: `rotate(${((h.dirViento ?? 0) + 180) % 360}deg)`, color: colorViento(h.viento ?? 0) }} />
                    <span className="relative h-1.5 flex-1 rounded-full bg-white/[0.06]" aria-hidden>
                        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, ((h.viento ?? 0) / 60) * 100)}%`, background: colorViento(h.viento ?? 0) }} />
                    </span>
                    <span className={`${s.cifra} w-9 text-right font-semibold`}>{velocidad(h.viento, u, false)}</span>
                </li>
            ))}
        </ol>
    );
}

function Cuerpo({ info, a, c, d, prox, cabecera, sello }: CtxMagnitud) {
    const { base, clase } = info;
    const u = d.u;
    const bf = beaufort(a.viento);
    const lado = Math.max(84, Math.min(info.ancho || 200, info.alto || 200) * (base === 's' ? 0.78 : 0.56));
    const barras = (n: number) => (
        <BarrasHoras horas={prox.slice(0, n)} valor={(h) => h.viento} color={colorViento} hora={d.fmt.hora} formato={(v) => velocidad(v, u)}
            maximo={Math.max(40, ...prox.slice(0, n).map((h) => h.rachas ?? 0))} etiqueta={`Viento de las próximas ${n} horas`} />
    );
    const detalle = [
        { t: 'Rachas', v: velocidad(a.rachas, u, false), n: ETIQUETA_VIENTO[u.viento] },
        { t: 'Fuerza', v: bf ? `${bf.fuerza}` : '—', n: bf?.nombre },
        { t: 'Viene', v: rumbo(a.dirViento), n: procedencia(a.dirViento) },
    ];

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-0.5" role="img" aria-label={`Viento ${rumbo(a.dirViento)} a ${velocidad(a.viento, u)}`}>
                <ArrowUp aria-hidden className="size-6" style={{ transform: `rotate(${((a.dirViento ?? 0) + 180) % 360}deg)`, color: COLOR }} />
                <span className={`${s.cifra} text-[22px] font-light leading-none`}>{velocidad(a.viento, u, false)}</span>
                <span className="text-[9px] text-white/60">{ETIQUETA_VIENTO[u.viento]}</span>
            </div>
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
                <BrujulaViento dir={a.dirViento} kmh={a.viento} rachas={a.rachas} u={u} lado={lado} color={colorViento(a.viento ?? 0)} />
                <span className="truncate text-[11px] text-white/70">{bf?.nombre ?? ''} · {procedencia(a.dirViento)}</span>
            </div>
        );
    }
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(9rem,1fr) minmax(0,1.2fr)' }}>
                <BrujulaViento dir={a.dirViento} kmh={a.viento} rachas={a.rachas} u={u} lado={Math.min(118, (info.alto || 130) - 16)} color={colorViento(a.viento ?? 0)} />
                <div className="min-w-0 space-y-1">{cabecera('Viento')}<Datos columnas={1} filas={detalle.slice(0, 2)} /></div>
                {barras(12)}
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <PilaAjustable className="gap-3 p-3.5">
                {cabecera('Viento')}
                <Encajar minimo={72} className="flex items-center justify-center">
                    {({ ancho, alto }) => <BrujulaViento dir={a.dirViento} kmh={a.viento} rachas={a.rachas} u={u} lado={Math.max(64, Math.min(150, alto, ancho))} color={colorViento(a.viento ?? 0)} />}
                </Encajar>
                <Prescindible nivel={2}><Datos columnas={3} filas={detalle} /></Prescindible>
                <Prescindible nivel={1}><div className="shrink-0 overflow-hidden"><Horas horas={prox.slice(0, 6)} hora={d.fmt.hora} u={u} /></div></Prescindible>
                <Prescindible nivel={1}>{sello}</Prescindible>
            </PilaAjustable>
        );
    }
    if (base === 'm') {
        return (
            // La brújula se dibuja del alto libre (fija, se montaba sobre la cabecera: «Cuernavaca,
            // Morelos» pisaba «Rachas»); en tarjetas bajas se retiran antes las barras de horas.
            <PilaAjustable className="gap-2 p-3.5">
                {cabecera('Viento')}
                <Encajar minimo={64} className="flex items-center gap-3">
                    {({ ancho, alto }) => (
                        <>
                            <BrujulaViento dir={a.dirViento} kmh={a.viento} rachas={a.rachas} u={u} lado={Math.max(56, Math.min(120, lado, alto, ancho * 0.5))} color={colorViento(a.viento ?? 0)} />
                            <div className="min-w-0 flex-1"><Datos columnas={1} filas={detalle.slice(0, alto >= 120 ? 3 : alto >= 78 ? 2 : 1)} /></div>
                        </>
                    )}
                </Encajar>
                <Prescindible nivel={1}>{barras(8)}</Prescindible>
            </PilaAjustable>
        );
    }
    const diasMax = c.dias.slice(0, base === 'xl' ? 5 : 3);
    return (
        <PilaAjustable className="gap-3 p-4">
            {cabecera('Viento')}
            <Encajar minimo={90} className="flex items-center gap-4">
                {({ ancho, alto }) => (
                    <>
                        <BrujulaViento dir={a.dirViento} kmh={a.viento} rachas={a.rachas} u={u} lado={Math.max(72, Math.min(base === 'xl' ? 160 : 124, alto, ancho * 0.45))} color={colorViento(a.viento ?? 0)} />
                        <div className="min-w-0 flex-1 space-y-2">
                            <Datos columnas={base === 'xl' && ancho >= 460 ? 3 : 1} filas={base === 'xl' && ancho >= 460 ? detalle : detalle.slice(0, alto >= 120 ? 3 : alto >= 78 ? 2 : 1)} />
                            {bf && alto >= 150 && <p className="text-[12px] text-white/70">{EN_LA_CALLE[bf.fuerza]}</p>}
                        </div>
                    </>
                )}
            </Encajar>
            <Prescindible nivel={2}>{barras(24)}</Prescindible>
            <Prescindible nivel={1}>
            <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${diasMax.length}, minmax(0,1fr))` }} aria-label="Viento máximo por día">
                {diasMax.map((dd, i) => (
                    <li key={dd.t} className="min-w-0 rounded-xl bg-white/[0.05] px-2 py-1.5 text-center" title={`Rachas de hasta ${velocidad(dd.rachasMax, u)}`}>
                        <span className="block truncate text-[11px] capitalize text-white/65">{i === 0 ? 'Hoy' : d.fmt.dia(dd.t)}</span>
                        <span className={`${s.cifra} block text-[15px] font-semibold`} style={{ color: colorViento(dd.vientoMax ?? 0) }}>{dd.vientoMax === null ? '—' : Math.round(aViento(dd.vientoMax, u.viento))}</span>
                        <span className="block truncate text-[10px] text-white/50">rachas {dd.rachasMax === null ? '—' : Math.round(aViento(dd.rachasMax, u.viento))}</span>
                    </li>
                ))}
            </ul>
            </Prescindible>
            <Prescindible nivel={1}>{sello}</Prescindible>
        </PilaAjustable>
    );
}

export function WeatherWindWidget() {
    return <WidgetMagnitud etiqueta="Viento" acento={COLOR} acento2="#38bdf8" icono={Wind} render={Cuerpo} />;
}

export default WeatherWindWidget;
