'use client';
/**
 * Sol y Luna (WEATHER_ASTRONOMY) — Ola 0929 · paquete A.
 * El cielo REAL de tu sitio, calculado en el propio dispositivo (src/lib/astro/cielo.ts, sin
 * red): el Sol recorriendo su arco entre el orto y el ocaso, la Luna con su fase e iluminación,
 * cuánta luz gana o pierde el día, la hora dorada, los signos del Sol y la Luna y las próximas
 * luna llena y nueva. Cero peticiones: solo necesita la ubicación.
 *   micro → Luna + % · s → Luna + orto/ocaso · m → arco del Sol + Luna · l → + hora dorada,
 *   signos y próximas fases · xl → + las lunas de las dos próximas semanas
 *   panorámico → arco | Luna | datos · torre → en columna.
 */
import * as React from 'react';
import { MoonStar } from 'lucide-react';
import { alturaSol, COLOR_ELEMENTO, faseLunar, horasDelSol, proximaFase, proximoCambioDeSigno, signosDelCielo } from '@/lib/astro/cielo';
import { formateadores, useReloj, useUbicacionClima } from '@/modules/weather/datos/hooks';
import { LunaFase } from '../_clima/cielo';
import { ArcoSolar } from '../_clima/graficas';
import { LugarClima, MarcoClima, MenuClima, RotuloClima, SinUbicacion, estilosClima as s, type InfoMarco } from '../_clima/piezas';

/** Horas doradas del día: el Sol entre −4° y 6° (mañana y tarde), por barrido de 5 min. */
export function horasDoradas(dia: Date, lat: number, lon: number): { manana: [number, number] | null; tarde: [number, number] | null } {
    const sol = horasDelSol(dia, lat, lon);
    if (!sol.orto || !sol.ocaso) return { manana: null, tarde: null };
    const tramo = (desde: number, hasta: number, paso: number) => {
        let ini: number | null = null, fin: number | null = null;
        for (let t = desde; paso > 0 ? t <= hasta : t >= hasta; t += paso) {
            const h = alturaSol(new Date(t), lat, lon);
            if (h >= -4 && h <= 6) { if (ini === null) ini = t; fin = t; } else if (ini !== null) break;
        }
        return ini !== null && fin !== null ? ([Math.min(ini, fin), Math.max(ini, fin)] as [number, number]) : null;
    };
    const o = sol.orto.getTime(), c = sol.ocaso.getTime();
    return { manana: tramo(o - 3_600_000, o + 3 * 3_600_000, 300_000), tarde: tramo(c + 3_600_000, c - 3 * 3_600_000, -300_000) };
}

function duracion(min: number): string {
    return `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
}

function Contenido({ info }: { info: InfoMarco }) {
    const { ubicacion } = useUbicacionClima();
    const ahora = useReloj(60_000);
    const id = React.useId().replace(/:/g, '');
    const fmt = React.useMemo(() => formateadores(ubicacion?.zona), [ubicacion?.zona]);
    const hora = Math.floor((ahora ?? 0) / 3_600_000);
    const cielo = React.useMemo(() => {
        if (!ahora || !ubicacion) return null;
        const f = new Date(ahora);
        const sol = horasDelSol(f, ubicacion.lat, ubicacion.lon);
        const ayer = horasDelSol(new Date(ahora - 86_400_000), ubicacion.lat, ubicacion.lon);
        const luz = sol.orto && sol.ocaso ? (sol.ocaso.getTime() - sol.orto.getTime()) / 60_000 : null;
        const luzAyer = ayer.orto && ayer.ocaso ? (ayer.ocaso.getTime() - ayer.orto.getTime()) / 60_000 : null;
        return {
            sol, luz, cambio: luz !== null && luzAyer !== null ? Math.round(luz - luzAyer) : null,
            fase: faseLunar(f), signos: signosDelCielo(f), altura: alturaSol(f, ubicacion.lat, ubicacion.lon),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [Math.floor((ahora ?? 0) / 60_000), ubicacion?.lat, ubicacion?.lon]);
    const lento = React.useMemo(() => {
        if (!ahora || !ubicacion) return null;
        const f = new Date(hora * 3_600_000);
        return {
            llena: proximaFase(f, 'llena'), nueva: proximaFase(f, 'nueva'), signo: proximoCambioDeSigno(f),
            doradas: horasDoradas(new Date(ahora), ubicacion.lat, ubicacion.lon),
            lunas: Array.from({ length: 14 }, (_, i) => ({ t: ahora + i * 86_400_000, f: faseLunar(new Date(ahora + i * 86_400_000)) })),
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hora, ubicacion?.lat, ubicacion?.lon]);

    if (!ubicacion) return <SinUbicacion info={info} />;
    if (!ahora || !cielo || !lento) return <div role="status" className="grid h-full place-items-center text-[12px] text-white/60">Calculando el cielo…</div>;

    const { base, clase } = info;
    const orto = cielo.sol.orto?.getTime() ?? null, ocaso = cielo.sol.ocaso?.getTime() ?? null;
    const pct = Math.round(cielo.fase.iluminada * 100);
    const falta = (t: Date) => { const h = Math.round((t.getTime() - ahora) / 3_600_000); return h >= 36 ? `en ${Math.round(h / 24)} días` : `en ${Math.max(0, h)} h`; };
    const cambioTxt = cielo.cambio === null || cielo.cambio === 0 ? null : `${cielo.cambio > 0 ? '+' : '−'}${Math.abs(cielo.cambio)} min que ayer`;
    const luna = (r: number) => (
        <svg viewBox={`${-r * 1.4} ${-r * 1.4} ${r * 2.8} ${r * 2.8}`} width={r * 2.8} height={r * 2.8} className="shrink-0 overflow-visible" role="img" aria-label={`${cielo.fase.nombre}, iluminada al ${pct} %`}>
            <LunaFase r={r} fase={cielo.fase} id={`${id}m${r}`} />
        </svg>
    );
    const menu = <MenuClima info={info} conUnidades={false} ruta="/atmosphere" rutaEtiqueta="Abrir el cielo y el clima espacial" />;
    const cabecera = (
        <div className="flex min-w-0 items-center gap-2">
            <MoonStar aria-hidden className="size-4 shrink-0" style={{ color: info.acento }} />
            <div className="min-w-0 flex-1"><RotuloClima>Sol y Luna</RotuloClima>{base !== 's' && <LugarClima nombre={ubicacion.nombre} elegida={ubicacion.elegida} className="text-[11px]" />}</div>
            {menu}
        </div>
    );
    const ortoOcaso = (
        <p className={`${s.cifra} text-[12px] text-white/80`} aria-label={orto && ocaso ? `Sale el sol a las ${fmt.hora(orto)} y se pone a las ${fmt.hora(ocaso)}` : 'Sin orto ni ocaso hoy'}>
            {orto && ocaso ? <>Sale el sol <b className="font-semibold text-amber-200">{fmt.hora(orto)}</b> · se pone <b className="font-semibold text-rose-200">{fmt.hora(ocaso)}</b></> : cielo.altura > 0 ? 'Sol de medianoche' : 'Noche polar'}
        </p>
    );
    const datoLuz = cielo.luz !== null && (
        <p className="text-[12px] text-white/75"><span className={`${s.cifra} font-semibold text-white`}>{duracion(cielo.luz)}</span> de luz{cambioTxt && <span className="text-white/55"> · {cambioTxt}</span>}</p>
    );
    const faseTxt = <p className="text-[12px]"><span className="font-semibold">{cielo.fase.nombre}</span> <span className={`${s.cifra} text-white/60`}>{pct} %</span></p>;
    const signos = (
        <p className="text-[12px] text-white/75">
            Sol en <b className="font-semibold" style={{ color: COLOR_ELEMENTO[cielo.signos.sol.elemento] }}>{cielo.signos.sol.nombre}</b> · Luna en <b className="font-semibold" style={{ color: COLOR_ELEMENTO[cielo.signos.luna.elemento] }}>{cielo.signos.luna.nombre}</b>
        </p>
    );
    const proximas = (
        <ul className="grid grid-cols-2 gap-2 text-[12px]" aria-label="Próximas fases">
            <li className="rounded-xl bg-white/[0.05] px-2.5 py-1.5"><span className="block text-[10px] uppercase tracking-[0.12em] text-white/50">Luna llena</span><span className={s.cifra}>{fmt.diaLargo(lento.llena.getTime())}</span> <span className="text-white/55">{falta(lento.llena)}</span></li>
            <li className="rounded-xl bg-white/[0.05] px-2.5 py-1.5"><span className="block text-[10px] uppercase tracking-[0.12em] text-white/50">Luna nueva</span><span className={s.cifra}>{fmt.diaLargo(lento.nueva.getTime())}</span> <span className="text-white/55">{falta(lento.nueva)}</span></li>
        </ul>
    );
    const doradas = (lento.doradas.manana || lento.doradas.tarde) && (
        <p className="text-[12px] text-white/75">Hora dorada {lento.doradas.manana && <span className={`${s.cifra} text-amber-200`}>{fmt.hora(lento.doradas.manana[0])}–{fmt.hora(lento.doradas.manana[1])}</span>}{lento.doradas.manana && lento.doradas.tarde && ' y '}{lento.doradas.tarde && <span className={`${s.cifra} text-amber-200`}>{fmt.hora(lento.doradas.tarde[0])}–{fmt.hora(lento.doradas.tarde[1])}</span>}</p>
    );

    if (base === 'micro') {
        return <div className="flex h-full flex-col items-center justify-center gap-0.5">{luna(16)}<span className={`${s.cifra} text-[12px] text-white/80`}>{pct}%</span></div>;
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center">
                {luna(Math.max(16, Math.min(30, (Math.min(info.ancho || 150, info.alto || 150) - 70) / 3)))}
                {faseTxt}
                <p className={`${s.cifra} text-[11px] text-white/70`}>{orto ? fmt.hora(orto) : '—'} · {ocaso ? fmt.hora(ocaso) : '—'}</p>
            </div>
        );
    }
    const arco = (alto: number) => <ArcoSolar orto={orto} ocaso={ocaso} ahora={ahora} fase={cielo.fase} hora={fmt.hora} id={id} alto={alto} conLuna={false} />;
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'minmax(8rem,1.2fr) auto minmax(0,1.3fr)' }}>
                {arco(Math.max(60, (info.alto || 130) - 24))}
                {luna(Math.min(26, ((info.alto || 130) - 30) / 3))}
                <div className="min-w-0 space-y-1">{cabecera}{faseTxt}{datoLuz}</div>
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera}
                {arco(90)}
                {ortoOcaso}{datoLuz}
                <div className="flex items-center gap-3">{luna(22)}{faseTxt}</div>
                {signos}{proximas}
            </div>
        );
    }
    if (base === 'm') {
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera}
                <div className="min-h-0 flex-1">{arco(Math.max(64, (info.alto || 240) - 150))}</div>
                <div className="flex items-center gap-3">
                    {luna(15)}
                    <div className="min-w-0 flex-1">{faseTxt}{datoLuz}</div>
                </div>
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {cabecera}
            <div className="grid items-center gap-3" style={{ gridTemplateColumns: 'minmax(0,1.5fr) auto' }}>
                {arco(base === 'xl' ? 120 : 96)}
                {luna(base === 'xl' ? 30 : 22)}
            </div>
            <div className="space-y-1">{ortoOcaso}{datoLuz}{doradas}{faseTxt}{signos}</div>
            {proximas}
            {base === 'xl' && (
                <ol className="grid grid-cols-7 gap-1" aria-label="La Luna de las próximas dos semanas">
                    {lento.lunas.map(({ t, f }, i) => (
                        <li key={t} className="flex flex-col items-center gap-0.5" title={`${fmt.diaLargo(t)}: ${f.nombre}, ${Math.round(f.iluminada * 100)} %`}>
                            <svg viewBox="-9 -9 18 18" width={20} height={20} aria-hidden><LunaFase r={7} fase={f} id={`${id}d${i}`} /></svg>
                            <span className="text-[9px] capitalize text-white/55">{i === 0 ? 'hoy' : fmt.dia(t - 43_200_000)}</span>
                        </li>
                    ))}
                </ol>
            )}
            <p className="mt-auto text-[10px] text-white/45">Calculado en tu dispositivo · próximo cambio de signo del Sol: {lento.signo.signo.nombre}, {fmt.diaLargo(lento.signo.fecha.getTime())}</p>
        </div>
    );
}

export function WeatherAstronomyWidget() {
    return (
        <MarcoClima etiqueta="Sol y Luna" acento="#c4b5fd" acento2="#fde047">
            {(info) => <Contenido info={info} />}
        </MarcoClima>
    );
}

export default WeatherAstronomyWidget;
