'use client';
/**
 * Resonancia Schumann (WEATHER_SPACE_SCHUMANN) — Ola 0929 · paquete A.
 *
 * Honesto por diseño: NO existe una fuente abierta que publique la resonancia Schumann en
 * tiempo real con datos legibles, así que aquí no se inventa ninguna «frecuencia de ahora»
 * (antes pintaba 7,83 Hz «elevada» de un espectrograma de ejemplo). Se enseña lo que sí es
 * verdad: el espectro de REFERENCIA (7,83 · 14,3 · 20,8 · 27,3 · 33,8 Hz, rotulado como tal) y,
 * medido ahora mismo, lo que agita la ionosfera que forma la cavidad: el índice Kp y los rayos X
 * del Sol (NOAA SWPC). Enlaza al observatorio de Tomsk, que publica sus espectrogramas.
 *   micro → 7,83 Hz · s → + «referencia» · m → espectro + Kp · l → + rayos X y el observatorio
 *   xl → + la física en claro · panorámico/torre → composiciones propias.
 */
import * as React from 'react';
import { AudioWaveform, ExternalLink } from 'lucide-react';
import { fuenteKp, fuenteSol, resumirKp } from '@/modules/weather/datos/noaa';
import { claseRayos, explicarKp } from '@/modules/weather/datos/interpretar';
import { useFuente } from '@/modules/weather/datos/hooks';
import { MarcoClima, SelloFuente, estilosClima as s, type InfoMarco } from '../_clima/piezas';
import { COLOR_CLASE, colorKp, EspectroSchumann } from '../_cosmos/piezas-cosmos';
import { CabeceraCosmos } from '../_cosmos/marco-cosmos';

const OBSERVATORIO = 'https://sosrff.tsu.ru/';

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const kp = useFuente(fuenteKp, undefined, info.visible && base !== 'micro');
    const sol = useFuente(fuenteSol, undefined, info.visible && (base === 'l' || base === 'xl' || clase === 'torre'));
    const rk = kp.datos ? resumirKp(kp.datos, Date.now()) : null;
    const kpAhora = rk?.actual?.kp ?? null;
    const rayo = sol.datos?.rayos[sol.datos.rayos.length - 1] ?? null;
    const cl = claseRayos(rayo?.flujo ?? null);
    const refrescar = () => { kp.refrescar(); sol.refrescar(); };
    const cabecera = <CabeceraCosmos info={info} titulo="Resonancia Schumann" subtitulo="Espectro de referencia" icono={AudioWaveform} alActualizar={refrescar} />;
    const nota = <p className="text-[11px] leading-snug text-white/60">Picos de referencia de la ciencia: no hay una fuente abierta que la mida en vivo.</p>;
    const medidos = (
        <div className="grid grid-cols-2 gap-2" aria-label="Lo que se mide ahora">
            <div className="rounded-xl bg-white/[0.05] px-2.5 py-1.5">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-white/50">Kp ahora</span>
                <span className={`${s.cifra} block text-[16px] font-semibold`} style={{ color: kpAhora === null ? undefined : colorKp(kpAhora) }}>{kpAhora === null ? (kp.error ? 'sin dato' : '…') : kpAhora.toFixed(1).replace('.', ',')}</span>
            </div>
            <div className="rounded-xl bg-white/[0.05] px-2.5 py-1.5">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-white/50">Rayos X</span>
                <span className={`${s.cifra} block text-[16px] font-semibold`} style={{ color: cl ? COLOR_CLASE[cl.letra] : undefined }}>{cl?.etiqueta ?? (sol.error ? 'sin dato' : sol.datos ? '—' : '…')}</span>
            </div>
        </div>
    );
    const enlace = (
        <a href={OBSERVATORIO} target="_blank" rel="noopener noreferrer" className={`${s.foco} inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-sky-300 hover:underline`}>
            Espectrogramas del observatorio de Tomsk <ExternalLink aria-hidden className="size-3" />
        </a>
    );

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center" role="img" aria-label="Resonancia Schumann: 7,83 Hz de referencia">
                <span className={`${s.cifra} text-[20px] font-light leading-none`} style={{ color: info.acento }}>7,83</span>
                <span className="text-[9px] text-white/60">Hz · ref.</span>
            </div>
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col justify-center gap-1 p-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Schumann</span>
                <span className={`${s.cifra} text-[30px] font-extralight leading-none`} style={{ color: info.acento }}>7,83<span className="ml-1 text-[12px] text-white/60">Hz</span></span>
                <span className="text-[11px] text-white/60">fundamental de referencia</span>
            </div>
        );
    }
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(12rem,1fr)' }}>
                <EspectroSchumann alto={Math.max(60, (info.alto || 130) - 20)} />
                <div className="min-w-0 space-y-1.5">{cabecera}{medidos}</div>
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera}<EspectroSchumann alto={110} />{nota}{medidos}
                <p className="text-[12px] text-white/70">{explicarKp(kpAhora)}</p>
                <div className="mt-auto space-y-1">{enlace}<SelloFuente fuente="NOAA SWPC (Kp y rayos X)" en={kp.en} /></div>
            </div>
        );
    }
    if (base === 'm') {
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera}
                <div className="min-h-0 flex-1"><EspectroSchumann alto={Math.max(56, (info.alto || 240) - 150)} /></div>
                {nota}
                <p className="text-[12px] text-white/75">Kp ahora: <b className={s.cifra} style={{ color: kpAhora === null ? undefined : colorKp(kpAhora) }}>{kpAhora === null ? '—' : kpAhora.toFixed(1).replace('.', ',')}</b> <span className="text-white/50">(agita la ionosfera)</span></p>
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {cabecera}
            <EspectroSchumann alto={base === 'xl' ? 120 : 96} />
            {nota}
            <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Lo que sí se mide ahora</p>
                {medidos}
            </div>
            {base === 'xl' && (
                <div className="space-y-1 text-[12px] leading-snug text-white/70">
                    <p>La Tierra y la ionosfera forman una cavidad que resuena con los ~50 relámpagos por segundo del planeta. Su fundamental ronda los 7,83 Hz y varía unas décimas con el día y la noche.</p>
                    <p>Las tormentas geomagnéticas (Kp alto) y las llamaradas (rayos X) alteran la ionosfera y, con ella, la intensidad y la anchura de los picos.</p>
                </div>
            )}
            <div className="mt-auto space-y-1">{enlace}<SelloFuente fuente="NOAA SWPC (Kp y rayos X)" en={kp.en} /></div>
        </div>
    );
}

export function SpaceEnergySchumannWidget() {
    return (
        <MarcoClima etiqueta="Resonancia Schumann" acento="#c084fc" acento2="#38bdf8">
            {(info) => <Contenido info={info} />}
        </MarcoClima>
    );
}

export default SpaceEnergySchumannWidget;
