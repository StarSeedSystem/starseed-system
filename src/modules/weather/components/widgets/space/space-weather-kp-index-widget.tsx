'use client';
/**
 * Índice Kp y tormentas geomagnéticas (WEATHER_SPACE_KP) — Ola 0929 · paquete A.
 *
 * Datos REALES de NOAA SWPC: el Kp estimado de este minuto, los bloques de 3 h observados y la
 * previsión de 3 días, con la escala de tormentas G1-G5 en el propio medidor. Se explica en
 * claro qué significa y, si hay ubicación, hasta qué latitud asoma la aurora (según Kp) y la
 * probabilidad OVATION sobre tu cielo. Antes pintaba «3» fijo cuando no le pasaban datos.
 *   micro → Kp coloreado · s → medidor · m → + explicación y máximo previsto · l → + barras
 *   de 24 h y 24 h previstas, días y aurora según Kp · xl → + óvalo OVATION y probabilidad
 *   panorámico → medidor | barras | texto · torre → en columna.
 * Las props `data`/`loading` se conservan por compatibilidad y se ignoran: el widget lee su
 * propia fuente compartida (una petición para todos, cada 15 min y solo si se ve).
 */
import * as React from 'react';
import { Magnet } from 'lucide-react';
import type { UnifiedSpaceWeather } from '@/modules/weather/services/space/schema';
import { fuenteAurora, fuenteEscalas, fuenteKp, resumirKp, type PuntoKp } from '@/modules/weather/datos/noaa';
import { escalaG, explicarKp, latitudGeomagnetica, lineaAuroraKp, nombreG, severidadKp } from '@/modules/weather/datos/interpretar';
import { formateadores, useFuente, useUbicacionClima } from '@/modules/weather/datos/hooks';
import { MarcoClima, SelloFuente, estilosClima as s, type InfoMarco } from '../_clima/piezas';
import { Encajar, PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';
import { BarrasKp, colorKp, MedidorKp, OvaloAurora, PildoraSeveridad } from '../_cosmos/piezas-cosmos';
import { CabeceraCosmos, estadoCosmos } from '../_cosmos/marco-cosmos';

interface KpIndexWidgetProps {
    /** Heredado: ya no se usa (el widget lee NOAA por sí mismo). */
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

/** Máximo de Kp previsto por día (en la hora local del navegador). */
export function maximosPorDia(previstas: PuntoKp[], dia: (t: number) => string): { dia: string; t: number; kp: number }[] {
    const m = new Map<string, { dia: string; t: number; kp: number }>();
    for (const p of previstas) {
        const k = new Date(p.t).toDateString();
        const actual = m.get(k);
        if (!actual || p.kp > actual.kp) m.set(k, { dia: dia(p.t), t: p.t, kp: p.kp });
    }
    return [...m.values()].slice(0, 3);
}

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const kp = useFuente(fuenteKp, undefined, info.visible);
    const escalas = useFuente(fuenteEscalas, undefined, info.visible && (base === 'l' || base === 'xl'));
    const { ubicacion } = useUbicacionClima();
    const conAurora = base === 'xl' && !!ubicacion;
    const aurora = useFuente(fuenteAurora, conAurora && ubicacion ? { lat: ubicacion.lat, lon: ubicacion.lon } : null, info.visible && conAurora);
    const fmt = React.useMemo(() => formateadores(), []);
    const diaCorto = React.useCallback((t: number) => new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(new Date(t)).replace('.', ''), []);

    const espera = estadoCosmos(kp, info, 'Leyendo el campo magnético…');
    if (espera) return espera;
    const r = resumirKp(kp.datos!, Date.now());
    const v = r.actual?.kp ?? null;
    const g = escalaG(v);
    const sev = severidadKp(v);
    const texto = explicarKp(v);
    const maxP = r.maxPrevisto;
    const aviso = g >= 1 ? `Tormenta ${nombreG(g)} en curso` : maxP && maxP.kp >= 5 ? `Tormenta ${nombreG(escalaG(maxP.kp))} prevista ${diaCorto(maxP.t)} ${fmt.hora(maxP.t)}` : null;
    const refrescar = () => { kp.refrescar(); escalas.refrescar(); aurora.refrescar(); };
    const cabecera = <CabeceraCosmos info={info} titulo="Índice Kp" subtitulo={nombreG(g)} icono={Magnet} alActualizar={refrescar} conUbicacion={base === 'xl'} />;
    const sello = <SelloFuente fuente="NOAA SWPC" en={kp.en} />;
    const lado = (fr: number) => Math.max(84, Math.min(info.ancho || 200, info.alto || 200) * fr);
    const dias = maximosPorDia(r.previstas, diaCorto);
    const glat = ubicacion ? latitudGeomagnetica(ubicacion.lat, ubicacion.lon) : null;
    const linea = v !== null ? lineaAuroraKp(Math.max(v, maxP?.kp ?? 0)) : null;
    const frAurora = glat !== null && linea !== null
        ? Math.abs(glat) >= linea ? 'La aurora puede asomar en tu cielo con este Kp.' : `La aurora llegaría hasta ~${Math.round(linea)}° de latitud magnética; tú estás a ${Math.round(Math.abs(glat))}°: no se verá desde aquí.`
        : null;

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center" role="img" aria-label={`Índice Kp ${v === null ? 'sin lectura' : v.toFixed(1)}: ${nombreG(g)}`}>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Kp</span>
                <span className={`${s.cifra} text-[30px] font-light leading-none`} style={{ color: v === null ? undefined : colorKp(v) }}>{v === null ? '—' : v.toFixed(1).replace('.', ',')}</span>
                {g > 0 && <span className="text-[10px] font-semibold" style={{ color: colorKp(v ?? 0) }}>G{g}</span>}
            </div>
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-2">
                <MedidorKp kp={v} lado={lado(0.72)} />
                <PildoraSeveridad severidad={sev}>{nombreG(g)}</PildoraSeveridad>
            </div>
        );
    }
    const bloque = (
        <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-[12px] leading-snug text-white/80">{texto}</p>
            {maxP && <p className="text-[12px] text-white/60">Previsto: hasta <span className={`${s.cifra} font-semibold`} style={{ color: colorKp(maxP.kp) }}>Kp {maxP.kp.toFixed(1).replace('.', ',')}</span> {diaCorto(maxP.t)} {fmt.hora(maxP.t)}</p>}
            {aviso && <p role="note"><PildoraSeveridad severidad={g >= 1 ? sev : 'menor'}>{aviso}</PildoraSeveridad></p>}
        </div>
    );
    const diasTira = dias.length > 0 && (
        <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0,1fr))` }} aria-label="Previsión por día">
            {dias.map((dd) => {
                const gg = escalaG(dd.kp);
                return (
                    <li key={dd.t} className="min-w-0 rounded-xl bg-white/[0.05] px-2 py-1.5 text-center">
                        <span className="block truncate text-[11px] capitalize text-white/65">{dd.dia}</span>
                        <span className={`${s.cifra} block text-[15px] font-semibold`} style={{ color: colorKp(dd.kp) }}>{dd.kp.toFixed(1).replace('.', ',')}</span>
                        <span className="block truncate text-[10px] text-white/50">{gg ? `G${gg}` : 'sin tormenta'}</span>
                    </li>
                );
            })}
        </ul>
    );
    const barras = (n: number, alto: number) => <BarrasKp pasadas={r.pasadas.slice(-n)} previstas={r.previstas.slice(0, n)} hora={fmt.soloHora} alto={alto} />;

    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(0,1.2fr) minmax(10rem,1fr)' }}>
                <MedidorKp kp={v} lado={Math.min(120, (info.alto || 130) - 12)} />
                {barras(8, Math.max(40, (info.alto || 130) - 60))}
                <div className="min-w-0 space-y-1">{cabecera}{bloque}</div>
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <PilaAjustable niveles={3} className="gap-3 p-3.5">
                {cabecera}
                <Encajar minimo={72} className="flex items-center justify-center">{({ ancho, alto }) => <MedidorKp kp={v} lado={Math.max(64, Math.min(160, ancho, alto))} />}</Encajar>
                <div className="shrink-0">{bloque}</div>
                <Prescindible nivel={2}>{diasTira}</Prescindible>
                <Prescindible nivel={1}>{barras(6, 56)}</Prescindible>
                <Prescindible nivel={3}>{sello}</Prescindible>
            </PilaAjustable>
        );
    }
    if (base === 'm') {
        return (
            <PilaAjustable className="gap-2 p-3.5">
                {cabecera}
                <Encajar minimo={60} className="flex items-center gap-3">
                    {({ ancho, alto }) => <><MedidorKp kp={v} lado={Math.max(56, Math.min(118, lado(0.56), alto, ancho * 0.45))} />{bloque}</>}
                </Encajar>
            </PilaAjustable>
        );
    }
    return (
        // Lo secundario se retira por niveles si no cabe (antes la leyenda de las barras se cortaba).
        <PilaAjustable niveles={4} className="gap-3 p-4">
            {cabecera}
            <div className="flex shrink-0 items-center gap-4">
                <MedidorKp kp={v} lado={Math.min(base === 'xl' ? 150 : 124, Math.max(80, (info.ancho || 300) * 0.38))} />
                {bloque}
            </div>
            <Prescindible nivel={4}>{barras(8, base === 'xl' ? 80 : 64)}</Prescindible>
            <Prescindible nivel={3}>{diasTira}</Prescindible>
            {base === 'l' && frAurora && <Prescindible nivel={2}><p className="shrink-0 text-[11px] text-white/60">{frAurora} <span className="text-white/40">(según Kp)</span></p></Prescindible>}
            {base === 'xl' && ubicacion && (<Prescindible nivel={2}>
                <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
                    {aurora.datos && <OvaloAurora aurora={aurora.datos} lat={ubicacion.lat} lon={ubicacion.lon} lado={104} />}
                    <div className="min-w-0 flex-1 space-y-1 text-[12px]">
                        <p className="font-semibold">Aurora sobre {ubicacion.nombre}</p>
                        {aurora.datos ? (
                            <p className="text-white/75">Probabilidad encima: <b className={s.cifra}>{aurora.datos.sobreTi ?? 0} %</b> · en el horizonte: <b className={s.cifra}>{aurora.datos.horizonte ?? 0} %</b></p>
                        ) : <p className="text-white/55">{aurora.error ? 'OVATION no respondió' : 'Leyendo el óvalo OVATION…'}</p>}
                        {frAurora && <p className="line-clamp-2 text-white/55" title={frAurora}>{frAurora}</p>}
                    </div>
                </div>
            </Prescindible>)}
            {escalas.datos?.ultimas24?.g != null && escalas.datos.ultimas24.g > 0 && (
                <Prescindible nivel={1}><p className="text-[11px] text-amber-100/90">En las últimas 24 h hubo tormenta G{escalas.datos.ultimas24.g}.</p></Prescindible>
            )}
            <Prescindible nivel={1}><div className="mt-auto flex flex-wrap gap-x-3">{sello}{aurora.en && <SelloFuente fuente="OVATION" en={aurora.en} />}</div></Prescindible>
        </PilaAjustable>
    );
}

export const KpIndexWidget: React.FC<KpIndexWidgetProps> = () => (
    <MarcoClima etiqueta="Índice Kp" acento="#34d399" acento2="#a78bfa">
        {(info) => <Contenido info={info} />}
    </MarcoClima>
);

export default KpIndexWidget;
