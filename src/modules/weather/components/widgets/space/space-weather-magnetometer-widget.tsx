'use client';
/**
 * Magnetómetro (WEATHER_SPACE_MAGNETOMETER) — Ola 0929 · paquete A.
 *
 * Una medida REAL y honesta del campo magnético: el magnetómetro del satélite GOES en órbita
 * geoestacionaria (NOAA SWPC), a 36.000 km. Su componente Hp (paralela al eje de la Tierra)
 * baja cuando el viento solar comprime la magnetosfera o llega una subtormenta; la traza de
 * 6 h lo enseña. Se completa con el Kp estimado de este minuto. Antes pintaba una estación
 * terrestre (TEO) con cifras fijas si la petición fallaba o no le pasaban datos.
 *   micro → Hp · s → Hp + variación · m → + traza de 6 h · l → + componentes y Kp · xl → + qué
 *   significa · panorámico → cifra | traza · torre → en columna.
 * Las props `data`/`loading` se conservan por compatibilidad y se ignoran.
 */
import * as React from 'react';
import { Magnet } from 'lucide-react';
import type { UnifiedSpaceWeather } from '@/modules/weather/services/space/schema';
import { fuenteKp, fuenteMagnetometro, resumirKp } from '@/modules/weather/datos/noaa';
import { explicarKp } from '@/modules/weather/datos/interpretar';
import { formateadores, useFuente } from '@/modules/weather/datos/hooks';
import { MarcoClima, SelloFuente, estilosClima as s, type InfoMarco } from '../_clima/piezas';
import { colorKp, TrazaCampo } from '../_cosmos/piezas-cosmos';
import { CabeceraCosmos, estadoCosmos } from '../_cosmos/marco-cosmos';

interface MagnetometerWidgetProps {
    /** Heredado: ya no se usa (el widget lee GOES por sí mismo). */
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

/** Variación de Hp en la ventana (nT) y cómo leerla (orientativo). */
export function variacionCampo(vals: number[]): { rango: number; texto: string; color: string } | null {
    if (vals.length < 2) return null;
    const rango = Math.max(...vals) - Math.min(...vals);
    if (rango < 25) return { rango, texto: 'variación pequeña', color: '#34d399' };
    if (rango < 60) return { rango, texto: 'variación moderada', color: '#facc15' };
    return { rango, texto: 'variación grande', color: '#fb923c' };
}

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const mag = useFuente(fuenteMagnetometro, undefined, info.visible);
    const kp = useFuente(fuenteKp, undefined, info.visible && base !== 'micro' && base !== 's');
    const fmt = React.useMemo(() => formateadores(), []);
    const id = React.useId().replace(/:/g, '');

    const espera = estadoCosmos(mag, info, 'Leyendo el magnetómetro…');
    if (espera) return espera;
    const m = mag.datos!;
    const ult = [...m.serie].reverse().find((p) => p.hp !== null) ?? null;
    const hp = ult?.hp ?? null;
    const vals = m.serie.map((p) => p.hp).filter((v): v is number => v !== null);
    const vari = variacionCampo(vals);
    const hace1h = m.serie.find((p) => p.t >= (ult?.t ?? 0) - 3_600_000 && p.hp !== null);
    const tendencia = hp !== null && hace1h?.hp != null ? hp - hace1h.hp : null;
    const rk = kp.datos ? resumirKp(kp.datos, Date.now()) : null;
    const kpAhora = rk?.actual?.kp ?? null;
    const refrescar = () => { mag.refrescar(); kp.refrescar(); };
    const cabecera = <CabeceraCosmos info={info} titulo="Magnetómetro" subtitulo={m.satelite ? `GOES-${m.satelite} · órbita geoestacionaria` : undefined} icono={Magnet} alActualizar={refrescar} />;
    const sello = <SelloFuente fuente="NOAA SWPC · GOES" en={mag.en} />;
    const hpTxt = hp === null ? '—' : hp.toFixed(1).replace('.', ',');
    const tendTxt = tendencia === null ? null : `${tendencia >= 0 ? '+' : '−'}${Math.abs(tendencia).toFixed(1).replace('.', ',')} nT en 1 h`;
    const cifra = (tam: number) => (
        <div className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">Hp</span>
            <span className={`${s.cifra} block font-extralight leading-none`} style={{ fontSize: tam, color: info.acento }}>{hpTxt}<span className="ml-1 text-[12px] text-white/60">nT</span></span>
            {tendTxt && <span className="block text-[11px] text-white/60">{tendTxt}</span>}
        </div>
    );
    const traza = (alto: number) => <TrazaCampo serie={m.serie} hora={fmt.hora} alto={alto} id={id} color={info.acento} />;
    const variTxt = vari && <p className="text-[12px]" style={{ color: vari.color }}>{Math.round(vari.rango)} nT en 6 h · {vari.texto}</p>;

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center" role="img" aria-label={`Campo magnético Hp ${hpTxt} nT`}>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Hp nT</span>
                <span className={`${s.cifra} text-[24px] font-light leading-none`} style={{ color: info.acento }}>{hp === null ? '—' : Math.round(hp)}</span>
            </div>
        );
    }
    if (base === 's') {
        return <div className="flex h-full flex-col justify-center gap-1.5 p-3">{cifra(32)}{variTxt}</div>;
    }
    const componentes = (
        <dl className="grid grid-cols-3 gap-2 text-center">
            {([['Hp', ult?.hp], ['He', ult?.he], ['Hn', ult?.hn]] as const).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/[0.05] px-2 py-1.5">
                    <dt className="text-[10px] uppercase tracking-[0.12em] text-white/50">{k}</dt>
                    <dd className={`${s.cifra} text-[14px] font-semibold`}>{v == null ? '—' : v.toFixed(1).replace('.', ',')}</dd>
                </div>
            ))}
        </dl>
    );
    const kpTxt = kpAhora !== null && <p className="text-[12px] text-white/75">Kp de este momento: <b className={s.cifra} style={{ color: colorKp(kpAhora) }}>{kpAhora.toFixed(1).replace('.', ',')}</b></p>;
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'minmax(9rem,auto) minmax(0,1fr)' }}>
                <div className="min-w-0 space-y-1">{cabecera}{cifra(30)}{variTxt}</div>
                {traza(Math.max(60, (info.alto || 130) - 20))}
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <div className="flex h-full flex-col gap-3 p-3.5">
                {cabecera}{cifra(36)}{variTxt}{traza(110)}{componentes}{kpTxt}
                <div className="mt-auto">{sello}</div>
            </div>
        );
    }
    if (base === 'm') {
        return (
            <div className="flex h-full flex-col gap-2 p-3.5">
                {cabecera}
                <div className="flex items-end justify-between gap-2">{cifra(30)}{variTxt}</div>
                <div className="min-h-0 flex-1">{traza(Math.max(56, (info.alto || 240) - 140))}</div>
            </div>
        );
    }
    return (
        <div className="flex h-full flex-col gap-3 p-4">
            {cabecera}
            <div className="flex items-end justify-between gap-3">{cifra(base === 'xl' ? 44 : 36)}<div className="text-right">{variTxt}{kpTxt}</div></div>
            {traza(base === 'xl' ? 130 : 100)}
            {componentes}
            {base === 'xl' && (
                <div className="space-y-1 text-[12px] leading-snug text-white/70">
                    <p>Hp es la componente paralela al eje de rotación de la Tierra, medida en la órbita del satélite. Cae cuando el viento solar aprieta la magnetosfera o cuando llega una subtormenta.</p>
                    <p>{explicarKp(kpAhora)}</p>
                </div>
            )}
            <div className="mt-auto">{sello}</div>
        </div>
    );
}

export const MagnetometerWidget: React.FC<MagnetometerWidgetProps> = () => (
    <MarcoClima etiqueta="Magnetómetro" acento="#a78bfa" acento2="#38bdf8">
        {(info) => <Contenido info={info} />}
    </MarcoClima>
);

export default MagnetometerWidget;
