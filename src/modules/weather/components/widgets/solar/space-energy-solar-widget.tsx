'use client';
/**
 * Viento solar (WEATHER_SPACE_SOLAR) — Ola 0929 · paquete A.
 *
 * Datos REALES de NOAA SWPC: velocidad y campo magnético (Bt/Bz) de los resúmenes de la sonda
 * activa y, desde «m», el plasma de 24 h (velocidad, densidad, temperatura). Foco: el viento
 * viajando del Sol a la magnetosfera — más rápido con más velocidad, más denso con más protones —
 * y la «puerta» Bz, abierta cuando apunta al sur (lo que enciende las auroras). Antes mezclaba
 * cifras de ejemplo con las reales.
 *   micro → km/s · s → velocidad + Bz · m → flujo animado + velocidad/densidad/Bz + frase
 *   l → + curva de 24 h · xl → + temperatura, F10.7 y Kp · panorámico/torre → composiciones propias.
 */
import * as React from 'react';
import { Wind } from 'lucide-react';
import { fuenteKp, fuentePlasma, fuenteSol, fuenteVientoResumen, resumirKp } from '@/modules/weather/datos/noaa';
import { COLOR_SEVERIDAD, explicarViento, severidadViento } from '@/modules/weather/datos/interpretar';
import { formateadores, useFuente } from '@/modules/weather/datos/hooks';
import { MarcoClima, MicroDato, SelloFuente, estilosClima as s, type InfoMarco } from '../_clima/piezas';
import { Encajar, PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';
import { FlujoViento, GraficaPlasma } from '../_cosmos/piezas-cosmos';
import { CabeceraCosmos, estadoCosmos } from '../_cosmos/marco-cosmos';

function colorBz(bz: number | null) {
    return bz === null ? '#94a3b8' : bz <= -10 ? '#f43f5e' : bz <= -5 ? '#fb923c' : bz < 0 ? '#facc15' : '#34d399';
}

function Cifra({ t, v, u, color, nota }: { t: string; v: string; u: string; color?: string; nota?: string }) {
    return (
        <div className="min-w-0" title={`${t}: ${v} ${u}${nota ? ` (${nota})` : ''}`}>
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">{t}</span>
            <span className={`${s.cifra} block truncate text-[18px] font-semibold leading-tight`} style={{ color }}>{v}<span className="ml-1 text-[11px] font-normal text-white/55">{u}</span></span>
            {nota && <span className="block truncate text-[10px] text-white/50">{nota}</span>}
        </div>
    );
}

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const resumen = useFuente(fuenteVientoResumen, undefined, info.visible);
    const conPlasma = base !== 'micro' && base !== 's';
    const plasma = useFuente(fuentePlasma, undefined, info.visible && conPlasma);
    const sol = useFuente(fuenteSol, undefined, info.visible && base === 'xl');
    const kp = useFuente(fuenteKp, undefined, info.visible && base === 'xl');
    const fmt = React.useMemo(() => formateadores(), []);
    const id = React.useId().replace(/:/g, '');

    const espera = estadoCosmos(resumen, info, 'Midiendo el viento solar…');
    if (espera) return espera;
    const r = resumen.datos!;
    const pa = plasma.datos?.actual ?? null;
    const vel = r.velocidad ?? pa?.velocidad ?? null;
    const dens = pa?.densidad ?? null;
    const sev = severidadViento(vel);
    const frase = explicarViento(vel, r.bz);
    const refrescar = () => { resumen.refrescar(); plasma.refrescar(); sol.refrescar(); kp.refrescar(); };
    const cabecera = <CabeceraCosmos info={info} titulo="Viento solar" subtitulo={plasma.datos?.fuente ? `Sonda ${plasma.datos.fuente}` : undefined} icono={Wind} alActualizar={refrescar} />;
    const sello = <SelloFuente fuente="NOAA SWPC" en={resumen.en} />;
    const velTxt = vel === null ? '—' : String(Math.round(vel));
    const cifras = (
        <div className="grid grid-cols-3 gap-2">
            <Cifra t="Velocidad" v={velTxt} u="km/s" color={COLOR_SEVERIDAD[sev]} />
            <Cifra t="Densidad" v={dens === null ? '—' : dens.toFixed(1).replace('.', ',')} u="p/cm³" nota={plasma.datos ? undefined : plasma.error ? 'sin dato' : 'leyendo…'} />
            <Cifra t="Bz" v={r.bz === null ? '—' : r.bz.toFixed(1).replace('.', ',')} u="nT" color={colorBz(r.bz)} nota={r.bz === null ? undefined : r.bz < 0 ? 'hacia el sur' : 'hacia el norte'} />
        </div>
    );

    if (base === 'micro') {
        return (
            <MicroDato info={info} etiqueta={`Viento solar ${vel === null ? 'sin lectura' : `${velTxt} km/s`}`}
                cifra={String(velTxt)} unidad="km/s" color={COLOR_SEVERIDAD[sev]} />
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col justify-center gap-2 p-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Viento solar</span>
                <span className={`${s.cifra} text-[34px] font-extralight leading-none`} style={{ color: COLOR_SEVERIDAD[sev] }}>{velTxt}<span className="ml-1 text-[12px] text-white/60">km/s</span></span>
                <span className="text-[12px]" style={{ color: colorBz(r.bz) }}>Bz {r.bz === null ? '—' : `${r.bz.toFixed(1).replace('.', ',')} nT`}</span>
            </div>
        );
    }
    const flujo = (alto: number) => <FlujoViento velocidad={vel} densidad={dens} bz={r.bz} animar={info.animar && info.visible} alto={alto} />;
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'minmax(8rem,1fr) minmax(12rem,1.2fr) minmax(0,1.2fr)' }}>
                {flujo(Math.max(60, (info.alto || 130) - 24))}
                <div className="min-w-0 space-y-1.5">{cabecera}{cifras}</div>
                {plasma.datos ? <GraficaPlasma serie={plasma.datos.serie} hora={fmt.hora} alto={Math.max(60, (info.alto || 130) - 24)} id={id} /> : <p className="text-[12px] text-white/70">{frase}</p>}
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <PilaAjustable className="gap-3 p-3.5">
                {cabecera}
                <Encajar minimo={56}>{({ alto }) => flujo(Math.min(120, alto))}</Encajar>
                {cifras}
                <Prescindible nivel={2}><p className="line-clamp-3 text-[12px] leading-snug text-white/75" title={frase}>{frase}</p></Prescindible>
                {plasma.datos && <Prescindible nivel={1}><GraficaPlasma serie={plasma.datos.serie} hora={fmt.hora} alto={90} id={id} /></Prescindible>}
                <Prescindible nivel={1}>{sello}</Prescindible>
            </PilaAjustable>
        );
    }
    if (base === 'm') {
        return (
            // El dibujo Sol → Tierra toma el alto que queda (antes, fijo, «Sol» se montaba sobre
            // «Velocidad»); si no cabe ni a 40 px, se retira antes la frase.
            <PilaAjustable className="gap-2 p-3.5">
                {cabecera}
                <Encajar minimo={40}>{({ alto }) => flujo(Math.min(96, alto))}</Encajar>
                {cifras}
                <Prescindible nivel={1}><p className="line-clamp-2 shrink-0 text-[11px] leading-snug text-white/70" title={frase}>{frase}</p></Prescindible>
            </PilaAjustable>
        );
    }
    const rk = kp.datos ? resumirKp(kp.datos, Date.now()) : null;
    return (
        <PilaAjustable className="gap-3 p-4">
            {cabecera}
            <Encajar minimo={56}>{({ alto }) => flujo(Math.min(base === 'xl' ? 120 : 96, alto))}</Encajar>
            {cifras}
            <Prescindible nivel={3}><p className="line-clamp-3 shrink-0 text-[12px] leading-snug text-white/75" title={frase}>{frase}</p></Prescindible>
            <Prescindible nivel={2}>{plasma.datos ? <GraficaPlasma serie={plasma.datos.serie} hora={fmt.hora} alto={base === 'xl' ? 100 : 80} id={id} /> : <p className="text-[11px] text-white/55">{plasma.error ? 'Sin la serie de 24 h de la sonda.' : 'Leyendo 24 h de plasma…'}</p>}</Prescindible>
            {base === 'xl' && (<Prescindible nivel={1}>
                <div className="grid grid-cols-3 gap-2">
                    <Cifra t="Temperatura" v={pa?.temperatura == null ? '—' : Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(pa.temperatura)} u="K" />
                    <Cifra t="Campo total" v={r.bt === null ? '—' : r.bt.toFixed(1).replace('.', ',')} u="nT" />
                    <Cifra t="Flujo F10.7" v={sol.datos?.f107.flujo == null ? '—' : String(Math.round(sol.datos.f107.flujo))} u="sfu" nota={rk?.actual ? `Kp ${rk.actual.kp.toFixed(1).replace('.', ',')}` : undefined} />
                </div>
            </Prescindible>)}
            <Prescindible nivel={1}>{sello}</Prescindible>
        </PilaAjustable>
    );
}

export function SpaceEnergySolarWidget() {
    return (
        <MarcoClima etiqueta="Viento solar" acento="#fbbf24" acento2="#f43f5e">
            {(info) => <Contenido info={info} />}
        </MarcoClima>
    );
}

export default SpaceEnergySolarWidget;
