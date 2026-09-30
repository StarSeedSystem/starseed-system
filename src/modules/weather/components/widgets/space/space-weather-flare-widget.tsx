'use client';
/**
 * Llamaradas solares (WEATHER_SPACE_FLARE) — Ola 0929 · paquete A.
 *
 * Datos REALES de NOAA SWPC / GOES: el flujo de rayos X de 6 h en escala logarítmica con las
 * clases A-B-C-M-X, la clase de ahora y su efecto (apagones de radio, escala R), las
 * llamaradas de los últimos 7 días y la probabilidad de llamarada C/M/X hoy combinando las
 * regiones activas del día. Antes pintaba «A1.0» o «M1.2» inventados cuando no le pasaban datos.
 *   micro → clase · s → clase + efecto · m → + curva de 6 h · l → + 7 días y probabilidades
 *   xl → + regiones activas y previsión R · panorámico/torre → composiciones propias.
 * Las props `data`/`loading` se conservan por compatibilidad y se ignoran.
 */
import * as React from 'react';
import { Zap } from 'lucide-react';
import type { UnifiedSpaceWeather } from '@/modules/weather/services/space/schema';
import { fuenteEscalas, fuenteSol } from '@/modules/weather/datos/noaa';
import { claseRayos, escalaR, explicarLlamarada, probabilidadCombinada } from '@/modules/weather/datos/interpretar';
import { formateadores, useFuente } from '@/modules/weather/datos/hooks';
import { MarcoClima, SelloFuente, estilosClima as s, type InfoMarco } from '../_clima/piezas';
import { Encajar, PilaAjustable, Prescindible } from '@/components/dashboard/kit/pila-ajustable';
import { COLOR_CLASE, GraficaRayos, LineaLlamaradas, PildoraSeveridad } from '../_cosmos/piezas-cosmos';
import { CabeceraCosmos, estadoCosmos } from '../_cosmos/marco-cosmos';

interface FlareWidgetProps {
    /** Heredado: ya no se usa (el widget lee GOES por sí mismo). */
    data?: UnifiedSpaceWeather;
    loading?: boolean;
}

function Contenido({ info }: { info: InfoMarco }) {
    const { base, clase } = info;
    const sol = useFuente(fuenteSol, undefined, info.visible);
    const escalas = useFuente(fuenteEscalas, undefined, info.visible && base === 'xl');
    const fmt = React.useMemo(() => formateadores(), []);
    const dia = React.useCallback((t: number) => new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(new Date(t)).replace('.', ''), []);
    const id = React.useId().replace(/:/g, '');

    const espera = estadoCosmos(sol, info, 'Mirando el Sol en rayos X…');
    if (espera) return espera;
    const d = sol.datos!;
    const ultimo = d.rayos[d.rayos.length - 1];
    const cl = claseRayos(ultimo?.flujo ?? null);
    const r = escalaR(ultimo?.flujo ?? null);
    const color = cl ? COLOR_CLASE[cl.letra] : '#94a3b8';
    const ahora = Date.now();
    const ult24 = d.llamaradas.filter((l) => l.inicio > ahora - 86_400_000 && /^[MX]/.test(l.clase));
    const pC = probabilidadCombinada(d.regiones.lista.map((x) => x.pC));
    const pM = probabilidadCombinada(d.regiones.lista.map((x) => x.pM));
    const pX = probabilidadCombinada(d.regiones.lista.map((x) => x.pX));
    const refrescar = () => { sol.refrescar(); escalas.refrescar(); };
    const cabecera = <CabeceraCosmos info={info} titulo="Llamaradas solares" subtitulo={d.satelite ? `GOES-${d.satelite} · rayos X` : undefined} icono={Zap} alActualizar={refrescar} />;
    const sello = <SelloFuente fuente="NOAA SWPC · GOES" en={sol.en} />;
    const efecto = r > 0 ? `Apagón de radio R${r} en el lado diurno` : 'Sin apagones de radio';
    const insignia = (tam: number) => (
        <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl px-3 py-2" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66, 0 0 24px -8px ${color}` }}
            role="img" aria-label={cl ? `Rayos X ahora: clase ${cl.etiqueta}` : 'Sin lectura de rayos X'}>
            <span className={`${s.cifra} font-light leading-none`} style={{ fontSize: tam, color }}>{cl?.etiqueta ?? '—'}</span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/55">ahora</span>
        </div>
    );
    const probs = (pC !== null || pM !== null) && (
        <ul className="grid grid-cols-3 gap-2" aria-label="Probabilidad de llamarada hoy">
            {([['C', pC], ['M', pM], ['X', pX]] as const).map(([c, p]) => (
                <li key={c} className="rounded-xl bg-white/[0.05] px-2 py-1.5 text-center">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-white/50">Clase {c} hoy</span>
                    <span className={`${s.cifra} block text-[16px] font-semibold`} style={{ color: COLOR_CLASE[c] }}>{p === null ? '—' : `${p} %`}</span>
                </li>
            ))}
        </ul>
    );

    if (base === 'micro') {
        return (
            <div className="flex h-full flex-col items-center justify-center" role="img" aria-label={cl ? `Rayos X clase ${cl.etiqueta}` : 'Sin lectura de rayos X'}>
                <span className="text-[9px] font-semibold uppercase tracking-widest text-white/60">Rayos X</span>
                <span className={`${s.cifra} text-[24px] font-light leading-none`} style={{ color }}>{cl?.etiqueta ?? '—'}</span>
            </div>
        );
    }
    if (base === 's') {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center">
                {insignia(30)}
                <span className="line-clamp-2 text-[11px] text-white/75">{efecto}</span>
            </div>
        );
    }
    const explicacion = explicarLlamarada(cl?.letra ?? null);
    const bloque = (
        <div className="min-w-0 flex-1 space-y-1.5">
            <p className="line-clamp-3 text-[12px] leading-snug text-white/80" title={explicacion}>{explicacion}</p>
            <PildoraSeveridad severidad={r >= 3 ? 'fuerte' : r >= 1 ? 'moderada' : 'calma'}>{efecto}</PildoraSeveridad>
            {ult24.length > 0 && <Prescindible nivel={2}><p className="text-[11px] text-amber-100/90">{ult24.length} llamarada{ult24.length > 1 ? 's' : ''} M o X en 24 h (la mayor, {ult24.reduce((m, l) => ((l.flujo ?? 0) > (m.flujo ?? 0) ? l : m)).clase})</p></Prescindible>}
        </div>
    );
    if (clase === 'panoramico') {
        return (
            <div className="grid h-full items-center gap-4 px-4 py-2" style={{ gridTemplateColumns: 'auto minmax(0,1.3fr) minmax(0,1fr)' }}>
                {insignia(28)}
                <GraficaRayos serie={d.rayos} llamaradas={d.llamaradas} hora={fmt.hora} alto={Math.max(60, (info.alto || 130) - 20)} id={id} />
                <div className="min-w-0 space-y-1">{cabecera}<LineaLlamaradas llamaradas={d.llamaradas} ahora={ahora} dia={dia} dias={5} /></div>
            </div>
        );
    }
    if (clase === 'torre') {
        return (
            <PilaAjustable className="gap-3 p-3.5">
                {cabecera}
                <div className="flex shrink-0 justify-center">{insignia(36)}</div>
                {bloque}
                <Prescindible nivel={1}><Encajar minimo={56}>{({ alto }) => <GraficaRayos serie={d.rayos} llamaradas={d.llamaradas} hora={fmt.hora} alto={Math.min(120, alto)} id={id} />}</Encajar></Prescindible>
                <Prescindible nivel={1}>{probs}</Prescindible>
                <Prescindible nivel={1}>{sello}</Prescindible>
            </PilaAjustable>
        );
    }
    if (base === 'm') {
        return (
            // La gráfica ocupa el alto que queda (antes, fija, se cortaba por abajo con sus horas).
            <PilaAjustable className="gap-2 p-3.5">
                {cabecera}
                <div className="flex shrink-0 items-center gap-3">{insignia(26)}{bloque}</div>
                <Prescindible nivel={1}><Encajar minimo={52}>{({ alto }) => <GraficaRayos serie={d.rayos} llamaradas={d.llamaradas} hora={fmt.hora} alto={alto} id={id} />}</Encajar></Prescindible>
            </PilaAjustable>
        );
    }
    const regiones = d.regiones.lista.slice(0, 3);
    return (
        <PilaAjustable className="gap-3 p-4">
            {cabecera}
            <div className="flex shrink-0 items-center gap-4">{insignia(base === 'xl' ? 40 : 32)}{bloque}</div>
            <Prescindible nivel={3}><Encajar minimo={64}>{({ alto }) => <GraficaRayos serie={d.rayos} llamaradas={d.llamaradas} hora={fmt.hora} alto={Math.min(base === 'xl' ? 130 : 110, alto)} id={id} />}</Encajar></Prescindible>
            <Prescindible nivel={2}><LineaLlamaradas llamaradas={d.llamaradas} ahora={ahora} dia={dia} /></Prescindible>
            <Prescindible nivel={2}>{probs}</Prescindible>
            {base === 'xl' && regiones.length > 0 && (<Prescindible nivel={1}>
                <ul className="space-y-1" aria-label="Regiones activas de hoy">
                    {regiones.map((x) => (
                        <li key={x.numero} className="flex items-center gap-2 text-[12px]" title={`Región ${x.numero} en ${x.ubicacion}: ${x.manchas ?? '?'} manchas, clase magnética ${x.claseMagnetica ?? '?'}`}>
                            <span className={`${s.cifra} w-12 font-semibold`}>{x.numero}</span>
                            <span className="w-16 text-white/60">{x.ubicacion}</span>
                            <span className="w-10 text-white/60">{x.claseMagnetica ?? '—'}</span>
                            <span className="flex-1 text-right text-white/75">M {x.pM ?? '—'} % · X {x.pX ?? '—'} %</span>
                        </li>
                    ))}
                </ul>
            </Prescindible>)}
            {base === 'xl' && escalas.datos && escalas.datos.dias.length > 0 && (
                <Prescindible nivel={1}><p className="text-[11px] text-white/60">Previsión de apagones R1-R2: {escalas.datos.dias.map((x) => `${x.probRMenor ?? '—'} %`).join(' · ')} (hoy, mañana, pasado)</p></Prescindible>
            )}
            <Prescindible nivel={1}>{sello}</Prescindible>
        </PilaAjustable>
    );
}

export const XRayFlareWidget: React.FC<FlareWidgetProps> = () => (
    <MarcoClima etiqueta="Llamaradas solares" acento="#fb923c" acento2="#facc15">
        {(info) => <Contenido info={info} />}
    </MarcoClima>
);

export default XRayFlareWidget;
